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
