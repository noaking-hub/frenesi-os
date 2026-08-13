import 'server-only'

import { mapearCatalogo, parseVarianteMl } from '@/domain'
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

/**
 * Descarta o token guardado.
 *
 * Escopo novo só entra em token novo, e o token vale ~24 h. Sem isto, marcar
 * a permissão na Shopify não teria efeito nenhum até alguém reiniciar o
 * servidor — o que é um passo que ninguém adivinha.
 */
export function esquecerToken(): void {
  cacheToken.clear()
}

/**
 * Escopos que a Shopify de fato concedeu a ESTE token.
 *
 * É a única fonte que encerra a dúvida entre "o app declara" e "o token tem":
 * lançar versão no dev dashboard não atualiza sozinho a instalação na loja, e
 * as duas telas mostram listas diferentes sem avisar.
 */
export async function escoposDoToken(): Promise<{ loja: string; escopos: string[] }> {
  const { loja } = credenciais()
  if (!loja) throw new Error('SHOPIFY_LOJA precisa estar no .env.local')
  const token = await tokenDeAcesso(loja)

  const resposta = await fetch(`https://${loja}/admin/oauth/access_scopes.json`, {
    headers: { 'X-Shopify-Access-Token': token },
    cache: 'no-store',
  })
  if (!resposta.ok) {
    throw new Error(
      `Não consegui ler os escopos do token (${resposta.status}). Confira loja e credenciais.`,
    )
  }
  const corpo = (await resposta.json()) as { access_scopes?: { handle: string }[] }
  return { loja, escopos: (corpo.access_scopes ?? []).map((e) => e.handle).sort() }
}

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
          nodes: {
            id: string
            title: string
            price: string
            inventoryQuantity: number | null
            sku: string | null
          }[]
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
            sku
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
          sku: v.sku,
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
    .select('id, custo_por_ml, volume_ml, consumo_diario_ml, genero, genero_manual, ativo')
  if (erroExistentes) throw erroExistentes
  const basePorId = new Map((existentes ?? []).map((e) => [e.id as string, e]))

  const novos = catalogo.bases.filter((b) => !basePorId.has(b.id))

  const linhasBases = catalogo.bases.map((b) => {
    const atual = basePorId.get(b.id)
    return {
      id: b.id,
      nome: b.nome,
      marca: b.marca,
      // Gênero corrigido à mão no ERP é soberano; fora isso, a loja é a
      // fonte quando diz, e o que já estava permanece quando ela não diz.
      genero: atual?.genero_manual ? atual.genero : (b.genero ?? atual?.genero ?? null),
      genero_manual: atual?.genero_manual ?? false,
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
      sku: v.sku,
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

// ── Escrita: publicar na Shopify o estoque que o ERP calculou ──────────────

const CONSULTA_LOCAL = /* GraphQL */ `
  query {
    locations(first: 1, query: "active:true") {
      nodes {
        id
        name
      }
    }
  }
`

/**
 * `inventoryItem` é o que a Shopify movimenta — a variante é só a face
 * vendável dele. Sem esse id não há como gravar quantidade.
 */
const CONSULTA_ITENS = /* GraphQL */ `
  query ($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        inventoryItem {
          id
          tracked
        }
      }
    }
  }
`

const MUTACAO_ESTOQUE = /* GraphQL */ `
  mutation ($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      userErrors {
        field
        message
      }
    }
  }
`

interface NoVariante {
  id: string
  inventoryItem: { id: string; tracked: boolean } | null
}

/** Uma chamada GraphQL autenticada, com as mensagens de erro que importam. */
/** Erro que a chamada reconhece como falta de permissão, para quem chamou decidir. */
export class AcessoNegadoShopify extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'AcessoNegadoShopify'
  }
}

async function chamarShopify<T>(
  loja: string,
  token: string,
  query: string,
  variables: Record<string, unknown>,
  oQueFazia: string,
  /** Escopos que ESTA operação exige — a mensagem precisa nomear os certos. */
  escopos = '',
): Promise<T> {
  const resposta = await fetch(`https://${loja}/admin/api/${VERSAO_API}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  })

  if (resposta.status === 401) {
    throw new Error(
      `A Shopify não reconheceu o token para ${loja} (401) ao ${oQueFazia}. Gere a credencial de novo e atualize o .env.local.`,
    )
  }
  if (resposta.status === 403) {
    throw new AcessoNegadoShopify(
      `A Shopify negou o acesso (403) ao ${oQueFazia}.` +
        (escopos ? ` Esta operação exige ${escopos}.` : '') +
        ' Escopo novo só vale em token novo: depois de marcar, atualize a instalação do app na loja e reinicie o servidor do ERP para descartar o token em cache.',
    )
  }
  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '')
    throw new Error(
      `Shopify respondeu ${resposta.status} ao ${oQueFazia}${detalhe ? ` — ${detalhe.slice(0, 160)}` : ''}.`,
    )
  }

  const corpo = (await resposta.json()) as { data?: T; errors?: { message: string }[] }
  if (corpo.errors?.length) {
    const msg = corpo.errors[0].message
    if (/access denied|not approved|unauthorized|scope|protected customer/i.test(msg)) {
      throw new AcessoNegadoShopify(
        `A Shopify negou "${oQueFazia}": ${msg}` +
          (escopos ? ` · esta operação exige ${escopos}.` : '') +
          ' Escopo novo só vale em token novo: atualize a instalação do app na loja e reinicie o servidor do ERP para descartar o token em cache.',
      )
    }
    throw new Error(`Shopify: ${msg}`)
  }
  if (!corpo.data) throw new Error(`Shopify não devolveu dados ao ${oQueFazia}.`)
  return corpo.data
}

export interface ResultadoAplicacao {
  aplicadas: number
  /** Variantes que o ERP quis mexer mas a Shopify não deixou, com o motivo. */
  ignoradas: { variante: string; motivo: string }[]
  local: string
}

/**
 * Publica na Shopify o estoque que o ERP calculou.
 *
 * Só escreve o que está fora de sincronia: mandar de volta o valor que já
 * está lá gastaria chamada e sujaria o histórico da loja sem mudar nada.
 *
 * O que vai é `possivel` — decants prontos mais o que o volume ainda permite
 * fracionar —, limitado pelo teto. É o único número que o ERP sabe sustentar;
 * qualquer coisa acima disso é venda que a produção não atende.
 */
export async function aplicarEstoqueShopify(
  alvos: { shopifyVariantId: string; rotulo: string; novoValor: number }[],
): Promise<ResultadoAplicacao> {
  const { loja } = credenciais()
  if (!loja) {
    throw new Error('SHOPIFY_LOJA precisa estar no .env.local (ex.: sua-loja.myshopify.com)')
  }
  if (alvos.length === 0) {
    return { aplicadas: 0, ignoradas: [], local: '' }
  }
  const token = await tokenDeAcesso(loja)

  const dadosLocal = await chamarShopify<{ locations: { nodes: { id: string; name: string }[] } }>(
    loja,
    token,
    CONSULTA_LOCAL,
    {},
    'ler o local de estoque',
    'read_locations',
  )
  const local = dadosLocal.locations.nodes[0]
  if (!local) {
    throw new Error('A loja não tem nenhum local de estoque ativo — crie um na Shopify.')
  }

  const ignoradas: ResultadoAplicacao['ignoradas'] = []
  const quantidades: { inventoryItemId: string; locationId: string; quantity: number }[] = []

  // `nodes(ids:)` aceita lotes; 100 por vez mantém o custo da query baixo.
  for (const parte of emLotes(alvos, 100)) {
    const dados = await chamarShopify<{ nodes: (NoVariante | null)[] }>(
      loja,
      token,
      CONSULTA_ITENS,
      { ids: parte.map((a) => a.shopifyVariantId) },
      'ler os itens de estoque',
      'read_inventory',
    )

    dados.nodes.forEach((no, i) => {
      const alvo = parte[i]
      if (!no?.inventoryItem) {
        ignoradas.push({
          variante: alvo.rotulo,
          motivo: 'variante não existe mais na loja — reimporte o catálogo',
        })
        return
      }
      if (!no.inventoryItem.tracked) {
        // Sem rastreio a Shopify vende infinito e ignora qualquer quantidade.
        ignoradas.push({
          variante: alvo.rotulo,
          motivo: 'produto sem controle de estoque na Shopify — ative "rastrear quantidade"',
        })
        return
      }
      quantidades.push({
        inventoryItemId: no.inventoryItem.id,
        locationId: local.id,
        quantity: alvo.novoValor,
      })
    })
  }

  // 250 por mutação é o limite prático da API.
  for (const parte of emLotes(quantidades, 250)) {
    const r = await chamarShopify<{
      inventorySetQuantities: { userErrors: { field: string[]; message: string }[] }
    }>(
      loja,
      token,
      MUTACAO_ESTOQUE,
      {
        input: {
          name: 'available',
          reason: 'correction',
          // O ERP é a fonte da verdade aqui; comparar com o valor anterior só
          // faria a escrita falhar quando uma venda entrasse no meio.
          ignoreCompareQuantity: true,
          quantities: parte,
        },
      },
      'gravar o estoque',
      'write_inventory',
    )
    // A mutação pode responder 200 e recusar tudo em userErrors — engolir isso
    // faria a tela dizer "aplicado" para uma gravação que não aconteceu.
    const erros = r.inventorySetQuantities?.userErrors ?? []
    if (erros.length) {
      throw new Error(
        `A Shopify recusou a gravação: ${erros.map((e) => e.message).join('; ').slice(0, 300)}`,
      )
    }
  }

  return { aplicadas: quantidades.length, ignoradas, local: local.name }
}

const MUTACAO_PRECO = /* GraphQL */ `
  mutation ($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      userErrors {
        field
        message
      }
    }
  }
`

export interface AlvoPreco {
  shopifyProductId: string
  shopifyVariantId: string
  rotulo: string
  preco: number
}

export interface ResultadoPrecos {
  aplicadas: number
  /** Variantes que o ERP quis mexer mas a loja não deixou, com o motivo. */
  ignoradas: { variante: string; motivo: string }[]
}

/**
 * Publica na Shopify o preço que o ERP calculou.
 *
 * A Shopify é a dona do catálogo, e a Yampi espelha o catálogo dela: escrever
 * aqui é o caminho para o preço chegar ao checkout. Escrever direto na Yampi
 * criaria duas verdades de preço, e a próxima sincronia desfaria uma delas.
 *
 * `productVariantsBulkUpdate` exige o id do PRODUTO, não só o da variante —
 * por isso os alvos são agrupados por produto antes de sair.
 */
export async function aplicarPrecosShopify(alvos: AlvoPreco[]): Promise<ResultadoPrecos> {
  const { loja } = credenciais()
  if (!loja) {
    throw new Error('SHOPIFY_LOJA precisa estar no .env.local (ex.: sua-loja.myshopify.com)')
  }
  if (alvos.length === 0) return { aplicadas: 0, ignoradas: [] }
  const token = await tokenDeAcesso(loja)

  const ignoradas: ResultadoPrecos['ignoradas'] = []
  const porProduto = new Map<string, AlvoPreco[]>()
  for (const a of alvos) {
    if (!a.shopifyProductId || !a.shopifyVariantId) {
      ignoradas.push({
        variante: a.rotulo,
        motivo: 'sem id da Shopify — reimporte o catálogo antes de publicar',
      })
      continue
    }
    const lista = porProduto.get(a.shopifyProductId)
    if (lista) lista.push(a)
    else porProduto.set(a.shopifyProductId, [a])
  }

  let aplicadas = 0
  for (const [productId, variantes] of porProduto) {
    const r = await chamarShopify<{
      productVariantsBulkUpdate: { userErrors: { field: string[]; message: string }[] }
    }>(
      loja,
      token,
      MUTACAO_PRECO,
      {
        productId,
        // A Shopify quer o preço como string com ponto decimal.
        variants: variantes.map((v) => ({ id: v.shopifyVariantId, price: v.preco.toFixed(2) })),
      },
      'gravar o preço',
      'write_products',
    )
    // A mutação responde 200 e recusa em userErrors — engolir isso faria a
    // tela dizer "publicado" para um preço que continua o antigo.
    const erros = r.productVariantsBulkUpdate?.userErrors ?? []
    if (erros.length) {
      for (const v of variantes) {
        ignoradas.push({ variante: v.rotulo, motivo: erros[0].message.slice(0, 160) })
      }
      continue
    }
    aplicadas += variantes.length
  }

  return { aplicadas, ignoradas }
}

// ── Pedidos ────────────────────────────────────────────────────────────────

/** Compara nomes ignorando acento, caixa e espaço repetido. */
function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const CONSULTA_PEDIDOS = /* GraphQL */ `
  query ($cursor: String, $filtro: String) {
    orders(first: 50, after: $cursor, sortKey: CREATED_AT, reverse: true, query: $filtro) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        createdAt
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet {
          shopMoney {
            amount
          }
        }
        totalShippingPriceSet {
          shopMoney {
            amount
          }
        }
        customer {
          firstName
          lastName
          email
          phone
        }
        shippingAddress {
          city
          provinceCode
          address1
          zip
        }
        lineItems(first: 25) {
          nodes {
            title
            quantity
            originalUnitPriceSet {
              shopMoney {
                amount
              }
            }
            variant {
              id
              title
            }
          }
        }
        fulfillments(first: 1) {
          trackingInfo(first: 1) {
            number
            company
          }
        }
      }
    }
  }
`

/**
 * A mesma consulta sem NENHUM campo de cliente.
 *
 * `customer` e `shippingAddress` são dados protegidos: a Shopify exige
 * aprovação de "protected customer data" além do escopo read_orders, e nega o
 * campo `orders` inteiro quando ela falta. Sem esta versão, uma aprovação
 * pendente impediria até de ver o faturamento — que não é dado de cliente.
 */
const CONSULTA_PEDIDOS_SEM_CLIENTE = (() => {
  const reduzida = CONSULTA_PEDIDOS.replace(
    /\n\s*customer \{[\s\S]*?\n\s*\}\n\s*shippingAddress \{[\s\S]*?\n\s*\}/,
    '',
  )
  // Se o corte falhar, a consulta "reduzida" seria idêntica à original e o
  // fallback tentaria de novo exatamente o que a Shopify acabou de negar —
  // um laço silencioso. Melhor quebrar aqui, no carregamento do módulo.
  if (/customer|shippingAddress/.test(reduzida)) {
    throw new Error('A consulta de pedidos sem dados de cliente não removeu os campos protegidos.')
  }
  return reduzida
})()

interface PedidoShopify {
  id: string
  name: string
  createdAt: string
  displayFinancialStatus: string | null
  displayFulfillmentStatus: string | null
  totalPriceSet: { shopMoney: { amount: string } }
  totalShippingPriceSet: { shopMoney: { amount: string } } | null
  customer: {
    firstName: string | null
    lastName: string | null
    email: string | null
    phone: string | null
  } | null
  shippingAddress: {
    city: string | null
    provinceCode: string | null
    address1: string | null
    zip: string | null
  } | null
  lineItems: {
    nodes: {
      title: string
      quantity: number
      originalUnitPriceSet: { shopMoney: { amount: string } }
      variant: { id: string; title: string } | null
    }[]
  }
  fulfillments: { trackingInfo: { number: string | null; company: string | null }[] }[]
}

/**
 * Pagamento e envio da Shopify no vocabulário do ERP.
 *
 * Reembolso vira `divergente` e não `pago`: o dinheiro entrou e voltou, e a
 * conciliação financeira precisa enxergar isso como pendência, não como
 * receita limpa.
 */
function pagamentoDe(status: string | null): 'pago' | 'pendente' | 'divergente' | 'cancelado' {
  if (status === 'PAID') return 'pago'
  if (status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED') return 'divergente'
  if (status === 'VOIDED' || status === 'EXPIRED') return 'cancelado'
  return 'pendente'
}

function envioDe(status: string | null, temRastreio: boolean): string {
  if (status === 'FULFILLED') return temRastreio ? 'enviado' : 'aguardando_envio'
  if (status === 'PARTIALLY_FULFILLED') return 'aguardando_envio'
  return 'nao_iniciado'
}

export interface ResultadoPedidos {
  pedidos: number
  itens: number
  clientes: number
  /** Itens cuja variante não existe no ERP — não dá para baixar estoque deles. */
  itensSemVariante: number
  desde: string
  /** A loja não liberou os dados protegidos: vieram valores, não pessoas. */
  semDadosDeCliente: boolean
  /** Itens recuperados pelo nome porque o id da variante mudou na loja. */
  casadosPorNome: number
}

/**
 * Importa os pedidos da Shopify.
 *
 * A janela existe porque a API só devolve os últimos 60 dias sem o escopo
 * `read_all_orders`, que a Shopify concede caso a caso. Pedir mais que isso
 * volta vazio sem erro — o que pareceria "loja sem vendas".
 */
export async function importarPedidosShopify(dias = 60): Promise<ResultadoPedidos> {
  if (!supabaseConfigurado()) {
    throw new Error('O Supabase precisa estar configurado para receber a importação.')
  }
  const { loja } = credenciais()
  if (!loja) {
    throw new Error('SHOPIFY_LOJA precisa estar no .env.local (ex.: sua-loja.myshopify.com)')
  }
  let token = await tokenDeAcesso(loja)

  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const filtro = `created_at:>=${desde}`

  const buscar = async (consulta: string) => {
    const encontrados: PedidoShopify[] = []
    let cursor: string | null = null
    for (let pagina = 0; pagina < 40; pagina++) {
      const dados: {
        orders: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: PedidoShopify[] }
      } = await chamarShopify(
        loja,
        token,
        consulta,
        { cursor, filtro },
        'ler os pedidos',
        'read_orders e, para nome/e-mail/endereço, aprovação de dados protegidos de cliente',
      )
      encontrados.push(...dados.orders.nodes)
      if (!dados.orders.pageInfo.hasNextPage) break
      cursor = dados.orders.pageInfo.endCursor
    }
    return encontrados
  }

  // Tenta com os dados de cliente; se a loja não tiver aprovação de dados
  // protegidos, importa o faturamento mesmo assim. Meia importação é melhor
  // que nenhuma — e a tela diz o que ficou de fora.
  let pedidos: PedidoShopify[]
  let semDadosDeCliente = false
  try {
    pedidos = await buscar(CONSULTA_PEDIDOS)
  } catch (e) {
    if (!(e instanceof AcessoNegadoShopify)) throw e

    // Escopo novo só entra em token novo, e o token vale ~24 h. Antes de
    // concluir que falta permissão, joga fora o token guardado e tenta de
    // novo — senão marcar o escopo na Shopify não teria efeito até alguém
    // reiniciar o servidor, que é um passo que ninguém adivinha.
    esquecerToken()
    token = await tokenDeAcesso(loja)
    try {
      pedidos = await buscar(CONSULTA_PEDIDOS)
    } catch (e2) {
      if (!(e2 instanceof AcessoNegadoShopify)) throw e2
      // Ainda negado com token fresco: ou falta read_orders, ou faltam os
      // dados protegidos de cliente. A consulta sem cliente separa os dois.
      semDadosDeCliente = true
      try {
        pedidos = await buscar(CONSULTA_PEDIDOS_SEM_CLIENTE)
      } catch (e3) {
        if (!(e3 instanceof AcessoNegadoShopify)) throw e3
        // Negado até sem nenhum campo de cliente: é o escopo mesmo. Dizer
        // QUAIS escopos o token tem encerra o vaivém entre as duas telas.
        const { escopos } = await escoposDoToken().catch(() => ({ escopos: [] as string[] }))
        throw new AcessoNegadoShopify(
          `A Shopify negou ler pedidos mesmo com token recém-emitido. ` +
            (escopos.length
              ? `Este token tem: ${escopos.join(', ')}. Falta read_orders. `
              : 'Não consegui nem listar os escopos do token. ') +
            'Lançar a versão no dev dashboard NÃO atualiza a instalação na loja: abra o app na ' +
            'loja e aceite as permissões novas, ou reinstale-o.',
        )
      }
    }
  }

  const sb = supabaseServer()

  // Variante da loja → base e tamanho no ERP. Sem esse mapa o item entra como
  // linha de texto: aparece no pedido, mas não baixa estoque de ninguém.
  const { data: derivados, error: erroDerivados } = await sb
    .from('produtos_derivados')
    .select('base_id, variante, shopify_variant_id')
  if (erroDerivados) throw erroDerivados
  const porVariante = new Map(
    (derivados ?? [])
      .filter((d) => d.shopify_variant_id)
      .map((d) => [
        d.shopify_variant_id as string,
        { baseId: d.base_id as string, variante: d.variante as number },
      ]),
  )

  // Segundo caminho de casamento: nome do produto → base.
  //
  // O id da variante muda quando o produto é editado ou recriado na loja, e
  // pedidos antigos guardam o id antigo para sempre. Sem esta volta, uma
  // reorganização do catálogo apagaria meses de histórico de venda — os itens
  // continuariam no pedido, mas sem base, sem consumo e sem baixa de estoque.
  const { data: basesPorNome, error: erroBases } = await sb
    .from('perfumes_base')
    .select('id, nome')
  if (erroBases) throw erroBases
  const porNome = new Map(
    (basesPorNome ?? []).map((b) => [normalizarNome(b.nome as string), b.id as string]),
  )

  // Cliente é identificado por e-mail: é o que a Shopify garante e o que o
  // portal de devolução usa para o cliente se encontrar.
  const clientes = new Map<string, { nome: string; email: string; telefone: string | null; cidade: string | null; uf: string | null }>()
  for (const p of pedidos) {
    const email = p.customer?.email?.trim().toLowerCase()
    if (!email) continue
    if (!clientes.has(email)) {
      clientes.set(email, {
        nome: [p.customer?.firstName, p.customer?.lastName].filter(Boolean).join(' ') || email,
        email,
        telefone: p.customer?.phone ?? null,
        cidade: p.shippingAddress?.city ?? null,
        uf: p.shippingAddress?.provinceCode ?? null,
      })
    }
  }

  for (const parte of emLotes([...clientes.values()], 500)) {
    const { error } = await sb.from('clientes').upsert(parte, { onConflict: 'email' })
    if (error) throw error
  }

  const { data: idsClientes, error: erroIds } = await sb.from('clientes').select('id, email')
  if (erroIds) throw erroIds
  const clientePorEmail = new Map(
    (idsClientes ?? []).map((c) => [(c.email as string).toLowerCase(), c.id as string]),
  )

  const linhasPedidos = pedidos.map((p) => {
    const rastreio = p.fulfillments[0]?.trackingInfo[0] ?? null
    const email = p.customer?.email?.trim().toLowerCase()
    return {
      id: p.name,
      cliente_id: email ? (clientePorEmail.get(email) ?? null) : null,
      canal: 'shopify',
      valor: Number(p.totalPriceSet.shopMoney.amount),
      frete: Number(p.totalShippingPriceSet?.shopMoney.amount ?? 0),
      cashback: 0,
      pagamento: pagamentoDe(p.displayFinancialStatus),
      envio: envioDe(p.displayFulfillmentStatus, Boolean(rastreio?.number)),
      comprado_em: p.createdAt,
      destino: [p.shippingAddress?.city, p.shippingAddress?.provinceCode]
        .filter(Boolean)
        .join(' · ') || null,
      cep: p.shippingAddress?.zip ?? null,
      logradouro: p.shippingAddress?.address1 ?? null,
      rastreio: rastreio?.number ?? null,
    }
  })

  for (const parte of emLotes(linhasPedidos, 500)) {
    const { error } = await sb.from('pedidos').upsert(parte, { onConflict: 'id' })
    if (error) throw error
  }

  // Itens são reescritos por pedido: quantidade e preço podem ter mudado por
  // edição do pedido na loja, e somar de novo duplicaria a venda.
  const { error: erroLimpa } = await sb
    .from('pedido_itens')
    .delete()
    .in('pedido_id', linhasPedidos.map((p) => p.id))
  if (erroLimpa) throw erroLimpa

  let itensSemVariante = 0
  let casadosPorNome = 0
  const linhasItens = pedidos.flatMap((p) =>
    p.lineItems.nodes.map((i) => {
      let casado = i.variant ? porVariante.get(i.variant.id) : undefined

      if (!casado && i.variant) {
        const baseId = porNome.get(normalizarNome(i.title))
        const ml = parseVarianteMl(i.variant.title)
        if (baseId && ml) {
          casado = { baseId, variante: ml }
          casadosPorNome++
        }
      }
      if (!casado) itensSemVariante++

      return {
        pedido_id: p.name,
        base_id: casado?.baseId ?? null,
        descricao: i.title,
        variante: casado?.variante ?? null,
        quantidade: i.quantity,
        preco: Number(i.originalUnitPriceSet.shopMoney.amount),
        shopify_variant_id: i.variant?.id ?? null,
        variante_titulo: i.variant?.title ?? null,
      }
    }),
  )

  for (const parte of emLotes(linhasItens, 500)) {
    const { error } = await sb.from('pedido_itens').insert(parte)
    if (error) throw error
  }

  const { error: erroLog } = await sb.from('sincronizacoes').insert({
    origem: 'shopify',
    tipo: 'pedidos',
    perfumes: clientes.size,
    variantes: linhasItens.length,
    ignorados: itensSemVariante,
    detalhes: { desde, dias, casadosPorNome },
  })
  if (erroLog) throw erroLog

  return {
    pedidos: linhasPedidos.length,
    itens: linhasItens.length,
    clientes: clientes.size,
    itensSemVariante,
    desde,
    semDadosDeCliente,
    casadosPorNome,
  }
}

/**
 * Deriva o consumo diário de cada base das vendas reais.
 *
 * Substitui o campo digitado à mão que alimentava a cobertura ("acaba em X
 * dias"). Só considera pedidos pagos: carrinho pendente não consome perfume.
 */
export async function derivarConsumoDiario(dias = 30): Promise<{ bases: number }> {
  if (!supabaseConfigurado()) {
    throw new Error('O Supabase precisa estar configurado.')
  }
  const sb = supabaseServer()
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await sb
    .from('pedido_itens')
    .select('base_id, variante, quantidade, pedidos!inner(comprado_em, pagamento)')
    .not('base_id', 'is', null)
    .gte('pedidos.comprado_em', desde)
    .eq('pedidos.pagamento', 'pago')
  if (error) throw error

  const mlPorBase = new Map<string, number>()
  for (const i of (data ?? []) as unknown as {
    base_id: string
    variante: number
    quantidade: number
  }[]) {
    mlPorBase.set(i.base_id, (mlPorBase.get(i.base_id) ?? 0) + i.variante * i.quantidade)
  }

  for (const [baseId, ml] of mlPorBase) {
    const { error: erroUp } = await sb
      .from('perfumes_base')
      .update({ consumo_diario_ml: Math.round((ml / dias) * 100) / 100 })
      .eq('id', baseId)
    if (erroUp) throw erroUp
  }

  return { bases: mlPorBase.size }
}

// ── Envio: levar o rastreio da Yampi até a conta do cliente na Shopify ─────

const CONSULTA_PEDIDO_ENVIO = /* GraphQL */ `
  query ($busca: String!) {
    orders(first: 1, query: $busca) {
      nodes {
        id
        name
        displayFulfillmentStatus
        fulfillmentOrders(first: 10) {
          nodes {
            id
            status
          }
        }
      }
    }
  }
`

const MUTACAO_ENVIO = /* GraphQL */ `
  mutation ($fulfillment: FulfillmentV2Input!) {
    fulfillmentCreateV2(fulfillment: $fulfillment) {
      fulfillment {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`

const MUTACAO_FECHAR = /* GraphQL */ `
  mutation ($id: ID!) {
    orderClose(input: { id: $id }) {
      order {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`

const MUTACAO_ENTREGA = /* GraphQL */ `
  mutation ($fulfillmentEvent: FulfillmentEventInput!) {
    fulfillmentEventCreate(fulfillmentEvent: $fulfillmentEvent) {
      fulfillmentEvent {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`

export interface EnvioParaShopify {
  pedidoId: string
  shopifyNumero: string
  rastreio: string | null
  transportadora: string | null
  entregue: boolean
}

export interface ResultadoEnvios {
  enviados: number
  entregues: number
  /** Pedidos tirados da fila de "abertos" da loja. */
  fechados: number
  ignorados: { pedido: string; motivo: string }[]
}

/**
 * Cria o fulfillment na Shopify com o rastreio que veio da Yampi.
 *
 * Existe porque a Yampi não devolve o envio para a Shopify: o cliente entra
 * na conta dele, vê "confirmado" e abre um chamado perguntando onde está o
 * pedido, mesmo com a etiqueta postada há dias. Criar o fulfillment marca o
 * pedido como enviado, dispara o e-mail de confirmação de envio com o código,
 * e faz o rastreio aparecer no histórico da conta.
 *
 * `notifyCustomer` é o ponto todo: sem ele o status muda mas ninguém avisa.
 */
export async function sincronizarEnviosShopify(
  envios: EnvioParaShopify[],
): Promise<ResultadoEnvios> {
  const { loja } = credenciais()
  if (!loja) throw new Error('SHOPIFY_LOJA precisa estar no .env.local')
  if (envios.length === 0) return { enviados: 0, entregues: 0, fechados: 0, ignorados: [] }
  const token = await tokenDeAcesso(loja)

  const ignorados: ResultadoEnvios['ignorados'] = []
  let enviados = 0
  let entregues = 0
  let fechados = 0

  for (const e of envios) {
    const busca = `name:${e.shopifyNumero}`
    const dados = await chamarShopify<{
      orders: {
        nodes: {
          id: string
          name: string
          displayFulfillmentStatus: string
          fulfillmentOrders: { nodes: { id: string; status: string }[] }
        }[]
      }
    }>(
      loja,
      token,
      CONSULTA_PEDIDO_ENVIO,
      { busca },
      'localizar o pedido na loja',
      'read_orders e read_merchant_managed_fulfillment_orders',
    )

    const pedido = dados.orders.nodes[0]
    if (!pedido) {
      ignorados.push({
        pedido: e.pedidoId,
        motivo: `nenhum pedido ${e.shopifyNumero} na Shopify — o número da Yampi pode não ser o da loja`,
      })
      continue
    }

    // Fulfillment order já fechado significa envio criado por outro caminho:
    // repetir geraria um segundo e-mail de envio para o mesmo pedido.
    const abertos = pedido.fulfillmentOrders.nodes.filter((f) => f.status === 'OPEN' || f.status === 'IN_PROGRESS')
    if (abertos.length === 0) {
      ignorados.push({ pedido: e.pedidoId, motivo: 'já estava enviado na Shopify' })
      continue
    }

    const r = await chamarShopify<{
      fulfillmentCreateV2: {
        fulfillment: { id: string } | null
        userErrors: { message: string }[]
      }
    }>(
      loja,
      token,
      MUTACAO_ENVIO,
      {
        fulfillment: {
          lineItemsByFulfillmentOrder: abertos.map((f) => ({ fulfillmentOrderId: f.id })),
          trackingInfo: e.rastreio
            ? { number: e.rastreio, company: e.transportadora ?? undefined }
            : undefined,
          // NÃO notificar: a Yampi já manda o e-mail de faturamento, envio e
          // entrega. Ligar isto aqui daria dois avisos do mesmo fato ao mesmo
          // cliente — o que é pior que não avisar. O objetivo desta sincronia
          // é a Shopify parar de mostrar o pedido como aberto, e o cliente
          // encontrar o rastreio quando entrar na conta.
          notifyCustomer: false,
        },
      },
      'marcar o pedido como enviado',
      'write_merchant_managed_fulfillment_orders',
    )

    const erros = r.fulfillmentCreateV2?.userErrors ?? []
    if (erros.length || !r.fulfillmentCreateV2?.fulfillment) {
      ignorados.push({
        pedido: e.pedidoId,
        motivo: erros.map((x) => x.message).join('; ') || 'a Shopify não criou o envio',
      })
      continue
    }
    enviados++

    if (e.entregue) {
      const rd = await chamarShopify<{
        fulfillmentEventCreate: { userErrors: { message: string }[] }
      }>(
        loja,
        token,
        MUTACAO_ENTREGA,
        {
          fulfillmentEvent: {
            fulfillmentId: r.fulfillmentCreateV2.fulfillment.id,
            status: 'DELIVERED',
          },
        },
        'marcar a entrega',
        'write_merchant_managed_fulfillment_orders',
      )
      if ((rd.fulfillmentEventCreate?.userErrors ?? []).length === 0) entregues++

      // Entregue e faturado é pedido terminado: fechar tira da fila de
      // "abertos" da loja, que é o trabalho manual que sobrava para o fim.
      // Sem o escopo write_orders a Shopify recusa — e isso não invalida o
      // envio, então o erro vira aviso em vez de derrubar a rodada.
      try {
        const rf = await chamarShopify<{
          orderClose: { userErrors: { message: string }[] }
        }>(
          loja,
          token,
          MUTACAO_FECHAR,
          { id: pedido.id },
          'fechar o pedido',
          'write_orders',
        )
        const errosFechar = rf.orderClose?.userErrors ?? []
        if (errosFechar.length) {
          ignorados.push({
            pedido: e.pedidoId,
            motivo: `enviado, mas não fechei na loja: ${errosFechar[0].message}`,
          })
        } else {
          fechados++
        }
      } catch (erro) {
        ignorados.push({
          pedido: e.pedidoId,
          motivo: `enviado, mas não fechei na loja: ${erro instanceof Error ? erro.message : String(erro)}`,
        })
      }
    }
  }

  return { enviados, entregues, fechados, ignorados }
}

// ── Vínculo Yampi → Shopify ────────────────────────────────────────────────

const CONSULTA_PEDIDOS_VINCULO = /* GraphQL */ `
  query ($cursor: String, $filtro: String) {
    orders(first: 100, after: $cursor, sortKey: CREATED_AT, reverse: true, query: $filtro) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        createdAt
        email
        sourceIdentifier
        note
        customAttributes {
          key
          value
        }
        totalPriceSet {
          shopMoney {
            amount
          }
        }
      }
    }
  }
`

/** A mesma consulta sem e-mail — para lojas sem aprovação de dados protegidos. */
const CONSULTA_PEDIDOS_VINCULO_SEM_EMAIL = (() => {
  const reduzida = CONSULTA_PEDIDOS_VINCULO.replace(/\n\s*email\n/, '\n')
  if (/\bemail\b/.test(reduzida)) {
    throw new Error('A consulta de vínculo sem e-mail não removeu o campo protegido.')
  }
  return reduzida
})()

interface PedidoVinculoShopify {
  /** GID da Shopify — identificador estável do pedido, para o fulfillment. */
  id: string
  name: string
  createdAt: string
  email: string | null
  sourceIdentifier: string | null
  note: string | null
  customAttributes: { key: string; value: string | null }[]
  totalPriceSet: { shopMoney: { amount: string } }
}

export interface ResultadoVinculo {
  /** Pedidos do ERP que estavam sem número da Shopify antes da rodada. */
  pendentes: number
  /** Pedidos lidos da Shopify na janela que a API permitiu. */
  examinados: number
  vinculados: number
  /** Casamentos por e-mail+valor com mais de um candidato — não vinculados. */
  ambiguos: number
  /** A loja não liberou o e-mail do pedido; só o vínculo por referência rodou. */
  semEmailShopify: boolean
  /**
   * Quantos dos pedidos lidos traziam "Pedido Yampi {n}" na observação.
   *
   * Existe para separar duas falhas que produzem o mesmo zero na tela: "a
   * Shopify não devolveu pedido nenhum" (janela, escopo ou credencial) e "os
   * pedidos vieram, mas nenhum tinha a referência" (o campo mudou de lugar).
   * Sem este número, as duas viravam a mesma mensagem inútil.
   */
  comReferencia: number
}

/**
 * Preenche o `shopify_numero` dos pedidos que nasceram na Yampi.
 *
 * A importação esperava `marketplace_sale_number` no pedido da Yampi, mas
 * nesta loja o campo veio vazio em TODOS os pedidos — e sem o número a baixa
 * de entrega na Shopify não tem o que fazer. Aqui o vínculo é feito pelo
 * outro lado: lê os pedidos da própria Shopify e casa com os da Yampi.
 *
 * Dois casamentos, do mais certeiro ao mais circunstancial:
 * 1. Referência explícita — o número Yampi citado em sourceIdentifier, nota
 *    ou atributo do pedido Shopify (é como integrações de checkout costumam
 *    marcar a origem).
 * 2. E-mail + valor idênticos, com data a até 10 dias — e só quando o par é
 *    único dos dois lados; havendo dois candidatos, ninguém é vinculado,
 *    porque um vínculo errado baixaria a entrega no pedido de outra pessoa.
 *
 * A API sem o escopo read_all_orders devolve só ~60 dias: pedidos mais
 * antigos que isso ficam sem par e a tela diz o porquê.
 */
export async function vincularPedidosShopify(): Promise<ResultadoVinculo> {
  if (!supabaseConfigurado()) {
    throw new Error('O Supabase precisa estar configurado para vincular os pedidos.')
  }
  const { loja } = credenciais()
  if (!loja) throw new Error('SHOPIFY_LOJA precisa estar no .env.local')

  const sb = supabaseServer()
  const { data: soltos, error } = await sb
    .from('pedidos')
    .select('id, valor, comprado_em, cliente_id')
    .is('shopify_numero', null)
  if (error) throw error

  const pendentes = (soltos ?? []) as unknown as {
    id: string
    valor: number
    comprado_em: string
    cliente_id: string | null
  }[]
  if (pendentes.length === 0) {
    return {
      pendentes: 0,
      examinados: 0,
      vinculados: 0,
      ambiguos: 0,
      semEmailShopify: false,
      comReferencia: 0,
    }
  }

  const { data: donos, error: erroClientes } = await sb.from('clientes').select('id, email')
  if (erroClientes) throw erroClientes
  const emailDoCliente = new Map(
    (donos ?? []).map((c) => [c.id as string, (c.email as string).trim().toLowerCase()]),
  )

  // Janela de leitura: do pedido solto mais antigo até hoje. Sem o escopo
  // read_all_orders a Shopify corta em ~60 dias por conta própria.
  const maisAntigo = pendentes.reduce(
    (menor, p) => (p.comprado_em < menor ? p.comprado_em : menor),
    pendentes[0].comprado_em,
  )
  const filtro = `created_at:>=${maisAntigo.slice(0, 10)}`

  // Token novo SEMPRE: sem read_all_orders a API corta a janela em ~60 dias
  // SILENCIOSAMENTE — não é erro que o retry pegue. Quem acabou de marcar o
  // escopo no painel só o vê valer num token novo, e o custo de emitir um é
  // uma chamada por rodada de vínculo.
  esquecerToken()
  let token = await tokenDeAcesso(loja)
  const buscar = async (consulta: string) => {
    const encontrados: PedidoVinculoShopify[] = []
    let cursor: string | null = null
    for (let pagina = 0; pagina < 40; pagina++) {
      const dados: {
        orders: {
          pageInfo: { hasNextPage: boolean; endCursor: string }
          nodes: PedidoVinculoShopify[]
        }
      } = await chamarShopify(
        loja,
        token,
        consulta,
        { cursor, filtro },
        'ler os pedidos da loja para vincular',
        'read_orders',
      )
      encontrados.push(...dados.orders.nodes)
      if (!dados.orders.pageInfo.hasNextPage) break
      cursor = dados.orders.pageInfo.endCursor
    }
    return encontrados
  }

  let daLoja: PedidoVinculoShopify[]
  let semEmailShopify = false
  try {
    daLoja = await buscar(CONSULTA_PEDIDOS_VINCULO)
  } catch (e) {
    if (!(e instanceof AcessoNegadoShopify)) throw e
    esquecerToken()
    token = await tokenDeAcesso(loja)
    try {
      daLoja = await buscar(CONSULTA_PEDIDOS_VINCULO)
    } catch (e2) {
      if (!(e2 instanceof AcessoNegadoShopify)) throw e2
      semEmailShopify = true
      daLoja = await buscar(CONSULTA_PEDIDOS_VINCULO_SEM_EMAIL)
    }
  }

  // 1º casamento: o número Yampi citado em algum campo do pedido Shopify.
  //
  // O desenvolvedor do site confirmou onde ele mora: a integração
  // Yampi→Shopify escreve "Pedido Yampi {numero}" no campo Observações
  // (`note`) de todo pedido importado. O número é exatamente o mesmo que o ERP
  // usa como chave — 16 dígitos, conferido nos 602 pedidos da base.
  const pedidoPorNumero = new Map(pendentes.map((p) => [p.id.replace(/^YP-/, ''), p]))
  const vinculo = new Map<string, { numero: string; gid: string }>()
  const usados = new Set<string>() // names da Shopify já reivindicados
  let comReferencia = 0
  for (const o of daLoja) {
    const texto = [
      o.sourceIdentifier ?? '',
      o.note ?? '',
      ...o.customAttributes.flatMap((a) => [a.key, a.value ?? '']),
    ].join(' ')
    const numeros = texto.match(/\d{6,}/g) ?? []
    if (numeros.length) comReferencia++
    for (const trecho of numeros) {
      const par = pedidoPorNumero.get(trecho)
      if (par && !vinculo.has(par.id) && !usados.has(o.name)) {
        vinculo.set(par.id, { numero: o.name.replace(/^#/, ''), gid: o.id })
        usados.add(o.name)
        break
      }
    }
  }

  // 2º casamento: e-mail + valor exato, único dos dois lados, datas próximas.
  let ambiguos = 0
  const chaveDe = (email: string, valor: number) => `${email}|${Math.round(valor * 100)}`
  const soltosPorChave = new Map<string, typeof pendentes>()
  for (const p of pendentes) {
    if (vinculo.has(p.id)) continue
    const email = p.cliente_id ? emailDoCliente.get(p.cliente_id) : null
    if (!email) continue
    const chave = chaveDe(email, p.valor)
    soltosPorChave.set(chave, [...(soltosPorChave.get(chave) ?? []), p])
  }
  const lojaPorChave = new Map<string, PedidoVinculoShopify[]>()
  for (const o of daLoja) {
    if (usados.has(o.name) || !o.email) continue
    const chave = chaveDe(o.email.trim().toLowerCase(), Number(o.totalPriceSet.shopMoney.amount))
    lojaPorChave.set(chave, [...(lojaPorChave.get(chave) ?? []), o])
  }
  const DEZ_DIAS = 10 * 24 * 60 * 60 * 1000
  for (const [chave, meus] of soltosPorChave) {
    const deles = lojaPorChave.get(chave) ?? []
    if (meus.length === 1 && deles.length === 1) {
      const distancia = Math.abs(
        new Date(meus[0].comprado_em).getTime() - new Date(deles[0].createdAt).getTime(),
      )
      if (distancia <= DEZ_DIAS) {
        vinculo.set(meus[0].id, { numero: deles[0].name.replace(/^#/, ''), gid: deles[0].id })
        usados.add(deles[0].name)
      }
    } else if (deles.length > 0) {
      ambiguos += meus.length
    }
  }

  for (const parte of emLotes([...vinculo.entries()], 20)) {
    await Promise.all(
      parte.map(([id, achado]) =>
        sb
          .from('pedidos')
          // O GID vai junto: ele é o identificador ESTÁVEL do pedido na
          // Shopify, e é o que o espelhamento de fulfillment precisa. O
          // `name` muda se alguém renumerar a loja; o GID, não.
          .update({ shopify_numero: achado.numero, shopify_gid: achado.gid })
          .eq('id', id)
          .then(({ error: e }) => {
            if (e) throw e
          }),
      ),
    )
  }

  return {
    pendentes: pendentes.length,
    examinados: daLoja.length,
    vinculados: vinculo.size,
    ambiguos,
    semEmailShopify,
    comReferencia,
  }
}

// ── Aplicação automática do estoque calculado ──────────────────────────────

export interface AplicacaoCalculada extends ResultadoAplicacao {
  /** Variantes fora de sincronia mas sem id da Shopify — reimportar o catálogo resolve. */
  pulados: number
}

/**
 * Publica na Shopify tudo o que o ERP calculou diferente do que está na loja.
 *
 * Vive na camada de dados, e não na tela, porque quem mais chama é a rotina
 * de hora em hora: sincronia que depende de alguém clicar não é sincronia.
 * A tela usa a mesma função — um caminho só, um comportamento só.
 */
export async function aplicarEstoqueCalculado(): Promise<AplicacaoCalculada> {
  if (!supabaseConfigurado()) {
    throw new Error('O Supabase precisa estar configurado para aplicar na Shopify.')
  }
  const { carregarSincronia } = await import('./consultas')
  const sync = await carregarSincronia()
  const sb = supabaseServer()

  // O id da variante na loja mora em produtos_derivados; sem ele não há o
  // que gravar — a base foi criada à mão ou nunca veio da importação.
  const { data: derivados, error } = await sb
    .from('produtos_derivados')
    .select('base_id, variante, shopify_variant_id')
  if (error) throw error
  const idPorChave = new Map(
    (derivados ?? [])
      .filter((d) => d.shopify_variant_id)
      .map((d) => [`${d.base_id}|${d.variante}`, d.shopify_variant_id as string]),
  )

  const alvos: { shopifyVariantId: string; rotulo: string; novoValor: number }[] = []
  const gravar: { base_id: string; variante: number; publicado: number }[] = []
  let pulados = 0

  for (const b of sync.bases) {
    for (const v of b.variantes) {
      // `sem_carga` é a trava que impede a loja de ir a zero: base que nunca
      // recebeu carga inicial não tem volume porque ninguém contou, não
      // porque acabou. Gravar zero aí tiraria o produto do ar.
      if (v.acao === 'ok' || v.acao === 'sem_carga') continue
      const id = idPorChave.get(`${b.base.id}|${v.variante}`)
      if (!id) {
        pulados++
        continue
      }
      alvos.push({
        shopifyVariantId: id,
        rotulo: `${b.base.nome} · ${v.variante} ml`,
        novoValor: v.novoValor,
      })
      gravar.push({ base_id: b.base.id, variante: v.variante, publicado: v.novoValor })
    }
  }

  const resultado = await aplicarEstoqueShopify(alvos)

  // O que a loja recusou não pode entrar como publicado — senão a tela diria
  // "em dia" para uma variante que continua vendendo o número antigo.
  const recusadas = new Set(resultado.ignoradas.map((i) => i.variante))
  const confirmadas = gravar.filter((g, i) => !recusadas.has(alvos[i].rotulo))

  if (confirmadas.length) {
    const agora = new Date().toISOString()
    const { error: erroGravar } = await sb
      .from('shopify_publicado')
      .upsert(
        confirmadas.map((c) => ({ ...c, lido_em: agora })),
        { onConflict: 'base_id,variante' },
      )
    if (erroGravar) throw erroGravar
  }

  // Rodada sem mudança não entra no registro: a rotina roda de hora em hora,
  // e 24 linhas diárias de "0 variantes" enterrariam as sincronias de verdade.
  if (alvos.length > 0 || pulados > 0) {
    const { error: erroLog } = await sb.from('sincronizacoes').insert({
      origem: 'shopify',
      tipo: 'estoque',
      perfumes: new Set(confirmadas.map((c) => c.base_id)).size,
      variantes: resultado.aplicadas,
      ignorados: resultado.ignoradas.length + pulados,
      detalhes: resultado.ignoradas,
    })
    if (erroLog) throw erroLog
  }

  return { ...resultado, pulados }
}

// ── Anulados na Shopify ────────────────────────────────────────────────────

const CONSULTA_ANULADOS = /* GraphQL */ `
  query ($cursor: String, $filtro: String) {
    orders(first: 100, after: $cursor, query: $filtro) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        name
        displayFinancialStatus
      }
    }
  }
`

/**
 * Marca como divergente o pedido anulado/estornado na Shopify.
 *
 * O operador cancela venda pela Shopify, e a Yampi às vezes segue dizendo
 * "paid" — o pedido continuava contando como receita, cliente e relatório.
 * O estorno pelo Mercado Pago também marca (via extrato), mas chega com
 * horas de atraso; a Shopify diz na hora.
 */
export async function marcarAnuladosDaShopify(
  dias = 45,
): Promise<{ anulados: number; marcados: number }> {
  const { loja } = credenciais()
  if (!loja) return { anulados: 0, marcados: 0 }
  const token = await tokenDeAcesso(loja)

  const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10)
  const filtro = `created_at:>=${desde} AND (financial_status:refunded OR financial_status:partially_refunded OR financial_status:voided OR status:cancelled)`

  const numeros: string[] = []
  let cursor: string | null = null
  for (let pagina = 0; pagina < 20; pagina++) {
    const dados: {
      orders: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
        nodes: { name: string }[]
      }
    } = await chamarShopify(
      loja,
      token,
      CONSULTA_ANULADOS,
      { cursor, filtro },
      'ler os pedidos anulados',
      'read_orders',
    )
    for (const n of dados.orders.nodes) {
      const digitos = n.name.replace(/\D/g, '')
      if (digitos) numeros.push(digitos)
    }
    if (!dados.orders.pageInfo.hasNextPage) break
    cursor = dados.orders.pageInfo.endCursor
  }

  if (numeros.length === 0 || !supabaseConfigurado()) {
    return { anulados: numeros.length, marcados: 0 }
  }

  // O número da Shopify chega da Yampi com prefixo variável — compara só os
  // dígitos, dos dois lados.
  const { data, error } = await supabaseServer().rpc('marcar_divergentes_por_numero_shopify', {
    p_numeros: numeros,
  })
  if (error) throw error
  return { anulados: numeros.length, marcados: Number(data ?? 0) }
}
