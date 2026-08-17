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

/**
 * Roda `tarefa` sobre a lista com no máximo `limite` em voo.
 *
 * A varredura era estritamente sequencial com 180 ms de pausa cega entre
 * clientes — 1.456 clientes × (uma consulta + 180 ms) não terminam dentro de
 * nenhum orçamento que a Netlify conceda. A pausa existia por causa de um 429
 * antigo, mas pausa fixa é o remédio errado: atrasa todo mundo para o caso de
 * um, e mesmo assim não protege se o limite for atingido. Quem protege é o
 * recuo em cima do 429, que está na leitura da carteira.
 */
async function emParalelo<T, R>(itens: T[], limite: number, tarefa: (t: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = new Array(itens.length)
  let proximo = 0
  const trabalhadores = Array.from({ length: Math.min(limite, itens.length) }, async () => {
    for (;;) {
      const i = proximo++
      if (i >= itens.length) return
      saida[i] = await tarefa(itens[i])
    }
  })
  await Promise.all(trabalhadores)
  return saida
}

export interface RodadaCashback {
  /** Página do cadastro de clientes onde a próxima rodada continua. */
  proximaPagina: number | null
  lidos: number
  comSaldo: number
  /** Quantas páginas o cadastro tem, quando a Yampi informa. */
  totalPaginas: number | null
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
/**
 * Lê a carteira de UM cliente, com recuo em cima do limite da Yampi.
 *
 * O recuo era de 15 s fixos, duas vezes: meio minuto parado dentro de uma
 * função que tem 26 s de vida. Uma carteira em 429 derrubava a rodada INTEIRA,
 * e o que se via era uma varredura que não gravava nada e não dizia por quê —
 * quatro dias seguidos sem uma única carteira atualizada.
 */
async function extratoDoCliente(id: string): Promise<Record<string, unknown>[]> {
  const recuos = [1_000, 3_000, 6_000]
  for (let tentativa = 0; ; tentativa++) {
    try {
      return movimentosDe(await chamarYampi(`/pricing/wallet/statement/${id}`))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Carteira inexistente = cliente nunca teve cashback: saldo zero.
      if (/404|não encontrou/i.test(msg)) return []
      if (/429|Too Many/i.test(msg) && tentativa < recuos.length) {
        await pausa(recuos[tentativa])
        continue
      }
      throw new Error(`Falha ao ler a carteira do cliente ${id}: ${msg}`)
    }
  }
}

interface RetratoDoCliente {
  linha: Record<string, unknown>
  movimentos: Record<string, unknown>[]
  temSaldo: boolean
}

/** O retrato de um cliente: a carteira e os movimentos dela. */
async function retratoDoCliente(
  c: Record<string, unknown>,
  hoje: string,
): Promise<RetratoDoCliente | null> {
  const idCru = campo(c, ['id'])
  if (idCru === undefined) return null
  const id = String(idCru)
  const nome =
    (typeof c.name === 'string' && c.name.trim()) ||
    [c.first_name, c.last_name].filter((x) => typeof x === 'string' && x).join(' ') ||
    null
  const email = typeof c.email === 'string' ? c.email.trim().toLowerCase() : null

  // O extrato é a fonte: o endpoint de saldo desta loja responde 404, e
  // era ele que fazia TODAS as carteiras aparecerem zeradas.
  const extrato = await extratoDoCliente(id)
  const saldo = saldoDoExtrato(extrato)
  const movimentos: Record<string, unknown>[] = []

  // O que a gestão precisa e o saldo sozinho não conta: quando vence o
  // próximo crédito, quanto já entrou e saiu, e a última compra que
  // gerou cashback.
  let gerado = 0
  let usado = 0
  let expiraEm: string | null = null
  let ultimoCredito: string | null = null
  {
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
            customer_id: id,
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
  }

  return {
    temSaldo: saldo > 0,
    movimentos,
    linha: {
      customer_id: id,
      email,
      nome,
      telefone: telefoneDe(c),
      saldo,
      expira_em: expiraEm,
      gerado: Math.round(gerado * 100) / 100,
      usado: Math.round(usado * 100) / 100,
      ultimo_credito_em: ultimoCredito ? new Date(ultimoCredito.replace(' ', 'T')).toISOString() : null,
      atualizado_em: new Date().toISOString(),
    },
  }
}

/** Quantas carteiras são lidas ao mesmo tempo. */
const CARTEIRAS_EM_PARALELO = 5

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
  let totalPaginas: number | null = null
  const hoje = hojeEmSaoPaulo()

  for (let pagina = Math.max(1, paginaInicial); ; pagina++) {
    const r = await chamarYampi<{
      data?: Record<string, unknown>[]
      meta?: { pagination?: { current_page: number; total_pages: number } }
    }>('/customers', { limit: '50', page: String(pagina) })
    const clientes = r.data ?? []

    const retratos = (await emParalelo(clientes, CARTEIRAS_EM_PARALELO, (c) => retratoDoCliente(c, hoje)))
      .filter(Boolean) as RetratoDoCliente[]

    lidos += retratos.length
    comSaldo += retratos.filter((x) => x.temSaldo).length
    const linhas = retratos.map((x) => x.linha)
    const movimentos = retratos.flatMap((x) => x.movimentos)

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
    if (p) totalPaginas = p.total_pages
    const acabou = !p || p.current_page >= p.total_pages
    if (acabou) return { proximaPagina: null, lidos, comSaldo, totalPaginas }
    if (Date.now() - inicio > prazoMs) {
      return { proximaPagina: pagina + 1, lidos, comSaldo, totalPaginas }
    }
  }
}

export interface PassadaDoEspelho {
  lidos: number
  comSaldo: number
  /** A passada inteira terminou nesta rodada. */
  completa: boolean
  paginaAtual: number
  totalPaginas: number | null
  duracaoMs: number
}

/**
 * UMA fatia da varredura, continuando de onde a anterior parou.
 *
 * A diferença para chamar `sincronizarCashbackYampi` direto é o marcador: a
 * página fica no banco, não numa variável que morre com a execução. Era essa a
 * razão de a varredura nunca alcançar a cauda do cadastro — cada rodada
 * recomeçava da página 1 e era cortada no mesmo lugar.
 */
export async function fatiaDoEspelhoDeCashback(prazoMs: number): Promise<PassadaDoEspelho> {
  const sb = supabaseServer()
  const comecou = Date.now()
  const { data: marcador } = await sb
    .from('cashback_varredura')
    .select('proxima_pagina, passada_iniciada_em')
    .eq('id', true)
    .maybeSingle()

  const pagina = Math.max(1, Number(marcador?.proxima_pagina) || 1)
  const agora = new Date().toISOString()

  try {
    const r = await sincronizarCashbackYampi(pagina, prazoMs)
    await sb
      .from('cashback_varredura')
      .update({
        proxima_pagina: r.proximaPagina ?? 1,
        passada_iniciada_em: pagina === 1 ? agora : (marcador?.passada_iniciada_em ?? agora),
        ...(r.proximaPagina === null ? { passada_concluida_em: new Date().toISOString() } : {}),
        rodada_em: new Date().toISOString(),
        rodada_lidos: r.lidos,
        rodada_erro: null,
        total_paginas: r.totalPaginas,
      })
      .eq('id', true)
    return {
      lidos: r.lidos,
      comSaldo: r.comSaldo,
      completa: r.proximaPagina === null,
      paginaAtual: pagina,
      totalPaginas: r.totalPaginas,
      duracaoMs: Date.now() - comecou,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // A falha fica GRAVADA. Quatro madrugadas seguidas sem uma carteira nova
    // não deixaram rastro em lugar nenhum: o pg_net só guarda seis horas, e a
    // rotina não escrevia o próprio fracasso.
    await sb
      .from('cashback_varredura')
      .update({ rodada_em: new Date().toISOString(), rodada_erro: msg.slice(0, 500) })
      .eq('id', true)
    throw e
  }
}

export interface CarteiraYampi extends CarteiraCashback {
  atualizadoEm: string
}

export async function carteirasYampi(): Promise<{
  carteiras: CarteiraYampi[]
  /**
   * Desde quando TODO o espelho está em pé.
   *
   * É a leitura mais VELHA do cadastro, não a mais nova. A mais nova sempre
   * existe — basta uma carteira lida há um minuto — e usá-la fazia a tela
   * anunciar "atualizado agora" com 356 carteiras de cinco dias atrás dentro
   * da mesma soma. Pior: a tela só se atualizava sozinha se essa data passasse
   * de seis horas, então a carteira recém-lida impedia para sempre a leitura
   * das outras. O número velho se defendia sozinho.
   */
  ultimaSincronizacao: string | null
}> {
  if (!supabaseConfigurado()) return { carteiras: [], ultimaSincronizacao: null }
  const { data: maisVelha } = await supabaseServer()
    .from('cashback_yampi')
    .select('atualizado_em')
    .order('atualizado_em', { ascending: true })
    .limit(1)
    .maybeSingle()
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

  return {
    carteiras,
    ultimaSincronizacao: (maisVelha?.atualizado_em as string | undefined) ?? null,
  }
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
