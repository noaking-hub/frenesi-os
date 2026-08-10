import 'server-only'

import {
  casarPagamento,
  indexarPedidos,
  linhasDoPagamentoMp,
  normalizarPagamentoMp,
} from '@/domain'
import type {
  CasamentoPagamento,
  LinhaExtratoBruta,
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
  /** Pagamentos lidos da API, aprovados ou não. */
  lidos: number
  /** Linhas de extrato que a leitura produziu. */
  linhas: number
  novasLinhas: number
  linhasRepetidas: number
  /** Repasses atualizados com o que o gateway informou. */
  repassesConciliados: number
  repassesJaConciliados: number
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

  const linhas: LinhaExtratoBruta[] = []
  const paraConciliar: Record<string, unknown>[] = []
  const semPedido: ResultadoSincroniaMp['semPedido'] = []
  const criterios: Record<string, number> = {}

  for (const p of pagamentos) {
    const casamento: CasamentoPagamento | null = casarPagamento(p, indice)
    if (casamento) {
      criterios[casamento.criterio] = (criterios[casamento.criterio] ?? 0) + 1
    }

    linhas.push(...linhasDoPagamentoMp(p, casamento?.pedidoId ?? null))

    if (p.status !== 'approved') continue

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
      creditado_em: (p.liberadoEm ?? p.aprovadoEm ?? '').slice(0, 10) || null,
      gateway_id: p.id,
      bruto: p.bruto,
      taxa_real: p.tarifa,
    })
  }

  let novasLinhas = 0
  let linhasRepetidas = 0
  if (linhas.length) {
    // Lotes para não estourar o tamanho do corpo da chamada RPC.
    for (const lote of emLotes(linhas, 200)) {
      const { data, error } = await sb.rpc('importar_extrato', {
        p_origem: 'mercadopago',
        p_conta_id: CONTA_MP,
        p_linhas: lote,
      })
      if (error) throw new ErroMercadoPago(mensagemDe(error))
      const r = (data ?? {}) as { novas?: number; repetidas?: number }
      novasLinhas += Number(r.novas ?? 0)
      linhasRepetidas += Number(r.repetidas ?? 0)
    }
  }

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

  return {
    periodo: { de, ate },
    lidos: pagamentos.length,
    linhas: linhas.length,
    novasLinhas,
    linhasRepetidas,
    repassesConciliados,
    repassesJaConciliados,
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
