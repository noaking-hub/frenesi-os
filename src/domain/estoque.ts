import { VARIANTES, TETO_SHOPIFY } from './types'
import type { AcaoSync, PerfumeBase, ProdutoDerivado, VarianteMl } from './types'

/**
 * Unidades vendáveis de uma variante:
 *   decants já envasados disponíveis + floor(volume base ÷ ml da variante)
 */
export function unidadesPossiveis(
  volumeBaseMl: number,
  variante: VarianteMl,
  prontos: number,
): number {
  return prontos + Math.floor(volumeBaseMl / variante)
}

export interface VarianteSync {
  variante: VarianteMl
  /** Decants prontos e não reservados. */
  prontos: number
  /** Unidades que o volume base ainda permite fracionar. */
  doVolume: number
  possivel: number
  /** O que está publicado na Shopify hoje. */
  publicado: number
  /** Unidades vendáveis sem lastro — pedidos que não seriam atendidos. */
  excesso: number
  acao: AcaoSync
  /** Valor que a sincronia vai gravar na Shopify. */
  novoValor: number
  /** Por que essa ação — sempre derivado dos números acima. */
  detalhe: string
  rotulo: string
}

/**
 * Decide o que fazer com uma variante na Shopify.
 *
 * O cliente controla estoque manualmente lá, sempre preenchendo 20 unidades por
 * variante e decrementando à mão. Isso desvia da realidade nos dois sentidos.
 *
 *   possível = 0                       → esgotar, ainda que haja 20 lá
 *   possível < publicado               → reduzir para possível
 *   publicado < 20 && possível >= 20   → repor ao teto (decremento desatualizado)
 *   possível >= publicado              → em dia
 *
 * Nunca sobe acima do teto de 20 — é política do cliente.
 */
export function sincronizarVariante(
  volumeBaseMl: number,
  variante: VarianteMl,
  prontos: number,
  publicado: number,
): VarianteSync {
  const doVolume = Math.floor(volumeBaseMl / variante)
  const possivel = prontos + doVolume
  const excesso = Math.max(0, publicado - possivel)

  const acao: AcaoSync =
    possivel === 0
      ? 'esgotar'
      : excesso > 0
        ? 'reduzir'
        : publicado < TETO_SHOPIFY && possivel >= TETO_SHOPIFY
          ? 'repor'
          : 'ok'

  const novoValor =
    acao === 'ok' ? publicado : acao === 'repor' ? TETO_SHOPIFY : possivel

  const detalhe =
    possivel === 0
      ? 'sem volume para fracionar'
      : acao === 'repor'
        ? `volume permite ${possivel} · decremento manual antigo`
        : prontos
          ? `${prontos} prontos + ${doVolume} do volume`
          : `${doVolume} do volume base`

  const rotulo =
    acao === 'esgotar'
      ? 'Esgotar'
      : acao === 'reduzir'
        ? 'Reduzir'
        : acao === 'repor'
          ? 'Repor ao teto'
          : 'Em dia'

  return {
    variante,
    prontos,
    doVolume,
    possivel,
    publicado,
    excesso,
    acao,
    novoValor,
    detalhe,
    rotulo,
  }
}

export interface BaseSync {
  base: PerfumeBase
  variantes: VarianteSync[]
  pendentes: number
  resumo: string
}

export function sincronizarBase(
  base: PerfumeBase,
  derivados: ProdutoDerivado[],
  publicados: Record<string, number>,
): BaseSync {
  const variantes = VARIANTES.map((v) => {
    const d = derivados.find((x) => x.baseId === base.id && x.variante === v)
    const prontos = d ? d.envasadas - d.reservadas : 0
    const chave = `${base.id}|${v}`
    const publicado = publicados[chave] ?? TETO_SHOPIFY
    return sincronizarVariante(base.volumeMl, v, prontos, publicado)
  })

  const pendentes = variantes.filter((v) => v.acao !== 'ok').length

  return {
    base,
    variantes,
    pendentes,
    resumo:
      pendentes === 0
        ? 'Todas as variantes em dia'
        : `${pendentes} ${pendentes === 1 ? 'variante fora' : 'variantes fora'} de sincronia`,
  }
}

export interface ResumoSync {
  bases: BaseSync[]
  esgotar: number
  reduzir: number
  repor: number
  emDia: number
  noTeto: number
  total: number
  /** Unidades sobrevendíveis: pedidos que não seriam atendidos. */
  excesso: number
}

export function resumoSync(bases: BaseSync[]): ResumoSync {
  const todas = bases.flatMap((b) => b.variantes)
  return {
    bases,
    esgotar: todas.filter((v) => v.acao === 'esgotar').length,
    reduzir: todas.filter((v) => v.acao === 'reduzir').length,
    repor: todas.filter((v) => v.acao === 'repor').length,
    emDia: todas.filter((v) => v.acao === 'ok').length,
    noTeto: todas.filter((v) => v.acao === 'ok' && v.publicado >= TETO_SHOPIFY).length,
    total: todas.length,
    excesso: todas.reduce((a, v) => a + v.excesso, 0),
  }
}

export type Criticidade = 'zero' | 'urgente' | 'atencao' | 'ok' | 'parado'

export interface CoberturaBase {
  base: PerfumeBase
  /** Dias até o estoque acabar no ritmo atual: volume ÷ consumo diário. */
  dias: number
  criticidade: Criticidade
  /** Vocabulário do usuário: "Estoque acaba em 12 dias", não "ruptura". */
  cobertura: string
  acao: string
  cta: string
}

export function coberturaDe(base: PerfumeBase): CoberturaBase {
  const dias = base.consumoDiarioMl ? Math.round(base.volumeMl / base.consumoDiarioMl) : 0

  const criticidade: Criticidade =
    base.volumeMl === 0
      ? 'zero'
      : dias < 7
        ? 'urgente'
        : dias < 20
          ? 'atencao'
          : dias > 90
            ? 'parado'
            : 'ok'

  const acao =
    criticidade === 'zero'
      ? 'Recompra urgente · pedidos pagos parados'
      : criticidade === 'urgente'
        ? 'Recomprar esta semana'
        : criticidade === 'atencao'
          ? 'Programar produção antes de acabar'
          : criticidade === 'parado'
            ? 'Giro baixo · avaliar promoção antes de repor'
            : 'Sem ação necessária'

  return {
    base,
    dias,
    criticidade,
    cobertura: base.volumeMl === 0 ? 'Esgotado' : `${dias} ${dias === 1 ? 'dia' : 'dias'}`,
    acao,
    cta: base.volumeMl === 0 ? 'Recomprar' : 'Produzir',
  }
}
