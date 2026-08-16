import 'server-only'

import {
  emReais,
  listarTransacoes,
  listarTransferencias,
  pagaleveConfigurada,
  type TransacaoPagaleve,
} from '@/data/pagaleve'
import { supabaseServer, tudoDe } from '@/data/supabase'
import { cronogramaDaVenda, diaDaOperacao, normalizarMeio } from '@/domain'

/**
 * A importação da Pagaleve, fora da rota.
 *
 * Estava dentro do handler HTTP, e ali só servia a quem chamasse a rota à mão.
 * O efeito prático era o pior possível: a conciliação rodava sozinha de hora em
 * hora, mas sobre uma tabela que só o operador enchia — venda nova da Pagaleve
 * ficava invisível até alguém exportar um relatório e mandar. Automático pela
 * metade é pior que manual assumido, porque a tela parece em dia.
 *
 * Como função, a rotina horária chama o MESMO código do ensaio manual. Não há
 * um caminho "de produção" e outro "de teste" que possam divergir em silêncio.
 */

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

type ComoCasou = 'identificador' | 'valor_e_data' | null

interface Casamento {
  checkoutId: string
  pedidoId: string | null
  como: ComoCasou
  bruto: number
  valorDaParcela: number
  estornado: number
  tarifa: number
  compradoEm: string
  distanciaMin: number | null
}

/**
 * O checkout da Pagaleve, buscado onde a Yampi já o tinha guardado.
 *
 * `pedido_transacoes.identificadores` traz o id que o meio de pagamento
 * devolveu, e para a Pagaleve esse id é o próprio `checkout_id` — conferido nas
 * 27 vendas conhecidas, 27 casaram. Isso dispensa adivinhação: a consulta é
 * pela chave, e devolve o pedido ou não devolve nada.
 */
async function pedidosPorCheckout(checkouts: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const ambiguos = new Set<string>()

  for (let i = 0; i < checkouts.length; i += 100) {
    const fatia = checkouts.slice(i, i + 100)
    const { data, error } = await supabaseServer()
      .from('pedido_transacoes')
      .select('pedido_id, identificadores')
      .overlaps('identificadores', fatia)
    if (error) throw new Error(error.message)

    for (const linha of (data ?? []) as { pedido_id: string; identificadores: string[] }[]) {
      for (const ident of linha.identificadores ?? []) {
        if (!fatia.includes(ident)) continue
        const jaTem = mapa.get(ident)
        // Um checkout apontando para dois pedidos é dado corrompido. Escolher
        // um seria inventar; some dos dois e aparece como órfão, que é uma
        // pendência visível em vez de um erro silencioso.
        if (jaTem && jaTem !== linha.pedido_id) ambiguos.add(ident)
        else mapa.set(ident, linha.pedido_id)
      }
    }
  }

  for (const ident of ambiguos) mapa.delete(ident)
  return mapa
}

/**
 * O antigo casamento por valor exato e proximidade no tempo — agora reserva.
 *
 * Ele cobre a venda cuja transação a Yampi ainda não trouxe, e só essa. Rodar
 * antes do identificador seria trocar fato por semelhança: dois clientes que
 * gastem o mesmo total na mesma hora fariam o dinheiro de um cair na venda do
 * outro, sem que nada acusasse.
 *
 * Um-para-um: pedido já casado sai do bolo.
 */
function casarPorValorEData(
  pendentes: TransacaoPagaleve[],
  pedidos: PedidoCru[],
  jaUsados: Set<string>,
): Map<string, { pedidoId: string; distanciaMin: number }> {
  const disponiveis = pedidos
    .filter((p) => !jaUsados.has(p.id))
    .map((p) => ({
      id: p.id,
      valor: Math.round(Number(p.valor) * 100),
      quando: new Date(p.comprado_em).getTime(),
      usado: false,
    }))

  const achados = new Map<string, { pedidoId: string; distanciaMin: number }>()
  for (const t of pendentes) {
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
    if (!melhor) continue
    melhor.usado = true
    achados.set(t.checkout_id, {
      pedidoId: melhor.id,
      distanciaMin: Math.round(menorDistancia / 60_000),
    })
  }
  return achados
}

function montar(
  t: TransacaoPagaleve,
  pedidoId: string | null,
  como: ComoCasou,
  distanciaMin: number | null,
): Casamento {
  return {
    checkoutId: t.checkout_id,
    pedidoId,
    como,
    bruto: emReais(t.order_amount),
    valorDaParcela: emReais(t.current_amount),
    estornado: emReais(t.refunded_amount),
    // A tarifa vem negativa da API; aqui ela vira custo positivo, que é como
    // o resto do ERP fala de tarifa.
    tarifa: emReais(Math.abs(t.total_fee_amount)),
    compradoEm: diaDaOperacao(t.order_purchase_date),
    distanciaMin,
  }
}

export interface OpcoesDaImportacao {
  /** Falso é ENSAIO: lê, confere e devolve o relatório sem escrever nada. */
  gravar?: boolean
  /**
   * Quantos dias de pedido entram na disputa pelo casamento.
   *
   * A rotina horária limita, e não é economia à toa: a API da Pagaleve só
   * devolve o mês corrente, então pedido de abril nunca teria par — lê-lo é
   * carregar a tabela inteira a cada hora para nada. A importação manual, que
   * existe justamente para resgatar histórico, não limita.
   */
  janelaDePedidosDias?: number
  /** Detalhe da estrutura e amostras. A rotina horária não precisa. */
  detalhado?: boolean
}

export interface RelatorioDaImportacao {
  ensaio: boolean
  transacoes: Record<string, unknown>
  transferencias?: Record<string, unknown>
  cronograma: Record<string, unknown>
  estrutura?: Record<string, unknown>
  amostraCasada?: Casamento[]
  amostraOrfa?: Casamento[]
  gravados: number
  parcelasGravadas: number
  parcelasProtegidas: number
  parcelasVinculadas: number
  parcelasPorIdentificador?: number
  parcelasPorValorEData?: number
  conciliadas: number
  recebido?: number
  erro?: string
}

const soma = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100

export async function importarPagaleve(
  opcoes: OpcoesDaImportacao = {},
): Promise<RelatorioDaImportacao> {
  const gravar = opcoes.gravar === true
  const detalhado = opcoes.detalhado === true

  if (!pagaleveConfigurada()) {
    throw new Error('PAGALEVE_CHAVE e PAGALEVE_SENHA não estão definidas no site.')
  }

  const [transacoes, transferencias] = await Promise.all([
    listarTransacoes(),
    listarTransferencias(),
  ])

  // ── Casamento ────────────────────────────────────────────────────────────
  //
  // Primeiro a chave, depois — e só se sobrar — a semelhança.
  const checkouts = [...new Set(transacoes.itens.map((t) => t.checkout_id))]
  const porIdentificador = await pedidosPorCheckout(checkouts)

  const semChave = transacoes.itens.filter((t) => !porIdentificador.has(t.checkout_id))
  let porValorEData = new Map<string, { pedidoId: string; distanciaMin: number }>()

  if (semChave.length > 0) {
    // A leitura de pedidos só acontece quando há órfã de verdade. No dia
    // normal, em que toda venda traz o checkout na transação, a rotina horária
    // não toca na tabela de pedidos.
    const desde =
      opcoes.janelaDePedidosDias === undefined
        ? null
        : new Date(Date.now() - opcoes.janelaDePedidosDias * 86_400_000).toISOString()

    const pedidos = await tudoDe<PedidoCru>('pedidos', (de, ate) => {
      let q = supabaseServer()
        .from('pedidos')
        .select('id, valor, comprado_em')
        .neq('situacao', 'cancelado')
      if (desde) q = q.gte('comprado_em', desde)
      return q.range(de, ate) as unknown as PromiseLike<{
        data: PedidoCru[] | null
        error: unknown
      }>
    })

    porValorEData = casarPorValorEData(semChave, pedidos, new Set(porIdentificador.values()))
  }

  const casamentos = transacoes.itens.map((t) => {
    const exato = porIdentificador.get(t.checkout_id)
    if (exato) return montar(t, exato, 'identificador', null)
    const palpite = porValorEData.get(t.checkout_id)
    if (palpite) return montar(t, palpite.pedidoId, 'valor_e_data', palpite.distanciaMin)
    return montar(t, null, null, null)
  })

  // O cronograma de cada venda: quando cada parcela cai. É o que transforma
  // "a Pagaleve me deve" num número com data, em vez de uma promessa vaga.
  const cronogramas = transacoes.itens.flatMap((t) => {
    const parcelas = cronogramaDaVenda({
      bruto: emReais(t.order_amount),
      liquidoDaParcela: emReais(t.current_amount),
      tarifaDaParcela: emReais(Math.abs(t.total_fee_amount)),
      compradaEm: diaDaOperacao(t.order_purchase_date),
    })
    return parcelas.map((p) => ({
      checkoutId: t.checkout_id,
      compradaEm: diaDaOperacao(t.order_purchase_date),
      ...p,
    }))
  })

  const casados = casamentos.filter((c) => c.pedidoId)
  const orfas = casamentos.filter((c) => !c.pedidoId)

  const relatorio: RelatorioDaImportacao = {
    ensaio: !gravar,
    transacoes: {
      lidas: transacoes.itens.length,
      totalDaApi: transacoes.total,
      paginacao: transacoes.paginacao,
      repetidosDescartados: transacoes.repetidos,
      casadas: casados.length,
      // Por qual caminho. Se `porValorEData` começar a crescer, é sinal de que
      // a Yampi parou de trazer o checkout — e o número aparece antes de o
      // dinheiro cair na venda errada.
      porIdentificador: casados.filter((c) => c.como === 'identificador').length,
      porValorEData: casados.filter((c) => c.como === 'valor_e_data').length,
      orfas: orfas.length,
      volumeBruto: soma(casamentos.map((c) => c.bruto)),
      somaDasParcelas: soma(casamentos.map((c) => c.valorDaParcela)),
      tarifas: soma(casamentos.map((c) => c.tarifa)),
      estornado: soma(casamentos.map((c) => c.estornado)),
    },
    cronograma: {
      // Venda cujo número de parcelas não se deduz não gera cronograma
      // inventado: ela aparece aqui como não deduzida, para ser olhada.
      vendasComCronograma: new Set(cronogramas.map((c) => c.checkoutId)).size,
      vendasSemCronograma:
        new Set(transacoes.itens.map((t) => t.checkout_id)).size -
        new Set(cronogramas.map((c) => c.checkoutId)).size,
      parcelas: cronogramas.length,
      aReceberTotal: soma(cronogramas.map((c) => c.liquido)),
    },
    gravados: 0,
    parcelasGravadas: 0,
    parcelasProtegidas: 0,
    parcelasVinculadas: 0,
    conciliadas: 0,
  }

  if (detalhado) {
    // Quantas LINHAS cada venda tem, e o que muda entre elas.
    //
    // Isto responde a pergunta que decide o modelo inteiro: `current_amount` é
    // o acumulado recebido ou o valor de UMA parcela? A conta à mão já mostrou
    // que é parcela — R$ 206,00 ÷ 4 − R$ 3,60 de tarifa dá exatamente os
    // R$ 47,90 que a API devolve, e R$ 168,18 ÷ 3 − R$ 2,25 dá os R$ 53,81.
    const porVenda = new Map<string, { linhas: number; parcelas: number[]; quando: string[] }>()
    for (const t of transacoes.itens) {
      const atual = porVenda.get(t.checkout_id) ?? { linhas: 0, parcelas: [], quando: [] }
      atual.linhas += 1
      atual.parcelas.push(emReais(t.current_amount))
      atual.quando.push(t.timestamp)
      porVenda.set(t.checkout_id, atual)
    }
    relatorio.estrutura = {
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
    relatorio.transferencias = {
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
    }
    ;(relatorio.cronograma as Record<string, unknown>).porVencimento = Object.entries(
      cronogramas.reduce<Record<string, number>>((acc, c) => {
        acc[c.previstaPara] = Math.round(((acc[c.previstaPara] ?? 0) + c.liquido) * 100) / 100
        return acc
      }, {}),
    ).sort()
    relatorio.amostraCasada = casados.slice(0, 8)
    relatorio.amostraOrfa = orfas.slice(0, 8)
  }

  if (!gravar) return relatorio

  // O QUE SE GRAVA É O QUE ESTÁ PROVADO, E SÓ ISSO.
  //
  // Bruto, tarifa e identidade do checkout são fato: o volume conferiu ao
  // centavo com o painel da Pagaleve (R$ 1.470,92 em agosto) e as vendas
  // casaram com pedidos do ERP.
  //
  // `recebido` fica de fora daqui. `current_amount` é o líquido de UMA parcela,
  // não o acumulado; gravá-lo como recebido faria cada venda entrar valendo um
  // terço ou um quarto do que entrou de verdade. Quem preenche `recebido` é a
  // conciliação no fim desta mesma função, somando as parcelas com data de
  // crédito — o único número que corresponde a dinheiro na conta.
  const linhas = casados.map((c) => ({
    pedido_id: c.pedidoId!,
    origem: 'pagaleve',
    meio: normalizarMeio('Pagaleve'),
    gateway_id: c.checkoutId,
    bruto_gateway: c.bruto,
    taxa_real: c.tarifa,
  }))

  for (let i = 0; i < linhas.length; i += 200) {
    const fatia = linhas.slice(i, i + 200)
    const { error } = await supabaseServer()
      .from('repasses')
      .upsert(fatia, { onConflict: 'pedido_id' })
    if (error) throw new Error(error.message)
    relatorio.gravados += fatia.length
  }

  // O cronograma vai para a tabela própria através de uma função que PROTEGE
  // o que já se sabe: estimativa nunca sobrescreve data informada.
  //
  // A distinção é a diferença entre melhorar e estragar. A API não publica o
  // cronograma — ela só permite calculá-lo. O relatório do lojista traz a data
  // que a Pagaleve promete, e essa acertou 44 dos 53 créditos já ocorridos.
  // Sem a guarda, a primeira execução automática trocaria dado bom por
  // aproximação, e ninguém perceberia: as duas são datas plausíveis.
  const porCheckout = new Map(casados.map((c) => [c.checkoutId, c]))
  const linhasDeParcela = cronogramas.map((c) => {
    const venda = porCheckout.get(c.checkoutId)
    return {
      checkout_id: c.checkoutId,
      numero: c.numero,
      de: c.de,
      bruto: c.bruto,
      tarifa: c.tarifa,
      liquido: c.liquido,
      prevista_para: c.previstaPara,
      origem_da_data: c.origemDaData,
      // A API não diz a modalidade. Fica nula para o banco preservar a que já
      // conhece — chutar "quinzenal" apagaria a informação certa das mensais.
      modalidade: null,
      comprada_em: c.compradaEm,
      total_da_compra: venda?.bruto ?? null,
    }
  })

  if (linhasDeParcela.length > 0) {
    const { data, error } = await supabaseServer().rpc('registrar_parcelas_pagaleve', {
      p_parcelas: linhasDeParcela,
    })
    if (error) throw new Error(error.message)
    const linha = Array.isArray(data) ? data[0] : data
    relatorio.parcelasGravadas = linha?.inseridas ?? 0
    relatorio.parcelasProtegidas = linha?.protegidas ?? 0
  }

  // O vínculo com o pedido é etapa própria: a parcela pode chegar antes de o
  // pedido ser importado da Yampi, e aí ele se faz na rodada seguinte sem
  // precisar reler a Pagaleve.
  const { data: vinc, error: erroVinc } = await supabaseServer().rpc(
    'vincular_parcelas_pagaleve',
  )
  if (erroVinc) throw new Error(erroVinc.message)
  const v = Array.isArray(vinc) ? vinc[0] : vinc
  relatorio.parcelasVinculadas = v?.vinculadas ?? 0
  relatorio.parcelasPorIdentificador = v?.por_identificador ?? 0
  relatorio.parcelasPorValorEData = v?.por_valor_e_data ?? 0

  // E a conciliação fecha a corrente: `recebido` vira a soma das parcelas
  // efetivamente creditadas.
  const { data: conc, error: erroConc } = await supabaseServer().rpc('conciliar_pagaleve')
  if (erroConc) throw new Error(erroConc.message)
  const fechamento = Array.isArray(conc) ? conc[0] : conc
  relatorio.conciliadas = fechamento?.vendas ?? 0
  relatorio.recebido = fechamento?.recebido ?? 0

  // A execução deixa marca, e a marca é o que faltava.
  //
  // Quando a guarda das datas funciona como deve, uma rodada correta não muda
  // uma linha sequer: as parcelas já têm data informada e nada é sobrescrito.
  // O efeito colateral é que "rodou e preservou tudo" e "não rodou" deixam o
  // banco IDÊNTICO — e foi exatamente nisso que eu travei ao tentar conferir se
  // a rotina horária estava alcançando a Pagaleve. Sem esta linha, a única
  // forma de saber é o silêncio, que não distingue as duas coisas.
  await supabaseServer()
    .from('sincronizacoes')
    .insert({
      origem: 'pagaleve',
      tipo: 'vendas',
      perfumes: 0,
      variantes: 0,
      ignorados: relatorio.transacoes.orfas as number,
      detalhes: {
        vendasLidas: relatorio.transacoes.lidas,
        casadas: relatorio.transacoes.casadas,
        porIdentificador: relatorio.transacoes.porIdentificador,
        porValorEData: relatorio.transacoes.porValorEData,
        repassesGravados: relatorio.gravados,
        parcelasGravadas: relatorio.parcelasGravadas,
        datasInformadasPreservadas: relatorio.parcelasProtegidas,
        parcelasVinculadas: relatorio.parcelasVinculadas,
        vendasConciliadas: relatorio.conciliadas,
        recebido: relatorio.recebido,
        aReceberTotal: (relatorio.cronograma as { aReceberTotal?: number }).aReceberTotal,
      },
    })

  return relatorio
}
