import 'server-only'

import { creditoVale, dataDe as textoData, saldoDoExtrato } from '@/domain'

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

/** A lista de movimentos de dentro da resposta do extrato, em qualquer embrulho. */
function movimentosDe(resposta: unknown): Record<string, unknown>[] {
  const cru = miolo(resposta)
  if (Array.isArray(cru)) return cru as Record<string, unknown>[]
  if (cru && typeof cru === 'object') {
    for (const nome of ['transactions', 'statement', 'movements', 'items']) {
      const dentro = miolo((cru as Record<string, unknown>)[nome])
      if (Array.isArray(dentro)) return dentro as Record<string, unknown>[]
    }
  }
  return []
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface RodadaCashback {
  /** Página do cadastro de clientes onde a próxima rodada continua. */
  proximaPagina: number | null
  lidos: number
  comSaldo: number
  /**
   * Respostas CRUAS de carteira, para diagnóstico: quando tudo vem zerado,
   * a diferença entre "a loja não tem cashback" e "o leitor não entendeu o
   * formato" está aqui — e se conserta em cima do fato, não de palpite.
   */
  amostraCrua: string[]
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
  const amostraCrua: string[] = []

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

      // O extrato é a fonte: o endpoint de saldo desta loja responde 404, e
      // era ele que fazia TODAS as carteiras aparecerem zeradas.
      let saldo = 0
      let tentativas = 0
      for (;;) {
        try {
          const cru = await chamarYampi(`/pricing/wallet/statement/${String(id)}`)
          if (amostraCrua.length < 3) {
            try {
              amostraCrua.push(JSON.stringify(cru).slice(0, 320))
            } catch {
              /* amostra é diagnóstico, não pode derrubar a leitura */
            }
          }
          saldo = saldoDoExtrato(movimentosDe(cru))
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
    if (acabou) return { proximaPagina: null, lidos, comSaldo, amostraCrua }
    if (Date.now() - inicio > prazoMs) return { proximaPagina: pagina + 1, lidos, comSaldo, amostraCrua }
  }
}

/**
 * Diagnóstico instantâneo: a resposta CRUA da carteira do primeiro cliente.
 * É o que separa "a loja não tem cashback" de "o leitor não entendeu o
 * formato" sem esperar uma varredura inteira.
 */
export async function amostraCarteiraCrua(): Promise<{ saldoCru: string; extratoCru: string }> {
  const r = await chamarYampi<{ data?: Record<string, unknown>[] }>('/customers', { limit: '1', page: '1' })
  const id = r.data?.[0] ? campo(r.data[0], ['id']) : undefined
  if (id === undefined) throw new Error('A Yampi não devolveu nenhum cliente para diagnosticar.')
  const json = (v: unknown) => {
    try {
      return JSON.stringify(v).slice(0, 500)
    } catch {
      return '(resposta não serializável)'
    }
  }
  let saldoCru = ''
  try {
    saldoCru = json(await chamarYampi(`/pricing/wallet/${String(id)}/balance`))
  } catch (e) {
    saldoCru = `ERRO: ${e instanceof Error ? e.message : String(e)}`
  }
  let extratoCru = ''
  try {
    extratoCru = json(await chamarYampi(`/pricing/wallet/statement/${String(id)}`))
  } catch (e) {
    extratoCru = `ERRO: ${e instanceof Error ? e.message : String(e)}`
  }
  return { saldoCru, extratoCru }
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
  /** Quanto deste crédito já foi gasto — o que sobra é `valor - usado`. */
  usado: number
  /** Crédito vivo: aprovado, não cancelado, dentro da validade. */
  vale: boolean
  /** Pedido que gerou o movimento, quando a Yampi informa. */
  pedido: string | null
}

/**
 * Extrato de UMA carteira, lido ao vivo — é o detalhe que não vale espelhar:
 * muda a cada pedido e só interessa quando alguém abre o cliente.
 */
export async function extratoCashbackYampi(customerId: string): Promise<{
  movimentos: MovimentoCashback[]
  /** Soma do que ainda vale — o mesmo cálculo que alimenta o espelho. */
  saldo: number
  camposCrus: string[]
}> {
  const r = await chamarYampi<unknown>(`/pricing/wallet/statement/${encodeURIComponent(customerId)}`)
  const lista = movimentosDe(r)
  const hoje = new Date().toISOString().slice(0, 10)

  const movimentos = lista.map((m) => {
    const tipoCru = campo(m, ['transaction_type', 'type', 'operation', 'kind'])
    const pedidoCru = miolo(campo(m, ['order'])) as Record<string, unknown> | undefined
    const numeroPedido = pedidoCru ? campo(pedidoCru, ['number', 'id']) : campo(m, ['order_id'])

    return {
      quando: textoData(campo(m, ['created_at', 'date', 'createdAt'])),
      valor: numero(campo(m, ['amount', 'value', 'total'])),
      usado: numero(campo(m, ['used_amount', 'used', 'consumed_amount'])),
      rotulo: typeof tipoCru === 'string' ? tipoCru : 'movimento',
      // Mesma regra que soma o saldo — a linha da tela e o total não podem
      // discordar sobre o que conta.
      vale: creditoVale(m, hoje),
      descricao: typeof m.description === 'string' ? m.description : null,
      expiraEm: textoData(campo(m, ['expires_at', 'expire_at', 'expiration_date'])),
      pedido: numeroPedido !== undefined ? String(numeroPedido) : null,
    }
  })

  return {
    movimentos,
    saldo: saldoDoExtrato(lista),
    camposCrus: lista[0] ? Object.keys(lista[0]).sort() : [],
  }
}
