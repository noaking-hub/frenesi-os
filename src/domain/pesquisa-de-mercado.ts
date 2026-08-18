/**
 * Pesquisa de mercado — o preço dos decants nos sites dos concorrentes.
 *
 * Portado do projeto `frenesi-price-lab`, que o dono validou em produção. A
 * mecânica é a mesma: busca-se pela PRIMEIRA palavra do nome do perfume na
 * página de busca de cada loja, e desta página extraem-se os cartões de
 * produto (título, preço, imagem, link). A primeira palavra é deliberada —
 * "Invictus" captura todas as variações de volume e edição, enquanto o nome
 * completo perderia metade delas.
 *
 * Este arquivo é puro: recebe HTML e devolve estrutura. Quem busca na rede é
 * a camada de dados.
 */

export interface Concorrente {
  chave: string
  nome: string
  dominio: string
}

/**
 * As lojas pesquisadas. As cinco primeiras vieram do price-lab validado;
 * a Eau de Léon entrou na integração ao ERP, a pedido do dono.
 */
export const CONCORRENTES: Concorrente[] = [
  { chave: 'tabs', nome: 'Tabs Perfumes', dominio: 'https://tabsperfumes.com.br' },
  { chave: 'tathi', nome: 'Tathi Importados', dominio: 'https://tathiimportados.com' },
  { chave: 'gabi', nome: 'Gabi Perfumes', dominio: 'https://gabiperfumes.com.br' },
  { chave: 'casa', nome: 'Casa dos Perfumes Importados', dominio: 'https://casadosperfumesimportados.com.br' },
  { chave: 'gregs', nome: 'The Gregs Exclusive', dominio: 'https://thegregsexclusive.com' },
  { chave: 'eaudeleon', nome: 'Eau de Léon', dominio: 'https://eaudeleon.com.br' },
]

export interface CartaoDeProduto {
  titulo: string
  url: string
  preco: number | null
  imagem: string | null
}

export const primeiraPalavra = (nome: string): string =>
  (nome || '').trim().split(/\s+/)[0] || ''

const semAcento = (s: string): string =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/** A página de busca da loja — o padrão serve às seis (Nuvemshop e Shopify). */
export function urlDeBusca(c: Concorrente, termo: string): string {
  return `${c.dominio}/search?q=${encodeURIComponent(termo)}`
}

/** "R$ 1.234,56" → 1234.56. Devolve null quando não há preço legível. */
export function precoDoTexto(texto: string): number | null {
  const m = texto.match(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/)
  if (!m) return null
  const n = Number.parseFloat(m[1].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// Tolera tags entre o "R$" e o número: The Gregs escreve "R$</span><span>199,90".
const RE_PRECO_TOLERANTE = /R\$(?:\s|<[^>]{0,120}>){0,6}(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/gi
const RE_PARCELA = /(\d+\s*x\s*(?:de\s*)?R?\$?|x\s*de|sem\s+juros|parcela|vezes)/i
const RE_PRECO_ANTIGO = /line-through|old[-_]?price|compare[-_]?at|preco[-_]?antigo|precoDe\b/i

/**
 * O preço de verdade de um trecho de card.
 *
 * Junta todos os candidatos e pesa cada um pelo entorno: perto de "10x de"
 * ou "sem juros" é PARCELA (a Eau de Léon exibia R$ 27,30 de um perfume de
 * R$ 273); perto de "line-through"/"compare-at" é o preço riscado da
 * promoção. Vence o maior valor ponderado — a regra do price-lab, com os
 * pesos que faltavam.
 */
function melhorPreco(trecho: string): number | null {
  const candidatos: { valor: number; peso: number }[] = []
  RE_PRECO_TOLERANTE.lastIndex = 0
  let p: RegExpExecArray | null
  while ((p = RE_PRECO_TOLERANTE.exec(trecho)) !== null) {
    const valor = precoDoTexto(p[1])
    if (valor === null) continue
    const arredores = trecho.slice(
      Math.max(0, p.index - 70),
      Math.min(trecho.length, p.index + p[0].length + 70),
    )
    const peso = RE_PARCELA.test(arredores) ? 0.4 : RE_PRECO_ANTIGO.test(arredores) ? 0.6 : 1
    candidatos.push({ valor, peso })
  }
  if (!candidatos.length) {
    // Último recurso: número brasileiro colado numa tag — "34,90</span>".
    const solto = trecho.match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?=\s*<)/)
    return solto ? precoDoTexto(solto[1]) : null
  }
  candidatos.sort((a, b) => b.valor * b.peso - a.valor * a.peso)
  return candidatos[0].valor
}

// O preço atual que a Nuvemshop grava no atributo, em CENTAVOS:
// data-product-price="8190" é R$ 81,90. O span riscado do "de/por" não tem o
// atributo, então ler daqui já ignora a promoção sem pesar nada.
const RE_PRECO_ATRIBUTO = /data-product-price=["'](\d+)["']/i

/**
 * Preços publicados nas "ilhas de dados" dos scripts — o JSON `googleItems`
 * que a Nuvemshop injeta para o Analytics. Na Gabi Perfumes os spans de preço
 * vêm VAZIOS do servidor (é o JavaScript da loja que os preenche), e este
 * JSON é o único lugar da página onde o valor existe. Precisa rodar no HTML
 * CRU: a limpeza de `<script>` da extração apagaria a única fonte.
 */
export function precosDeIlhasDeDados(htmlCru: string): {
  porProduto: Map<string, number>
  porNome: { nome: string; preco: number }[]
} {
  const porProduto = new Map<string, number>()
  const porNome: { nome: string; preco: number }[] = []
  const ilhas = /googleItems\s*=\s*(\[[\s\S]{0,40000}?\])\s*;/g
  let m: RegExpExecArray | null
  while ((m = ilhas.exec(htmlCru)) !== null) {
    let itens: unknown
    try {
      itens = JSON.parse(m[1])
    } catch {
      continue
    }
    if (!Array.isArray(itens)) continue
    for (const item of itens as { info?: { price?: unknown; item_name?: unknown }; source?: { product_id?: unknown } }[]) {
      const preco = Number(item?.info?.price)
      if (!Number.isFinite(preco) || preco <= 0) continue
      const id = item?.source?.product_id ? String(item.source.product_id) : ''
      const nome = typeof item?.info?.item_name === 'string' ? item.info.item_name : ''
      if (id) {
        const atual = porProduto.get(id)
        // Entre variantes do mesmo produto, vale a mais barata — é o "a
        // partir de" que a vitrine da loja também mostra.
        if (atual === undefined || preco < atual) porProduto.set(id, preco)
      }
      if (nome) porNome.push({ nome, preco })
    }
  }
  return { porProduto, porNome }
}

/**
 * O preço de um card, na ordem do mais confiável: o atributo em centavos da
 * Nuvemshop, o JSON de Analytics casado pelo id do produto que aparece no
 * próprio card (data-product / add_to_cart / stock-product), e só então a
 * leitura ponderada do texto — que continua sendo o caminho das lojas que
 * escrevem "R$ 34,90" direto no HTML.
 */
function precoDoCard(
  cardInteiro: string,
  vizinhanca: string,
  porProduto: Map<string, number>,
): number | null {
  const attr = cardInteiro.match(RE_PRECO_ATRIBUTO)
  if (attr) {
    const centavos = Number.parseInt(attr[1], 10)
    if (Number.isFinite(centavos) && centavos > 0) return centavos / 100
  }
  const id =
    cardInteiro.match(/data-product=["'](\d+)["']/i) ??
    cardInteiro.match(/name=["']add_to_cart["'][^>]*value=["'](\d+)["']/i) ??
    cardInteiro.match(/stock-product-(\d+)/i)
  if (id) {
    const preco = porProduto.get(id[1])
    if (preco !== undefined) return preco
  }
  return melhorPreco(vizinhanca)
}

function absoluta(href: string | null, dominio: string): string | null {
  if (!href) return null
  if (/^https?:\/\//i.test(href)) return href
  if (href.startsWith('//')) return `https:${href}`
  return dominio.replace(/\/+$/, '') + (href.startsWith('/') ? href : `/${href}`)
}

const semTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Extrai os cartões de produto do HTML de uma página de busca.
 *
 * A cadeia é a do price-lab, na ordem em que ela acertava: âncoras de
 * produto (`/products/` e `/produtos/`, que cobrem Nuvemshop, Shopify e os
 * temas em português), e — quando nada bate — blocos de card genéricos. O
 * preço prefere o valor cheio ao da parcela: "3x de R$ 24,90" perto do número
 * derruba a confiança daquele match.
 */
/**
 * A extração da Nuvemshop, fiel ao scan-nuvem do price-lab: o HTML é quebrado
 * pelos cards de produto (âncoras com classe `product`), o título vem do
 * atributo `title` — o texto visível da âncora costuma ser só "ver produto" —
 * e a imagem prefere `srcset`/`data-src`, porque o `src` da Nuvemshop é o
 * placeholder do lazy-load.
 */
function extrairCartoesNuvemshop(
  html: string,
  dominio: string,
  precosPorProduto: Map<string, number>,
): CartaoDeProduto[] {
  const cardRe = /<a([^>]+class=["'][^"']*product[^"']*["'][^>]*)>/gi
  // Todas as aberturas primeiro: o card de um produto termina onde começa o
  // do vizinho — sem o corte, o preço de um vazava para o outro (foi assim
  // que a Gabi mostrou R$ 15,00 num decant que não custa isso).
  const aberturas: { index: number; tag: string; href: string | null }[] = []
  let m: RegExpExecArray | null
  while ((m = cardRe.exec(html)) !== null) {
    const hrefM = m[1].match(/href=["']([^"']+)["']/i)
    aberturas.push({ index: m.index, tag: m[1], href: hrefM ? hrefM[1] : null })
  }

  const itens: CartaoDeProduto[] = []
  for (let i = 0; i < aberturas.length; i++) {
    const { index, tag, href } = aberturas[i]
    // O card acaba na PRÓXIMA âncora de OUTRO produto — a âncora do título do
    // mesmo produto (mesmo href) não encerra nada. O card inteiro da
    // Nuvemshop passa de 14 mil caracteres (srcset gigante + formulário de
    // variantes), e era o corte curto que deixava a The Gregs sem preço: o
    // data-product-price mora no fim do card.
    let fim = Math.min(html.length, index + 30000)
    for (let j = i + 1; j < aberturas.length; j++) {
      if (aberturas[j].href && aberturas[j].href !== href) {
        fim = Math.min(fim, aberturas[j].index)
        break
      }
    }
    const cardInteiro = html.slice(index, fim)
    // Título, imagem e leitura de "R$" no texto continuam olhando só o
    // começo do card: é ali que eles moram, e um trecho longo demais deixaria
    // o preço do banner da loja vazar para dentro do card.
    const chunk = cardInteiro.slice(0, 2600)

    const url = absoluta(href, dominio)
    if (!url) continue
    const caminho = url.split('?')[0].toLowerCase()
    if (!caminho.includes('/products/') && !caminho.includes('/produto')) continue

    const tituloM =
      tag.match(/title=["']([^"']+)["']/i) ||
      chunk.match(/title=["']([^"']+)["']/i) ||
      chunk.match(/<h\d[^>]*class=["'][^"']*product[^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h\d>/i)
    const titulo = semTags(tituloM ? tituloM[1] : '').slice(0, 240)

    itens.push({
      titulo,
      url,
      preco: precoDoCard(cardInteiro, chunk, precosPorProduto),
      imagem: imagemDoTrecho(chunk, dominio),
    })
  }
  return itens
}

/**
 * A melhor imagem que o trecho do card oferece. Cada tema esconde a foto num
 * lugar: `srcset`/`data-srcset` (a maior largura vence), `data-src` do
 * lazy-load, `src` de verdade — placeholder não conta — e, por fim, o
 * `background-image` de quem desenha o card com CSS.
 */
function imagemDoTrecho(trecho: string, dominio: string): string | null {
  const imgTag = trecho.match(/<img[^>]+>/i)
  if (imgTag) {
    const t = imgTag[0]
    const conjunto =
      t.match(/\s(?:data-)?srcset=["']([^"']+)["']/i)
    if (conjunto) {
      const maior = conjunto[1]
        .split(',')
        .map((s) => s.trim().match(/(\S+)\s+(\d+)w/))
        .filter((x): x is RegExpMatchArray => Boolean(x))
        .sort((a, b) => Number(b[2]) - Number(a[2]))[0]
      if (maior) return absoluta(maior[1], dominio)
      // srcset sem descritor de largura: vale a primeira URL.
      const primeira = conjunto[1].split(',')[0]?.trim().split(/\s+/)[0]
      if (primeira) return absoluta(primeira, dominio)
    }
    const dataSrc = t.match(/\sdata-src=["']([^"']+)["']/i)
    if (dataSrc) return absoluta(dataSrc[1], dominio)
    const src = t.match(/\ssrc=["']([^"']+)["']/i)
    if (src && !/data:image|placeholder|blank|1x1|\.svg/i.test(src[1])) {
      return absoluta(src[1], dominio)
    }
  }
  const fundo = trecho.match(/background-image\s*:\s*url\((["']?)([^)"']+)\1\)/i)
  if (fundo) return absoluta(fundo[2], dominio)
  return null
}

export function extrairCartoes(htmlCru: string, dominio: string): CartaoDeProduto[] {
  // ANTES da limpeza: os preços da Gabi só existem dentro de um <script>.
  const ilhas = precosDeIlhasDeDados(htmlCru)

  const html = htmlCru
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    // "R$&nbsp;34,90" é como a Nuvemshop escreve preço — e `\s` não casa com
    // a entidade. Sem esta troca, TODOS os preços da loja viravam null.
    .replace(/&nbsp;| /g, ' ')

  // A passada da Nuvemshop vem PRIMEIRO: o dedup preserva a primeira
  // ocorrência, e é ela que traz o título do atributo e a imagem certa do
  // lazy-load. As âncoras genéricas complementam para Shopify e afins.
  const itens: CartaoDeProduto[] = extrairCartoesNuvemshop(html, dominio, ilhas.porProduto)

  const ancoras = /<a\b[^>]*href=['"]([^'"]*\/(?:products|produtos?)\/[^'"]+)['"][^>]*>([\s\S]{0,1600}?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = ancoras.exec(html)) !== null) {
    const url = absoluta(m[1], dominio)
    if (!url) continue
    const titulo = semTags(m[2]).slice(0, 240)

    // O contexto ao redor da âncora é onde o preço e a imagem moram — o card
    // inteiro raramente cabe dentro do <a>.
    const inicio = Math.max(0, m.index - 1600)
    const fim = Math.min(html.length, m.index + 1800)
    const contexto = html.slice(inicio, fim)

    itens.push({ titulo, url, preco: melhorPreco(contexto), imagem: imagemDoTrecho(contexto, dominio) })
  }

  if (!itens.length) {
    const blocos = /<div[^>]+class=['"][^'"]*(?:product|card|grid__item|product-item)[^'"]*['"][^>]*>([\s\S]{0,1800}?)<\/div>/gi
    let b: RegExpExecArray | null
    while ((b = blocos.exec(html)) !== null) {
      const bloco = b[1]
      const a = bloco.match(/<a\b[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i)
      if (!a) continue
      const url = absoluta(a[1], dominio)
      if (!url) continue
      const titulo = semTags(a[2]).slice(0, 240)
      itens.push({ titulo, url, preco: melhorPreco(bloco), imagem: imagemDoTrecho(bloco, dominio) })
    }
  }

  // Dedup por URL que FUNDE, não descarta: o mesmo produto aparece em várias
  // âncoras — uma com o título, outra com o preço, outra com a imagem. Cada
  // duplicata preenche o que faltava na primeira.
  const porUrl = new Map<string, CartaoDeProduto>()
  for (const it of itens) {
    const visto = porUrl.get(it.url)
    if (!visto) {
      porUrl.set(it.url, { ...it })
      continue
    }
    // O título da primeira passada é o do atributo `title` — autoridade. A
    // duplicata só o preenche quando a primeira veio sem nome.
    if (visto.titulo.trim().length <= 2 && it.titulo.trim().length > 2) visto.titulo = it.titulo
    if (visto.preco === null && it.preco !== null) visto.preco = it.preco
    if (!visto.imagem && it.imagem) visto.imagem = it.imagem
  }

  // Quem ficou sem preço ainda tem uma chance: o nome do card como prefixo do
  // item_name das ilhas de dados ("Vibrato Eau de Parfum – Sospiro (Decant)"
  // casa com "... (Decant) (2 ml)"). Entre as variantes, vale a mais barata.
  for (const cartao of porUrl.values()) {
    if (cartao.preco !== null) continue
    const alvo = semAcento(cartao.titulo)
    if (alvo.length < 5) continue
    let menor: number | null = null
    for (const { nome, preco } of ilhas.porNome) {
      if (!semAcento(nome).startsWith(alvo)) continue
      if (menor === null || preco < menor) menor = preco
    }
    cartao.preco = menor
  }

  return [...porUrl.values()].slice(0, 80)
}

/** Cards genéricos que a busca devolve e que não são produto nenhum. */
function cartaoGenerico(titulo: string): boolean {
  const t = semAcento(titulo)
  if (!t) return true
  return [
    'ver outros', 'ver mais', 'ver todos', 'ver todas', 'mais produtos',
    'categoria', 'colecao', 'collection', 'preview', 'produto indisponivel',
    'sem estoque', 'inicio', 'alterar cep',
  ].some((chave) => t.includes(chave))
}

/**
 * Filtra pelo TERMO INTEIRO e ordena por relevância.
 *
 * A loja é buscada pela primeira palavra — é o que captura as variações —,
 * mas o filtro respeita o que foi digitado: quem escreve "Polo Black" não
 * quer a família Polo inteira. Se existir cartão com TODAS as palavras no
 * título, só eles ficam; sem nenhum, vale o recorte da primeira palavra,
 * como o price-lab fazia. O filtro olha só o TÍTULO (URL trazia âncoras
 * "ver produto" sem nome), e título vazio não vira cartão.
 *
 * O score é o do price-lab: decant e volumes pequenos ganham reforço (é o
 * mercado da FRENESI) e preços fora da realidade perdem pontos. Empate
 * resolve pelo preço, do menor.
 */
export function filtrarERanquear(cartoes: CartaoDeProduto[], termo: string): CartaoDeProduto[] {
  const palavras = semAcento(termo).split(/\s+/).filter(Boolean)
  if (!palavras.length) return []
  const primeira = palavras[0]

  const score = (c: CartaoDeProduto): number => {
    const t = semAcento(c.titulo)
    let s = 0
    if (palavras.every((p) => t.includes(p))) s += 12
    if (t.includes(primeira)) s += 10
    if (/\bdecant\b/.test(t)) s += 4
    if (/\b5 ?ml\b/.test(t)) s += 3
    if (/\b(10|15) ?ml\b/.test(t)) s += 1
    if (/\bedp\b|eau de parfum/.test(t)) s += 1
    if (c.preco !== null) {
      if (c.preco < 10) s -= 3
      if (c.preco > 1500) s -= 3
    }
    return s
  }

  const aproveitaveis = cartoes
    .filter((c) => c.titulo.trim().length > 2)
    .filter((c) => !cartaoGenerico(c.titulo))
    .filter((c) => semAcento(c.titulo).includes(primeira))

  const exatos = aproveitaveis.filter((c) => {
    const t = semAcento(c.titulo)
    return palavras.every((p) => t.includes(p))
  })

  return (exatos.length ? exatos : aproveitaveis).sort((a, b) => {
    const diff = score(b) - score(a)
    if (diff !== 0) return diff
    if (a.preco === null) return 1
    if (b.preco === null) return -1
    return a.preco - b.preco
  })
}

/** O volume que o título anuncia — "Decant 5ml" → 5. */
export function mlDoTitulo(titulo: string): number | null {
  const m = semAcento(titulo).match(/(\d+(?:[.,]\d+)?) ?ml\b/)
  if (!m) return null
  const n = Number.parseFloat(m[1].replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** R$/ml quando o título diz o volume — a régua que compara 3ml com 10ml. */
export function precoPorMl(c: CartaoDeProduto): number | null {
  if (c.preco === null) return null
  const ml = mlDoTitulo(c.titulo)
  if (!ml) return null
  return Math.round((c.preco / ml) * 100) / 100
}
