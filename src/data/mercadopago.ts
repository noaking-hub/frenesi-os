import 'server-only'

import { categoriaPelaContraparte, contraparteDe } from '@/domain'

import {
  casarPagamento,
  dataEmSaoPaulo,
  destinosDoRodape,
  lerLiberacoes,
  linhasDeLiberacao,
  indexarPedidos,
  normalizarPagamentoMp,
  recortarJanela,
  relatorioServe,
  normalizarMeio,
} from '@/domain'
import type {
  CasamentoPagamento,
  PagamentoMp,
  PedidoParaCasar,
} from '@/domain'

import { mensagemDe } from './shopify'
import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * Mercado Pago: ler o que de fato foi pago e o que de fato foi creditado.
 *
 * O gateway é a única fonte que sabe a tarifa real de cada venda. A Yampi diz
 * o que o cliente comprou; o Mercado Pago diz quanto sobrou. A diferença
 * entre os dois é o custo do dinheiro, e sem ela a margem líquida é chute.
 *
 * Credencial: um Access Token de produção (`APP_USR-…`), gerado no painel de
 * desenvolvedor. Não há OAuth aqui porque a conta é nossa — OAuth serve para
 * ler a conta de terceiros, que não é o caso.
 */

const BASE = 'https://api.mercadopago.com'

/** O `search` do MP pagina por offset e não devolve nada além do milésimo. */
const LIMITE_POR_PAGINA = 50
const TETO_OFFSET = 950

export function mercadoPagoConfigurado(): boolean {
  return Boolean(token())
}

function token(): string {
  return (process.env.MERCADOPAGO_ACCESS_TOKEN ?? '').trim().replace(/^["']|["']$/g, '')
}

/** Id da conta do gateway dentro do ERP. Fixo: só existe uma conta Mercado Pago. */
export const CONTA_MP = 'mercado-pago'

export class ErroMercadoPago extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ErroMercadoPago'
  }
}

export interface RespostaCrua {
  caminho: string
  metodo: string
  status: number
  /** Começo do corpo, cru. É ele que diz o formato — não a documentação. */
  corpo: string
}

/**
 * Chamada que NÃO lança: devolve o status e o corpo, aconteça o que acontecer.
 *
 * Existe para sondar. Um erro aqui é resultado, não acidente: saber que a
 * conta responde 403 num caminho e 200 noutro é exatamente o que se quer
 * descobrir.
 */
async function sondar(caminho: string, metodo = 'GET', corpo?: string): Promise<RespostaCrua> {
  const t = token()
  if (!t) return { caminho, metodo, status: 0, corpo: 'MERCADOPAGO_ACCESS_TOKEN ausente' }

  try {
    const r = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${t}`,
        Accept: 'application/json',
        ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      },
      body: corpo,
      cache: 'no-store',
    })
    return { caminho, metodo, status: r.status, corpo: (await r.text()).slice(0, 700) }
  } catch (e) {
    return { caminho, metodo, status: -1, corpo: mensagemDe(e) }
  }
}

/**
 * Descobre por onde ESTA conta entrega saldo e extrato completo.
 *
 * A busca de pagamentos não vê saque nem transferência, e o endpoint de saldo
 * da carteira devolveu 403 — ele não é liberado para aplicação, só para o
 * painel. O caminho documentado é o Relatório de Liberações, que traz o
 * movimento inteiro, saques inclusive.
 *
 * Só que "documentado" não é "habilitado nesta conta": cada relatório depende
 * de permissão, e algumas contas têm um e não o outro. Em vez de escrever o
 * leitor em cima de um palpite — já errei duas vezes assim nesta integração,
 * no `collector_id` e no saldo —, esta função bate em todos os caminhos e
 * devolve o que cada um respondeu, cru. O leitor vem depois, escrito em cima
 * do formato que apareceu.
 *
 * Não grava nada.
 */
export async function sondarRelatorios(): Promise<RespostaCrua[]> {
  const id = await idDaConta()
  const hoje = hojeEmSaoPaulo()
  const mesPassado = recuar(hoje, 30)

  const alvos: [string, string, string?][] = [
    ['/users/me', 'GET'],
    // Relatório de Liberações: o extrato de verdade, com saque e tarifa.
    ['/v1/account/release_report/list', 'GET'],
    ['/v1/account/release_report/config', 'GET'],
    // Relatório de Conciliação: outra permissão, mesmo propósito.
    ['/v1/account/settlement_report/list', 'GET'],
    ['/v1/account/settlement_report/config', 'GET'],
    // Movimentos da conta, quando a aplicação tem escopo para eles.
    [`/v1/account/bank_report/list`, 'GET'],
    // Saldo — o caminho que devolveu 403, mantido para registrar a resposta.
    ...(id ? ([[`/users/${id}/mercadopago_account/balance`, 'GET']] as [string, string][]) : []),
    // Geração sob demanda do relatório de liberações no período recente.
    [
      '/v1/account/release_report',
      'POST',
      corpoDoPedido(mesPassado, hoje),
    ],
  ]

  const respostas: RespostaCrua[] = []
  for (const [caminho, metodo, corpo] of alvos) {
    respostas.push(await sondar(caminho, metodo, corpo))
  }
  return respostas
}


/**
 * Hoje em São Paulo, que é o "hoje" do Mercado Pago.
 *
 * `new Date().toISOString()` devolve a data em UTC, e das 21h à meia-noite
 * isso é o DIA SEGUINTE aqui. Pedir um relatório que termina amanhã faz o
 * Mercado Pago recusar com `max_date_end_exceeded` — o extrato simplesmente
 * para de atualizar toda noite, e só toda noite.
 */
function hojeEmSaoPaulo(): string {
  return dataEmSaoPaulo(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10)
}

/**
 * O fim da janela nunca passa de hoje.
 *
 * O relógio de quem clica pode estar adiantado, em outro fuso ou simplesmente
 * errado. Recortar aqui, do lado do servidor, é o que impede um relógio
 * torto de derrubar a atualização inteira.
 */
function ateNoMaximoHoje(ate: string): string {
  const hoje = hojeEmSaoPaulo()
  return ate > hoje ? hoje : ate
}


/**
 * O corpo do pedido de relatório: a janela em UTC.
 *
 * Duas lições, cada uma de um 400 diferente:
 *
 *   `invalid_begin_date`      a API só aceita o sufixo `Z`. Mandar
 *                             `-03:00`, que é o fuso correto da conta, faz
 *                             ela recusar o parâmetro inteiro.
 *   `max_date_end_exceeded`   o fim não pode passar do agora dela.
 *
 * Então o fuso entra na CONTA, não no texto: 00:00 em São Paulo é 03:00Z, e
 * o fim de um dia fechado é 02:59:59Z do dia seguinte. Escrever `T00:00:00Z`
 * direto pareceria certo e cortaria as três primeiras horas de cada dia.
 *
 * Quando a janela alcança hoje, o fim é o instante atual: ele é sempre aceito
 * e traz tudo que existe até agora. Pedir o fim do dia seria empatar com o
 * teto da API, e empate com relógio alheio é aposta.
 */
function corpoDoPedido(de: string, ate: string): string {
  const agora = `${new Date().toISOString().slice(0, 19)}Z`
  return JSON.stringify({
    begin_date: `${de}T03:00:00Z`,
    end_date: ate >= hojeEmSaoPaulo() ? agora : `${avancar(ate, 1)}T02:59:59Z`,
  })
}

/** Id da conta que o token abriu. Vazio quando o Mercado Pago não responde. */
export async function idDaConta(): Promise<string> {
  try {
    const eu = await chamar('/users/me')
    return eu.id === undefined || eu.id === null ? '' : String(eu.id)
  } catch {
    // Falhar aqui não pode derrubar a sincronia: sem o id, tudo é tratado
    // como recebimento e o aviso aparece no relatório.
    return ''
  }
}

async function chamar(caminho: string): Promise<Record<string, unknown>> {
  const t = token()
  if (!t) {
    throw new ErroMercadoPago(
      'Falta MERCADOPAGO_ACCESS_TOKEN. Pegue o token de produção em Mercado Pago → Suas integrações → a aplicação → Credenciais de produção.',
    )
  }

  const resposta = await fetch(`${BASE}${caminho}`, {
    headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' },
    cache: 'no-store',
  })

  const texto = await resposta.text()
  if (!resposta.ok) {
    // A mensagem do MP é útil e específica ("invalid access token", "scope
    // not authorized"). Trocá-la por "erro 401" obrigaria a adivinhar.
    let detalhe = texto.slice(0, 300)
    try {
      const corpo = JSON.parse(texto) as { message?: string; error?: string; cause?: unknown }
      detalhe = [corpo.message, corpo.error].filter(Boolean).join(' · ') || detalhe
    } catch {
      /* fica o texto cru */
    }
    if (resposta.status === 401) {
      throw new ErroMercadoPago(
        `O Mercado Pago recusou a credencial (401): ${detalhe}. Confira se o token é o de PRODUÇÃO e se não expirou.`,
        401,
      )
    }
    if (resposta.status === 403) {
      throw new ErroMercadoPago(
        `O Mercado Pago negou o acesso (403): ${detalhe}. O token precisa pertencer à conta que RECEBE os pagamentos.`,
        403,
      )
    }
    throw new ErroMercadoPago(`Mercado Pago devolveu ${resposta.status}: ${detalhe}`, resposta.status)
  }

  try {
    return JSON.parse(texto) as Record<string, unknown>
  } catch {
    throw new ErroMercadoPago('O Mercado Pago devolveu uma resposta que não é JSON.')
  }
}

/**
 * Busca os pagamentos de um intervalo, paginando por offset.
 *
 * O `search` do Mercado Pago para de responder depois do offset 1000. Em vez
 * de truncar em silêncio — que é o jeito clássico de perder metade do mês sem
 * notar —, a janela é quebrada ao meio e cada metade é buscada em separado,
 * até caber. Uma janela de um dia só que estoure o teto é reportada.
 */
export async function pagamentosDoPeriodo(
  de: string,
  ate: string,
  avisos: string[] = [],
): Promise<PagamentoMp[]> {
  const encontrados: PagamentoMp[] = []
  let offset = 0
  let total = 0

  for (;;) {
    const params = new URLSearchParams({
      sort: 'date_created',
      criteria: 'asc',
      range: 'date_created',
      begin_date: `${de}T00:00:00.000-03:00`,
      end_date: `${ate}T23:59:59.999-03:00`,
      limit: String(LIMITE_POR_PAGINA),
      offset: String(offset),
    })

    const corpo = await chamar(`/v1/payments/search?${params}`)
    const paging = (corpo.paging ?? {}) as { total?: number }
    total = Number(paging.total ?? 0)
    const resultados = Array.isArray(corpo.results) ? (corpo.results as Record<string, unknown>[]) : []

    for (const cru of resultados) {
      const p = normalizarPagamentoMp(cru)
      if (p) encontrados.push(p)
    }

    offset += LIMITE_POR_PAGINA
    if (resultados.length < LIMITE_POR_PAGINA || offset >= total) break

    if (offset > TETO_OFFSET) {
      // Não dá para paginar mais. Divide a janela e busca as metades.
      const meio = dataDoMeio(de, ate)
      if (!meio) {
        avisos.push(
          `O dia ${de} tem mais de ${TETO_OFFSET + LIMITE_POR_PAGINA} pagamentos e a API do Mercado Pago não pagina além disso — os excedentes desse dia não foram lidos.`,
        )
        break
      }
      const [a, b] = await Promise.all([
        pagamentosDoPeriodo(de, meio, avisos),
        pagamentosDoPeriodo(proximoDia(meio), ate, avisos),
      ])
      return dedupe([...a, ...b])
    }
  }

  return dedupe(encontrados)
}

function dedupe(pagamentos: PagamentoMp[]): PagamentoMp[] {
  const porId = new Map<string, PagamentoMp>()
  for (const p of pagamentos) porId.set(p.id, p)
  return [...porId.values()]
}

/** Meio do intervalo, ou null quando ele já é de um dia só. */
function dataDoMeio(de: string, ate: string): string | null {
  const a = Date.parse(`${de}T12:00:00Z`)
  const b = Date.parse(`${ate}T12:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b - a < 86_400_000) return null
  return new Date(a + Math.floor((b - a) / 2)).toISOString().slice(0, 10)
}

function proximoDia(data: string): string {
  return new Date(Date.parse(`${data}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
}

export interface ResultadoSincroniaMp {
  periodo: { de: string; ate: string }
  /** Id da conta que o token abriu. Sem ele não dá para saber quem recebeu. */
  conta: string
  /** Pagamentos que NÓS fizemos — etiqueta de frete, por exemplo. */
  saidas: number
  /** Pagamentos lidos da API, aprovados ou não. */
  lidos: number
  /** Repasses atualizados com o que o gateway informou. */
  repassesConciliados: number
  repassesJaConciliados: number
  /** Linhas do extrato ligadas ao pedido pelo id do pagamento. */
  extratoLigado: number
  /** Pagamentos aprovados que não achamos a qual pedido pertencem. */
  semPedido: { id: string; valor: number; referencia: string; quando: string }[]
  criterios: Record<string, number>
  avisos: string[]
}

/**
 * Lê o período no Mercado Pago e escreve o que aprendeu:
 *  - uma linha de extrato por crédito e por estorno;
 *  - o repasse de cada pedido conciliado com o líquido real.
 *
 * Rodar duas vezes o mesmo período é seguro: a linha do extrato tem o id do
 * pagamento como chave, e a conciliação só reescreve quando o valor mudou.
 */
export async function sincronizarMercadoPago(de: string, ate: string): Promise<ResultadoSincroniaMp> {
  if (!supabaseConfigurado()) {
    throw new ErroMercadoPago('O Supabase precisa estar configurado para guardar o extrato.')
  }

  const avisos: string[] = []

  // Quem somos, para separar o que recebemos do que pagamos. A busca de
  // pagamentos devolve os dois, e sem esta pergunta a compra de etiqueta de
  // frete entra no ERP como venda.
  const conta = await idDaConta()
  if (!conta) {
    avisos.push(
      'Não consegui identificar o id da conta no Mercado Pago; todo pagamento do período foi tratado como recebimento.',
    )
  }

  const pagamentos = await pagamentosDoPeriodo(de, ate, avisos)
  const sb = supabaseServer()

  await sb.rpc('garantir_conta', {
    p_id: CONTA_MP,
    p_nome: 'Mercado Pago',
    p_tipo: 'Gateway',
    p_banco: 'Mercado Pago',
    p_uso: 'Recebimento das vendas da loja',
  })

  // Os pedidos que podem corresponder a estes pagamentos. A janela é folgada
  // dos dois lados: o cartão é aprovado depois da compra, e a compra pode ter
  // acontecido antes do começo do período pedido.
  const { data: pedidosCrus, error: erroPedidos } = await sb
    .from('pedidos')
    .select('id, valor, comprado_em')
    .gte('comprado_em', `${recuar(de, 15)}T00:00:00Z`)
    .lte('comprado_em', `${avancar(ate, 5)}T23:59:59Z`)
    .limit(5000)
  if (erroPedidos) throw new ErroMercadoPago(mensagemDe(erroPedidos))

  const pedidos: PedidoParaCasar[] = (pedidosCrus ?? []).map((p) => ({
    id: p.id as string,
    valor: Number(p.valor),
    data: String(p.comprado_em).slice(0, 10),
  }))
  const indice = indexarPedidos(pedidos)

  const paraConciliar: Record<string, unknown>[] = []
  const semPedido: ResultadoSincroniaMp['semPedido'] = []
  const criterios: Record<string, number> = {}

  let saidas = 0

  for (const p of pagamentos) {
    const recebemos = !conta || p.collectorId === conta
    if (!recebemos) saidas += 1

    const casamento: CasamentoPagamento | null = recebemos ? casarPagamento(p, indice) : null
    if (casamento) {
      criterios[casamento.criterio] = (criterios[casamento.criterio] ?? 0) + 1
    }

    // Nada de gravar extrato aqui. O Relatório de Liberações descreve as
    // MESMAS vendas com outra chave, e as duas fontes juntas fariam o
    // crédito de cada venda entrar duas vezes — o saldo dobraria.
    if (p.status !== 'approved' || !recebemos) continue

    if (!casamento) {
      // Dinheiro que entrou sem venda registrada é exatamente o caso que
      // precisa de gente olhando. Descartar em silêncio esconderia a única
      // pista de que a importação de pedidos ficou para trás.
      semPedido.push({
        id: p.id,
        valor: p.bruto,
        referencia: p.referencia,
        quando: (p.aprovadoEm ?? '').slice(0, 10),
      })
      continue
    }

    paraConciliar.push({
      pedido_id: casamento.pedidoId,
      recebido: p.liquido,
      // `money_release_date` vem no fuso do Mercado Pago (`-04:00`), não no
      // nosso. Cortar os dez primeiros caracteres entregava o dia de LÁ: as
      // compras de 16/08 feitas até 01:00 em São Paulo ficaram com
      // `creditado_em = 2026-08-15` enquanto o extrato de liberações trazia
      // 16/08 — a mesma venda com duas datas, e a Conciliação mostrando o
      // dinheiro um dia antes de ele existir.
      creditado_em: dataEmSaoPaulo(p.liberadoEm ?? p.aprovadoEm ?? '') ?? null,
      gateway_id: p.id,
      bruto: p.bruto,
      taxa_real: p.tarifa,
      // O meio mora no repasse porque é dele que sai o custo real de
      // receber, agora que o extrato vem das liberações.
      meio: normalizarMeio(p.meio),
    })
  }

  // Pagamento → pedido, para o extrato. A busca de pagamentos é quem lê a
  // referência externa da loja; o relatório de liberações traz o id do
  // pagamento e mais nada sobre o pedido. Este par é a ponte entre os dois, e
  // é exato — ao contrário de casar por valor e data, que recusa sempre que
  // dois decants do mesmo preço caem no mesmo dia.
  const pares = paraConciliar.map((r) => ({ gateway: r.gateway_id, pedido: r.pedido_id }))

  let repassesConciliados = 0
  let repassesJaConciliados = 0
  if (paraConciliar.length) {
    // Sem a linha de repasse prevista não há o que conciliar; criá-las agora
    // é o que permite sincronizar antes de alguém abrir a tela de repasses.
    await sb.rpc('prever_repasses')

    for (const lote of emLotes(paraConciliar, 200)) {
      const { data, error } = await sb.rpc('conciliar_repasses_lote', {
        p_itens: lote,
        p_operador: 'Mercado Pago',
      })
      if (error) throw new ErroMercadoPago(mensagemDe(error))
      const r = (data ?? {}) as { conciliados?: number; inalterados?: number; orfaos?: unknown[] }
      repassesConciliados += Number(r.conciliados ?? 0)
      repassesJaConciliados += Number(r.inalterados ?? 0)
    }
  }

  let extratoLigado = 0
  for (const lote of emLotes(pares, 200)) {
    const { data, error } = await sb.rpc('ligar_extrato_ao_pedido', {
      p_origem: 'mercadopago',
      p_pares: lote,
    })
    if (error) throw new ErroMercadoPago(mensagemDe(error))
    extratoLigado += Number(data ?? 0)
  }

  return {
    periodo: { de, ate },
    conta,
    saidas,
    lidos: pagamentos.length,
    repassesConciliados,
    repassesJaConciliados,
    extratoLigado,
    semPedido: semPedido.slice(0, 40),
    criterios,
    avisos,
  }
}

/**
 * Conta o que a credencial alcança, com números reais.
 *
 * Existe pelo mesmo motivo do diagnóstico das lojas de concorrente: quando a
 * sincronia volta vazia, a pergunta é "o token está errado ou não houve venda
 * no período?", e só quem viu a resposta crua sabe responder.
 */
export async function diagnosticarMercadoPago(de: string, ate: string): Promise<{
  ok: boolean
  passos: string[]
  amostra: string[]
}> {
  const passos: string[] = []
  const amostra: string[] = []

  if (!token()) {
    return {
      ok: false,
      passos: ['MERCADOPAGO_ACCESS_TOKEN não está definido no ambiente.'],
      amostra: [],
    }
  }
  passos.push(`Token presente (${token().slice(0, 8)}…, ${token().length} caracteres).`)

  try {
    const eu = await chamar('/users/me')
    passos.push(
      `Conta: ${eu.nickname ?? '—'} · id ${eu.id ?? '—'} · ${eu.site_id ?? '—'} · e-mail ${eu.email ?? '—'}.`,
    )
  } catch (e) {
    passos.push(`Falhou ao identificar a conta: ${mensagemDe(e)}`)
    return { ok: false, passos, amostra }
  }

  try {
    const params = new URLSearchParams({
      sort: 'date_created',
      criteria: 'desc',
      range: 'date_created',
      begin_date: `${de}T00:00:00.000-03:00`,
      end_date: `${ate}T23:59:59.999-03:00`,
      limit: '5',
      offset: '0',
    })
    const corpo = await chamar(`/v1/payments/search?${params}`)
    const paging = (corpo.paging ?? {}) as { total?: number }
    const resultados = Array.isArray(corpo.results) ? (corpo.results as Record<string, unknown>[]) : []
    passos.push(`Busca de ${de} a ${ate}: ${paging.total ?? 0} pagamento(s) no total, ${resultados.length} nesta página.`)

    for (const cru of resultados.slice(0, 5)) {
      const p = normalizarPagamentoMp(cru)
      if (!p) continue
      amostra.push(
        `${p.id} · ${p.status} · ${p.meio} · bruto ${p.bruto} · líquido ${p.liquido} · tarifa ${p.tarifa} · ref "${p.referencia}" · aprovado ${p.aprovadoEm ?? '—'} · libera ${p.liberadoEm ?? '—'}`,
      )
    }
    if (resultados.length && !amostra.length) {
      amostra.push('A API respondeu, mas nenhum resultado tinha id — o formato mudou.')
    }
    return { ok: true, passos, amostra }
  } catch (e) {
    passos.push(`Falhou ao buscar pagamentos: ${mensagemDe(e)}`)
    return { ok: false, passos, amostra }
  }
}

function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho))
  return lotes
}

function recuar(data: string, dias: number): string {
  return new Date(Date.parse(`${data}T12:00:00Z`) - dias * 86_400_000).toISOString().slice(0, 10)
}

function avancar(data: string, dias: number): string {
  return new Date(Date.parse(`${data}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)
}

// ── Relatório de Liberações: o extrato de verdade ──────────────────────────

interface ArquivoRelatorio {
  file_name?: string
  created_from?: string
  date_created?: string
  begin_date?: string
  end_date?: string
}

async function texto(caminho: string): Promise<{ status: number; corpo: string }> {
  const t = token()
  const r = await fetch(`${BASE}${caminho}`, {
    headers: { Authorization: `Bearer ${t}` },
    cache: 'no-store',
  })
  return { status: r.status, corpo: await r.text() }
}

export interface RelatorioDisponivel {
  arquivo: string
  criadoEm: string
  de: string
  ate: string
  /** Já foi importado antes? Sai da tabela de importações. */
  jaImportado: boolean
}

/**
 * Lista os relatórios que o Mercado Pago já tem prontos.
 *
 * A geração é assíncrona e pode levar minutos. Esperar dentro da requisição
 * foi desenho errado: ela estourava em 60 segundos e o operador via um erro
 * onde na verdade estava tudo certo, só que ainda processando. Pedir e
 * buscar são duas ações, e a tela mostra o que existe.
 */
export async function relatoriosDisponiveis(): Promise<RelatorioDisponivel[]> {
  const lista = await listarRelatorios()
  const sb = supabaseConfigurado() ? supabaseServer() : null
  const importados = new Set<string>()
  if (sb) {
    const { data } = await sb.from('relatorios_importados').select('arquivo')
    for (const r of data ?? []) importados.add(r.arquivo as string)
  }

  return lista
    .filter((a) => a.file_name)
    .map((a) => ({
      arquivo: a.file_name as string,
      criadoEm: (a.date_created ?? '').slice(0, 19).replace('T', ' '),
      de: (a.begin_date ?? '').slice(0, 10),
      ate: (a.end_date ?? '').slice(0, 10),
      jaImportado: importados.has(a.file_name as string),
    }))
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
}

/** Pede ao Mercado Pago que gere o relatório do período. Volta na hora. */
export async function pedirRelatorio(de: string, ate: string): Promise<string> {
  const r = await fetch(`${BASE}/v1/account/release_report`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: corpoDoPedido(de, ateNoMaximoHoje(ate)),
    cache: 'no-store',
  })
  const corpo = await r.text()
  if (r.status !== 202 && r.status !== 201 && r.status !== 200) {
    throw new ErroMercadoPago(
      `O Mercado Pago recusou gerar o relatório (${r.status}): ${corpo.slice(0, 300)}`,
    )
  }
  try {
    const j = JSON.parse(corpo) as { id?: number | string }
    return String(j.id ?? '')
  } catch {
    return ''
  }
}

export interface ResultadoLiberacoes {
  arquivo: string
  periodo: { de: string; ate: string }
  linhasLidas: number
  novas: number
  repetidas: number
  /** Linhas do arquivo que caíram fora da janela pedida e foram descartadas. */
  foraDaJanela: number
  cabecalhos: string[]
  avisos: string[]
}

/**
 * Baixa um relatório pronto e importa.
 *
 * O `recorte` é o que torna seguro escolher o relatório sozinho. O Mercado
 * Pago entrega o arquivo do período que quiser — o pedido de 22/07 a 10/08
 * pode voltar como 10/07 a 11/08 —, e importar o excedente traria para o
 * caixa desta loja o movimento de uma operação anterior. Com o recorte, o que
 * está fora da janela é descartado na leitura e contado no relatório, em vez
 * de virar saldo errado que ninguém sabe de onde veio.
 */
export async function importarLiberacoes(
  arquivo: string,
  recorte?: { de: string; ate: string },
): Promise<ResultadoLiberacoes> {
  if (!supabaseConfigurado()) {
    throw new ErroMercadoPago('O Supabase precisa estar configurado para guardar o extrato.')
  }

  const baixado = await texto(`/v1/account/release_report/${arquivo}`)
  if (baixado.status !== 200) {
    throw new ErroMercadoPago(
      `Falha ao baixar ${arquivo} (${baixado.status}): ${baixado.corpo.slice(0, 300)}`,
    )
  }

  const lido = lerLiberacoes(baixado.corpo)
  if (lido.linhas.length === 0) {
    throw new ErroMercadoPago(['Nenhuma linha foi lida do relatório.', ...lido.avisos].join(' '))
  }

  const dentro = recorte ? recortarJanela(lido.linhas, recorte.de, recorte.ate) : lido.linhas
  const foraDaJanela = lido.linhas.length - dentro.length
  const extrato = { ...lido, linhas: dentro }

  if (dentro.length === 0) {
    throw new ErroMercadoPago(
      `O relatório ${arquivo} tem ${lido.linhas.length} linha(s), mas nenhuma dentro de ${recorte?.de} a ${recorte?.ate}. É de outro período.`,
    )
  }

  const sb = supabaseServer()
  await sb.rpc('garantir_conta', {
    p_id: CONTA_MP,
    p_nome: 'Mercado Pago',
    p_tipo: 'Gateway',
    p_banco: 'Mercado Pago',
    p_uso: 'Recebimento das vendas da loja',
  })

  const linhas = linhasDeLiberacao(extrato)
  let novas = 0
  let repetidas = 0
  for (const lote of emLotes(linhas, 200)) {
    const { data, error } = await sb.rpc('importar_extrato', {
      p_origem: 'mercadopago',
      p_conta_id: CONTA_MP,
      p_linhas: lote,
    })
    if (error) throw new ErroMercadoPago(mensagemDe(error))
    const r = (data ?? {}) as { novas?: number; repetidas?: number }
    novas += Number(r.novas ?? 0)
    repetidas += Number(r.repetidas ?? 0)
  }

  await sb.from('relatorios_importados').upsert({
    arquivo,
    linhas: linhas.length,
    importado_em: new Date().toISOString(),
  })

  const datas = extrato.linhas.map((l) => l.data).sort()
  return {
    arquivo,
    periodo: { de: datas[0] ?? '', ate: datas[datas.length - 1] ?? '' },
    linhasLidas: linhas.length,
    novas,
    repetidas,
    foraDaJanela,
    cabecalhos: extrato.cabecalhos,
    avisos: extrato.avisos,
  }
}

// ── Atualização automática ─────────────────────────────────────────────────

export interface PassoAtualizacao {
  /** `pronto`: importou. `aguardando`: o Mercado Pago ainda está montando. */
  estado: 'pronto' | 'aguardando'
  linhas: string[]
}

/**
 * O pedido de relatório em andamento, guardado no banco.
 *
 * No banco, e não na memória da tela: recarregar a página perdia a lista de
 * arquivos anteriores ao pedido, e o clique seguinte pedia OUTRO relatório —
 * a conta enchia de arquivos idênticos e a espera recomeçava do zero. Com o
 * estado persistido, a tela, o F5 e a rotina de hora em hora esperam o MESMO
 * pedido.
 *
 * O relatório novo é reconhecido pelo nome do arquivo, comparado com a lista
 * de antes do pedido — nome é único e não depende de relógio nenhum, nem do
 * nosso nem do fuso da conta.
 */
interface PedidoPendente {
  pedidoEm: string
  jaExistiam: string[]
}

/** Depois disso, o pedido é dado por perdido e outro pode ser feito. */
const VALIDADE_PEDIDO_MIN = 30

async function pedidoPendente(): Promise<PedidoPendente | null> {
  const { data } = await supabaseServer()
    .from('mp_pedido_relatorio')
    .select('pedido_em, ja_existiam')
    .maybeSingle()
  if (!data) return null
  const idadeMin = (Date.now() - Date.parse(data.pedido_em as string)) / 60_000
  // Pedido velho não bloqueia um novo: o Mercado Pago pode ter falhado do
  // lado dele, e prender a tela num pedido morto seria pior que repetir.
  if (!Number.isFinite(idadeMin) || idadeMin > VALIDADE_PEDIDO_MIN) return null
  return { pedidoEm: data.pedido_em as string, jaExistiam: (data.ja_existiam as string[]) ?? [] }
}

async function gravarPedido(jaExistiam: string[]): Promise<void> {
  await supabaseServer()
    .from('mp_pedido_relatorio')
    .upsert({ id: true, pedido_em: new Date().toISOString(), ja_existiam: jaExistiam })
}

async function limparPedido(): Promise<void> {
  await supabaseServer().from('mp_pedido_relatorio').delete().eq('id', true)
}

/**
 * O relatório pronto que vale a pena importar agora — ou nada.
 *
 * Existe para desfazer um impasse que travou a rotina por 22 horas seguidas.
 * O medo original era legítimo: um relatório pedido às 10h para a janela
 * "22/07 até hoje" DECLARA fim = hoje, mas o conteúdo dele para às 10h;
 * importá-lo às 21h traz zero movimentos novos e a tela diz "importado"
 * enquanto os pagamentos da tarde não estão lá — parece sucesso. A defesa
 * escolhida foi recusar TODO arquivo pronto quando a janela alcança hoje, e
 * aceitar só um que não existisse antes do pedido desta rodada.
 *
 * Só que o pedido vale 30 minutos e a rotina roda de hora em hora: toda
 * rodada encontrava o pendente vencido, pedia outro e ia embora. O arquivo
 * gerado na hora anterior ficava pronto, listado, com o período certo — e era
 * ignorado. Zero importações vieram da rotina; as duas de 17/08 só
 * aconteceram porque alguém abriu a tela.
 *
 * A troca aqui é a régua, não o medo: em vez de recusar todo arquivo pronto,
 * recusa-se o que é mais VELHO que o último já importado. Um arquivo de 60
 * minutos atrás continua sendo notícia melhor que um extrato de 22 horas, e o
 * "parece sucesso" morre porque quem importa diz em que instante o Mercado
 * Pago tirou a foto (veja `corteDoArquivo`).
 *
 * A comparação é entre carimbos da MESMA fonte — o `date_created` que o
 * Mercado Pago devolve na listagem —, então não depende de saber em que fuso
 * ele vem. Arquivo sem carimbo não passa: sem régua, não há decisão honesta.
 */
function relatorioMaisNovoQueOImportado(
  lista: RelatorioDisponivel[],
  de: string,
  ate: string,
): RelatorioDisponivel | null {
  const piso = lista.reduce(
    (maior, r) => (r.jaImportado && r.criadoEm > maior ? r.criadoEm : maior),
    '',
  )
  // A lista já vem do mais novo para o mais velho, e `relatorioServe` recusa
  // o que já foi importado e o que não cobre a janela.
  return lista.find((r) => relatorioServe(r, de, ate) && r.criadoEm > piso) ?? null
}

/**
 * Até que instante o arquivo enxerga, lido do NOME dele.
 *
 * `reserve-release-3195610773-manual-2026-08-17-073421.csv` foi pedido às
 * 10:34:21 UTC — 07:34:21 em São Paulo. Conferido em três arquivos contra a
 * hora de importação gravada em `relatorios_importados`: o carimbo do nome é
 * o horário daqui, não UTC.
 *
 * É o único número desta tela que responde à pergunta que o operador tem de
 * verdade. "Lido há 6 minutos" fala de quando o ERP leu; não fala de até onde
 * o arquivo vai — e é essa confusão que faz ele achar que o sistema quebrou
 * quando a venda das 07:43 não aparece num extrato tirado às 07:34.
 *
 * Nome fora do padrão devolve nulo e a frase simplesmente não aparece:
 * inventar um corte seria pior que não ter nenhum.
 */
function corteDoArquivo(arquivo: string): string | null {
  const m = arquivo.match(/-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.csv$/)
  return m ? `${m[3]}/${m[2]} às ${m[4]}:${m[5]}` : null
}

/**
 * Atualiza o extrato do jeito que deveria ter sido desde o começo: sozinho.
 *
 * Antes eram três cliques em ordem — pedir, listar, importar —, e a ordem
 * estava na cabeça de quem escreveu, não na tela. Aqui o passo é decidido
 * pelo estado real da conta:
 *
 *   o arquivo do pedido em andamento já saiu  →  importa e lê as tarifas
 *   existe arquivo pronto mais novo que o
 *   último importado                          →  importa esse
 *   não existe                                →  pede e devolve "aguardando"
 *
 * `pedir` é falso na volta automática da tela: sem isso, cada consulta geraria
 * um relatório novo e a conta encheria de arquivos idênticos.
 */
export async function atualizarExtratoMp(
  de: string,
  deAte: string,
  opcoes: { pedir: boolean },
): Promise<PassoAtualizacao> {
  // Recortado logo na entrada para que TODO o resto — o teste de janela
  // aberta, o recorte das linhas, a mensagem na tela — fale da mesma data.
  const ate = ateNoMaximoHoje(deAte)
  const lista = await relatoriosDisponiveis()
  const janelaAberta = ate >= hojeEmSaoPaulo()

  // Há um pedido em andamento? Então a primeira pergunta é se o arquivo dele
  // já apareceu — ele é o mais fresco que pode existir.
  const pendente = await pedidoPendente()
  if (pendente) {
    const conhecidos = new Set(pendente.jaExistiam)
    const novo = lista.find((r) => !conhecidos.has(r.arquivo) && relatorioServe(r, de, ate))
    if (!novo) {
      return {
        estado: 'aguardando',
        linhas: ['O Mercado Pago ainda está montando o extrato. O pedido continua valendo.'],
      }
    }
    await limparPedido()
    return encomendarOProximoEImportar(novo.arquivo, de, ate, lista, janelaAberta && opcoes.pedir)
  }

  // Janela fechada no passado aproveita qualquer relatório existente: o
  // conteúdo não muda mais, e pedir outro só faria esperar por um arquivo
  // idêntico. Janela que alcança hoje usa a régua do carimbo.
  const alvo = janelaAberta
    ? relatorioMaisNovoQueOImportado(lista, de, ate)
    : (lista.find((r) => relatorioServe(r, de, ate)) ?? null)
  if (alvo) {
    return encomendarOProximoEImportar(alvo.arquivo, de, ate, lista, janelaAberta && opcoes.pedir)
  }

  if (!opcoes.pedir) {
    // Sem pedido em andamento e sem ordem de pedir: não há o que esperar.
    return {
      estado: 'aguardando',
      linhas: ['Nenhum pedido de extrato em andamento. Clique em Atualizar extrato.'],
    }
  }

  await pedirRelatorio(de, ate)
  await gravarPedido(lista.map((r) => r.arquivo))
  return {
    estado: 'aguardando',
    linhas: [
      `Extrato de ${de} a ${ate} pedido ao Mercado Pago.`,
      'Costuma levar menos de um minuto, mas pode passar disso quando a fila deles está cheia. O pedido fica registrado: mesmo fechando esta tela, a próxima atualização importa sem pedir de novo.',
    ],
  }
}

/**
 * Encomenda o extrato seguinte e SÓ ENTÃO importa o de agora.
 *
 * É o que transforma a rotina numa esteira em vez de um pedido perdido: a
 * rodada de agora importa o arquivo que a rodada anterior encomendou e deixa
 * outro na fila para a próxima. O atraso do extrato passa a ser um ciclo do
 * agendador, e não "até alguém abrir a tela".
 *
 * A ordem é o ponto, e é contraintuitiva. Encomendar depois de importar seria
 * o natural — só que a importação é a parte cara da rodada (baixa o CSV, lê as
 * tarifas de 35 dias, consulta contrapartes) e a Netlify mata a função perto
 * de 26 segundos. Um corte no meio da importação levaria a encomenda junto, a
 * rodada seguinte não acharia arquivo novo, e o impasse voltaria pela porta
 * dos fundos. Encomendado primeiro, o corte não custa mais que o atraso de um
 * ciclo: as linhas já gravadas ficam, e o próximo arquivo está a caminho.
 *
 * Esperar o arquivo ficar pronto, aqui dentro, continua proibido pelo mesmo
 * motivo — foi um `setTimeout` de até 150 segundos que fez a etapa financeira
 * registrar só "Timeout of 30000 ms" e mais nada.
 *
 * A tela NÃO encomenda (`encomendar` falso na volta automática): ela pede
 * quando alguém clica, e um pedido por consulta encheria a conta de arquivos.
 */
async function encomendarOProximoEImportar(
  arquivo: string,
  de: string,
  ate: string,
  lista: RelatorioDisponivel[],
  encomendar: boolean,
): Promise<PassoAtualizacao> {
  const notas: string[] = []
  if (encomendar) {
    try {
      await pedirRelatorio(de, ate)
      // A lista de antes da encomenda é o que identifica o arquivo novo pelo
      // nome — inclusive o que está sendo importado agora, que não pode ser
      // confundido com o que acabou de ser pedido.
      await gravarPedido(lista.map((r) => r.arquivo))
      notas.push(
        'O extrato seguinte já foi encomendado ao Mercado Pago: a próxima rodada traz o que entrou depois desse corte, sem ninguém precisar clicar.',
      )
    } catch (e) {
      // O extrato de agora continua valendo; o que falhou foi só a encomenda
      // do próximo. Dizer isso é o que impede a rodada seguinte de parecer
      // inexplicavelmente parada.
      notas.push(`Não consegui encomendar o extrato seguinte agora: ${mensagemDe(e)}`)
    }
  }

  const passo = await importarEComplementar(arquivo, de, ate)
  passo.linhas.push(...notas)
  return passo
}

/** Importa o arquivo escolhido e completa com tarifas e ligação aos pedidos. */
async function importarEComplementar(
  arquivo: string,
  de: string,
  ate: string,
): Promise<PassoAtualizacao> {
  const r = await importarLiberacoes(arquivo, { de, ate })
  const corte = corteDoArquivo(arquivo)
  const linhas = [
    `Extrato de ${r.periodo.de} a ${r.periodo.ate} importado.`,
    ...(corte
      ? [
          `O Mercado Pago montou este arquivo em ${corte} (horário de São Paulo) — venda posterior a esse instante ainda não está nele.`,
        ]
      : []),
    `${r.linhasLidas} movimento(s) · ${r.novas} novo(s) · ${r.repetidas} já conhecido(s).`,
    ...(r.foraDaJanela
      ? [`${r.foraDaJanela} linha(s) do arquivo eram de antes de ${de} e foram descartadas.`]
      : []),
    ...r.avisos.map((a) => `Atenção: ${a}`),
  ]

  // A ligação exata: o id que a Yampi guardou na transação do pedido é o
  // mesmo que o extrato traz. Roda antes da busca de pagamentos porque não
  // depende de rede nenhuma — é uma junção dentro do banco.
  try {
    const { data: ligadas } = await supabaseServer().rpc('ligar_extrato_por_transacao', {
      p_origem: 'mercadopago',
    })
    if (Number(ligadas ?? 0) > 0) {
      linhas.push(`${ligadas} venda(s) ligadas ao pedido pela transação da Yampi.`)
    }
  } catch {
    /* a ligação é melhoria, não pré-requisito do extrato */
  }

  // A tarifa de cada venda vem da busca de pagamentos, não do extrato. São as
  // duas metades do mesmo número: o extrato diz quanto entrou, a busca diz
  // quanto o gateway ficou. Falhar aqui não invalida o extrato já gravado.
  try {
    const t = await sincronizarMercadoPago(de, ate)
    linhas.push(
      `Tarifas: ${t.lidos} pagamento(s) lidos, ${t.repassesConciliados} venda(s) conciliadas agora.`,
    )
    if (t.extratoLigado) {
      linhas.push(`${t.extratoLigado} movimento(s) ligados ao pedido pelo id do pagamento.`)
    }
    if (t.semPedido.length) {
      linhas.push(
        `${t.semPedido.length} pagamento(s) sem pedido correspondente no ERP — aparecem na fila como entrada sem pedido.`,
      )
    }
  } catch (e) {
    linhas.push(`As tarifas das vendas não puderam ser lidas agora: ${mensagemDe(e)}`)
  }

  // Quem recebeu o dinheiro? O relatório de liberações não diz — a resposta
  // mora no pagamento. Com a contraparte preenchida, as regras de categoria
  // conseguem reconhecer o motoboy, o imposto e a fatura de anúncio.
  try {
    const nomeados = await enriquecerContrapartes()
    if (nomeados > 0) linhas.push(`${nomeados} movimento(s) ganharam o nome do destinatário.`)
    // O nome tem de descer para o lançamento: é lá que a classificação lê o
    // favorecido. Roda sempre, porque a conversão em caixa acontece antes do
    // enriquecimento e deixa lançamentos sem o nome que agora existe.
    const { data: descidos } = await supabaseServer().rpc(
      'propagar_contraparte_para_lancamentos',
    )
    if (Number(descidos ?? 0) > 0) {
      linhas.push(`${descidos} lançamento(s) passaram a mostrar de quem é o movimento.`)
    }
  } catch {
    /* enriquecer é melhoria, não pré-requisito */
  }

  // O estorno chega pelo extrato: é agora que o pedido pago-e-devolvido
  // ganha o carimbo de divergente e sai da receita.
  try {
    const { data: estornados } = await supabaseServer().rpc('marcar_estornados')
    if (Number(estornados ?? 0) > 0) {
      linhas.push(`${estornados} venda(s) estornadas saíram da receita.`)
    }
    await supabaseServer().rpc('limpar_nao_vendas')
  } catch {
    /* marcação é derivada, não pré-requisito */
  }

  // A regra é conforto, não pré-requisito — mas calar o erro dela custou caro.
  // `classificar_extrato`, que é quem grava o lançamento da regra, não
  // preenchia `competencia` (NOT NULL desde a reconstrução do Financeiro) e
  // estourava a cada linha casada, derrubando a rotina inteira das regras. O
  // `catch` vazio que estava aqui engoliu isso: as 9 regras cadastradas nunca
  // categorizaram nada e nenhuma tela disse por quê.
  try {
    const { data: regras, error } = await supabaseServer().rpc('aplicar_regras_categoria')
    if (error) throw error
    const aplicadas = Number((regras as { aplicadas?: number } | null)?.aplicadas ?? 0)
    if (aplicadas > 0) {
      linhas.push(`${aplicadas} movimento(s) categorizados sozinhos pelas regras.`)
    }
  } catch (e) {
    linhas.push(
      `As regras de categoria não rodaram desta vez: ${mensagemDe(e)}. Os movimentos entram sem categoria e ficam na fila de classificação.`,
    )
  }

  // E aqui o extrato vira CAIXA — o passo que faltava.
  //
  // Só a rotina chamava `converter_extrato_em_caixa`, então "Atualizar
  // extrato" gravava a linha e parava por aí: em 16/08 o crédito lido às
  // 11:30 só virou lançamento às 13:15, quando a rodada seguinte passou. Até
  // lá a mesma tela dizia duas coisas contrárias sobre o mesmo dinheiro —
  // movimento no extrato, R$ 0,00 no caixa.
  //
  // Vem por último de propósito: a ligação com o pedido, o nome da
  // contraparte, o carimbo de estorno e as regras de categoria já rodaram, e
  // é disso que o lançamento nasce. Rodar antes das regras roubaria delas as
  // linhas que elas sabem categorizar. A conversão é idempotente
  // (`on conflict do nothing`), então a chamada que a rotina faz logo depois
  // desta não duplica nada.
  try {
    // `if (error) throw error` é o que faz a mensagem abaixo existir. O cliente
    // do Supabase RESOLVE com `{ data, error }` em falha de banco — não rejeita
    // —, então sem esta linha o `catch` só pegaria queda de rede: erro de SQL
    // viraria `criados = 0` e a tela diria "importado" com o caixa parado. Foi
    // assim que uma colisão de chave derrubou a conversão inteira por nove
    // horas sem aparecer em lugar nenhum.
    const { data, error } = await supabaseServer().rpc('converter_extrato_em_caixa')
    if (error) throw error
    const criados = Number((Array.isArray(data) ? data[0] : data)?.criados ?? 0)
    if (criados > 0) linhas.push(`${criados} movimento(s) viraram lançamento no caixa.`)
  } catch (e) {
    linhas.push(
      `O extrato foi importado, mas não virou lançamento agora: ${mensagemDe(e)}. A próxima rodada da sincronia converte.`,
    )
  }

  return { estado: 'pronto', linhas }
}

/**
 * Preenche a contraparte das saídas que ainda não têm nome.
 *
 * O relatório de liberações identifica o movimento mas não o destinatário;
 * o objeto do pagamento identifica. A colheita é defensiva como a dos
 * pedidos da Yampi: procura strings em campos com cara de nome em vez de
 * apostar num caminho fixo, porque o formato varia por meio de pagamento.
 *
 * O PRAZO não é preciosismo. São 264 linhas sem nome hoje, e cada uma custa
 * uma consulta própria ao Mercado Pago: rodar as 90 de enfiada consome mais
 * tempo do que a Netlify dá à função inteira (~26s), e o corte cairia sobre o
 * que vem DEPOIS — inclusive a conversão do extrato em caixa. Passado o
 * prazo, o que sobrou fica para a próxima rodada; nomear contraparte é
 * melhoria contínua, e nenhuma melhoria vale derrubar o lançamento do
 * dinheiro que acabou de entrar.
 */
async function enriquecerContrapartes(limite = 90, prazoMs = 6_000): Promise<number> {
  const expiraEm = Date.now() + prazoMs
  const sb = supabaseServer()
  const { data, error } = await sb
    .from('extrato_linhas')
    // `documento` guarda o id do pagamento; `chave` é composta
    // (`2026-08-15:173952068842:payment:-15271:1`). Consultar a API com a
    // chave era pedir um pagamento que não existe, e o `catch` engolia o 404
    // — a rotina rodava desde sempre e nomeava zero movimentos.
    .select('chave, documento')
    .eq('origem', 'mercadopago')
    .eq('contraparte', '')
    .eq('ignorado', false)
    // Sem filtro de tipo: a ENTRADA sem pedido é tão anônima quanto a saída, e
    // "Crédito a classificar" sem contraparte é impossível de categorizar.
    //
    // Sem filtro de `lancamento_id` também. Ele excluía exatamente as linhas
    // que precisam do nome: a conversão em caixa roda antes desta rotina, então
    // toda linha interessante JÁ tem lançamento. Era uma condição que garantia
    // que o enriquecimento nunca alcançaria quem precisava dele.
    // Pela FILA, não pela data. Ordenar por `ocorrido_em desc` com teto de 90
    // devolvia as mesmas 90 linhas recentes a cada rodada: as que não têm nome
    // a oferecer continuam sem contraparte de propósito, então voltavam para
    // sempre e as antigas nunca eram alcançadas. Medido: 475 de 525 linhas
    // anônimas, nenhuma anterior a 09/08 jamais consultada. Quem nunca foi
    // tentado passa na frente; o resto entra pelo mais antigo.
    .order('contraparte_buscada_em', { ascending: true, nullsFirst: true })
    .limit(limite)
  if (error) throw error

  let nomeados = 0
  for (const linha of data ?? []) {
    if (Date.now() > expiraEm) break
    const id = String(linha.documento ?? '')
    // Id que não é numérico não é pagamento consultável (saldo inicial,
    // ajuste manual). Pular é o certo; tentar geraria 404 a cada rodada.
    if (!/^\d{6,}$/.test(id)) continue
    // O carimbo vai ANTES da consulta, e vale mesmo se ela falhar: o que ele
    // registra é "esta linha já teve a vez dela", não "deu certo". Carimbar só
    // no sucesso reproduziria a esteira parada, com outro nome.
    await sb
      .from('extrato_linhas')
      .update({ contraparte_buscada_em: new Date().toISOString() })
      .eq('origem', 'mercadopago')
      .eq('chave', String(linha.chave))
    try {
      const pagamento = await chamar(`/v1/payments/${id}`)
      // `contraparteDe` tira o nome da PRÓPRIA casa do texto. O Mercado Pago
      // descreve o movimento com os dois lados juntos — `<pagou> | <recebeu>` —
      // e a varredura de campos abaixo pegava o primeiro que casasse, que numa
      // VENDA é a própria FRENESI: quem coleta o dinheiro é a loja. Resultado
      // medido antes do conserto: 46 linhas com a razão social da casa no campo
      // do outro lado, 43 delas vendas, R$ 4.726,05, onde o nome que importa é
      // o do cliente.
      const nome = contraparteDe(nomeDaContraparte(pagamento))
      // Vazio segue sendo "não achei", e a linha continua elegível na próxima
      // rodada — a consulta filtra `contraparte = ''`. É de propósito: nome da
      // casa gravado como contraparte fecharia essa porta para sempre.
      if (!nome) continue
      const { error: erroGravar } = await sb
        .from('extrato_linhas')
        .update({ contraparte: nome })
        .eq('origem', 'mercadopago')
        .eq('chave', String(linha.chave))
      if (erroGravar) throw erroGravar
      nomeados++
    } catch {
      // 404/403 aqui é normal: nem todo movimento é um pagamento legível.
      continue
    }
  }
  return nomeados
}

/** Campos com cara de nome, do mais específico ao mais genérico. */
function nomeDaContraparte(pagamento: Record<string, unknown>): string {
  const achados: string[] = []
  const PISTAS = /(account_holder|holder_name|beneficiar|recipient|counterpart|razao_social|business_name)/i
  const NOMES = /^(name|nome|full_name)$/i

  const desce = (valor: unknown, profundidade: number, dentroDePista: boolean) => {
    if (!valor || profundidade > 4) return
    if (typeof valor !== 'object') return
    for (const [campo, v] of Object.entries(valor as Record<string, unknown>)) {
      const ePista = PISTAS.test(campo)
      if (typeof v === 'string' && v.trim().length >= 5 && /[a-zA-ZÀ-ú] /.test(v)) {
        if (ePista || (dentroDePista && NOMES.test(campo))) achados.push(v.trim())
      } else {
        desce(v, profundidade + 1, dentroDePista || ePista)
      }
    }
  }
  desce(pagamento, 0, false)

  // `description` e `statement_descriptor` são o plano B: em Pix enviado é
  // comum o texto trazer o nome de quem recebeu.
  if (!achados.length) {
    for (const campo of ['description', 'statement_descriptor']) {
      const v = pagamento[campo]
      if (typeof v === 'string' && v.trim().length >= 5) achados.push(v.trim())
    }
  }
  return achados[0] ?? ''
}

async function listarRelatorios(): Promise<ArquivoRelatorio[]> {
  const r = await texto('/v1/account/release_report/list')
  if (r.status !== 200) return []
  try {
    const lista = JSON.parse(r.corpo)
    return Array.isArray(lista) ? (lista as ArquivoRelatorio[]) : []
  } catch {
    return []
  }
}

// ── Destino dos saques: perguntar ao próprio gateway ───────────────────────

export interface RodadaDestinoPayouts {
  examinados: number
  resolvidos: { lancamento: string; contraparte: string; categoria: string }[]
  /** Contraparte descoberta mas sem categoria óbvia: anotada na observação. */
  anotados: { lancamento: string; contraparte: string }[]
  /**
   * As respostas cruas dos caminhos sondados para o PRIMEIRO saque da rodada.
   * É por elas que o mapeamento se corrige sobre fato — o mesmo método dos
   * relatórios: a documentação descreve o caso geral, não esta conta.
   */
  amostras: RespostaCrua[]
}

/**
 * Pergunta ao Mercado Pago quem recebeu cada saque da fila de destino.
 *
 * O extrato descreve todo saque como "Transferência para conta bancária" — o
 * pagamento do Google ADS e o repasse para o Inter saem idênticos, e a fila
 * pedia que o operador adivinhasse. Mas o movimento tem um id, e a API sabe
 * mais do que o relatório mostra. Quando a contraparte volta com nome que se
 * explica sozinho (Google, Meta, Melhor Envio), o saque é resolvido como
 * despesa na hora, pela mesma função atômica da tela; quando volta um nome
 * que não decide nada, ele é ANOTADO na observação — a fila continua, mas
 * quem abrir deixa de decidir às cegas.
 */
export async function descobrirDestinoDosPayouts(limite = 8): Promise<RodadaDestinoPayouts> {
  const rodada: RodadaDestinoPayouts = { examinados: 0, resolvidos: [], anotados: [], amostras: [] }
  if (!supabaseConfigurado() || !mercadoPagoConfigurado()) return rodada

  const sb = supabaseServer()
  const { data, error } = await sb
    .from('lancamentos')
    .select('id, chave_externa, descricao, observacao')
    .eq('aguarda_destino', true)
    .is('cancelado_em', null)
    .order('ocorrido_em', { ascending: false })
    .limit(60)
  if (error) throw error

  const filaCompleta = (data ?? []) as {
    id: string
    chave_externa: string | null
    descricao: string | null
    observacao: string | null
  }[]
  const idDoMovimento = (l: { id: string; chave_externa: string | null }): string | null =>
    (l.chave_externa ?? l.id).match(/:(\d{6,}):payout:/)?.[1] ?? null

  const fila = filaCompleta
    // Quem já tem a contraparte anotada só espera a decisão humana — sondar
    // de novo a cada rodada gastaria a API para reescrever a mesma nota.
    .filter((l) => !(l.observacao ?? '').startsWith('Contraparte'))
    .slice(0, limite)

  // Enquanto houver saque sem resposta, a rodada persegue a porta que restou:
  // o RELATÓRIO DE LIBERAÇÕES — o mesmo que a esteira já baixa toda hora —
  // tem o modo `include_withdrawal_at_end`, que anexa no fim do arquivo o
  // detalhe de cada retirada; é ali que o gateway escreve para onde o
  // dinheiro foi. Em dois atos: liga o modo na config (o leitor do extrato já
  // corta esse rodapé antes de ler movimentos); nas rodadas seguintes, traz o
  // FIM do arquivo mais novo nas amostras, cru, para o leitor do destino
  // nascer sobre o formato real. O informe bancário ficou para trás: o PUT da
  // config dele responde 405 e a geração 404 — o produto não existe nesta
  // conta.
  const resolver = async (id: string, categoria: string): Promise<boolean> => {
    const { data: r, error: erro } = await sb.rpc('resolver_destino_do_payout', {
      p_id: id,
      p_conta_destino: null,
      p_categoria_id: categoria,
      p_operador: 'API do Mercado Pago',
    })
    if (erro) {
      console.error('[financeiro] destino do payout não gravado:', erro)
      return false
    }
    return Boolean((r as { ok?: boolean } | null)?.ok)
  }

  // As regras de categoria valem também aqui: quem cadastra "nome do
  // motoboy → Frete" resolve os PRÓXIMOS saques para ele sem abrir a fila.
  const { data: regrasCruas } = await sb
    .from('regras_categoria')
    .select('padrao, categoria_id')
    .eq('ativa', true)
    .limit(300)
  const regras = ((regrasCruas ?? []) as { padrao: string | null; categoria_id: string | null }[])
    .filter((r) => r.padrao && r.categoria_id)
  const categoriaDoNome = (nome: string): string | null =>
    categoriaPelaContraparte(nome) ??
    regras.find((r) => nome.toLowerCase().includes(String(r.padrao).toLowerCase()))?.categoria_id ??
    null

  // O que já se sabe do destino, gravado no lançamento. Para nome que nenhuma
  // regra decide, a nota é o produto: a fila deixa de ser às cegas.
  const gravarDestino = async (
    l: { id: string; descricao: string | null; observacao: string | null },
    contraparte: string,
  ): Promise<void> => {
    const categoria = categoriaDoNome(contraparte)
    if (categoria && (await resolver(l.id, categoria))) {
      rodada.resolvidos.push({ lancamento: l.id, contraparte, categoria })
      // O favorecido vira a descrição visível quando ela era o rótulo
      // genérico do extrato.
      if ((l.descricao ?? '').trim() === 'Transferência para conta bancária') {
        await sb.from('lancamentos').update({ descricao: contraparte }).eq('id', l.id)
      }
      return
    }
    const nota = `Contraparte (relatório do gateway): ${contraparte}`
    const atual = (l.observacao ?? '').trim()
    // A nota só escreve sobre nada ou sobre nota anterior desta rotina —
    // nunca sobre o que um operador anotou.
    if (!atual || atual.startsWith('Contraparte')) {
      const { error: erroNota } = await sb
        .from('lancamentos')
        .update({ observacao: nota })
        .eq('id', l.id)
        .eq('aguarda_destino', true)
      if (!erroNota && atual !== nota) rodada.anotados.push({ lancamento: l.id, contraparte })
    }
  }

  // A porta que restou para o destino é o RELATÓRIO POR RETIRADA: com
  // `execute_after_withdrawal`, o gateway gera um arquivo a cada saque, e com
  // `include_withdrawal_at_end` esse arquivo termina no rodapé de detalhe —
  // o único lugar em que ele escreve para onde o dinheiro foi. O relatório
  // manual comprovadamente ignora o rodapé, e a esteira de importação está
  // protegida por construção: arquivo de janela curta nunca passa no
  // `relatorioServe`. O fim do arquivo continua indo às amostras, cru.
  if (fila.length) {
    const configCru = await texto('/v1/account/release_report/config')
    let config: Record<string, unknown> | null = null
    try {
      config = JSON.parse(configCru.corpo) as Record<string, unknown>
    } catch {
      config = null
    }
    if (
      config &&
      (config.include_withdrawal_at_end !== true || config.execute_after_withdrawal !== true)
    ) {
      const ligado = await sondar(
        '/v1/account/release_report/config',
        'PUT',
        JSON.stringify({ ...config, include_withdrawal_at_end: true, execute_after_withdrawal: true }),
      )
      rodada.amostras.push(ligado)
    } else if (config) {
      try {
        const arquivos = await relatoriosDisponiveis()
        // O arquivo do SAQUE, não o encomendado pela esteira: o gerado por
        // retirada não carrega o marcador "-manual-" no nome.
        const doSaque = arquivos.find((a) => !a.arquivo.includes('-manual-')) ?? arquivos[0]
        if (doSaque?.arquivo) {
          const csv = await texto(`/v1/account/release_report/${doSaque.arquivo}`)
          rodada.amostras.push({
            caminho: doSaque.arquivo,
            metodo: 'GET',
            status: csv.status,
            corpo: csv.corpo.slice(-1600),
          })
          if (csv.status === 200) {
            const destinos = destinosDoRodape(lerLiberacoes(csv.corpo).rodape)
            if (destinos.length) {
              const porFonte = new Map(destinos.map((d) => [d.fonte, d.nome]))
              for (const l of filaCompleta) {
                const idMov = idDoMovimento(l)
                const nome = idMov ? porFonte.get(idMov) : undefined
                if (nome) await gravarDestino(l, contraparteDe(nome) || nome)
              }
            }
          }
        }
      } catch {
        /* amostra é diagnóstico; não pode derrubar a rodada */
      }
    }
  }

  let primeiro = true
  for (const l of fila) {
    // Já resolvido pelo rodapé nesta mesma rodada: nada a sondar.
    if (rodada.resolvidos.some((r) => r.lancamento === l.id)) continue
    // A própria descrição às vezes decide ("Compra de etiquetas de envio").
    const pelaDescricao = categoriaPelaContraparte(l.descricao)
    if (pelaDescricao) {
      rodada.examinados++
      if (await resolver(l.id, pelaDescricao)) {
        rodada.resolvidos.push({ lancamento: l.id, contraparte: l.descricao ?? '', categoria: pelaDescricao })
      }
      continue
    }

    const idMovimento = (l.chave_externa ?? l.id).match(/:(\d{6,}):payout:/)?.[1]
    if (!idMovimento) continue
    rodada.examinados++

    const caminhos = [
      `/v1/payments/${idMovimento}`,
      `/v1/transfers/${idMovimento}`,
      `/v1/withdrawals/${idMovimento}`,
      `/v1/account/withdrawals/${idMovimento}`,
      `/v1/account/movements/${idMovimento}`,
    ]
    let contraparte: string | null = null
    for (const caminho of caminhos) {
      const r = await texto(caminho)
      if (primeiro) rodada.amostras.push({ caminho, metodo: 'GET', status: r.status, corpo: r.corpo.slice(0, 700) })
      if (r.status !== 200) continue
      let objeto: unknown
      try {
        objeto = JSON.parse(r.corpo)
      } catch {
        continue
      }
      if (!objeto || typeof objeto !== 'object') continue
      // O mesmo leitor de nome dos pagamentos, com a mesma limpeza: o nome da
      // própria casa não é contraparte de nada.
      const nome = contraparteDe(nomeDaContraparte(objeto as Record<string, unknown>))
      if (nome) {
        contraparte = nome
        break
      }
    }
    primeiro = false
    if (!contraparte) {
      // Sondado e mudo: fica anotado para a rotina não bater nos mesmos 404
      // a cada rodada — e para quem abrir o lançamento saber que a resposta
      // automática já foi tentada.
      if (!(l.observacao ?? '').trim()) {
        await sb
          .from('lancamentos')
          .update({ observacao: 'Contraparte: o gateway não revela o destinatário deste saque — decisão manual em Repasses.' })
          .eq('id', l.id)
          .eq('aguarda_destino', true)
      }
      continue
    }

    const categoria = categoriaPelaContraparte(contraparte)
    if (categoria) {
      if (await resolver(l.id, categoria)) {
        rodada.resolvidos.push({ lancamento: l.id, contraparte, categoria })
        // O favorecido vira a descrição visível quando ela era o rótulo
        // genérico do extrato: "Transferência para conta bancária" descrevia
        // errado uma despesa com dono conhecido.
        if ((l.descricao ?? '').trim() === 'Transferência para conta bancária') {
          await sb.from('lancamentos').update({ descricao: contraparte }).eq('id', l.id)
        }
      }
      continue
    }
    if (!(l.observacao ?? '').trim()) {
      const { error: erroNota } = await sb
        .from('lancamentos')
        .update({ observacao: `Contraparte (API do gateway): ${contraparte}` })
        .eq('id', l.id)
        .eq('aguarda_destino', true)
      if (!erroNota) rodada.anotados.push({ lancamento: l.id, contraparte })
    }
  }
  return rodada
}
