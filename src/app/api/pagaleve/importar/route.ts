import { NextResponse } from 'next/server'

import {
  emReais,
  listarTransacoes,
  listarTransferencias,
  pagaleveConfigurada,
  type TransacaoPagaleve,
} from '@/data/pagaleve'
import { supabaseConfigurado, supabaseServer, tudoDe } from '@/data/supabase'
import { diaDaOperacao } from '@/domain'

/**
 * Importação das vendas e repasses da Pagaleve.
 *
 *     POST /api/pagaleve/importar        → ENSAIO, não grava nada
 *     POST /api/pagaleve/importar
 *     { "gravar": true }                 → grava
 *
 * O ensaio vem primeiro e é o padrão, como foi no resgate da Pagar.me. O
 * motivo é a assimetria: um ensaio errado custa uma leitura, e uma gravação
 * errada custa uma conciliação inteira remendada à mão depois. Enquanto o
 * casamento não estiver provado pelos números, ele não escreve.
 */

export const maxDuration = 300
export const dynamic = 'force-dynamic'

function autorizado(req: Request): boolean {
  const esperado = process.env.CRON_SEGREDO
  if (!esperado) return false
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') === esperado
}

interface PedidoCru {
  id: string
  valor: number | string
  comprado_em: string
}

/**
 * Tolerância entre a compra no ERP e o checkout na Pagaleve.
 *
 * As duas datas nunca coincidem: o pedido nasce na Yampi e o cliente vai à
 * Pagaleve em seguida. Nas amostras conferidas a diferença foi de um a dois
 * minutos, mas cliente que hesita no checkout leva mais. Meia hora acomoda a
 * hesitação sem alcançar a próxima venda do MESMO valor — e o valor exato ao
 * centavo é o que sustenta o casamento; a data só desempata.
 */
const JANELA_MS = 30 * 60_000

interface Casamento {
  checkoutId: string
  pedidoId: string | null
  bruto: number
  valorDaParcela: number
  estornado: number
  tarifa: number
  compradoEm: string
  distanciaMin: number | null
}

/**
 * Casa transação com pedido por valor exato e proximidade no tempo.
 *
 * Um-para-um: pedido já casado sai do bolo. Sem isso, duas vendas do mesmo
 * valor no mesmo dia disputariam a mesma transação e as duas ficariam erradas.
 */
function casar(transacoes: TransacaoPagaleve[], pedidos: PedidoCru[]): Casamento[] {
  const disponiveis = pedidos.map((p) => ({
    id: p.id,
    valor: Math.round(Number(p.valor) * 100),
    quando: new Date(p.comprado_em).getTime(),
    usado: false,
  }))

  return transacoes.map((t) => {
    const quando = new Date(t.order_purchase_date).getTime()
    let melhor: (typeof disponiveis)[number] | null = null
    let menorDistancia = Infinity

    for (const p of disponiveis) {
      if (p.usado || p.valor !== Math.round(t.order_amount)) continue
      const distancia = Math.abs(p.quando - quando)
      if (distancia <= JANELA_MS && distancia < menorDistancia) {
        melhor = p
        menorDistancia = distancia
      }
    }
    if (melhor) melhor.usado = true

    return {
      checkoutId: t.checkout_id,
      pedidoId: melhor?.id ?? null,
      bruto: emReais(t.order_amount),
      valorDaParcela: emReais(t.current_amount),
      estornado: emReais(t.refunded_amount),
      // A tarifa vem negativa da API; aqui ela vira custo positivo, que é como
      // o resto do ERP fala de tarifa.
      tarifa: emReais(Math.abs(t.total_fee_amount)),
      compradoEm: diaDaOperacao(t.order_purchase_date),
      distanciaMin: melhor ? Math.round(menorDistancia / 60_000) : null,
    }
  })
}

export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  if (!pagaleveConfigurada()) {
    return NextResponse.json({ erro: 'Credencial da Pagaleve não está no site.' }, { status: 503 })
  }
  if (!supabaseConfigurado()) {
    return NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 500 })
  }

  const corpo = (await req.json().catch(() => ({}))) as { gravar?: boolean }
  const gravar = corpo.gravar === true

  const [transacoes, transferencias] = await Promise.all([
    listarTransacoes(),
    listarTransferencias(),
  ])

  // Só pedidos que ainda não têm crédito: os já conciliados vieram de outro
  // caminho de pagamento e não devem entrar na disputa pelo casamento.
  const pedidos = await tudoDe<PedidoCru>('pedidos', (de, ate) =>
    supabaseServer()
      .from('pedidos')
      .select('id, valor, comprado_em')
      .neq('situacao', 'cancelado')
      .range(de, ate) as unknown as PromiseLike<{ data: PedidoCru[] | null; error: unknown }>,
  )

  // Quantas LINHAS cada venda tem, e o que muda entre elas.
  //
  // Isto responde a pergunta que decide o modelo inteiro: `current_amount` é o
  // acumulado recebido ou o valor de UMA parcela? A conta à mão já mostrou que
  // é parcela — R$ 206,00 ÷ 4 − R$ 3,60 de tarifa dá exatamente os R$ 47,90
  // que a API devolve, e R$ 168,18 ÷ 3 − R$ 2,25 dá os R$ 53,81. Se houver
  // uma linha por parcela liberada, o recebido de verdade é a SOMA delas.
  const porVenda = new Map<string, { linhas: number; parcelas: number[]; quando: string[] }>()
  for (const t of transacoes.itens) {
    const atual = porVenda.get(t.checkout_id) ?? { linhas: 0, parcelas: [], quando: [] }
    atual.linhas += 1
    atual.parcelas.push(emReais(t.current_amount))
    atual.quando.push(t.timestamp)
    porVenda.set(t.checkout_id, atual)
  }
  const estrutura = {
    vendasDistintas: porVenda.size,
    linhasPorVenda: Object.entries(
      [...porVenda.values()].reduce<Record<string, number>>((acc, v) => {
        acc[String(v.linhas)] = (acc[String(v.linhas)] ?? 0) + 1
        return acc
      }, {}),
    ),
    exemplosComMaisDeUmaLinha: [...porVenda.entries()]
      .filter(([, v]) => v.linhas > 1)
      .slice(0, 5)
      .map(([id, v]) => ({ checkoutId: id, ...v })),
  }

  const casamentos = casar(transacoes.itens, pedidos)
  const casados = casamentos.filter((c) => c.pedidoId)
  const orfas = casamentos.filter((c) => !c.pedidoId)

  const soma = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100
  const relatorio = {
    ensaio: !gravar,
    estrutura,
    transacoes: {
      lidas: transacoes.itens.length,
      totalDaApi: transacoes.total,
      paginacao: transacoes.paginacao,
      repetidosDescartados: transacoes.repetidos,
      casadas: casados.length,
      orfas: orfas.length,
      volumeBruto: soma(casamentos.map((c) => c.bruto)),
      somaDasParcelas: soma(casamentos.map((c) => c.valorDaParcela)),
      tarifas: soma(casamentos.map((c) => c.tarifa)),
      estornado: soma(casamentos.map((c) => c.estornado)),
    },
    transferencias: {
      lidas: transferencias.itens.length,
      totalDaApi: transferencias.total,
      paginacao: transferencias.paginacao,
      // `final_amount` negativo é saída do saldo da Pagaleve — ou seja, o
      // dinheiro que chegou na conta. O sinal invertido é o que torna a soma
      // comparável com o extrato.
      repassado: soma(
        transferencias.itens
          .filter((t) => t.status === 'COMPLETE')
          .map((t) => emReais(Math.abs(t.final_amount))),
      ),
      porStatus: Object.entries(
        transferencias.itens.reduce<Record<string, number>>((acc, t) => {
          acc[t.status] = (acc[t.status] ?? 0) + 1
          return acc
        }, {}),
      ),
    },
    amostraCasada: casados.slice(0, 8),
    amostraOrfa: orfas.slice(0, 8),
    gravados: 0,
  }

  if (!gravar) return NextResponse.json(relatorio)

  // O QUE SE GRAVA É O QUE ESTÁ PROVADO, E SÓ ISSO.
  //
  // Bruto, tarifa e identidade do checkout são fato: o volume conferiu ao
  // centavo com o painel da Pagaleve (R$ 1.470,92 em agosto) e as dez vendas
  // casaram com pedidos do ERP.
  //
  // `recebido` fica de fora. Cada venda tem uma linha só, e `current_amount`
  // nela é o valor líquido de UMA parcela — não o acumulado. Gravá-lo como
  // recebido faria cada venda entrar valendo um terço ou um quarto do que
  // entrou de verdade no caixa; e preencher com o bruto seria pior ainda,
  // inventando dinheiro que só chega em 45 dias. Sem a fonte do liberado por
  // venda, o campo continua vazio — e vazio é honesto, porque a Conciliação
  // já sabe tratar venda da Pagaleve como "aguardando" durante o prazo.
  const linhas = casados.map((c) => ({
    pedido_id: c.pedidoId!,
    origem: 'pagaleve',
    meio: 'Pix parcelado (Pagaleve)',
    gateway_id: c.checkoutId,
    bruto_gateway: c.bruto,
    taxa_real: c.tarifa,
  }))

  for (let i = 0; i < linhas.length; i += 200) {
    const fatia = linhas.slice(i, i + 200)
    const { error } = await supabaseServer()
      .from('repasses')
      .upsert(fatia, { onConflict: 'pedido_id' })
    if (error) {
      return NextResponse.json({ ...relatorio, erro: error.message }, { status: 500 })
    }
    relatorio.gravados += fatia.length
  }

  return NextResponse.json(relatorio)
}
