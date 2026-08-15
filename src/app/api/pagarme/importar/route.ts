import { NextResponse } from 'next/server'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

/**
 * Importação ÚNICA do histórico da Pagar.me (gateway usado até 22/07/2026).
 *
 * A operação trocou de intermediador em 22/07: antes disso o dinheiro passava
 * pela Pagar.me, e o ERP não tem nenhum registro desse período — a maioria dos
 * pedidos ficou sem data de recebimento e sem a tarifa real, o que deixa a
 * margem de junho e julho superestimada.
 *
 * Isto NÃO é uma integração: é um resgate de histórico. Não há cron, não há
 * tela, e o acesso à conta é temporário — depois de rodar, a chave pode (e
 * deve) ser revogada. Por isso a rota vive sozinha, com a mesma guarda das
 * rotinas, e não dentro do módulo Financeiro.
 *
 *     POST /api/pagarme/importar?dry=1        → mostra o que viria, sem gravar
 *     POST /api/pagarme/importar              → grava no extrato e converte
 *     POST /api/pagarme/importar?casar=1      → só refaz elo e conversão
 *     POST /api/pagarme/importar?sonda=<path> → GET cru na API, para explorar
 *     Authorization: Bearer $CRON_SEGREDO
 */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const BASE = 'https://api.pagar.me/core/v5'
/** A conta do gateway antigo é separada: misturar dois provedores numa conta
 *  só apagaria a data da migração e a comparação de tarifa entre eles. */
const CONTA = 'pagarme'
/** Janela informada pela operação: primeira movimentação 09/06, última 22/07.
 *  Uma folga de dias nas duas pontas cobre fuso e liquidação atrasada. */
const DE = '2026-06-01'
const ATE = '2026-07-25'

/** Teto de páginas. Existe para o laço não virar loop infinito se a API mudar
 *  o contrato de paginação — não para limitar o volume: 200 páginas de 100
 *  cobrem 20 mil registros, muito além dos ~600 pedidos do período. */
const TETO_PAGINAS = 200

function autorizado(req: Request): boolean {
  const esperado = process.env.CRON_SEGREDO
  if (!esperado) return false
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') === esperado
}

interface Cobranca {
  id: string
  code?: string
  status?: string
  amount?: number
  paid_amount?: number
  created_at?: string
  paid_at?: string
  payment_method?: string
  order?: { id?: string; code?: string } | null
  customer?: { name?: string; email?: string } | null
  last_transaction?: {
    acquirer_name?: string
    installments?: number
    paid_amount?: number
    amount?: number
  } | null
}

/** Recebível: é AQUI que mora a tarifa. A cobrança devolve quanto o cliente
 *  pagou; quanto sobrou depois do gateway só aparece no recebível — e uma
 *  venda parcelada gera um recebível por parcela, cada um com sua fatia. */
interface Recebivel {
  id: number
  charge_id?: string
  amount?: number
  fee?: number
  anticipation_fee?: number
  installment?: number
  type?: string
  status?: string
  payment_date?: string
}

/** Centavos → reais. A v5 devolve tudo em centavos inteiros. */
const reais = (centavos: number | undefined | null) => Math.round(centavos ?? 0) / 100

/**
 * Percorre uma coleção paginada da v5 até a página vir vazia.
 *
 * A primeira versão parava quando o lote vinha com menos de 100 itens,
 * assumindo que `size=100` era respeitado. Não é: a API devolveu 30 e o laço
 * encerrou na página 1 — o ensaio mostrou três dias de julho e ninguém
 * percebeu que faltavam seis semanas. Página vazia é o único sinal de fim em
 * que dá para confiar.
 */
async function paginar<T>(caminho: string, auth: string, limite = TETO_PAGINAS) {
  const itens: T[] = []
  const juncao = caminho.includes('?') ? '&' : '?'
  for (let pagina = 1; pagina <= limite; pagina++) {
    const r = await fetch(`${BASE}/${caminho}${juncao}size=100&page=${pagina}`, {
      headers: { Authorization: auth },
    })
    if (!r.ok) throw new Error(`${caminho} respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`)
    const lote = ((await r.json()) as { data?: T[] }).data ?? []
    if (lote.length === 0) return { itens, paginas: pagina - 1, truncado: false }
    itens.push(...lote)
  }
  return { itens, paginas: limite, truncado: true }
}

export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })

  const chave = process.env.PAGARME_SECRET_KEY
  if (!chave) {
    return NextResponse.json(
      { erro: 'PAGARME_SECRET_KEY não está definida nas variáveis do site.' },
      { status: 400 },
    )
  }
  if (!supabaseConfigurado()) {
    return NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 400 })
  }

  const params = new URL(req.url).searchParams
  const ensaio = params.get('dry') === '1'
  const auth = `Basic ${Buffer.from(`${chave}:`).toString('base64')}`

  // Só refaz o elo com os pedidos e a conversão em caixa, sem tocar na API.
  // O casamento é por aproximação (ver `ligar_extrato_pagarme`), então ele
  // melhora à medida que os pedidos do período são corrigidos — e repetir a
  // importação inteira só para isso seria caro e desnecessário.
  if (params.get('casar') === '1') {
    const sb = supabaseServer()
    const { data: ligados, error: erroLigacao } = await sb.rpc('ligar_extrato_pagarme')
    const { data: convertido, error: erroConversao } = await sb.rpc('converter_extrato_em_caixa')
    return NextResponse.json({
      ligacao: erroLigacao ? erroLigacao.message : ligados,
      conversao: erroConversao ? erroConversao.message : convertido,
    })
  }

  // Sonda: repassa um GET cru para a API e devolve o que voltou. Existe
  // porque descobrir o formato de um gateway às cegas custa um deploy por
  // tentativa — e a tarifa real não estava onde parecia estar (na cobrança),
  // e sim nos recebíveis. Some junto com esta rota quando o histórico
  // estiver importado.
  const sonda = params.get('sonda')
  if (sonda) {
    const r = await fetch(`${BASE}/${sonda}`, { headers: { Authorization: auth } })
    const texto = await r.text()
    return NextResponse.json({ status: r.status, corpo: texto.slice(0, 8000) })
  }

  let cobrancas: Cobranca[]
  let recebiveis: Recebivel[]
  let paginasCobrancas = 0
  let paginasRecebiveis = 0
  try {
    const c = await paginar<Cobranca>(
      `charges?created_since=${DE}T00:00:00Z&created_until=${ATE}T23:59:59Z`,
      auth,
    )
    cobrancas = c.itens
    paginasCobrancas = c.paginas
    // Os recebíveis vêm sem filtro de data: a conta está encerrada e o volume
    // total é o do próprio período. Filtrar por data de pagamento deixaria de
    // fora a parcela que só liquidou depois — e é justamente a tarifa dela
    // que está faltando.
    const p = await paginar<Recebivel>('payables', auth)
    recebiveis = p.itens
    paginasRecebiveis = p.paginas
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 })
  }

  // Tarifa por cobrança: soma de todos os recebíveis dela. Parcelado gera um
  // por parcela; estorno e chargeback aparecem com sinal negativo e por isso
  // entram na mesma soma em vez de serem filtrados — é assim que a tarifa
  // devolvida cancela a cobrada.
  const tarifaPorCobranca = new Map<string, number>()
  for (const p of recebiveis) {
    if (!p.charge_id) continue
    const custo = (p.fee ?? 0) + (p.anticipation_fee ?? 0)
    tarifaPorCobranca.set(p.charge_id, (tarifaPorCobranca.get(p.charge_id) ?? 0) + custo)
  }

  // Só o que virou dinheiro. Recusada e não paga não movimentam caixa.
  const pagas = cobrancas.filter((c) => c.status === 'paid')

  const linhas = pagas.map((c) => {
    const pago = c.paid_amount ?? c.last_transaction?.paid_amount ?? c.amount ?? 0
    const tarifa = tarifaPorCobranca.get(c.id) ?? 0
    // Líquido é o que sobrou para a FRENESI: o que o cliente pagou menos o
    // que o gateway reteve. Sem os recebíveis isso empatava com o bruto e a
    // margem do período nascia inflada.
    const liquido = reais(pago - tarifa)
    const quando = (c.paid_at ?? c.created_at ?? '').slice(0, 10)
    return {
      origem: 'pagarme',
      chave: `pagarme:${c.id}`,
      conta_id: CONTA,
      ocorrido_em: quando,
      descricao: 'Venda recebida',
      contraparte: c.customer?.name ?? '',
      // O código do pedido na Pagar.me é da Yampi, não do ERP — guardado por
      // rastreabilidade, mas quem casa o pedido é o e-mail (ver abaixo).
      documento: c.order?.code ?? c.code ?? '',
      tipo: 'entrada',
      valor: liquido,
      pedido_id: null as string | null,
      ignorado: false,
      interno: false,
      bruto: {
        pago: reais(pago),
        tarifa: reais(tarifa),
        liquido,
        meio: c.payment_method ?? null,
        parcelas: c.last_transaction?.installments ?? null,
        adquirente: c.last_transaction?.acquirer_name ?? null,
        pedido_pagarme: c.order?.code ?? null,
        // O elo com o pedido do ERP se faz por aqui: o código do gateway não
        // existe em nenhuma tabela nossa, o e-mail existe em todas.
        email: c.customer?.email?.trim().toLowerCase() ?? null,
      },
    }
  })

  const totalPago = pagas.reduce(
    (a, c) => a + reais(c.paid_amount ?? c.last_transaction?.paid_amount ?? c.amount),
    0,
  )
  const totalLiquido = linhas.reduce((a, l) => a + l.valor, 0)
  const dias = linhas.map((l) => l.ocorrido_em).filter(Boolean).sort()

  const resumo = {
    periodo: `${DE} a ${ATE}`,
    cobrancasLidas: cobrancas.length,
    paginasCobrancas,
    recebiveisLidos: recebiveis.length,
    paginasRecebiveis,
    pagas: pagas.length,
    comTarifaConhecida: linhas.filter((l) => l.bruto.tarifa !== 0).length,
    semEmail: linhas.filter((l) => !l.bruto.email).length,
    totalPago: Math.round(totalPago * 100) / 100,
    totalLiquido: Math.round(totalLiquido * 100) / 100,
    tarifaTotal: Math.round((totalPago - totalLiquido) * 100) / 100,
    tarifaMediaPct: totalPago ? Math.round(((totalPago - totalLiquido) / totalPago) * 10000) / 100 : 0,
    primeira: dias[0] ?? null,
    ultima: dias.at(-1) ?? null,
  }

  if (ensaio) {
    return NextResponse.json({ ensaio: true, resumo, amostra: linhas.slice(0, 3) })
  }

  const sb = supabaseServer()

  // A conta do gateway antigo precisa existir antes das linhas apontarem
  // para ela. Saldo calculado: quem manda é o extrato que estamos trazendo.
  const { error: erroConta } = await sb.from('contas_bancarias').upsert(
    {
      id: CONTA,
      nome: 'Pagar.me',
      tipo: 'Gateway',
      banco: 'Pagar.me',
      uso: 'Checkout até 22/07/2026',
      principal: false,
      ativa: false,
      origem_saldo: 'calculado',
    },
    { onConflict: 'id' },
  )
  if (erroConta) return NextResponse.json({ erro: erroConta.message }, { status: 500 })

  // Em lotes: um upsert de 600 linhas com jsonb estoura o limite de corpo do
  // PostgREST antes de estourar o tempo da função.
  for (let i = 0; i < linhas.length; i += 200) {
    const { error } = await sb
      .from('extrato_linhas')
      .upsert(linhas.slice(i, i + 200), { onConflict: 'chave' })
    if (error) return NextResponse.json({ erro: error.message, resumo }, { status: 500 })
  }

  const { data: ligados, error: erroLigacao } = await sb.rpc('ligar_extrato_pagarme')
  const { data: convertido, error: erroConversao } = await sb.rpc('converter_extrato_em_caixa')

  return NextResponse.json({
    resumo,
    gravadas: linhas.length,
    ligacao: erroLigacao ? erroLigacao.message : ligados,
    conversao: erroConversao ? erroConversao.message : convertido,
  })
}
