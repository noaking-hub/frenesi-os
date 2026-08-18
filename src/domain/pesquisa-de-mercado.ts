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
export function extrairCartoes(htmlCru: string, dominio: string): CartaoDeProduto[] {
  const html = htmlCru
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')

  const itens: CartaoDeProduto[] = []

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

    const img = contexto.match(/<img\b[^>]*src=['"]([^'"]+)['"][^>]*>/i)
    itens.push({ titulo, url, preco, imagem: img ? absoluta(img[1], dominio) : null })
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

  // Dedup por URL: o mesmo produto aparece na âncora da imagem e na do título.
  const vistos = new Set<string>()
  const unicos: CartaoDeProduto[] = []
  for (const it of itens) {
    if (vistos.has(it.url)) continue
    vistos.add(it.url)
    unicos.push(it)
  }
  return unicos.slice(0, 80)
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
 * Filtra pelo termo e ordena por relevância.
 *
 * O score é o do price-lab: a palavra no título vale mais que na URL, decant
 * e volumes pequenos ganham reforço (é o mercado da FRENESI), e preços fora
 * da realidade — abaixo de R$ 10 ou acima de R$ 1.500 — perdem pontos por
 * cheirarem a placeholder ou kit. Empate resolve pelo preço, do menor.
 */
export function filtrarERanquear(cartoes: CartaoDeProduto[], palavra: string): CartaoDeProduto[] {
  const w = semAcento(palavra)
  if (!w) return []

  const score = (c: CartaoDeProduto): number => {
    const t = semAcento(c.titulo)
    let s = 0
    if (t.includes(w)) s += 10
    if (/\bdecant\b/.test(t)) s += 4
    if (/\b5 ?ml\b/.test(t)) s += 3
    if (/\b(10|15) ?ml\b/.test(t)) s += 1
    if (/\bedp\b|eau de parfum/.test(t)) s += 1
    if (semAcento(c.url).includes(w)) s += 2
    if (c.preco !== null) {
      if (c.preco < 10) s -= 3
      if (c.preco > 1500) s -= 3
    }
    return s
  }

  return cartoes
    .filter((c) => !cartaoGenerico(c.titulo))
    .filter((c) => semAcento(c.titulo).includes(w) || semAcento(c.url).includes(w))
    .sort((a, b) => {
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
