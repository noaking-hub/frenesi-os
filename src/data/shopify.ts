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
/** Normaliza o domínio: aceita colado com https://, barra final ou espaços. */
function lojaNormalizada(valor: string): string {
  return valor
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
}

export async function lerCatalogoShopify(): Promise<ProdutoShopify[]> {
  const loja = lojaNormalizada(process.env.SHOPIFY_LOJA ?? '')
  const token = (process.env.SHOPIFY_ADMIN_TOKEN ?? '').trim().replace(/^["']|["']$/g, '')
  if (!loja || !token) {
    throw new Error('SHOPIFY_LOJA e SHOPIFY_ADMIN_TOKEN precisam estar no .env.local')
  }
  // O único valor que funciona aqui é o Admin API access token, gerado ao
  // INSTALAR o app. O "API key" e o "API secret key" da mesma tela não servem.
  if (!token.startsWith('shpat_')) {
    throw new Error(
      'O valor em SHOPIFY_ADMIN_TOKEN não parece um Admin API access token — ele começa com shpat_. ' +
        'Na tela de credenciais do app, o "API key" e o "API secret key" não servem: ' +
        'clique em "Instalar app" e copie o Admin API access token revelado após a instalação.',
    )
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

    if (resposta.status === 401) {
      throw new Error(
        `A Shopify não reconheceu o token para ${loja} (401). Ou o token não é desta loja, ` +
          'ou o app foi desinstalado, ou o token foi rotacionado. Gere de novo em ' +
          'Desenvolver apps → seu app → API credentials → Instalar app.',
      )
    }
    if (resposta.status === 403) {
      throw new Error(
        'A Shopify reconheceu o token mas negou o acesso (403). Confira se o app foi instalado ' +
          'com os escopos read_products e read_inventory marcados — se acabou de marcar, é preciso ' +
          'instalar de novo para o token ganhar os escopos.',
      )
    }
    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => '')
      throw new Error(
        `Shopify respondeu ${resposta.status} ao ler o catálogo${detalhe ? ` — ${detalhe.slice(0, 160)}` : ''}.`,
      )
    }

    const corpo = (await resposta.json()) as RespostaGraphql
    if (corpo.errors?.length) {
      const msg = corpo.errors[0].message
      // Escopo faltando chega como erro GraphQL, não como HTTP 403.
      if (/access denied|not approved|unauthorized/i.test(msg)) {
        throw new Error(
          `A Shopify negou o campo consultado: "${msg}". Marque os escopos read_products e ` +
            'read_inventory no app e reinstale para o token ganhar as permissões.',
        )
      }
      throw new Error(`Shopify: ${msg}`)
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
