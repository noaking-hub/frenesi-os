import type { FrascoMl, VarianteMl } from './types'

/**
 * Frasco em que a variante é envasada.
 *
 * 3, 5 e 8 ml vão para o frasco de 8 ml — 3 e 5 ficam parcialmente cheios.
 * 10 e 15 ml vão para o de 15 ml — 10 fica parcialmente cheio.
 *
 * Consequência que atravessa o portal: a foto do nível do líquido é a evidência
 * de uso, e um decant de 5 ml num frasco de 8 ml DEVE parecer parcialmente cheio.
 */
export function frascoDe(variante: VarianteMl): FrascoMl {
  return variante <= 8 ? 8 : 15
}

/** "5 ml · frasco de 8 ml" — como o portal descreve o item ao cliente. */
export function descreveVariante(variante: VarianteMl): string {
  return `${variante} ml · frasco de ${frascoDe(variante)} ml`
}

/**
 * Volume de base consumido para produzir `unidades` de uma variante,
 * já com a perda técnica estimada embutida.
 */
export function volumeConsumido(
  unidades: number,
  variante: VarianteMl,
  perdaPct: number,
): number {
  return Math.round(unidades * variante * (1 + perdaPct / 100) * 10) / 10
}
