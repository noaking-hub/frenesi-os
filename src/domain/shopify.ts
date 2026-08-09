import { VARIANTES } from './types'
import type { PerfumeBase, VarianteMl } from './types'

type Genero = NonNullable<PerfumeBase['genero']>

/**
 * Mapeamento do catálogo da Shopify para o modelo do ERP. Puro: recebe o que
 * a Admin API devolveu e decide o que vira perfume base, o que vira variante
 * e o que é ignorado — sempre com o motivo dito.
 *
 * A Shopify sabe nome, marca, variantes, preço e quantidade publicada. Ela
 * NÃO sabe custo por ml, volume do frasco base nem consumo — esses são do
 * ERP e a importação nunca os inventa nem sobrescreve.
 */

export interface VarianteShopify {
  id: string
  titulo: string
  preco: number
  /** Quantidade publicada; `null` quando a loja não rastreia estoque. */
  estoque: number | null
}

export interface ProdutoShopify {
  id: string
  titulo: string
  /** `vendor` da Shopify — vira a marca. */
  fornecedor: string
  handle: string
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  imagemUrl: string | null
  /** `productType` da Shopify — entra na detecção de gênero. */
  tipo: string
  tags: string[]
  variantes: VarianteShopify[]
}

export interface BaseImportada {
  /** O handle da Shopify: estável, legível e único na loja. */
  id: string
  nome: string
  marca: string
  shopifyProductId: string
  imagemUrl: string | null
  /** Detectado do título/tipo/tags; `null` quando a loja não diz. */
  genero: Genero | null
}

export interface VarianteImportada {
  baseId: string
  variante: VarianteMl
  preco: number
  publicado: number
  shopifyVariantId: string
}

export interface ItemIgnorado {
  produto: string
  variante?: string
  motivo: string
}

export interface CatalogoMapeado {
  bases: BaseImportada[]
  variantes: VarianteImportada[]
  ignorados: ItemIgnorado[]
}

/**
 * Gênero a partir do texto do produto. A Shopify não tem campo para isso —
 * a loja escreve no próprio título ("… Masculino Eau de Parfum"), no tipo de
 * produto ou nas tags. Quando nada indica, devolve `null`: o ERP prefere o
 * travessão a um palpite.
 */
export function detectarGenero(...textos: string[]): Genero | null {
  const t = textos
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (/\bunissex\b|\bunisex\b/.test(t)) return 'Unissex'
  const masculino = /\bmasculin[oa]\b|\bmasc\b|\bpour homme\b|\bfor men\b/.test(t)
  const feminino = /\bfeminin[oa]\b|\bfem\b|\bpour femme\b|\bfor women\b/.test(t)
  // Os dois no mesmo produto significam "serve para ambos".
  if (masculino && feminino) return 'Unissex'
  if (masculino) return 'Masculino'
  if (feminino) return 'Feminino'
  return null
}

/**
 * Extrai a variante em ml de um título da Shopify: "5 ml", "5ml", "Decant
 * 10ML"… Só aceita os tamanhos que o ERP fraciona (3, 5, 8, 10, 15) — um
 * "50 ml" não vira variante por engano.
 */
export function parseVarianteMl(titulo: string): VarianteMl | null {
  const m = titulo.toLowerCase().match(/(\d+)\s*ml\b/)
  const n = m ? Number(m[1]) : Number(titulo.trim())
  if (!Number.isInteger(n)) return null
  return (VARIANTES as readonly number[]).includes(n) ? (n as VarianteMl) : null
}

/**
 * Mapeia os produtos lidos da loja. Regras, na ordem:
 *  - produto fora do ar (DRAFT/ARCHIVED) é ignorado inteiro;
 *  - variante sem tamanho em ml reconhecível é ignorada (kit, estojo, 50 ml);
 *  - produto que não sobra com nenhuma variante válida é ignorado inteiro;
 *  - tamanho repetido no mesmo produto: vale o primeiro, o resto é ignorado.
 */
export function mapearCatalogo(produtos: ProdutoShopify[]): CatalogoMapeado {
  const bases: BaseImportada[] = []
  const variantes: VarianteImportada[] = []
  const ignorados: ItemIgnorado[] = []

  for (const p of produtos) {
    if (p.status !== 'ACTIVE') {
      ignorados.push({ produto: p.titulo, motivo: 'não está ativo na loja' })
      continue
    }

    const vistas = new Set<VarianteMl>()
    const validas: VarianteImportada[] = []
    for (const v of p.variantes) {
      const ml = parseVarianteMl(v.titulo)
      if (ml === null) {
        ignorados.push({
          produto: p.titulo,
          variante: v.titulo,
          motivo: 'sem tamanho em ml reconhecível (3, 5, 8, 10 ou 15)',
        })
        continue
      }
      if (vistas.has(ml)) {
        ignorados.push({
          produto: p.titulo,
          variante: v.titulo,
          motivo: `tamanho ${ml} ml repetido no produto — vale a primeira`,
        })
        continue
      }
      vistas.add(ml)
      validas.push({
        baseId: p.handle,
        variante: ml,
        preco: v.preco,
        // Estoque negativo existe na Shopify (sobrevenda); o publicado do ERP não.
        publicado: Math.max(0, v.estoque ?? 0),
        shopifyVariantId: v.id,
      })
    }

    if (validas.length === 0) {
      ignorados.push({
        produto: p.titulo,
        motivo: 'nenhuma variante em ml fracionável — provavelmente kit ou acessório',
      })
      continue
    }

    bases.push({
      id: p.handle,
      nome: p.titulo,
      marca: p.fornecedor.trim() || '—',
      shopifyProductId: p.id,
      imagemUrl: p.imagemUrl,
      genero: detectarGenero(p.titulo, p.tipo, ...p.tags),
    })
    variantes.push(...validas)
  }

  return { bases, variantes, ignorados }
}
