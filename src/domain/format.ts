/** Formatação pt-BR. Todo número renderizado passa por aqui. */

/** Espaço não-quebrável usado entre valor e unidade ("90 ml" nunca quebra linha). */
export const NBSP = ' '

export function brl(n: number): string {
  return `R$ ${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/, '.')}`
}

/** Número com no máximo 2 casas, sem zeros à direita: 3 → "3", 3,25 → "3,25". */
export function num(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace('.', ',')
}

/** Volume em ml, com separador de milhar e no máximo 1 casa. */
export function ml(n: number): string {
  const s = (Math.round(n * 10) / 10).toString().replace('.', ',')
  const [inteiro, decimal] = s.split(',')
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (decimal ? `,${decimal}` : '')
}

/** Volume já com a unidade colada por espaço não-quebrável. */
export function volume(n: number): string {
  return `${ml(n)}${NBSP}ml`
}

export function pct(n: number, casas = 1): string {
  return `${n.toFixed(casas).replace('.', ',')}%`
}

/** Pluralização simples: 1 item / 3 itens. */
export function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

/** Contagem com dois dígitos, do jeito que o dashboard mostra pendências. */
export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function parseNum(v: string | number): number {
  if (typeof v === 'number') return v
  const n = parseFloat(String(v).replace(',', '.'))
  return Number.isNaN(n) ? 0 : n
}
