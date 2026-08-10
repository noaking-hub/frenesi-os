/**
 * Extrato: o dinheiro que de fato entrou e saiu, lido do banco e do gateway.
 *
 * Tudo aqui é puro — nenhuma chamada de rede, nenhum acesso a banco. O leitor
 * do Mercado Pago e o leitor de OFX entregam texto ou JSON cru; quem decide o
 * que aquilo significa é este arquivo, e é por isso que dá para testar cada
 * decisão sem um centavo real envolvido.
 *
 * A regra que governa o módulo inteiro: **a chave da linha é o id do fato na
 * origem**. Reimportar o mesmo arquivo ou ressincronizar o mesmo período não
 * pode criar dinheiro do nada.
 */

export type OrigemExtrato = 'mercadopago' | 'sicoob' | 'ofx' | 'manual'

/** Linha pronta para a função `importar_extrato` do banco. */
export interface LinhaExtratoBruta {
  chave: string
  /** AAAA-MM-DD. */
  ocorrido_em: string
  descricao: string
  contraparte: string
  documento: string
  tipo: 'entrada' | 'saida'
  valor: number
  pedido_id: string | null
  bruto: unknown
}

/** Linha já gravada, como a tela lê. */
export interface LinhaExtrato {
  origem: OrigemExtrato
  chave: string
  contaId: string
  contaNome: string
  ocorridoEm: string
  descricao: string
  contraparte: string
  documento: string
  tipo: 'entrada' | 'saida'
  valor: number
  pedidoId: string | null
  lancamentoId: string | null
  ignorado: boolean
  motivoIgnorado: string
}

// ── Datas ──────────────────────────────────────────────────────────────────

/**
 * Converte um instante ISO para a data do calendário em São Paulo.
 *
 * O Mercado Pago devolve o horário com o fuso da conta (`-03:00`, às vezes
 * `-04:00`). Cortar os dez primeiros caracteres funcionaria quase sempre e
 * erraria o dia justamente nas vendas da madrugada — que são muitas. Uma
 * venda das 23h50 caindo no dia seguinte desalinha a conciliação do mês.
 */
export function dataEmSaoPaulo(iso: string): string | null {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return null
  // `sv-SE` formata como AAAA-MM-DD, que é o que o Postgres espera.
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(t)
}

/** Distância em dias entre duas datas AAAA-MM-DD. */
function distanciaEmDias(a: string, b: string): number {
  const ms = Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)
  return Math.abs(Math.round(ms / 86_400_000))
}

// ── Mercado Pago ───────────────────────────────────────────────────────────

export interface PagamentoMp {
  id: string
  /** approved, refunded, charged_back, pending, rejected, cancelled… */
  status: string
  /** Quando o pagamento foi aprovado. */
  aprovadoEm: string | null
  /** Quando o dinheiro ficou disponível na conta — é aí que ele vira saldo. */
  liberadoEm: string | null
  atualizadoEm: string | null
  /** Valor que o cliente pagou. */
  bruto: number
  /** O que sobra depois da tarifa — o que efetivamente credita. */
  liquido: number
  /** Tarifa cobrada de nós, em reais. */
  tarifa: number
  /** Quanto já foi devolvido ao cliente. */
  estornado: number
  /** O que a plataforma mandou como identificador do pedido dela. */
  referencia: string
  meio: string
  descricao: string
  pagador: string
  /** Quem RECEBEU o dinheiro. */
  collectorId: string
  /** Quem PAGOU. */
  payerId: string
}

const MEIO_MP: Record<string, string> = {
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  account_money: 'Saldo Mercado Pago',
  bank_transfer: 'Pix',
  ticket: 'Boleto',
  atm: 'Caixa eletrônico',
  digital_wallet: 'Carteira digital',
  digital_currency: 'Moeda digital',
  voucher_card: 'Vale',
  crypto_transfer: 'Cripto',
}

function n(v: unknown): number {
  const x = typeof v === 'string' ? Number(v) : v
  return typeof x === 'number' && Number.isFinite(x) ? x : 0
}

function s(v: unknown): string {
  return typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v)
}

/**
 * Traduz um pagamento cru do Mercado Pago.
 *
 * O líquido é o número que importa: é ele que credita na conta. Quando o MP
 * não manda `net_received_amount` — acontece em pagamento pendente e em
 * alguns meios —, calculamos bruto menos tarifas em vez de assumir que a
 * tarifa foi zero, que faria a conciliação acusar divergência em cada venda.
 */
export function normalizarPagamentoMp(cru: Record<string, unknown>): PagamentoMp | null {
  const id = s(cru.id)
  if (!id) return null

  const detalhes = (cru.transaction_details ?? {}) as Record<string, unknown>
  const tarifas = Array.isArray(cru.fee_details) ? (cru.fee_details as Record<string, unknown>[]) : []
  // Só entram as tarifas que NÓS pagamos. `fee_payer: payer` é dinheiro que
  // sai do cliente e nunca passou por nós.
  const tarifa =
    Math.round(
      tarifas
        .filter((f) => s(f.fee_payer) !== 'payer')
        .reduce((a, f) => a + n(f.amount), 0) * 100,
    ) / 100

  const bruto = n(cru.transaction_amount)
  const liquidoInformado = n(detalhes.net_received_amount)
  const liquido = liquidoInformado > 0 ? liquidoInformado : Math.round((bruto - tarifa) * 100) / 100

  const tipo = s(cru.payment_type_id)
  const parcelas = n(cru.installments)
  const meio =
    (MEIO_MP[tipo] ?? (tipo ? tipo.replace(/_/g, ' ') : 'Meio não informado')) +
    (parcelas > 1 ? ` ${parcelas}x` : '')

  const pagador = (cru.payer ?? {}) as Record<string, unknown>

  return {
    id,
    status: s(cru.status),
    aprovadoEm: s(cru.date_approved) || null,
    liberadoEm: s(cru.money_release_date) || null,
    atualizadoEm: s(cru.date_last_updated) || s(cru.date_created) || null,
    bruto,
    liquido,
    tarifa,
    estornado: n(cru.transaction_amount_refunded),
    referencia: s(cru.external_reference).trim(),
    meio,
    descricao: s(cru.description).trim(),
    pagador: s(pagador.email).trim(),
    collectorId: s(cru.collector_id),
    payerId: s(pagador.id),
  }
}

/**
 * As linhas de extrato que um pagamento produz.
 *
 * Um pagamento pode virar duas linhas: o crédito da venda e, se houve
 * devolução, o débito do estorno. Somar os dois num número só esconderia que
 * houve venda e houve devolução — e é justamente essa a informação que falta
 * quando o mês fecha diferente do esperado.
 *
 * Pagamento não aprovado não vira linha nenhuma: intenção de pagar não é
 * dinheiro em conta.
 */
export function linhasDoPagamentoMp(
  p: PagamentoMp,
  pedidoId: string | null,
  nossaConta: string,
): LinhaExtratoBruta[] {
  const linhas: LinhaExtratoBruta[] = []
  const aprovado = p.status === 'approved' || p.status === 'refunded' || p.status === 'charged_back'
  if (!aprovado) return linhas

  // A busca de pagamentos do Mercado Pago devolve TAMBÉM o que a conta pagou,
  // não só o que ela recebeu — compra de etiqueta de frete, por exemplo. Sem
  // olhar quem é o recebedor, dinheiro saindo entra no ERP como venda, e o
  // caixa erra duas vezes: a mais na entrada e a menos na despesa.
  const recebemos = !nossaConta || p.collectorId === nossaConta

  // A data do crédito é a da liberação: é quando o dinheiro passa a ser
  // nosso. Enquanto o MP não libera, a venda existe e o saldo não.
  const dataCredito = dataEmSaoPaulo(p.liberadoEm ?? p.aprovadoEm ?? '')
  if (dataCredito && p.liquido > 0) {
    linhas.push({
      chave: p.id,
      ocorrido_em: dataCredito,
      descricao: [p.meio, p.descricao].filter(Boolean).join(' · ') || 'Venda Mercado Pago',
      contraparte: p.pagador,
      documento: p.referencia,
      tipo: recebemos ? 'entrada' : 'saida',
      // Quando somos nós que pagamos, o valor é o que saiu por inteiro: a
      // tarifa do gateway é do lado de quem recebeu, não do nosso.
      valor: recebemos ? p.liquido : p.bruto,
      // Pagamento que NÓS fizemos não pertence a pedido de venda nenhum.
      pedido_id: recebemos ? pedidoId : null,
      bruto: {
        bruto: p.bruto,
        tarifa: recebemos ? p.tarifa : 0,
        status: p.status,
        referencia: p.referencia,
        liberado_em: p.liberadoEm,
        recebemos,
      },
    })
  }

  if (p.estornado > 0) {
    const dataEstorno = dataEmSaoPaulo(p.atualizadoEm ?? p.aprovadoEm ?? '')
    if (dataEstorno) {
      linhas.push({
        // Chave própria: o estorno é outro fato, com outra data e outro sinal.
        chave: `${p.id}-estorno`,
        ocorrido_em: dataEstorno,
        descricao: `Estorno · ${p.meio}`,
        contraparte: p.pagador,
        documento: p.referencia,
        // Estorno desfaz o movimento original: se entrou, sai; se saiu, volta.
        tipo: recebemos ? 'saida' : 'entrada',
        valor: p.estornado,
        pedido_id: recebemos ? pedidoId : null,
        bruto: { estorno_de: p.id, status: p.status },
      })
    }
  }

  return linhas
}

// ── Casar pagamento com pedido ─────────────────────────────────────────────

export interface PedidoParaCasar {
  id: string
  valor: number
  /** AAAA-MM-DD da compra. */
  data: string
}

export type CriterioCasamento = 'referencia' | 'sufixo' | 'valor-e-data'

export interface CasamentoPagamento {
  pedidoId: string
  criterio: CriterioCasamento
}

export interface IndicePedidos {
  porId: Map<string, PedidoParaCasar>
  porSufixo: Map<string, PedidoParaCasar[]>
  porCentavos: Map<number, PedidoParaCasar[]>
}

/** Monta os índices uma vez para casar centenas de pagamentos sem varredura. */
export function indexarPedidos(pedidos: PedidoParaCasar[]): IndicePedidos {
  const porId = new Map<string, PedidoParaCasar>()
  const porSufixo = new Map<string, PedidoParaCasar[]>()
  const porCentavos = new Map<number, PedidoParaCasar[]>()

  for (const p of pedidos) {
    porId.set(p.id, p)
    // "YP-1510190684870993" também responde por "1510190684870993": a
    // plataforma manda o id dela, e o prefixo é nosso.
    const sufixo = p.id.split('-').pop() ?? ''
    if (sufixo && sufixo !== p.id) {
      porSufixo.set(sufixo, [...(porSufixo.get(sufixo) ?? []), p])
    }
    const centavos = Math.round(p.valor * 100)
    porCentavos.set(centavos, [...(porCentavos.get(centavos) ?? []), p])
  }

  return { porId, porSufixo, porCentavos }
}

/** Dias de folga entre a data da compra e a do pagamento no casamento por valor. */
const JANELA_DIAS = 3

/**
 * Descobre a qual pedido um pagamento pertence.
 *
 * A referência externa é a resposta certa quando existe. O casamento por
 * valor é o último recurso e só vale quando há UM candidato: dois pedidos do
 * mesmo valor na mesma semana são comuns numa loja de decants, e escolher um
 * deles ao acaso conciliaria a venda errada — pior que deixar pendente, porque
 * ninguém volta para conferir o que o sistema já deu por resolvido.
 */
export function casarPagamento(
  p: PagamentoMp,
  indice: IndicePedidos,
): CasamentoPagamento | null {
  const data = dataEmSaoPaulo(p.aprovadoEm ?? '')
  return casarObservacao({ referencia: p.referencia, valor: p.bruto, data: data ?? '' }, indice)
}

/** O que se sabe de um pagamento, seja ele recém-lido ou já gravado. */
export interface ObservacaoDePagamento {
  referencia: string
  valor: number
  /** AAAA-MM-DD. */
  data: string
}

/**
 * O casamento propriamente dito, separado de onde os dados vieram.
 *
 * Existe em separado porque a mesma decisão precisa rodar duas vezes: na
 * leitura, com o pagamento fresco da API, e depois — quando mais histórico de
 * pedidos é importado — sobre a linha já gravada. Duas implementações da
 * mesma regra divergiriam no primeiro ajuste, e aí o mesmo pagamento casaria
 * de um jeito na entrada e de outro no reprocessamento.
 */
export function casarObservacao(
  o: ObservacaoDePagamento,
  indice: IndicePedidos,
): CasamentoPagamento | null {
  const ref = o.referencia.trim()
  if (ref) {
    if (indice.porId.has(ref)) return { pedidoId: ref, criterio: 'referencia' }

    const porSufixo = indice.porSufixo.get(ref)
    if (porSufixo?.length === 1) return { pedidoId: porSufixo[0].id, criterio: 'sufixo' }
    // Referência que aponta para mais de um pedido não aponta para nenhum.
    if (porSufixo && porSufixo.length > 1) return null
  }

  if (!o.data) return null

  const mesmoValor = indice.porCentavos.get(Math.round(o.valor * 100)) ?? []
  const perto = mesmoValor.filter((c) => distanciaEmDias(c.data, o.data) <= JANELA_DIAS)
  if (perto.length === 1) return { pedidoId: perto[0].id, criterio: 'valor-e-data' }

  return null
}

// ── OFX ────────────────────────────────────────────────────────────────────

export interface ExtratoOfx {
  banco: string
  conta: string
  moeda: string
  /** Saldo informado pelo arquivo, quando existe. */
  saldoFinal: number | null
  linhas: LinhaExtratoBruta[]
  /** O que o arquivo não trouxe e o operador precisa saber. */
  avisos: string[]
}

/**
 * Decodifica o arquivo respeitando o que ele diz sobre si mesmo.
 *
 * Banco brasileiro ainda emite OFX em Windows-1252. Ler como UTF-8 não falha
 * ruidosamente: entrega "TARIFA DE MANUTEN�ÃO", e o operador passa a
 * desconfiar do extrato inteiro por causa de um acento.
 */
export function decodificarOfx(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    try {
      return new TextDecoder('windows-1252').decode(bytes)
    } catch {
      return new TextDecoder('latin1').decode(bytes)
    }
  }
}

/** Valor de uma tag folha do OFX, que no formato SGML não tem fechamento. */
function tag(bloco: string, nome: string): string {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'))
  return m ? m[1].trim() : ''
}

/**
 * Número do OFX, com os dois formatos que os bancos usam.
 *
 * "1.234,56" tem ponto de milhar e vírgula decimal; "1234.56" tem ponto
 * decimal e nenhum milhar. Tratar os dois igual transformaria mil reais em um
 * real e vinte e três — no sentido de esconder dinheiro, não de mostrá-lo.
 */
function numeroOfx(bruto: string): number {
  const t = bruto.trim()
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  return Number(normal)
}

/** `20260801120000[-3:BRT]` e `20260801` viram `2026-08-01`. */
function dataOfx(valor: string): string | null {
  const m = valor.match(/^(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/**
 * Tipos que significam saída mesmo quando o banco manda o valor sem sinal.
 *
 * O sinal do `TRNAMT` manda; isto é rede de proteção para o arquivo que vem
 * com tudo positivo — caso em que confiar só no sinal transformaria toda
 * tarifa em receita.
 */
const SAIDA_OFX = new Set(['DEBIT', 'ATM', 'FEE', 'SRVCHG', 'DIRECTDEBIT', 'CHECK', 'PAYMENT'])

/**
 * Lê o OFX exportado do internet banking.
 *
 * Serve para qualquer banco: o formato é o mesmo. É o caminho que funciona
 * hoje, sem depender de habilitação de API, e por isso ele não é um plano B
 * envergonhado — é a porta da frente do Sicoob enquanto o certificado não sai.
 */
export function lerOfx(texto: string): ExtratoOfx {
  const avisos: string[] = []
  const corpo = texto.replace(/\r/g, '')

  const banco = tag(corpo, 'BANKID') || tag(corpo, 'ORG') || ''
  const conta = tag(corpo, 'ACCTID') || tag(corpo, 'CCACCTID') || ''
  const moeda = tag(corpo, 'CURDEF') || 'BRL'
  const saldoBruto = tag(corpo, 'BALAMT')
  const saldoFinal = saldoBruto ? Number(saldoBruto.replace(',', '.')) : null

  if (!conta) avisos.push('O arquivo não informa o número da conta (ACCTID).')
  if (moeda && moeda !== 'BRL') avisos.push(`O extrato está em ${moeda}, não em reais.`)

  const blocos = corpo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? []
  if (blocos.length === 0) {
    avisos.push('Nenhuma transação (STMTTRN) foi encontrada — confira se o arquivo é um extrato OFX.')
  }

  const linhas: LinhaExtratoBruta[] = []
  let semId = 0
  let semData = 0

  for (const bloco of blocos) {
    const valor = numeroOfx(tag(bloco, 'TRNAMT'))
    const data = dataOfx(tag(bloco, 'DTPOSTED') || tag(bloco, 'DTUSER'))
    const fitid = tag(bloco, 'FITID')
    const tipoOfx = tag(bloco, 'TRNTYPE').toUpperCase()
    const memo = tag(bloco, 'MEMO')
    const nome = tag(bloco, 'NAME')

    if (!data) {
      semData += 1
      continue
    }
    if (!fitid) {
      semId += 1
      continue
    }
    if (!Number.isFinite(valor) || valor === 0) continue

    const negativo = valor < 0 || (valor > 0 && SAIDA_OFX.has(tipoOfx))

    linhas.push({
      // O FITID é único dentro da conta, não entre contas. Sem o prefixo, o
      // extrato de duas contas do mesmo banco se sobreporia.
      chave: `${conta || 'sem-conta'}:${fitid}`,
      ocorrido_em: data,
      descricao: memo || nome || tipoOfx || 'Movimento sem descrição',
      contraparte: nome,
      documento: tag(bloco, 'CHECKNUM') || tag(bloco, 'REFNUM'),
      tipo: negativo ? 'saida' : 'entrada',
      valor: Math.abs(valor),
      pedido_id: null,
      bruto: { fitid, trntype: tipoOfx, memo, name: nome },
    })
  }

  // Transação descartada é dinheiro que some do extrato. Se acontecer, tem de
  // aparecer na tela — não num console que ninguém lê.
  if (semData > 0) {
    avisos.push(`${semData} transação(ões) sem data foram deixadas de fora.`)
  }
  if (semId > 0) {
    avisos.push(
      `${semId} transação(ões) sem identificador (FITID) foram deixadas de fora — sem ele, reimportar o arquivo duplicaria o valor.`,
    )
  }

  return { banco, conta, moeda, saldoFinal, linhas, avisos }
}

// ── Classificação ──────────────────────────────────────────────────────────

/**
 * Palavras que denunciam a categoria. É sugestão, nunca decisão: a tela
 * mostra o palpite já escolhido e quem classifica confirma ou troca.
 */
const PISTAS: { termos: string[]; categoria: string }[] = [
  { termos: ['tarifa', 'taxa', 'iof', 'mensalidade', 'cesta', 'anuidade', 'juros'], categoria: 'Taxas de pagamento' },
  { termos: ['das ', 'darf', 'simples nacional', 'imposto', 'inss', 'fgts', 'issqn'], categoria: 'Imposto' },
  { termos: ['correios', 'melhor envio', 'jadlog', 'loggi', 'frete', 'sedex', 'total express', 'etiqueta'], categoria: 'Frete' },
  { termos: ['meta plat', 'facebook', 'google ads', 'googleads', 'tiktok', 'ads', 'publicidade', 'trafego', 'tráfego'], categoria: 'Marketing e ADS' },
  { termos: ['frasco', 'embalagem', 'rotulo', 'rótulo', 'valvula', 'válvula', 'pipeta', 'caixa'], categoria: 'Frascos e insumos' },
  { termos: ['perfume', 'fragrancia', 'fragrância', 'importado', 'essencia', 'essência'], categoria: 'Perfume base' },
  { termos: ['aluguel', 'condominio', 'condomínio', 'energia', 'luz', 'agua', 'água', 'internet'], categoria: 'Ocupação' },
  { termos: ['shopify', 'yampi', 'vercel', 'supabase', 'canva', 'assinatura', 'saas', 'software'], categoria: 'Ferramentas e SaaS' },
  { termos: ['pro-labore', 'pró-labore', 'prolabore', 'salario', 'salário'], categoria: 'Pró-labore' },
]

/**
 * Palpite de categoria a partir da descrição.
 *
 * Só para saídas. Entrada não recebe sugestão porque a receita do DRE vem dos
 * pedidos pagos, não dos lançamentos: classificar um crédito de venda numa
 * categoria de receita contaria a mesma venda duas vezes.
 */
export function sugerirCategoria(descricao: string, tipo: 'entrada' | 'saida'): string | null {
  if (tipo === 'entrada') return null
  const t = semAcento(descricao)

  for (const pista of PISTAS) {
    for (const termo of pista.termos) {
      const limpo = semAcento(termo).trim()
      if (limpo && t.includes(limpo)) return pista.categoria
    }
  }
  return null
}

function semAcento(v: string): string {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export interface ResumoExtrato {
  linhas: number
  entradas: number
  saidas: number
  saldo: number
  aClassificar: number
  ignoradas: number
  classificadas: number
}

export function resumirExtrato(linhas: LinhaExtrato[]): ResumoExtrato {
  const entradas = linhas
    .filter((l) => l.tipo === 'entrada' && !l.ignorado)
    .reduce((a, l) => a + l.valor, 0)
  const saidas = linhas
    .filter((l) => l.tipo === 'saida' && !l.ignorado)
    .reduce((a, l) => a + l.valor, 0)

  return {
    linhas: linhas.length,
    entradas,
    saidas,
    saldo: Math.round((entradas - saidas) * 100) / 100,
    aClassificar: linhas.filter((l) => !l.ignorado && !l.lancamentoId).length,
    ignoradas: linhas.filter((l) => l.ignorado).length,
    classificadas: linhas.filter((l) => l.lancamentoId).length,
  }
}
