import 'server-only'

import {
  creditoVale,
  dataDe as textoData,
  janelaDoPeriodo,
  metricasCashback,
  saldoDoExtrato,
  type CarteiraCashback,
  type MetricasCashback,
  type MovimentoGravado,
  type Periodo,
  hojeEmSaoPaulo,
} from '@/domain'

import { supabaseConfigurado, supabaseServer } from './supabase'
import { chamarYampi, yampiConfigurada } from './yampi'

/**
 * Cashback ESPELHADO da Yampi.
 *
 * O cashback nasce, é resgatado e expira no checkout da Yampi — o ERP não
 * mantém livro próprio, ele retrata. A fonte é o extrato de cada cliente
 * (`/pricing/wallet/statement/{customerId}`): o endpoint de saldo não existe
 * nesta conta, e o extrato traz mais — quanto foi creditado, quanto já foi
 * usado, quando vence. A sincronização varre o cadastro de clientes em
 * rodadas e grava dois retratos: a carteira em `cashback_yampi` e cada
 * movimento em `cashback_movimentos`, de onde saem as métricas de período.
 *
 * Nada de diagnóstico aqui vai para a tela: quando algo não bate, o motivo
 * vai para o log do servidor. A tela mostra o resultado, não a investigação.
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
}

/** Telefone do cliente da Yampi, só dígitos, em qualquer formato que ela use. */
function telefoneDe(c: Record<string, unknown>): string | null {
  const cru =
    campo(c, ['whatsapp', 'phone', 'cellphone']) ??
    (miolo(campo(c, ['phone'])) as Record<string, unknown> | undefined)?.full_number
  const bruto = miolo(cru)
  const texto =
    typeof bruto === 'string'
      ? bruto
      : bruto && typeof bruto === 'object'
        ? String(campo(bruto as Record<string, unknown>, ['full_number', 'number', 'phone']) ?? '')
        : ''
  const digitos = texto.replace(/\D/g, '')
  return digitos.length >= 10 ? digitos : null
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
  const hoje = hojeEmSaoPaulo()

  for (let pagina = Math.max(1, paginaInicial); ; pagina++) {
    const r = await chamarYampi<{
      data?: Record<string, unknown>[]
      meta?: { pagination?: { current_page: number; total_pages: number } }
    }>('/customers', { limit: '50', page: String(pagina) })
    const clientes = r.data ?? []

    const linhas: Record<string, unknown>[] = []
    const movimentos: Record<string, unknown>[] = []

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
      let extrato: Record<string, unknown>[] = []
      let tentativas = 0
      for (;;) {
        try {
          extrato = movimentosDe(await chamarYampi(`/pricing/wallet/statement/${String(id)}`))
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

      const saldo = saldoDoExtrato(extrato)
      if (saldo > 0) comSaldo++

      // O que a gestão precisa e o saldo sozinho não conta: quando vence o
      // próximo crédito, quanto já entrou e saiu, e a última compra que
      // gerou cashback.
      let gerado = 0
      let usado = 0
      let expiraEm: string | null = null
      let ultimoCredito: string | null = null
      for (const m of extrato) {
        const mid = campo(m, ['id'])
        const tipo = String(campo(m, ['transaction_type', 'type', 'operation', 'kind']) ?? 'credit')
        const valor = numero(campo(m, ['amount', 'value', 'total']))
        const gasto = numero(campo(m, ['used_amount', 'used', 'consumed_amount']))
        const criadoEm = textoData(campo(m, ['created_at', 'date', 'createdAt']))
        const venceEm = textoData(campo(m, ['expires_at', 'expire_at', 'expiration_date']))
        const vale = creditoVale(m, hoje)
        const credito = !/debit|debito|débito|resgate|withdraw/i.test(tipo)
        const pedidoCru = miolo(campo(m, ['order'])) as Record<string, unknown> | undefined
        const pedido = pedidoCru ? campo(pedidoCru, ['number', 'id']) : campo(m, ['order_id'])

        if (credito) {
          gerado += valor
          usado += gasto
          if (criadoEm && (!ultimoCredito || criadoEm > ultimoCredito)) ultimoCredito = criadoEm
          // Vence primeiro o crédito vivo mais próximo: é o que a operação
          // persegue quando avisa o cliente.
          if (vale && valor - gasto > 0 && venceEm && (!expiraEm || venceEm < expiraEm)) {
            expiraEm = venceEm.slice(0, 10)
          }
        }

        if (mid !== undefined) {
          movimentos.push({
            id: String(mid),
            customer_id: String(id),
            tipo,
            valor: Math.round(valor * 100) / 100,
            usado: Math.round(gasto * 100) / 100,
            status: String(campo(m, ['status']) ?? ''),
            pedido: pedido !== undefined ? String(pedido) : null,
            criado_em: criadoEm ? new Date(criadoEm.replace(' ', 'T')).toISOString() : null,
            expira_em: venceEm ? venceEm.slice(0, 10) : null,
            vale,
          })
        }
      }

      linhas.push({
        customer_id: String(id),
        email,
        nome,
        telefone: telefoneDe(c),
        saldo,
        expira_em: expiraEm,
        gerado: Math.round(gerado * 100) / 100,
        usado: Math.round(usado * 100) / 100,
        ultimo_credito_em: ultimoCredito ? new Date(ultimoCredito.replace(' ', 'T')).toISOString() : null,
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
    if (movimentos.length) {
      const { error } = await sb.from('cashback_movimentos').upsert(movimentos)
      // Movimento é histórico para métrica: se falhar, o saldo já está
      // gravado e a rodada continua — o erro vai para o log, não para a tela.
      if (error) console.error('[cashback] movimentos não gravados:', error.message)
    }

    const p = r.meta?.pagination
    const acabou = !p || p.current_page >= p.total_pages
    if (acabou) return { proximaPagina: null, lidos, comSaldo }
    if (Date.now() - inicio > prazoMs) return { proximaPagina: pagina + 1, lidos, comSaldo }
  }
}

export interface CarteiraYampi extends CarteiraCashback {
  atualizadoEm: string
}

export async function carteirasYampi(): Promise<{
  carteiras: CarteiraYampi[]
  ultimaSincronizacao: string | null
}> {
  if (!supabaseConfigurado()) return { carteiras: [], ultimaSincronizacao: null }
  const { data, error } = await supabaseServer()
    .from('cashback_yampi')
    .select('customer_id, email, nome, telefone, saldo, expira_em, ultimo_credito_em, aviso_em, atualizado_em')
    .gt('saldo', 0)
    .order('saldo', { ascending: false })
    .limit(5000)
  if (error) throw error

  const carteiras = ((data ?? []) as {
    customer_id: string
    email: string | null
    nome: string | null
    telefone: string | null
    saldo: number | string
    expira_em: string | null
    ultimo_credito_em: string | null
    aviso_em: string | null
    atualizado_em: string
  }[]).map((c) => ({
    customerId: c.customer_id,
    nome: c.nome ?? c.email ?? c.customer_id,
    email: c.email,
    telefone: c.telefone,
    saldo: Number(c.saldo),
    expiraEm: c.expira_em,
    ultimaCompra: c.ultimo_credito_em,
    avisoEm: c.aviso_em,
    atualizadoEm: c.atualizado_em,
  }))

  const ultima = carteiras.reduce<string | null>(
    (a, c) => (!a || c.atualizadoEm > a ? c.atualizadoEm : a),
    null,
  )
  return { carteiras, ultimaSincronizacao: ultima }
}

/**
 * As métricas do período: quanto de cashback nasceu, quanto foi usado, em
 * quantos pedidos, que fatia das vendas e quanto de receita isso moveu.
 *
 * Os movimentos vêm do espelho (não da Yampi ao vivo) porque a pergunta é
 * sobre um período inteiro — perguntar carteira a carteira levaria minutos
 * a cada troca de filtro.
 */
export async function metricasDoPeriodo(periodo: Periodo): Promise<MetricasCashback> {
  const vazio: MetricasCashback = {
    gerado: 0,
    utilizado: 0,
    pedidosComCashback: 0,
    percentualPedidos: 0,
    receita: 0,
    tempoMedioDeUso: null,
  }
  if (!supabaseConfigurado()) return vazio

  const { de, ate } = janelaDoPeriodo(periodo)
  const sb = supabaseServer()

  const { data: movs, error } = await sb
    .from('cashback_movimentos')
    .select('id, customer_id, tipo, valor, usado, pedido, criado_em, expira_em, vale')
    .gte('criado_em', de)
    .lt('criado_em', ate)
    .limit(20_000)
  if (error) throw error

  const movimentos: MovimentoGravado[] = ((movs ?? []) as Record<string, unknown>[]).map((m) => ({
    id: String(m.id),
    customerId: String(m.customer_id),
    tipo: String(m.tipo),
    valor: Number(m.valor),
    usado: Number(m.usado),
    pedido: (m.pedido as string | null) ?? null,
    criadoEm: (m.criado_em as string | null) ?? null,
    expiraEm: (m.expira_em as string | null) ?? null,
    vale: Boolean(m.vale),
  }))

  // Os pedidos do mesmo período, para a fatia e a receita. O id do pedido no
  // ERP é `YP-{número}`, e é o número que o movimento de cashback cita.
  const { data: pedidos, error: erroPedidos } = await sb
    .from('pedidos')
    .select('id, valor')
    .eq('pagamento', 'pago')
    .gte('comprado_em', de)
    .lt('comprado_em', ate)
    .limit(20_000)
  if (erroPedidos) throw erroPedidos

  const doPeriodo = ((pedidos ?? []) as { id: string; valor: number | string }[]).map((p) => ({
    id: p.id.replace(/^YP-/, ''),
    valor: Number(p.valor),
  }))

  return metricasCashback(movimentos, doPeriodo)
}

/** Marca que o cliente foi avisado do vencimento — some da fila do dia. */
export async function registrarAvisoCashback(customerIds: string[]): Promise<void> {
  if (!supabaseConfigurado() || customerIds.length === 0) return
  const { error } = await supabaseServer()
    .from('cashback_yampi')
    .update({ aviso_em: new Date().toISOString() })
    .in('customer_id', customerIds)
  if (error) throw error
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
  const hoje = hojeEmSaoPaulo()

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
