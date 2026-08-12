/**
 * A regra do saldo de cashback — pura, para poder ser testada e reusada.
 *
 * O saldo desta loja NÃO vem de `/pricing/wallet/{id}/balance`: esse endpoint
 * responde 404 aqui, e era ele que fazia todas as carteiras aparecerem
 * zeradas. Vem do extrato, que traz cada crédito com o que sobrou dele —
 * `amount` gerado, `used_amount` já gasto, `status`, `cancelled_at`,
 * `expires_at`. Somar o que resta dos créditos vivos dá o número do painel.
 */

function miolo(valor: unknown): unknown {
  if (valor && typeof valor === 'object' && !Array.isArray(valor) && 'data' in valor) {
    return (valor as { data: unknown }).data
  }
  return valor
}

export function campoDe(registro: Record<string, unknown>, nomes: string[]): unknown {
  for (const nome of nomes) {
    if (nome in registro && registro[nome] !== null && registro[nome] !== undefined) {
      return registro[nome]
    }
  }
  return undefined
}

export function numeroDe(valor: unknown): number {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  if (typeof valor === 'string') {
    const n = Number(valor.replace(',', '.'))
    if (Number.isFinite(n)) return n
  }
  return 0
}

/** Data de dentro de string ou de `{ date: '...' }`, como a Yampi manda. */
export function dataDe(valor: unknown): string | null {
  const cru = miolo(valor)
  if (typeof cru === 'string' && cru.trim()) return cru.trim()
  if (cru && typeof cru === 'object' && 'date' in cru) {
    const d = (cru as { date: unknown }).date
    return typeof d === 'string' ? d : null
  }
  return null
}

/** O movimento vale para o saldo: crédito aprovado, vivo e dentro do prazo. */
export function creditoVale(m: Record<string, unknown>, diaDeHoje: string): boolean {
  const tipo = String(campoDe(m, ['transaction_type', 'type', 'operation', 'kind']) ?? 'credit')
  if (/debit|debito|débito|resgate|withdraw/i.test(tipo)) return false

  const status = String(campoDe(m, ['status']) ?? 'approved').toLowerCase()
  if (status && !/approved|aprovado|active|ativo|paid/.test(status)) return false
  if (campoDe(m, ['cancelled_at', 'canceled_at'])) return false
  if (campoDe(m, ['expired'])) return false

  const expira = dataDe(campoDe(m, ['expires_at', 'expire_at', 'expiration_date']))
  return !(expira && expira.slice(0, 10) < diaDeHoje)
}

/**
 * O saldo da carteira a partir dos movimentos do extrato.
 *
 * Débitos não são subtraídos de novo: o gasto já está descontado em
 * `used_amount` do próprio crédito, e tirar duas vezes deixaria o saldo
 * negativo.
 */
export function saldoDoExtrato(lista: Record<string, unknown>[], hoje = new Date()): number {
  const diaDeHoje = hoje.toISOString().slice(0, 10)
  let total = 0
  for (const m of lista) {
    if (!creditoVale(m, diaDeHoje)) continue
    const resta =
      numeroDe(campoDe(m, ['amount', 'value', 'total'])) -
      numeroDe(campoDe(m, ['used_amount', 'used', 'consumed_amount']))
    if (resta > 0) total += resta
  }
  return Math.round(total * 100) / 100
}

// ── Gestão do cashback ─────────────────────────────────────────────────────

/** Um movimento do extrato já normalizado — como o ERP o guarda. */
export interface MovimentoGravado {
  id: string
  customerId: string
  tipo: string
  valor: number
  usado: number
  pedido: string | null
  criadoEm: string | null
  expiraEm: string | null
  vale: boolean
}

/** A carteira de um cliente, do jeito que a tela de gestão precisa. */
export interface CarteiraCashback {
  customerId: string
  nome: string
  email: string | null
  telefone: string | null
  saldo: number
  /** Vencimento do crédito vivo que expira primeiro. */
  expiraEm: string | null
  /** Data da última compra que gerou cashback. */
  ultimaCompra: string | null
  /** Quando o ERP avisou este cliente pela última vez. */
  avisoEm: string | null
}

export type FaixaVencimento = 'todos' | '7' | '15' | '30' | 'expirados'

/** Dias até o cashback vencer — negativo quando já venceu. */
export function diasAteVencer(expiraEm: string | null, hoje = new Date()): number | null {
  if (!expiraEm) return null
  const alvo = new Date(`${expiraEm.slice(0, 10)}T12:00:00Z`).getTime()
  const base = new Date(`${hoje.toISOString().slice(0, 10)}T12:00:00Z`).getTime()
  if (Number.isNaN(alvo)) return null
  return Math.round((alvo - base) / 86_400_000)
}

/** Recorte por proximidade do vencimento — o que a operação persegue. */
export function naFaixa(c: CarteiraCashback, faixa: FaixaVencimento, hoje = new Date()): boolean {
  if (faixa === 'todos') return true
  const dias = diasAteVencer(c.expiraEm, hoje)
  if (dias === null) return false
  if (faixa === 'expirados') return dias < 0
  return dias >= 0 && dias <= Number(faixa)
}

export type Periodo = 'hoje' | 'ontem' | '7dias' | 'mes' | 'ano'

export const ROTULO_PERIODO: Record<Periodo, string> = {
  hoje: 'Hoje',
  ontem: 'Ontem',
  '7dias': 'Últimos 7 dias',
  mes: 'Mês atual',
  ano: 'Ano atual',
}

/** Começo e fim (exclusivo) do período, em ISO — a régua das métricas. */
export function janelaDoPeriodo(periodo: Periodo, hoje = new Date()): { de: string; ate: string } {
  const dia = new Date(`${hoje.toISOString().slice(0, 10)}T00:00:00.000Z`)
  const amanha = new Date(dia.getTime() + 86_400_000)
  switch (periodo) {
    case 'hoje':
      return { de: dia.toISOString(), ate: amanha.toISOString() }
    case 'ontem':
      return { de: new Date(dia.getTime() - 86_400_000).toISOString(), ate: dia.toISOString() }
    case '7dias':
      return { de: new Date(dia.getTime() - 6 * 86_400_000).toISOString(), ate: amanha.toISOString() }
    case 'mes':
      return {
        de: new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), 1)).toISOString(),
        ate: amanha.toISOString(),
      }
    case 'ano':
      return {
        de: new Date(Date.UTC(dia.getUTCFullYear(), 0, 1)).toISOString(),
        ate: amanha.toISOString(),
      }
  }
}

export interface MetricasCashback {
  gerado: number
  utilizado: number
  pedidosComCashback: number
  /** Fatia dos pedidos do período que geraram cashback. */
  percentualPedidos: number
  /** Faturamento dos pedidos que geraram cashback. */
  receita: number
  /** Dias médios entre ganhar o cashback e começar a usá-lo — null sem uso. */
  tempoMedioDeUso: number | null
}

/**
 * As métricas do período a partir dos movimentos gravados.
 *
 * `utilizado` sai do que cada crédito registra como gasto (`usado`), e não
 * de lançamentos de débito: a Yampi desta loja não emite débito separado —
 * ela abate no próprio crédito. Contar as duas coisas dobraria o número.
 */
export function metricasCashback(
  movimentos: MovimentoGravado[],
  pedidosNoPeriodo: { id: string; valor: number }[],
  hoje = new Date(),
): MetricasCashback {
  const creditos = movimentos.filter((m) => !/debit|debito|débito|resgate|withdraw/i.test(m.tipo))
  const gerado = creditos.reduce((a, m) => a + m.valor, 0)
  const utilizado = creditos.reduce((a, m) => a + m.usado, 0)

  const pedidosCitados = new Set(creditos.map((m) => m.pedido).filter(Boolean) as string[])
  const valorPorPedido = new Map(pedidosNoPeriodo.map((p) => [p.id, p.valor]))
  const receita = [...pedidosCitados].reduce((a, id) => a + (valorPorPedido.get(id) ?? 0), 0)

  // Tempo médio de uso: dos créditos já consumidos, quanto tempo ficaram
  // parados. Sem data do resgate, o melhor sinal honesto é a idade do
  // crédito consumido — e ele só entra na média quando houve consumo.
  const consumidos = creditos.filter((m) => m.usado > 0 && m.criadoEm)
  const tempoMedioDeUso = consumidos.length
    ? Math.round(
        consumidos.reduce(
          (a, m) => a + (hoje.getTime() - new Date(m.criadoEm as string).getTime()) / 86_400_000,
          0,
        ) / consumidos.length,
      )
    : null

  return {
    gerado: Math.round(gerado * 100) / 100,
    utilizado: Math.round(utilizado * 100) / 100,
    pedidosComCashback: pedidosCitados.size,
    percentualPedidos: pedidosNoPeriodo.length
      ? Math.round((pedidosCitados.size / pedidosNoPeriodo.length) * 100)
      : 0,
    receita: Math.round(receita * 100) / 100,
    tempoMedioDeUso,
  }
}
