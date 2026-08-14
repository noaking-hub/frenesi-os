import 'server-only'

import {
  casarTitulo,
  ehPaginaDeProduto,
  nomeCondiz,
  nomeDaPagina,
  parseVarianteMl,
  precoDe,
  precosDeReferencia,
  produtosDoJsonLd,
  variantesDoHtml,
} from '@/domain'
import type { OfertaLd, VarianteMl } from '@/domain'

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
  if (typeof e === 'string') return e
  // Erro do Supabase não é `Error`: é objeto com message, details, hint e
  // code. Cair no "Erro desconhecido" jogava fora justamente o que explicaria
  // a falha — e sem ele não há como consertar sem adivinhar.
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>
    const partes = [o.message, o.details, o.hint]
      .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    if (partes.length) return `${partes.join(' · ')}${o.code ? ` (${o.code})` : ''}`
    try {
      return JSON.stringify(e).slice(0, 300)
    } catch {
      return 'Erro sem mensagem legível'
    }
  }
  return 'Erro desconhecido'
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
// Teto por vasculhada. Era 400 e ficava AQUÉM do catálogo das lojas — perfume
// que o concorrente vende não aparecia na busca porque a coleta parava antes
// de chegar nele. 900 cobre as quatro lojas de hoje com folga.
const MAX_PRODUTOS_NUVEMSHOP = 900
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
      // 10 s, não 20: a leitura roda em fatias com orçamento de tempo, e o
      // pior caso de UMA página lenta precisa caber na sobra da fatia.
      signal: AbortSignal.timeout(10_000),
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

  const paginas = locs.filter(ehPaginaDeProduto)
  if (paginas.length > 0) return paginas.slice(0, MAX_PRODUTOS_NUVEMSHOP)

  // Era um índice: os produtos estão nos sitemaps filhos.
  const filhos = locs.filter((u) => /\.xml/i.test(u)).slice(0, 12)
  const encontradas: string[] = []
  for (const filho of filhos) {
    if (encontradas.length >= MAX_PRODUTOS_NUVEMSHOP) break
    try {
      const xml = await texto(filho, 'abrir um sitemap do índice')
      encontradas.push(...locsDe(xml).filter(ehPaginaDeProduto))
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

/**
 * Lê um trecho das páginas de produto, de `desde` até o prazo estourar.
 *
 * A loja inteira leva minutos e a Netlify corta a função em ~26 s — foi esse
 * corte que derrubava a tela de Concorrentes no meio da varredura. Quem chama
 * guarda o `proximo` e continua na chamada seguinte, de onde parou.
 */
async function lerPaginasNuvemshop(
  urls: string[],
  desde: number,
  prazoAte: number,
): Promise<{ observados: PrecoObservado[]; proximo: number }> {
  const observados: PrecoObservado[] = []
  let i = desde

  while (i < urls.length && Date.now() < prazoAte) {
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

      const nomePagina = nomeDaPagina(pagina.html)

      // O caminho bom: as variações trazem o ml e o preço de cada tamanho.
      const variacoes = variantesDoHtml(pagina.html)
      if (variacoes.length > 0) {
        // O nome vem do documento, não do primeiro Product da página: entre os
        // blocos JSON-LD estão os relacionados do carrossel.
        const nome = nomePagina ?? produtosDoJsonLd(pagina.html)[0]?.nome
        if (!nome) continue
        for (const v of variacoes) {
          const variante = parseVarianteMl(v.rotulo)
          // Sem ml reconhecível é tamanho que não vendemos (2 ml, 30 ml).
          if (variante === null) continue
          observados.push({
            chave: `${pagina.url}|${v.rotulo}`,
            titulo: `${nome} ${v.rotulo}`.trim(),
            preco: v.preco,
            variante,
            url: pagina.url,
          })
        }
        continue
      }

      for (const p of produtosDoJsonLd(pagina.html)) {
        // Só o Product que fala DESTA página entra: no tema novo da Eau de
        // Leon os Products do JSON-LD são os 8 do carrossel, e gravá-los aqui
        // punha o preço do vizinho com a URL desta página.
        if (nomePagina && !nomeCondiz(p.nome, nomePagina)) continue
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

    i += PARALELAS
  }

  return { observados, proximo: Math.min(i, urls.length) }
}

export type Estrategia = 'shopify' | 'nuvemshop' | 'manual'

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

  // A validação que separa o payload do produto do payload de um widget:
  // sem preço em comum com o JSON-LD do produto principal, o payload é
  // rejeitado — foi um widget assim que gravou 510 preços de outro produto.
  const referencia = precosDeReferencia(html)
  passos.push({
    passo: 'preço de referência (JSON-LD do principal)',
    resultado: referencia.length
      ? referencia
          .slice(0, 6)
          .map((n) => n.toFixed(2))
          .join(' | ')
      : 'nenhum — payloads de variação serão aceitos sem validação',
  })

  // Quando o ml não está no JSON-LD, ele costuma estar num payload de
  // variantes que o tema publica. Procurar por ele aqui é o que permite
  // escrever a leitura certa em vez de tentar às cegas.
  // O que o COLETOR extrairia desta página. Antes o diagnóstico só falava do
  // JSON-LD, que é o caminho reserva — e por isso não mostrava que a leitura
  // das variações estava devolvendo vazio.
  const variacoes = variantesDoHtml(html)
  passos.push({
    passo: 'variações lidas',
    resultado: variacoes.length
      ? `${variacoes.length} · ${variacoes
          .slice(0, 5)
          .map((v) => `${v.rotulo} = ${v.preco}`)
          .join(' | ')}`
      : 'nenhuma aceita — ou a página não publica payload de variações, ou nenhum compartilha preço com a referência acima (widget, não produto)',
  })

  const amostraVariacoes = variacoes
    .map((v) => ({
      titulo: `${nomeDaPagina(html) ?? ''} ${v.rotulo}`.trim(),
      preco: v.preco,
      variante: parseVarianteMl(v.rotulo),
    }))
    .slice(0, 8)

  // Quantas VEZES cada formato aparece, não só se aparece. Uma página com
  // três `data-variants` — template vazio, card do carrossel e o produto —
  // se lida só na primeira volta vazia, e "existe" não contava essa história.
  const pistas = [
    ['data-variants', /data-variants=(["'])([\s\S]*?)\1/gi, 2],
    ['LS.product', /LS\.product\s*=\s*(\{[\s\S]{0,4000}?\});/gi, 1],
    ['window.__st', /window\.__st\s*=\s*(\{[\s\S]{0,2000}?\});/gi, 1],
  ] as const
  const achada = pistas.map(([nome, re, grupo]) => {
    const todos = [...html.matchAll(re)].map((m) => m[grupo] ?? '')
    const maior = todos.reduce((a, t) => Math.max(a, t.trim().length), 0)
    return { nome, vezes: todos.length, maior }
  })
  const comPayload = achada.filter((a) => a.vezes > 0)
  passos.push({
    passo: 'payload de variações',
    resultado: comPayload.length
      ? comPayload.map((a) => `${a.nome} ×${a.vezes} (maior: ${a.maior} chars)`).join(', ')
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
    // A amostra mostra o caminho que o coletor usaria: variações primeiro.
    amostra: amostraVariacoes.length ? amostraVariacoes : amostra.slice(0, 8),
    // Primeiro o payload de variações, se houver: é ele que tem o ml. Sem ele,
    // o bloco Product — nunca a Organization, que não diz nada sobre preço.
    // O maior payload é o do produto principal: é ele que explica a leitura.
    bruto: (
      [...html.matchAll(/data-variants=(["'])([\s\S]*?)\1/gi)]
        .map((m) => m[2])
        .sort((a, b) => b.length - a.length)[0] ??
      blocoProduto ??
      html
    )
      .trim()
      .slice(0, 1800),
  }
}

export interface ResultadoColeta {
  lidos: number
  /** Preços cujo título casou com uma base do catálogo. */
  casados: number
  /** Passada fechada? Falso = ainda há páginas — chame de novo para avançar. */
  concluido: boolean
  /** Páginas que ainda faltam ler nesta passada. */
  restantes: number
  /** Total de páginas da passada — é o que deixa a tela mostrar progresso. */
  total: number
}

/**
 * Uma passada abandonada (deploy no meio, loja que saiu do ar) não pode
 * prender o cursor para sempre: mais velha que isto, recomeça do zero.
 */
const PASSADA_VALIDA_MS = 6 * 3_600_000

interface LinhaPreco {
  concorrente_id: string
  chave: string
  base_id: string | null
  casado_por: 'apelido' | 'titulo' | null
  variante: VarianteMl
  titulo: string
  preco: number
  url: string | null
  lido_em: string
}

type ObservadoComMl = PrecoObservado & { variante: VarianteMl }

/**
 * A falha é gravada na fonte: a tela mostra o motivo em vez de um card parado
 * dizendo que tudo foi lido. O cursor zera junto — a próxima vasculhada
 * recomeça a passada em vez de retomar uma leitura doente.
 */
async function gravarBloqueio(
  sb: ReturnType<typeof supabaseServer>,
  concorrenteId: string,
  e: unknown,
) {
  await sb
    .from('concorrentes')
    .update({
      ultima_leitura: new Date().toISOString(),
      ultimo_status: 'bloqueada',
      ultimo_erro: mensagemDe(e).slice(0, 400),
      coleta_indice: null,
      coleta_iniciada_em: null,
      coleta_observados: 0,
    })
    .eq('id', concorrenteId)
}

/**
 * Lê uma loja e grava os preços — em fatias que cabem no tempo de execução.
 *
 * O casamento com o catálogo acontece aqui, e o que não casa é gravado do
 * mesmo jeito com `base_id` nulo. Descartar o não casado esconderia o tamanho
 * do buraco: a tela precisa poder dizer "212 preços lidos, 47 sem dono" para
 * alguém decidir ensinar os nomes.
 *
 * Com `prazoMs`, a chamada lê o que couber no prazo e devolve
 * `concluido: false` com o quanto falta; o cursor fica na própria fonte e a
 * chamada seguinte continua de onde parou. Os preços valendo só são trocados
 * quando a passada FECHA — uma leitura pela metade nunca vira comparação.
 */
export async function coletarConcorrente(
  concorrenteId: string,
  opcoes?: { prazoMs?: number },
): Promise<ResultadoColeta> {
  if (!supabaseConfigurado()) {
    throw new Error('O Supabase precisa estar configurado para coletar preços.')
  }
  const sb = supabaseServer()

  const { data: fonte, error: erroFonte } = await sb
    .from('concorrentes')
    .select('id, dominio, coleta, coleta_indice, coleta_iniciada_em, coleta_observados')
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

  const paraLinha = (o: ObservadoComMl): LinhaPreco => {
    const ensinado = ensinados.get(normalizarTitulo(o.titulo)) ?? null
    const baseId = ensinado ?? casarTitulo(o.titulo, catalogo)?.baseId ?? null
    return {
      concorrente_id: concorrenteId,
      chave: o.chave,
      base_id: baseId,
      // A confiança do vínculo viaja com o preço: apelido é gente que
      // ensinou; título é palpite de máquina. A tela mostra a diferença.
      casado_por: baseId === null ? null : ensinado !== null ? 'apelido' : 'titulo',
      variante: o.variante,
      titulo: o.titulo,
      preco: o.preco,
      url: o.url,
      lido_em: new Date().toISOString(),
    }
  }

  // A trava do "nada tinha tamanho": a loja respondeu e nenhum preço trazia o
  // ml — é falha, não silêncio. Sem ela a coleta gravava zero linha, marcava
  // "parcial" e não dizia por quê.
  const motivoSemMl = (quantos: number, amostra: string) =>
    `li ${quantos} preços em ${fonte.dominio}, mas nenhum trazia o tamanho em ml ` +
    `(3, 5, 8, 10 ou 15). Nesta loja o ml provavelmente é variação do produto, e o JSON-LD ` +
    `publica só um preço por página.${amostra ? ` Exemplos do que veio: ${amostra}` : ''}`

  if (fonte.coleta === 'shopify') {
    // Shopify entrega o catálogo em até dez requisições: cabe numa chamada só,
    // sem cursor — o fatiamento existe para a leitura página a página.
    let observados: PrecoObservado[]
    try {
      observados = await lerLojaShopify(fonte.dominio)
    } catch (e) {
      await gravarBloqueio(sb, concorrenteId, e)
      throw e
    }

    const comVariante = observados.filter((o): o is ObservadoComMl => o.variante !== null)
    if (observados.length > 0 && comVariante.length === 0) {
      const motivo = motivoSemMl(
        observados.length,
        observados.slice(0, 3).map((o) => o.titulo).join(' · '),
      )
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

    const r = await concluirPassada(sb, concorrenteId, comVariante.map(paraLinha))
    return { ...r, concluido: true, restantes: 0, total: observados.length }
  }

  // ── Nuvemshop: a loja não cabe numa execução — a passada avança em fatias.
  const prazoAte = Date.now() + (opcoes?.prazoMs ?? 20 * 60_000)

  const passadaViva =
    fonte.coleta_indice !== null &&
    fonte.coleta_iniciada_em !== null &&
    Date.now() - new Date(fonte.coleta_iniciada_em as string).getTime() < PASSADA_VALIDA_MS
  const indice = passadaViva ? (fonte.coleta_indice as number) : 0
  let observadosNaPassada = passadaViva ? ((fonte.coleta_observados as number) ?? 0) : 0
  const iniciadaEm = passadaViva ? (fonte.coleta_iniciada_em as string) : new Date().toISOString()

  if (!passadaViva) {
    // Restos de uma passada abandonada não podem contaminar a nova.
    const { error } = await sb
      .from('concorrente_precos_coleta')
      .delete()
      .eq('concorrente_id', concorrenteId)
    if (error) throw error
  }

  // O sitemap é relido a cada fatia (uma ou duas requisições): guardar
  // centenas de URLs no banco custaria mais que reler, e a ordem dele é
  // estável no intervalo entre fatias.
  let urls: string[]
  try {
    urls = await urlsDeProduto(fonte.dominio)
  } catch (e) {
    await gravarBloqueio(sb, concorrenteId, e)
    throw e
  }

  const { observados, proximo } = await lerPaginasNuvemshop(urls, indice, prazoAte)
  observadosNaPassada += observados.length

  // Dedup por chave DENTRO da fatia: o upsert recusa a mesma chave duas vezes
  // no mesmo lote. Entre fatias, o conflito resolve no banco pela chave.
  const daFatia = new Map<string, LinhaPreco>()
  for (const o of observados) {
    if (o.variante === null) continue
    const l = paraLinha(o as ObservadoComMl)
    const atual = daFatia.get(l.chave)
    if (!atual || l.preco < atual.preco) daFatia.set(l.chave, l)
  }
  const linhasDaFatia = [...daFatia.values()]
  for (let i = 0; i < linhasDaFatia.length; i += 500) {
    const { error } = await sb
      .from('concorrente_precos_coleta')
      .upsert(linhasDaFatia.slice(i, i + 500), { onConflict: 'concorrente_id,chave' })
    if (error) throw error
  }

  if (proximo < urls.length) {
    // Fatia do meio: só o cursor anda. `ultima_leitura` e o status ficam da
    // última passada completa — a tela não troca dado bom por metade.
    const { error } = await sb
      .from('concorrentes')
      .update({
        coleta_indice: proximo,
        coleta_iniciada_em: iniciadaEm,
        coleta_observados: observadosNaPassada,
      })
      .eq('id', concorrenteId)
    if (error) throw error
    return {
      lidos: linhasDaFatia.length,
      casados: linhasDaFatia.filter((l) => l.base_id !== null).length,
      concluido: false,
      restantes: urls.length - proximo,
      total: urls.length,
    }
  }

  // Passada completa: o acumulado das fatias substitui os preços valendo.
  const { data: acumulado, error: erroAcumulado } = await sb
    .from('concorrente_precos_coleta')
    .select('chave, base_id, casado_por, variante, titulo, preco, url')
    .eq('concorrente_id', concorrenteId)
  if (erroAcumulado) throw erroAcumulado

  const todas: LinhaPreco[] = (acumulado ?? []).map((a) => ({
    concorrente_id: concorrenteId,
    chave: a.chave as string,
    base_id: (a.base_id as string | null) ?? null,
    casado_por: (a.casado_por as 'apelido' | 'titulo' | null) ?? null,
    variante: a.variante as VarianteMl,
    titulo: a.titulo as string,
    preco: Number(a.preco),
    url: (a.url as string | null) ?? null,
    lido_em: new Date().toISOString(),
  }))

  if (todas.length === 0) {
    const motivo =
      observadosNaPassada > 0
        ? motivoSemMl(
            observadosNaPassada,
            observados.slice(0, 3).map((o) => o.titulo).join(' · '),
          )
        : `${fonte.dominio} abriu, mas nenhuma página trouxe preço em JSON-LD. Rode o ` +
          'diagnóstico: ele mostra o que veio, e dá para ajustar a leitura sem adivinhar.'
    await sb
      .from('concorrentes')
      .update({
        ultima_leitura: new Date().toISOString(),
        ultimo_status: observadosNaPassada > 0 ? 'parcial' : 'bloqueada',
        ultimo_erro: motivo.slice(0, 400),
        precos_lidos: 0,
        coleta_indice: null,
        coleta_iniciada_em: null,
        coleta_observados: 0,
      })
      .eq('id', concorrenteId)
    throw new LeituraBloqueada(motivo)
  }

  const r = await concluirPassada(sb, concorrenteId, todas)

  const { error: erroLimparColeta } = await sb
    .from('concorrente_precos_coleta')
    .delete()
    .eq('concorrente_id', concorrenteId)
  if (erroLimparColeta) throw erroLimparColeta
  const { error: erroCursor } = await sb
    .from('concorrentes')
    .update({ coleta_indice: null, coleta_iniciada_em: null, coleta_observados: 0 })
    .eq('id', concorrenteId)
  if (erroCursor) throw erroCursor

  return { ...r, concluido: true, restantes: 0, total: urls.length }
}

/**
 * Fecha a passada: dedup, registro do que mudou e substituição dos preços
 * valendo — tudo de uma vez, nunca no meio de uma leitura.
 */
async function concluirPassada(
  sb: ReturnType<typeof supabaseServer>,
  concorrenteId: string,
  linhas: LinhaPreco[],
): Promise<{ lidos: number; casados: number }> {
  // Uma loja vende UM preço por perfume e tamanho. Ler três é sinal de que o
  // mesmo produto apareceu em URLs diferentes — e três linhas contraditórias
  // fariam a tela exibir dezenove "concorrentes" onde há um. Vale o menor:
  // é o que o cliente pagaria naquela loja.
  const porProduto = new Map<string, LinhaPreco>()
  for (const l of linhas) {
    const chave = `${l.base_id ?? l.titulo}|${l.variante}`
    const atual = porProduto.get(chave)
    if (!atual || l.preco < atual.preco) porProduto.set(chave, l)
  }

  // Segunda passada pela CHAVE, que é a chave primária da tabela. A primeira
  // agrupa por produto e não garante unicidade dela: duas entradas da mesma
  // página com o mesmo rótulo geram a mesma chave, e o insert inteiro morria
  // com violação de chave duplicada — a loja aparecia com "Erro desconhecido"
  // e nenhum preço.
  const porChave = new Map<string, LinhaPreco>()
  for (const l of porProduto.values()) {
    const atual = porChave.get(l.chave)
    if (!atual || l.preco < atual.preco) porChave.set(l.chave, l)
  }
  const unicas = [...porChave.values()]
  const casados = unicas.filter((l) => l.base_id !== null).length

  // Antes de substituir, o DIFF vira registro: subiu, baixou, entrou, saiu.
  // Sem ele, a mudança de preço do concorrente evaporava a cada releitura —
  // e é exatamente ela que a tela de mercado precisa alertar.
  const { data: anteriores } = await sb
    .from('concorrente_precos')
    .select('chave, titulo, base_id, variante, preco')
    .eq('concorrente_id', concorrenteId)
  const antes = new Map(
    ((anteriores ?? []) as { chave: string; titulo: string; base_id: string | null; variante: number; preco: number | string }[]).map(
      (a) => [a.chave, a],
    ),
  )
  if (antes.size > 0) {
    const mudancas: {
      concorrente_id: string
      titulo: string
      base_id: string | null
      variante: number | null
      tipo: 'subiu' | 'baixou' | 'entrou' | 'saiu'
      preco_de: number | null
      preco_para: number | null
    }[] = []
    const novasChaves = new Set(unicas.map((l) => l.chave))
    for (const l of unicas) {
      const a = antes.get(l.chave)
      if (!a) {
        mudancas.push({ concorrente_id: concorrenteId, titulo: l.titulo, base_id: l.base_id, variante: l.variante, tipo: 'entrou', preco_de: null, preco_para: l.preco })
      } else if (Math.round(Number(a.preco) * 100) !== Math.round(l.preco * 100)) {
        mudancas.push({ concorrente_id: concorrenteId, titulo: l.titulo, base_id: l.base_id, variante: l.variante, tipo: l.preco > Number(a.preco) ? 'subiu' : 'baixou', preco_de: Number(a.preco), preco_para: l.preco })
      }
    }
    for (const [chave, a] of antes) {
      if (!novasChaves.has(chave)) {
        mudancas.push({ concorrente_id: concorrenteId, titulo: a.titulo, base_id: a.base_id, variante: a.variante ?? null, tipo: 'saiu', preco_de: Number(a.preco), preco_para: null })
      }
    }
    for (let i = 0; i < mudancas.length; i += 500) {
      const { error } = await sb.from('concorrente_mudancas').insert(mudancas.slice(i, i + 500))
      if (error) throw error
    }
  }

  // A releitura substitui a anterior: preço antigo do mesmo item não é
  // histórico útil aqui, é ruído que puxaria o "menor do mercado" para baixo.
  const { error: erroLimpar } = await sb
    .from('concorrente_precos')
    .delete()
    .eq('concorrente_id', concorrenteId)
  if (erroLimpar) throw erroLimpar

  for (let i = 0; i < unicas.length; i += 500) {
    const { error } = await sb.from('concorrente_precos').insert(unicas.slice(i, i + 500))
    if (error) throw error
  }

  await sb
    .from('concorrentes')
    .update({
      ultima_leitura: new Date().toISOString(),
      // Parcial quando a loja respondeu mas metade dos títulos não achou dono:
      // dizer "lida" ali daria a entender que a comparação está completa.
      ultimo_status: casados === 0 || casados < unicas.length / 2 ? 'parcial' : 'lida',
      ultimo_erro: null,
      precos_lidos: unicas.length,
    })
    .eq('id', concorrenteId)

  return { lidos: unicas.length, casados }
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
