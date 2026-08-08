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

const VERSAO_API = '2026-07'

/** Extrai mensagem legível de qualquer formato de erro (Error, PostgrestError, objeto). */
export function mensagemDe(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  if (e && typeof e === 'object') {
    const m = (e as { message?: unknown; details?: unknown; hint?: unknown })
    const partes = [m.message, m.details, m.hint].filter((x): x is string => typeof x === 'string' && x.length > 0)
    if (partes.length) return partes.join(' · ')
    try {
      return JSON.stringify(e).slice(0, 300)
    } catch {
      /* segue para o String */
    }
  }
  return String(e)
}

/** Normaliza o domínio: aceita colado com https://, barra final ou espaços. */
function lojaNormalizada(valor: string): string {
  return valor
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
}

function limpa(valor: string | undefined): string {
  return (valor ?? '').trim().replace(/^["']|["']$/g, '')
}

/**
 * Dois modos de credencial, conforme onde o app foi criado:
 *  - app legado (admin da loja → Desenvolver apps): Admin API access token
 *    fixo, `shpat_…`, em SHOPIFY_ADMIN_TOKEN;
 *  - app do dev dashboard novo (2025+): "ID do cliente" + "Chave secreta"
 *    (`shpss_…`) em SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET — o ERP troca
 *    por um token de acesso via OAuth client credentials e renova sozinho.
 * Chave secreta colada em SHOPIFY_ADMIN_TOKEN por engano é aceita como secreta.
 */
function credenciais() {
  const loja = lojaNormalizada(process.env.SHOPIFY_LOJA ?? '')
  const bruto = limpa(process.env.SHOPIFY_ADMIN_TOKEN)
  const clientId = limpa(process.env.SHOPIFY_CLIENT_ID)
  let secret = limpa(process.env.SHOPIFY_CLIENT_SECRET)
  if (!secret && bruto.startsWith('shpss_')) secret = bruto
  const tokenFixo = bruto.startsWith('shpat_') ? bruto : ''
  return { loja, tokenFixo, clientId, secret }
}

export function shopifyConfigurada(): boolean {
  const { loja, tokenFixo, secret } = credenciais()
  return Boolean(loja && (tokenFixo || secret))
}

// Token trocado por client credentials, com validade — renovado 2 min antes.
const cacheToken = new Map<string, { token: string; expiraEm: number }>()

async function tokenDeAcesso(loja: string): Promise<string> {
  const { tokenFixo, clientId, secret } = credenciais()
  if (tokenFixo) return tokenFixo
  if (!secret) {
    throw new Error(
      'Configure no .env.local: SHOPIFY_ADMIN_TOKEN (shpat_…, app legado) OU ' +
        'SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (app do dev dashboard).',
    )
  }
  if (!clientId) {
    throw new Error(
      'Encontrei a chave secreta (shpss_…), mas falta o SHOPIFY_CLIENT_ID — é o "ID do cliente" ' +
        'que aparece na mesma tela de credenciais do app no dev dashboard.',
    )
  }

  const chave = `${loja}|${clientId}`
  const emCache = cacheToken.get(chave)
  if (emCache && Date.now() < emCache.expiraEm - 120_000) return emCache.token

  const resposta = await fetch(`https://${loja}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: secret,
      grant_type: 'client_credentials',
    }),
    cache: 'no-store',
  })
  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '')
    throw new Error(
      `A troca de credenciais com a Shopify falhou (${resposta.status}). Confira o ID do cliente ` +
        `e a chave secreta, e se o app está instalado na loja ${loja} — no dev dashboard, o app ` +
        'precisa de uma versão lançada e instalada na loja para gerar token.' +
        (detalhe ? ` Resposta: ${detalhe.slice(0, 160)}` : ''),
    )
  }
  const corpo = (await resposta.json()) as { access_token: string; expires_in?: number }
  cacheToken.set(chave, {
    token: corpo.access_token,
    expiraEm: Date.now() + (corpo.expires_in ?? 86_400) * 1000,
  })
  return corpo.access_token
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
        productType: string | null
        tags: string[] | null
        featuredMedia: { preview: { image: { url: string } | null } | null } | null
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
    products(first: 50, after: $cursor) {
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
        productType
        tags
        featuredMedia {
          preview {
            image {
              url
            }
          }
        }
        variants(first: 25) {
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

/** Lê o catálogo inteiro da loja, paginando de 50 em 50 (custo de query baixo). */
export async function lerCatalogoShopify(): Promise<ProdutoShopify[]> {
  const { loja } = credenciais()
  if (!loja) {
    throw new Error('SHOPIFY_LOJA precisa estar no .env.local (ex.: sua-loja.myshopify.com)')
  }
  const token = await tokenDeAcesso(loja)

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
          'ou o app foi desinstalado, ou a credencial foi rotacionada — gere de novo na tela ' +
          'de credenciais do app e atualize o .env.local.',
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
        imagemUrl: p.featuredMedia?.preview?.image?.url ?? null,
        tipo: p.productType ?? '',
        tags: p.tags ?? [],
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

  // Lê o estado atual UMA vez e escreve em upserts em lote — nada de milhares
  // de round-trips. Campos do ERP (custo, volume, consumo, envasadas,
  // reservadas, gênero) são preservados linha a linha.
  const { data: existentes, error: erroExistentes } = await sb
    .from('perfumes_base')
    .select('id, custo_por_ml, volume_ml, consumo_diario_ml, genero, ativo')
  if (erroExistentes) throw erroExistentes
  const basePorId = new Map((existentes ?? []).map((e) => [e.id as string, e]))

  const novos = catalogo.bases.filter((b) => !basePorId.has(b.id))

  const linhasBases = catalogo.bases.map((b) => {
    const atual = basePorId.get(b.id)
    return {
      id: b.id,
      nome: b.nome,
      marca: b.marca,
      // A loja é a fonte quando diz o gênero; quando não diz, o que já
      // estava no ERP permanece — a importação não apaga informação.
      genero: b.genero ?? atual?.genero ?? null,
      custo_por_ml: atual ? atual.custo_por_ml : 0,
      volume_ml: atual ? atual.volume_ml : 0,
      consumo_diario_ml: atual ? atual.consumo_diario_ml : 0,
      ativo: atual ? atual.ativo : true,
      shopify_product_id: b.shopifyProductId,
      shopify_handle: b.id,
      imagem_url: b.imagemUrl,
    }
  })
  for (const parte of emLotes(linhasBases, 500)) {
    const { error } = await sb.from('perfumes_base').upsert(parte, { onConflict: 'id' })
    if (error) throw error
  }

  const { data: derivadosExistentes, error: erroDerivados } = await sb
    .from('produtos_derivados')
    .select('base_id, variante, envasadas, reservadas')
  if (erroDerivados) throw erroDerivados
  const derivadoPorChave = new Map(
    (derivadosExistentes ?? []).map((d) => [`${d.base_id}|${d.variante}`, d]),
  )

  const linhasDerivados = catalogo.variantes.map((v) => {
    const atual = derivadoPorChave.get(`${v.baseId}|${v.variante}`)
    return {
      base_id: v.baseId,
      variante: v.variante,
      envasadas: atual?.envasadas ?? 0,
      reservadas: atual?.reservadas ?? 0,
      preco_praticado: v.preco,
      shopify_variant_id: v.shopifyVariantId,
    }
  })
  for (const parte of emLotes(linhasDerivados, 500)) {
    const { error } = await sb
      .from('produtos_derivados')
      .upsert(parte, { onConflict: 'base_id,variante' })
    if (error) throw error
  }

  const agora = new Date().toISOString()
  const linhasPublicado = catalogo.variantes.map((v) => ({
    base_id: v.baseId,
    variante: v.variante,
    publicado: v.publicado,
    lido_em: agora,
    shopify_variant_id: v.shopifyVariantId,
  }))
  for (const parte of emLotes(linhasPublicado, 500)) {
    const { error } = await sb
      .from('shopify_publicado')
      .upsert(parte, { onConflict: 'base_id,variante' })
    if (error) throw error
  }

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
    perfumesAtualizados: catalogo.bases.length - novos.length,
    variantes: catalogo.variantes.length,
    ignorados: catalogo.ignorados,
  }
}

function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const partes: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) partes.push(itens.slice(i, i + tamanho))
  return partes
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
