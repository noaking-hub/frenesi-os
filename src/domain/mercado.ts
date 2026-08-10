import {
  arredondaPreco,
  calcularPreco,
  margemDe,
  pisoMargem,
} from './precificacao'
import type { ParametrosPrecificacao, PerfumeBase, VarianteMl } from './types'

/**
 * Posicionamento contra concorrentes.
 *
 * A regra que manda: nenhuma recomendação pode furar o piso de margem
 * (margem alvo − 10 pontos). Se acompanhar o menor preço do mercado não cobre
 * o piso, a recomendação é manter o ideal — perder a guerra de preço é melhor
 * que vender no prejuízo.
 */

export type PosicaoMercado = 'acima' | 'na-media' | 'menor-preco'

export type TipoRecomendacao = 'baixar' | 'subir' | 'manter-ideal' | 'saudavel'

export interface AnaliseMercado {
  base: PerfumeBase
  variante: VarianteMl
  /** Preços coletados dos concorrentes para este produto e variante. */
  precos: number[]
  menor: number
  nosso: number
  nossaMargem: number
  ideal: number
  posicao: PosicaoMercado
  /** Menor preço − R$ 0,10 arredondado para ,90 — o alvo para virar o menor. */
  alvoCompetitivo: number
  /** O alvo competitivo respeita o piso de margem. */
  podeCompetir: boolean
  /** Vendendo abaixo do preço ideal (margem menor que a alvo). */
  abaixoIdeal: boolean
  /** Cabe subir o preço e continuar o menor do mercado. */
  oportunidade: boolean
  recomendacao: TipoRecomendacao
  precoRecomendado: number
  frase: string
}

export function analisarMercado(
  base: PerfumeBase,
  variante: VarianteMl,
  precos: number[],
  nosso: number,
  p: ParametrosPrecificacao,
): AnaliseMercado {
  const calc = calcularPreco(base.custoPorMl, variante, p)
  const ideal = calc.sugerido
  const menor = Math.min(...precos)
  const maior = Math.max(...precos)

  const posicao: PosicaoMercado =
    nosso > maior ? 'acima' : nosso < menor ? 'menor-preco' : 'na-media'

  // Dez centavos abaixo do menor, terminando em ,90. Se o arredondamento
  // devolver o próprio menor, desce um real para o alvo ficar de fato abaixo.
  let alvoCompetitivo = arredondaPreco(menor - 0.1)
  if (alvoCompetitivo >= menor) alvoCompetitivo = arredondaPreco(menor - 1.0)

  const margem = (preco: number) => margemDe(preco, calc.custoProduto, p)
  const podeCompetir = margem(alvoCompetitivo) >= pisoMargem(p)
  const nossaMargem = margem(nosso)
  const abaixoIdeal = nosso > 0 && nosso < ideal
  const oportunidade = nosso > 0 && nosso < alvoCompetitivo && nossaMargem < p.margemAlvo

  const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',')

  if (!podeCompetir) {
    return {
      base, variante, precos, menor, nosso, nossaMargem, ideal, posicao,
      alvoCompetitivo, podeCompetir, abaixoIdeal, oportunidade,
      recomendacao: 'manter-ideal',
      precoRecomendado: ideal,
      frase: `Manter o preço ideal · acompanhar o menor do mercado não cobre a margem mínima de ${fmt(pisoMargem(p))}%`,
    }
  }

  if (nosso > alvoCompetitivo) {
    return {
      base, variante, precos, menor, nosso, nossaMargem, ideal, posicao,
      alvoCompetitivo, podeCompetir, abaixoIdeal, oportunidade,
      recomendacao: 'baixar',
      precoRecomendado: alvoCompetitivo,
      frase: `Baixar e ${alvoCompetitivo < menor ? 'virar o menor preço' : 'empatar com o menor preço'} mantendo ${fmt(margem(alvoCompetitivo))}% de margem`,
    }
  }

  if (nosso < ideal) {
    return {
      base, variante, precos, menor, nosso, nossaMargem, ideal, posicao,
      alvoCompetitivo, podeCompetir, abaixoIdeal, oportunidade,
      recomendacao: 'subir',
      precoRecomendado: ideal,
      frase: `Subir para o ideal · hoje a margem está em ${fmt(nossaMargem)}%`,
    }
  }

  return {
    base, variante, precos, menor, nosso, nossaMargem, ideal, posicao,
    alvoCompetitivo, podeCompetir, abaixoIdeal, oportunidade,
    recomendacao: 'saudavel',
    precoRecomendado: nosso,
    frase: 'Preço saudável · nada a fazer',
  }
}

export type StatusFonte = 'nunca' | 'lida' | 'parcial' | 'bloqueada' | 'manual'

export interface FonteConcorrente {
  id: string
  nome: string
  dominio: string
  status: StatusFonte
  /**
   * Como o preço entra: `nuvemshop` lê sitemap + JSON-LD da vitrine,
   * `shopify` lê /products.json, `manual` só recebe preço digitado.
   */
  coleta: 'shopify' | 'nuvemshop' | 'manual'
  /** Quando foi a última tentativa. Vazio enquanto não houve nenhuma. */
  quando: string
  itensLidos: number
  /** Motivo cru da última falha. É o que evita adivinhar por que não leu. */
  erro: string | null
}

export const ROTULO_FONTE: Record<StatusFonte, string> = {
  nunca: 'Nunca lida',
  lida: 'Lida',
  parcial: 'Parcial',
  bloqueada: 'Bloqueada',
  manual: 'Manual',
}

// ── Kits e combos ──────────────────────────────────────────────────────────

export interface ItemKit {
  /** Null para itens sem base (estojo, refil genérico). */
  baseId: string | null
  label: string
}

export interface Kit {
  id: string
  nome: string
  tag: 'Entrada' | 'Presente' | 'Sazonal' | 'Recompra'
  itens: ItemKit[]
  preco: number
  /** Custo somado dos produtos que compõem o kit, sem os fixos por pedido. */
  custoProdutos: number
  vendas30: number
}

export interface KitAvaliado {
  kit: Kit
  /** Mesma fórmula de margem das variantes — parâmetros iguais para tudo. */
  margem: number
  receita30: number
  /**
   * Derivado do estoque das bases: um kit com QUALQUER base esgotada fica
   * bloqueado. Item sem base (estojo) não bloqueia.
   */
  disponivel: boolean
  basesEsgotadas: string[]
}

export function avaliarKit(
  kit: Kit,
  bases: PerfumeBase[],
  p: ParametrosPrecificacao,
): KitAvaliado {
  const esgotadas = kit.itens
    .filter((i) => i.baseId !== null)
    .map((i) => bases.find((b) => b.id === i.baseId))
    .filter((b): b is PerfumeBase => Boolean(b && b.volumeMl === 0))
    .map((b) => b.nome)

  return {
    kit,
    margem: margemDe(kit.preco, kit.custoProdutos, p),
    receita30: kit.preco * kit.vendas30,
    disponivel: esgotadas.length === 0,
    basesEsgotadas: [...new Set(esgotadas)],
  }
}

export interface ResumoKits {
  ativos: number
  bloqueados: number
  vendas30: number
  receita30: number
  ticketMedio: number
  /** Margem média ponderada pela receita de cada kit. */
  margemMedia: number
}

export function resumirKits(avaliados: KitAvaliado[]): ResumoKits {
  const vendas = avaliados.reduce((a, k) => a + k.kit.vendas30, 0)
  const receita = avaliados.reduce((a, k) => a + k.receita30, 0)
  return {
    ativos: avaliados.length,
    bloqueados: avaliados.filter((k) => !k.disponivel).length,
    vendas30: vendas,
    receita30: receita,
    ticketMedio: vendas ? receita / vendas : 0,
    margemMedia: receita
      ? avaliados.reduce((a, k) => a + k.margem * k.receita30, 0) / receita
      : 0,
  }
}

// ── Casar título de concorrente com o nosso catálogo ───────────────────────

/**
 * Palavras que quase todo decant carrega e que por isso não distinguem nada.
 *
 * A lista é curta de propósito. "Intense", "Elixir", "Masculino", "Parfum" e
 * "Toilette" NÃO entram: neste catálogo elas separam produtos diferentes —
 * Bleu de Chanel Eau de Parfum e Eau de Toilette são duas bases, com preços
 * diferentes. Descartá-las por parecerem genéricas casaria uma com a outra.
 */
const GENERICAS = new Set([
  'decant',
  'decants',
  'fracionado',
  'fracionados',
  'perfume',
  'perfumes',
  'ml',
  'de',
  'da',
  'do',
  'the',
  'e',
  'com',
  'para',
])

/** Sem acento, sem caixa, sem pontuação — e sem os números de volume. */
export function tokensDe(texto: string): Set<string> {
  return new Set(
    texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\d+\s*ml\b/g, ' ')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !GENERICAS.has(t) && !/^\d+$/.test(t)),
  )
}

export interface Casamento {
  baseId: string
  /** Fração dos tokens da nossa base presentes no título do concorrente. */
  score: number
}

/** Cobertura mínima para aceitar um casamento automático. */
export const SCORE_MINIMO = 0.7
/** Vantagem mínima sobre o segundo colocado. Empate técnico não casa. */
export const VANTAGEM_MINIMA = 0.15

/**
 * Descobre de qual base nossa um título de concorrente fala.
 *
 * Devolve `null` quando não há certeza — e isso é o ponto. Um preço casado com
 * o perfume errado não fica só errado: ele entra na comparação de mercado e
 * empurra o preço de venda de OUTRO produto. Duas travas evitam isso: a
 * cobertura precisa ser alta, e o segundo colocado precisa ficar claramente
 * atrás. Empate técnico vira trabalho manual, não palpite.
 */
export function casarTitulo(
  titulo: string,
  bases: { id: string; nome: string; marca: string }[],
): Casamento | null {
  const alvo = tokensDe(titulo)
  if (alvo.size === 0) return null

  let melhor: Casamento | null = null
  let segundo = 0

  for (const b of bases) {
    const meus = tokensDe(`${b.nome} ${b.marca}`)
    if (meus.size === 0) continue
    let acertos = 0
    for (const t of meus) if (alvo.has(t)) acertos++
    const score = acertos / meus.size

    if (!melhor || score > melhor.score) {
      segundo = melhor?.score ?? 0
      melhor = { baseId: b.id, score }
    } else if (score > segundo) {
      segundo = score
    }
  }

  if (!melhor || melhor.score < SCORE_MINIMO) return null
  if (melhor.score - segundo < VANTAGEM_MINIMA) return null
  return melhor
}
