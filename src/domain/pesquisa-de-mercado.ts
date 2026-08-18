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

const RE_PRECO = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/gi
const RE_PARCELA = /(x\s*de|sem\s+juros|parcela|vezes)/i

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
function extrairCartoesNuvemshop(html: string, dominio: string): CartaoDeProduto[] {
  const cardRe = /<a([^>]+class=["'][^"']*product[^"']*["'][^>]*)>/gi
  const itens: CartaoDeProduto[] = []

  let m: RegExpExecArray | null
  while ((m = cardRe.exec(html)) !== null) {
    const tag = m[1]
    // O card inteiro (título visível, preço, imagem) mora logo depois da
    // abertura da âncora; 2.600 caracteres cobrem os temas da plataforma.
    const chunk = html.slice(m.index, m.index + 2600)

    const hrefM = tag.match(/href=["']([^"']+)["']/i)
    const url = absoluta(hrefM ? hrefM[1] : null, dominio)
    if (!url) continue
    const caminho = url.split('?')[0].toLowerCase()
    if (!caminho.includes('/products/') && !caminho.includes('/produto')) continue

    const tituloM =
      tag.match(/title=["']([^"']+)["']/i) ||
      chunk.match(/title=["']([^"']+)["']/i) ||
      chunk.match(/<h\d[^>]*class=["'][^"']*product[^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h\d>/i)
    const titulo = semTags(tituloM ? tituloM[1] : '').slice(0, 240)

    const recorte = chunk.slice(0, 2400)
    const precoM =
      recorte.match(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/i) || recorte.match(/\d+,\d{2}(?=<)/i)
    const preco = precoM ? precoDoTexto(precoM[0]) : null

    itens.push({ titulo, url, preco, imagem: imagemDoTrecho(recorte, dominio) })
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
  const html = htmlCru
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    // "R$&nbsp;34,90" é como a Nuvemshop escreve preço — e `\s` não casa com
    // a entidade. Sem esta troca, TODOS os preços da loja viravam null.
    .replace(/&nbsp;| /g, ' ')

  // A passada da Nuvemshop vem PRIMEIRO: o dedup preserva a primeira
  // ocorrência, e é ela que traz o título do atributo e a imagem certa do
  // lazy-load. As âncoras genéricas complementam para Shopify e afins.
  const itens: CartaoDeProduto[] = extrairCartoesNuvemshop(html, dominio)

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

    const precos: { valor: number; peso: number }[] = []
    let p: RegExpExecArray | null
    RE_PRECO.lastIndex = 0
    while ((p = RE_PRECO.exec(contexto)) !== null) {
      const arredores = contexto.slice(Math.max(0, p.index - 50), Math.min(contexto.length, p.index + 70))
      const valor = precoDoTexto(p[0])
      if (valor === null) continue
      precos.push({ valor, peso: RE_PARCELA.test(arredores) ? 0.4 : 1 })
    }
    precos.sort((a, b) => b.valor * b.peso - a.valor * a.peso)
    const preco = precos.length ? precos[0].valor : null

    itens.push({ titulo, url, preco, imagem: imagemDoTrecho(contexto, dominio) })
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
      const pm = bloco.match(RE_PRECO)
      const preco = pm ? precoDoTexto(pm[pm.length - 1]) : null
      const img = bloco.match(/<img\b[^>]*src=['"]([^'"]+)['"][^>]*>/i)
      itens.push({ titulo, url, preco, imagem: img ? absoluta(img[1], dominio) : null })
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
