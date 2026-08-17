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

/**
 * Fuso da operação. A FRENESI vende, fatura e fecha o caixa no horário de
 * Brasília; o banco guarda `timestamptz`, que o PostgREST devolve em UTC.
 */
export const FUSO_DA_OPERACAO = 'America/Sao_Paulo'

// 'en-CA' formata data como AAAA-MM-DD, que é o formato que o resto do
// domínio compara com `<` e `>`. Criado uma vez: instanciar Intl por linha
// custa caro num laço de milhares de pedidos.
const DIA_LOCAL = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_DA_OPERACAO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * O DIA em que a venda aconteceu para quem trabalha aqui.
 *
 * Cortar os dez primeiros caracteres do ISO devolve a data em UTC, e isso
 * jogava todo pedido feito depois das 21h para o dia seguinte. No gráfico de
 * faturamento diário aparecia como divergência contra a loja: 13/08 fechava
 * R$ 1.779,35 aqui e R$ 2.585,97 lá, porque quatro pedidos da noite tinham
 * migrado para 14/08. Não faltava venda — faltava fuso.
 *
 * Data pura (AAAA-MM-DD) volta intacta: ela já é um dia, não um instante, e
 * convertê-la a empurraria um dia para trás.
 */
export function diaDaOperacao(instante: string): string {
  if (instante.length <= 10) return instante
  const d = new Date(instante)
  return Number.isNaN(d.getTime()) ? instante.slice(0, 10) : DIA_LOCAL.format(d)
}

/**
 * dd/mm/aaaa a partir de AAAA-MM-DD, sem passar por `Date` (que desloca fuso).
 *
 * Existe ao lado de `diaCurtoPt` (dd/mm) por causa do cronograma de
 * parcelamento: 48 parcelas de 30 dias passam de três anos, e "06/11" numa
 * lista assim não diz de qual novembro se trata. Onde o ano é óbvio — a coluna
 * de baixa da tabela de lançamentos — o formato curto continua sendo o certo.
 */
export function diaPt(iso: string): string {
  const [a, m, d] = iso.split('-')
  return a && m && d ? `${d}/${m}/${a}` : iso
}
