import 'server-only'

import { supabaseConfigurado, supabaseServer } from './supabase'
import { chamarYampi, yampiConfigurada } from './yampi'

/**
 * Cashback ESPELHADO da Yampi.
 *
 * O cashback nasce, é resgatado e expira no checkout da Yampi — o ERP não
 * mantém livro próprio, ele retrata. A carteira de cada cliente vem de
 * `/pricing/wallet/{customerId}/balance`, e o extrato completo de
 * `/pricing/wallet/statement/{customerId}` (endpoints do portal oficial).
 * Como o saldo é por cliente, a sincronização varre o cadastro de clientes
 * e consulta carteira a carteira — por isso ela roda em rodadas, com
 * progresso, e grava o retrato em `cashback_yampi`.
 */

function miolo(valor: unknown): unknown {
  if (valor && typeof valor === 'object' && !Array.isArray(valor) && 'data' in valor) {
    return (valor as { data: unknown }).data
  }
  return valor
}

function campo(registro: Record<string, unknown>, nomes: string[]): unknown {
  for (const nome of nomes) {
    if (nome in registro && registro[nome] !== null && registro[nome] !== undefined) {
      return registro[nome]
    }
  }
  return undefined
}

function numero(valor: unknown): number {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  if (typeof valor === 'string') {
    const n = Number(valor.replace(',', '.'))
    if (Number.isFinite(n)) return n
  }
  return 0
}

/** O saldo pode vir como número cru, `{ balance }`, `{ amount }` ou embrulhado. */
function saldoDe(resposta: unknown): number {
  const cru = miolo(resposta)
  if (typeof cru === 'number' || typeof cru === 'string') return numero(cru)
  if (cru && typeof cru === 'object') {
    return numero(campo(cru as Record<string, unknown>, ['balance', 'amount', 'value', 'total', 'saldo']))
  }
  return 0
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface RodadaCashback {
  /** Página do cadastro de clientes onde a próxima rodada continua. */
  proximaPagina: number | null
  lidos: number
  comSaldo: number
}

/**
 * Uma rodada de sincronização: varre páginas do cadastro de clientes da
 * Yampi, consulta a carteira de cada um e grava o retrato. Para no prazo e
 * devolve onde continuar — a tela repete até o fim.
 */
export async function sincronizarCashbackYampi(
  paginaInicial: number,
  prazoMs: number,
): Promise<RodadaCashback> {
  if (!yampiConfigurada()) {
    throw new Error('A Yampi precisa estar configurada para espelhar o cashback.')
  }
  const sb = supabaseConfigurado() ? supabaseServer() : null
  if (!sb) throw new Error('O Supabase precisa estar configurado para guardar o espelho.')

  const inicio = Date.now()
  let lidos = 0
  let comSaldo = 0

  for (let pagina = Math.max(1, paginaInicial); ; pagina++) {
    const r = await chamarYampi<{
      data?: Record<string, unknown>[]
      meta?: { pagination?: { current_page: number; total_pages: number } }
    }>('/customers', { limit: '50', page: String(pagina) })
    const clientes = r.data ?? []

    const linhas: {
      customer_id: string
      email: string | null
      nome: string | null
      saldo: number
      atualizado_em: string
    }[] = []

    for (const c of clientes) {
      const id = campo(c, ['id'])
      if (id === undefined) continue
      lidos++
      const nome =
        (typeof c.name === 'string' && c.name.trim()) ||
        [c.first_name, c.last_name].filter((x) => typeof x === 'string' && x).join(' ') ||
        null
      const email = typeof c.email === 'string' ? c.email.trim().toLowerCase() : null

      let saldo = 0
      let tentativas = 0
      for (;;) {
        try {
          saldo = saldoDe(await chamarYampi(`/pricing/wallet/${String(id)}/balance`))
          break
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          // Carteira inexistente = cliente nunca teve cashback: saldo zero.
          if (/404|não encontrou/i.test(msg)) break
          if (/429|Too Many/i.test(msg) && tentativas < 2) {
            tentativas++
            await pausa(15_000)
            continue
          }
          throw new Error(`Falha ao ler a carteira do cliente ${String(id)}: ${msg}`)
        }
      }
      if (saldo > 0) comSaldo++
      linhas.push({
        customer_id: String(id),
        email,
        nome,
        saldo: Math.round(saldo * 100) / 100,
        atualizado_em: new Date().toISOString(),
      })
      // Espaçamento curto: são muitas consultas pequenas, e o limite da
      // Yampi já nos derrubou uma vez.
      await pausa(180)
    }

    if (linhas.length) {
      const { error } = await sb.from('cashback_yampi').upsert(linhas)
      if (error) throw error
    }

    const p = r.meta?.pagination
    const acabou = !p || p.current_page >= p.total_pages
    if (acabou) return { proximaPagina: null, lidos, comSaldo }
    if (Date.now() - inicio > prazoMs) return { proximaPagina: pagina + 1, lidos, comSaldo }
  }
}

export interface CarteiraYampi {
  customerId: string
  nome: string
  email: string | null
  saldo: number
  atualizadoEm: string
}

export async function carteirasYampi(): Promise<{
  carteiras: CarteiraYampi[]
  ultimaSincronizacao: string | null
}> {
  if (!supabaseConfigurado()) return { carteiras: [], ultimaSincronizacao: null }
  const { data, error } = await supabaseServer()
    .from('cashback_yampi')
    .select('customer_id, email, nome, saldo, atualizado_em')
    .order('saldo', { ascending: false })
    .limit(5000)
  if (error) throw error

  const carteiras = ((data ?? []) as {
    customer_id: string
    email: string | null
    nome: string | null
    saldo: number | string
    atualizado_em: string
  }[]).map((c) => ({
    customerId: c.customer_id,
    nome: c.nome ?? c.email ?? c.customer_id,
    email: c.email,
    saldo: Number(c.saldo),
    atualizadoEm: c.atualizado_em,
  }))

  const ultima = carteiras.reduce<string | null>(
    (a, c) => (!a || c.atualizadoEm > a ? c.atualizadoEm : a),
    null,
  )
  return { carteiras, ultimaSincronizacao: ultima }
}

export interface MovimentoCashback {
  quando: string | null
  valor: number
  /** Como a Yampi descreve o movimento (crédito, resgate, expiração…). */
  rotulo: string
  descricao: string | null
  expiraEm: string | null
}

/**
 * Extrato de UMA carteira, lido ao vivo — é o detalhe que não vale espelhar:
 * muda a cada pedido e só interessa quando alguém abre o cliente.
 */
export async function extratoCashbackYampi(customerId: string): Promise<{
  movimentos: MovimentoCashback[]
  camposCrus: string[]
}> {
  const r = await chamarYampi<unknown>(`/pricing/wallet/statement/${encodeURIComponent(customerId)}`)
  const cru = miolo(r)
  const lista = Array.isArray(cru) ? cru : []

  const movimentos = (lista as Record<string, unknown>[]).map((m) => {
    const dataCru = miolo(campo(m, ['created_at', 'date', 'createdAt']))
    const expiraCru = miolo(campo(m, ['expires_at', 'expire_at', 'expiration_date']))
    const texto = (v: unknown) =>
      typeof v === 'string'
        ? v
        : v && typeof v === 'object' && 'date' in (v as object)
          ? String((v as { date: unknown }).date)
          : null
    const tipoCru = campo(m, ['type', 'operation', 'kind', 'description_type'])
    return {
      quando: texto(dataCru),
      valor: numero(campo(m, ['value', 'amount', 'total'])),
      rotulo: typeof tipoCru === 'string' ? tipoCru : 'movimento',
      descricao:
        (typeof m.description === 'string' && m.description) ||
        (typeof m.order_id !== 'undefined' ? `pedido ${String(m.order_id)}` : null),
      expiraEm: texto(expiraCru),
    }
  })

  return {
    movimentos,
    camposCrus: lista[0] ? Object.keys(lista[0] as object).sort() : [],
  }
}
