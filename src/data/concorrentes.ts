import 'server-only'

import { casarTitulo, parseVarianteMl } from '@/domain'
import type { VarianteMl } from '@/domain'

import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * Coleta de preço de concorrente.
 *
 * O caminho é `/products.json`, endpoint público que lojas Shopify servem por
 * padrão com catálogo, variantes e preço em JSON. Ler isso é diferente de
 * raspar HTML: não há seletor de página para quebrar na próxima mudança de
 * tema, e o dado vem estruturado.
 *
 * Nem toda loja é Shopify, e nem toda loja Shopify deixa o endpoint aberto.
 * Quando não dá, a fonte fica marcada como bloqueada COM O MOTIVO — e o preço
 * pode ser lançado à mão. Um módulo que decide preço não pode ter etapa que
 * falha em silêncio.
 */

/** Páginas de 250 itens. Dez páginas cobrem 2.500 produtos — sobra folgado. */
const MAX_PAGINAS = 10

interface VarianteLoja {
  id: number
  title: string
  price: string
  available?: boolean
}

interface ProdutoLoja {
  id: number
  title: string
  handle: string
  variants?: VarianteLoja[]
}

export class LeituraBloqueada extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'LeituraBloqueada'
  }
}

export function mensagemDe(e: unknown): string {
  if (e instanceof Error) return e.message
  return typeof e === 'string' ? e : 'Erro desconhecido'
}

/** `https://loja.com/` e `loja.com` chegam ao mesmo lugar. */
export function dominioNormalizado(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '')
}

async function buscarPagina(dominio: string, pagina: number): Promise<ProdutoLoja[]> {
  const url = `https://${dominio}/products.json?limit=250&page=${pagina}`

  let resposta: Response
  try {
    resposta = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  } catch (e) {
    // DNS, TLS, timeout: a loja não respondeu. Dizer qual foi importa mais
    // que um "falhou" genérico — é o que separa domínio errado de bloqueio.
    throw new LeituraBloqueada(`não foi possível abrir ${url} — ${mensagemDe(e)}`)
  }

  if (resposta.status === 404) {
    throw new LeituraBloqueada(
      `${dominio} respondeu 404 em /products.json. A loja provavelmente não é Shopify — ` +
        'mude a fonte para leitura manual e lance os preços à mão.',
    )
  }
  if (resposta.status === 401 || resposta.status === 403 || resposta.status === 429) {
    throw new LeituraBloqueada(
      `${dominio} recusou a leitura (${resposta.status}). A loja bloqueia acesso automático — ` +
        'use leitura manual para esta fonte.',
    )
  }
  if (!resposta.ok) {
    throw new LeituraBloqueada(`${dominio} respondeu ${resposta.status} em /products.json.`)
  }

  const texto = await resposta.text()
  let corpo: unknown
  try {
    corpo = JSON.parse(texto)
  } catch {
    // Página de erro ou de "aguarde" costuma vir como HTML com status 200.
    throw new LeituraBloqueada(
      `${dominio} respondeu algo que não é JSON em /products.json — ${texto.slice(0, 120)}`,
    )
  }

  const produtos = (corpo as { products?: ProdutoLoja[] }).products
  if (!Array.isArray(produtos)) {
    throw new LeituraBloqueada(
      `${dominio} devolveu JSON sem a lista "products" — o endpoint existe mas não é de catálogo.`,
    )
  }
  return produtos
}

export interface PrecoObservado {
  chave: string
  titulo: string
  preco: number
  variante: VarianteMl | null
  url: string
}

/** Lê o catálogo inteiro de uma loja Shopify. */
export async function lerLojaShopify(dominio: string): Promise<PrecoObservado[]> {
  const observados: PrecoObservado[] = []

  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const produtos = await buscarPagina(dominio, pagina)
    if (produtos.length === 0) break

    for (const p of produtos) {
      for (const v of p.variants ?? []) {
        const preco = Number(v.price)
        if (!Number.isFinite(preco) || preco <= 0) continue

        // O tamanho pode estar no título da variante ("5 ml") ou só no do
        // produto ("Decant 5ml de ..."). Vale o primeiro que der.
        const variante = parseVarianteMl(v.title) ?? parseVarianteMl(p.title)

        observados.push({
          chave: `${p.handle}|${v.id}`,
          titulo: `${p.title} ${v.title}`.trim(),
          preco,
          variante,
          url: `https://${dominio}/products/${p.handle}`,
        })
      }
    }
  }

  return observados
}


// ── Nuvemshop ──────────────────────────────────────────────────────────────

/**
 * Nuvemshop não expõe um endpoint de catálogo como a Shopify. O que ela expõe,
 * e todo tema expõe porque o Google exige, é marcação Schema.org no HTML de
 * cada produto: um bloco `application/ld+json` com nome, variante e preço.
 *
 * Ler isso não é raspar HTML no sentido frágil do termo — não há classe de CSS
 * nem posição de elemento envolvida. É um contrato de SEO, e ele muda muito
 * mais devagar que o tema da loja.
 *
 * O custo é uma requisição por produto. Daí o teto e o passo: a coleta é
 * lenta de propósito, para não parecer ataque a quem está do outro lado.
 */
const MAX_PRODUTOS_NUVEMSHOP = 400
const PARALELAS = 4

async function texto(url: string, oQue: string): Promise<string> {
  let r: Response
  try {
    r = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml',
        // Vitrine costuma recusar cliente sem identificação.
        'User-Agent': 'FRENESI-OS/1.0 (comparador de precos)',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  } catch (e) {
    throw new LeituraBloqueada(`não foi possível ${oQue} (${url}) — ${mensagemDe(e)}`)
  }
  if (r.status === 403 || r.status === 429) {
    throw new LeituraBloqueada(
      `a loja recusou a leitura (${r.status}) ao ${oQue}. Use leitura manual nesta fonte.`,
    )
  }
  if (!r.ok) throw new LeituraBloqueada(`a loja respondeu ${r.status} ao ${oQue} (${url}).`)
  return r.text()
}

/** URLs de `<loc>` — serve tanto para índice de sitemaps quanto para o sitemap. */
function locsDe(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1])
}

/** Percorre o sitemap (e os filhos, quando é índice) atrás de páginas de produto. */
export async function urlsDeProduto(dominio: string): Promise<string[]> {
  const raiz = await texto(`https://${dominio}/sitemap.xml`, 'abrir o sitemap')
  const locs = locsDe(raiz)
  if (locs.length === 0) {
    throw new LeituraBloqueada(
      `o sitemap de ${dominio} veio sem nenhuma URL — a loja pode não publicar sitemap.`,
    )
  }

  const paginas = locs.filter((u) => /\/produtos?\//i.test(u) || /\/products?\//i.test(u))
  if (paginas.length > 0) return paginas.slice(0, MAX_PRODUTOS_NUVEMSHOP)

  // Era um índice: os produtos estão nos sitemaps filhos.
  const filhos = locs.filter((u) => /\.xml/i.test(u)).slice(0, 12)
  const encontradas: string[] = []
  for (const filho of filhos) {
    if (encontradas.length >= MAX_PRODUTOS_NUVEMSHOP) break
    try {
      const xml = await texto(filho, 'abrir um sitemap do índice')
      encontradas.push(...locsDe(xml).filter((u) => /\/produtos?\//i.test(u)))
    } catch {
      // Um sitemap filho ilegível não invalida os outros.
    }
  }
  if (encontradas.length === 0) {
    throw new LeituraBloqueada(
      `nenhuma URL de produto no sitemap de ${dominio}. Rode o diagnóstico para ver o que ele traz.`,
    )
  }
  return encontradas.slice(0, MAX_PRODUTOS_NUVEMSHOP)
}

interface OfertaLd {
  price?: number | string
  priceSpecification?: { price?: number | string }
  name?: string
  sku?: string
}

interface ProdutoLd {
  '@type'?: string | string[]
  name?: string
  offers?: OfertaLd | OfertaLd[]
}

function ehProduto(no: ProdutoLd): boolean {
  const t = no['@type']
  return Array.isArray(t) ? t.includes('Product') : t === 'Product'
}

function precoDe(o: OfertaLd): number {
  const bruto = o.price ?? o.priceSpecification?.price
  // "1.234,56" e "1234.56" convivem no mesmo padrão; o separador de milhar sai.
  const n =
    typeof bruto === 'string'
      ? Number(bruto.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
      : Number(bruto)
  return Number.isFinite(n) ? n : 0
}

/** Extrai os produtos do JSON-LD de uma página. Ignora o que não for Product. */
export function produtosDoJsonLd(html: string): { nome: string; ofertas: OfertaLd[] }[] {
  const blocos = [
    ...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi),
  ]
  const achados: { nome: string; ofertas: OfertaLd[] }[] = []

  for (const b of blocos) {
    let dado: unknown
    try {
      dado = JSON.parse(b[1].trim())
    } catch {
      continue
    }
    // O bloco pode ser um objeto, uma lista, ou um @graph com os dois.
    const candidatos: ProdutoLd[] = Array.isArray(dado)
      ? (dado as ProdutoLd[])
      : [(dado as ProdutoLd), ...(((dado as { '@graph'?: ProdutoLd[] })['@graph']) ?? [])]

    for (const c of candidatos) {
      if (!c || !ehProduto(c) || !c.name) continue
      const ofertas = c.offers ? (Array.isArray(c.offers) ? c.offers : [c.offers]) : []
      achados.push({ nome: c.name, ofertas })
    }
  }
  return achados
}

async function lerLojaNuvemshop(dominio: string): Promise<PrecoObservado[]> {
  const urls = await urlsDeProduto(dominio)
  const observados: PrecoObservado[] = []

  for (let i = 0; i < urls.length; i += PARALELAS) {
    const lote = await Promise.all(
      urls.slice(i, i + PARALELAS).map(async (url) => {
        try {
          return { url, html: await texto(url, 'abrir a página do produto') }
        } catch {
          // Página fora do ar não derruba a coleta inteira.
          return null
        }
      }),
    )

    for (const pagina of lote) {
      if (!pagina) continue
      for (const p of produtosDoJsonLd(pagina.html)) {
        // Sem oferta nomeada, a página inteira é um preço só.
        const ofertas = p.ofertas.length ? p.ofertas : [{} as OfertaLd]
        ofertas.forEach((o, indice) => {
          const preco = precoDe(o)
          if (preco <= 0) return
          const rotulo = o.name ?? ''
          observados.push({
            chave: `${pagina.url}|${o.sku ?? (rotulo || indice)}`,
            titulo: `${p.nome} ${rotulo}`.trim(),
            preco,
            // O tamanho pode estar no nome da oferta, no do produto ou só na
            // URL — lojas de decant costumam pôr "…-5ml" no endereço.
            variante:
              parseVarianteMl(rotulo) ??
              parseVarianteMl(p.nome) ??
              parseVarianteMl(pagina.url.replace(/[^0-9a-z]+/gi, ' ')),
            url: pagina.url,
          })
        })
      }
    }
  }

  if (observados.length === 0) {
    throw new LeituraBloqueada(
      `${dominio} abriu, mas nenhuma página trouxe preço em JSON-LD. Rode o diagnóstico: ` +
        'ele mostra o que veio, e dá para ajustar a leitura sem adivinhar.',
    )
  }
  return observados
}

export type Estrategia = 'shopify' | 'nuvemshop' | 'manual'

/** Despacha para o leitor da plataforma da loja. */
export async function lerLoja(dominio: string, estrategia: Estrategia): Promise<PrecoObservado[]> {
  if (estrategia === 'manual') {
    throw new Error('Fonte manual não é lida automaticamente.')
  }
  return estrategia === 'shopify' ? lerLojaShopify(dominio) : lerLojaNuvemshop(dominio)
}

/**
 * O que a loja devolve, cru.
 *
 * Existe pelo mesmo motivo do diagnóstico da Yampi: quando a leitura não sai
 * como esperado, ver a resposta real resolve em um minuto o que adivinhar não
 * resolve em uma hora. Por isso ele devolve EVIDÊNCIA, não um "ok/falhou" —
 * inclusive um trecho cru do que veio, para quem for ajustar a leitura.
 */
export interface Diagnostico {
  estrategia: Estrategia
  /** Cada passo tentado, na ordem, com o que aconteceu. */
  passos: { passo: string; resultado: string }[]
  /** Primeiros títulos e preços que a leitura conseguiu extrair. */
  amostra: { titulo: string; preco: number; variante: number | null }[]
  /** Trecho cru da resposta, para diagnosticar o que a amostra não explica. */
  bruto: string
}

export async function diagnosticarLoja(
  dominio: string,
  estrategia: Estrategia = 'nuvemshop',
): Promise<Diagnostico> {
  const d = dominioNormalizado(dominio)
  const passos: Diagnostico['passos'] = []

  if (estrategia === 'shopify') {
    const produtos = await buscarPagina(d, 1)
    passos.push({ passo: '/products.json', resultado: `${produtos.length} produtos na 1ª página` })
    const amostra = (await lerLojaShopify(d)).slice(0, 8)
    return {
      estrategia,
      passos,
      amostra: amostra.map((a) => ({ titulo: a.titulo, preco: a.preco, variante: a.variante })),
      bruto: JSON.stringify(produtos[0] ?? {}).slice(0, 1200),
    }
  }

  const urls = await urlsDeProduto(d)
  passos.push({ passo: 'sitemap.xml', resultado: `${urls.length} URLs de produto` })

  const html = await texto(urls[0], 'abrir a primeira página de produto')
  passos.push({ passo: 'página lida', resultado: urls[0] })

  const encontrados = produtosDoJsonLd(html)
  // A página traz vários Products (o principal e os relacionados). O que
  // interessa é o de MAIS ofertas: é nele que as variações aparecem, se
  // aparecerem. Mostrar o primeiro trouxe a Organization e não explicou nada.
  const principal = encontrados.slice().sort((a, b) => b.ofertas.length - a.ofertas.length)[0]
  passos.push({
    passo: 'JSON-LD',
    resultado: encontrados.length
      ? `${encontrados.length} blocos Product · o maior tem ${principal.ofertas.length} oferta(s)`
      : 'nenhum bloco Product encontrado',
  })

  const amostra = encontrados.flatMap((p) =>
    (p.ofertas.length ? p.ofertas : [{}]).map((o) => ({
      titulo: `${p.nome} ${o.name ?? ''}`.trim(),
      preco: precoDe(o),
      variante:
        parseVarianteMl(o.name ?? '') ??
        parseVarianteMl(p.nome) ??
        parseVarianteMl(urls[0].replace(/[^0-9a-z]+/gi, ' ')),
    })),
  )
  const comMl = amostra.filter((a) => a.variante !== null).length
  passos.push({
    passo: 'tamanho em ml',
    resultado:
      comMl > 0
        ? `${comMl} de ${amostra.length} com ml reconhecível`
        : 'NENHUM item traz o ml — o tamanho deve ser variação do produto',
  })

  // Quando o ml não está no JSON-LD, ele costuma estar num payload de
  // variantes que o tema publica. Procurar por ele aqui é o que permite
  // escrever a leitura certa em vez de tentar às cegas.
  const pistas = [
    ['LS.product', /LS\.product\s*=\s*(\{[\s\S]{0,4000}?\});/],
    ['window.__st', /window\.__st\s*=\s*(\{[\s\S]{0,2000}?\});/],
    ['variants', /"variants"\s*:\s*(\[[\s\S]{0,3000}?\])/],
    ['data-variants', /data-variants=(?:'|")([\s\S]{0,2000}?)(?:'|")/],
  ] as const
  const achada = pistas.map(([nome, re]) => [nome, html.match(re)?.[1] ?? null] as const)
  const comPayload = achada.filter(([, v]) => v !== null)
  passos.push({
    passo: 'payload de variações',
    resultado: comPayload.length
      ? comPayload.map(([nome]) => nome).join(', ')
      : 'nenhum dos formatos conhecidos encontrado',
  })

  const blocoProduto = [
    ...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi),
  ]
    .map((m) => m[1].trim())
    .find((t) => /"@type"\s*:\s*"?\[?[^,]*Product/.test(t))

  return {
    estrategia,
    passos,
    amostra: amostra.slice(0, 8),
    // Primeiro o payload de variações, se houver: é ele que tem o ml. Sem ele,
    // o bloco Product — nunca a Organization, que não diz nada sobre preço.
    bruto: (comPayload[0]?.[1] ?? blocoProduto ?? html).trim().slice(0, 1800),
  }
}

export interface ResultadoColeta {
  lidos: number
  /** Preços cujo título casou com uma base do catálogo. */
  casados: number
  /** Variantes em ml que o ERP não fraciona (50 ml, kit) — ignoradas. */
  semVariante: number
}

/**
 * Lê uma loja e grava os preços.
 *
 * O casamento com o catálogo acontece aqui, e o que não casa é gravado do
 * mesmo jeito com `base_id` nulo. Descartar o não casado esconderia o tamanho
 * do buraco: a tela precisa poder dizer "212 preços lidos, 47 sem dono" para
 * alguém decidir ensinar os nomes.
 */
export async function coletarConcorrente(concorrenteId: string): Promise<ResultadoColeta> {
  if (!supabaseConfigurado()) {
    throw new Error('O Supabase precisa estar configurado para coletar preços.')
  }
  const sb = supabaseServer()

  const { data: fonte, error: erroFonte } = await sb
    .from('concorrentes')
    .select('id, dominio, coleta')
    .eq('id', concorrenteId)
    .maybeSingle()
  if (erroFonte) throw erroFonte
  if (!fonte) throw new Error(`Concorrente "${concorrenteId}" não existe.`)
  if (fonte.coleta === 'manual') {
    throw new Error('Esta fonte está marcada como leitura manual — lance os preços à mão.')
  }

  const [{ data: bases, error: erroBases }, { data: apelidos, error: erroApelidos }] =
    await Promise.all([
      sb.from('perfumes_base').select('id, nome, marca').eq('ativo', true),
      sb.from('concorrente_apelidos').select('titulo_normalizado, base_id'),
    ])
  if (erroBases) throw erroBases
  if (erroApelidos) throw erroApelidos

  const catalogo = (bases ?? []) as { id: string; nome: string; marca: string }[]
  const ensinados = new Map((apelidos ?? []).map((a) => [a.titulo_normalizado, a.base_id]))

  let observados: PrecoObservado[]
  try {
    observados = await lerLoja(fonte.dominio, fonte.coleta as Estrategia)
  } catch (e) {
    // A falha é gravada na fonte: a tela mostra o motivo em vez de um card
    // parado dizendo que tudo foi lido.
    await sb
      .from('concorrentes')
      .update({
        ultima_leitura: new Date().toISOString(),
        ultimo_status: 'bloqueada',
        ultimo_erro: mensagemDe(e).slice(0, 400),
      })
      .eq('id', concorrenteId)
    throw e
  }

  const comVariante = observados.filter((o) => o.variante !== null)

  // A loja respondeu e nada tinha tamanho: é falha, não silêncio. Sem esta
  // trava a coleta gravava zero linha, marcava "parcial" e não dizia por quê —
  // que foi exatamente o que aconteceu na primeira leitura de verdade.
  if (observados.length > 0 && comVariante.length === 0) {
    const amostra = observados
      .slice(0, 3)
      .map((o) => o.titulo)
      .join(' · ')
    const motivo =
      `li ${observados.length} preços em ${fonte.dominio}, mas nenhum trazia o tamanho em ml ` +
      `(3, 5, 8, 10 ou 15). Nesta loja o ml provavelmente é variação do produto, e o JSON-LD ` +
      `publica só um preço por página. Exemplos do que veio: ${amostra}`
    await sb
      .from('concorrentes')
      .update({
        ultima_leitura: new Date().toISOString(),
        ultimo_status: 'parcial',
        ultimo_erro: motivo.slice(0, 400),
        precos_lidos: 0,
      })
      .eq('id', concorrenteId)
    throw new LeituraBloqueada(motivo)
  }

  let casados = 0

  const linhas = comVariante.map((o) => {
    const chaveEnsinada = normalizarTitulo(o.titulo)
    const baseId = ensinados.get(chaveEnsinada) ?? casarTitulo(o.titulo, catalogo)?.baseId ?? null
    if (baseId) casados++
    return {
      concorrente_id: concorrenteId,
      chave: o.chave,
      base_id: baseId,
      variante: o.variante,
      titulo: o.titulo,
      preco: o.preco,
      url: o.url,
      lido_em: new Date().toISOString(),
    }
  })

  // A releitura substitui a anterior: preço antigo do mesmo item não é
  // histórico útil aqui, é ruído que puxaria o "menor do mercado" para baixo.
  const { error: erroLimpar } = await sb
    .from('concorrente_precos')
    .delete()
    .eq('concorrente_id', concorrenteId)
  if (erroLimpar) throw erroLimpar

  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await sb.from('concorrente_precos').insert(linhas.slice(i, i + 500))
    if (error) throw error
  }

  await sb
    .from('concorrentes')
    .update({
      ultima_leitura: new Date().toISOString(),
      // Parcial quando a loja respondeu mas metade dos títulos não achou dono:
      // dizer "lida" ali daria a entender que a comparação está completa.
      ultimo_status: casados === 0 || casados < linhas.length / 2 ? 'parcial' : 'lida',
      ultimo_erro: null,
      precos_lidos: linhas.length,
    })
    .eq('id', concorrenteId)

  return {
    lidos: linhas.length,
    casados,
    semVariante: observados.length - comVariante.length,
  }
}

/** Mesma normalização que a tabela de apelidos guarda. */
export function normalizarTitulo(titulo: string): string {
  return titulo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
