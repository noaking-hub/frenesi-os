import 'server-only'

import { mapearCatalogo } from '@/domain'
import type { CatalogoMapeado, ProdutoShopify } from '@/domain'

import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * Cliente da Admin API da Shopify (GraphQL) e a rotina de importação do
 * catálogo. Roda no servidor — o token nunca chega ao navegador.
 *
 * O que a importação escreve:
 *  - perfumes_base: nome, marca e vínculo com a Shopify. Perfume novo entra
 *    com custo 0 e volume 0 — o ERP passa a ACUSAR que falta completar, em
 *    vez de inventar número. Perfume existente NUNCA tem custo, volume ou
 *    consumo sobrescritos.
 *  - produtos_derivados: preço praticado por variante e vínculo.
 *  - shopify_publicado: quantidade publicada lida agora.
 *  - sincronizacoes: uma linha por execução, com os ignorados e o motivo.
 */

const VERSAO_API = '2025-07'

export function shopifyConfigurada(): boolean {
  return Boolean(process.env.SHOPIFY_LOJA && process.env.SHOPIFY_ADMIN_TOKEN)
}

interface RespostaGraphql {
  data?: {
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
      nodes: {
        id: string
        title: string
        vendor: string
        handle: string
        status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
        variants: {
          nodes: { id: string; title: string; price: string; inventoryQuantity: number | null }[]
        }
      }[]
    }
  }
  errors?: { message: string }[]
}

const CONSULTA_PRODUTOS = /* GraphQL */ `
  query CatalogoErp($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        vendor
        handle
        status
        variants(first: 100) {
          nodes {
            id
            title
            price
            inventoryQuantity
          }
        }
      }
    }
  }
`

/** Lê o catálogo inteiro da loja, paginando de 100 em 100. */
export async function lerCatalogoShopify(): Promise<ProdutoShopify[]> {
  const loja = process.env.SHOPIFY_LOJA
  const token = process.env.SHOPIFY_ADMIN_TOKEN
  if (!loja || !token) {
    throw new Error('SHOPIFY_LOJA e SHOPIFY_ADMIN_TOKEN precisam estar no .env.local')
  }

  const produtos: ProdutoShopify[] = []
  let cursor: string | null = null

  for (let pagina = 0; pagina < 50; pagina++) {
    const resposta = await fetch(`https://${loja}/admin/api/${VERSAO_API}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query: CONSULTA_PRODUTOS, variables: { cursor } }),
      cache: 'no-store',
    })

    if (resposta.status === 401 || resposta.status === 403) {
      throw new Error(
        'A Shopify recusou o token. Confira o SHOPIFY_ADMIN_TOKEN e os escopos read_products e read_inventory.',
      )
    }
    if (!resposta.ok) {
      throw new Error(`Shopify respondeu ${resposta.status} ao ler o catálogo.`)
    }

    const corpo = (await resposta.json()) as RespostaGraphql
    if (corpo.errors?.length) {
      throw new Error(`Shopify: ${corpo.errors[0].message}`)
    }
    const pageInfo = corpo.data?.products.pageInfo
    for (const p of corpo.data?.products.nodes ?? []) {
      produtos.push({
        id: p.id,
        titulo: p.title,
        fornecedor: p.vendor,
        handle: p.handle,
        status: p.status,
        variantes: p.variants.nodes.map((v) => ({
          id: v.id,
          titulo: v.title,
          preco: Number(v.price),
          estoque: v.inventoryQuantity,
        })),
      })
    }

    if (!pageInfo?.hasNextPage) break
    cursor = pageInfo.endCursor
  }

  return produtos
}

export interface ResultadoImportacao {
  perfumesNovos: number
  perfumesAtualizados: number
  variantes: number
  ignorados: CatalogoMapeado['ignorados']
}

/** Importa o catálogo mapeado para o banco. Idempotente: rodar de novo atualiza. */
export async function importarCatalogoShopify(): Promise<ResultadoImportacao> {
  if (!supabaseConfigurado()) {
    throw new Error('O Supabase precisa estar configurado para receber a importação.')
  }

  const produtos = await lerCatalogoShopify()
  const catalogo = mapearCatalogo(produtos)
  const sb = supabaseServer()

  // Novos entram com custo/volume 0; existentes só atualizam o que é da loja.
  const { data: existentes, error: erroExistentes } = await sb
    .from('perfumes_base')
    .select('id')
  if (erroExistentes) throw erroExistentes
  const idsExistentes = new Set((existentes ?? []).map((e) => e.id))

  const novos = catalogo.bases.filter((b) => !idsExistentes.has(b.id))
  const conhecidos = catalogo.bases.filter((b) => idsExistentes.has(b.id))

  if (novos.length) {
    const { error } = await sb.from('perfumes_base').insert(
      novos.map((b) => ({
        id: b.id,
        nome: b.nome,
        marca: b.marca,
        custo_por_ml: 0,
        volume_ml: 0,
        consumo_diario_ml: 0,
        shopify_product_id: b.shopifyProductId,
        shopify_handle: b.id,
      })),
    )
    if (error) throw error
  }
  for (const b of conhecidos) {
    const { error } = await sb
      .from('perfumes_base')
      .update({
        nome: b.nome,
        marca: b.marca,
        shopify_product_id: b.shopifyProductId,
        shopify_handle: b.id,
      })
      .eq('id', b.id)
    if (error) throw error
  }

  // Variantes: preço praticado (sem mexer em envasadas/reservadas) e publicado.
  const { data: derivadosExistentes, error: erroDerivados } = await sb
    .from('produtos_derivados')
    .select('base_id, variante')
  if (erroDerivados) throw erroDerivados
  const chavesDerivados = new Set(
    (derivadosExistentes ?? []).map((d) => `${d.base_id}|${d.variante}`),
  )

  for (const v of catalogo.variantes) {
    if (chavesDerivados.has(`${v.baseId}|${v.variante}`)) {
      const { error } = await sb
        .from('produtos_derivados')
        .update({ preco_praticado: v.preco, shopify_variant_id: v.shopifyVariantId })
        .eq('base_id', v.baseId)
        .eq('variante', v.variante)
      if (error) throw error
    } else {
      const { error } = await sb.from('produtos_derivados').insert({
        base_id: v.baseId,
        variante: v.variante,
        envasadas: 0,
        reservadas: 0,
        preco_praticado: v.preco,
        shopify_variant_id: v.shopifyVariantId,
      })
      if (error) throw error
    }
  }

  const agora = new Date().toISOString()
  const { error: erroPublicado } = await sb.from('shopify_publicado').upsert(
    catalogo.variantes.map((v) => ({
      base_id: v.baseId,
      variante: v.variante,
      publicado: v.publicado,
      lido_em: agora,
      shopify_variant_id: v.shopifyVariantId,
    })),
    { onConflict: 'base_id,variante' },
  )
  if (erroPublicado) throw erroPublicado

  const { error: erroLog } = await sb.from('sincronizacoes').insert({
    origem: 'shopify',
    tipo: 'catalogo',
    perfumes: catalogo.bases.length,
    variantes: catalogo.variantes.length,
    ignorados: catalogo.ignorados.length,
    detalhes: catalogo.ignorados,
  })
  if (erroLog) throw erroLog

  return {
    perfumesNovos: novos.length,
    perfumesAtualizados: conhecidos.length,
    variantes: catalogo.variantes.length,
    ignorados: catalogo.ignorados,
  }
}

export interface RegistroSincronizacao {
  executadaEm: string
  perfumes: number
  variantes: number
  ignorados: number
}

/** Última sincronização registrada — a tela deriva o "quando" daqui. */
export async function ultimaSincronizacao(
  origem: 'shopify' | 'yampi',
): Promise<RegistroSincronizacao | null> {
  if (!supabaseConfigurado()) return null
  const { data, error } = await supabaseServer()
    .from('sincronizacoes')
    .select('executada_em, perfumes, variantes, ignorados')
    .eq('origem', origem)
    .order('executada_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    executadaEm: data.executada_em,
    perfumes: data.perfumes,
    variantes: data.variantes,
    ignorados: data.ignorados,
  }
}
