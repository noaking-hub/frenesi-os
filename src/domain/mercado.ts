import {
  arredondaPreco,
  calcularPreco,
  margemDe,
  pisoMargem,
} from './precificacao'
import type { ParametrosPrecificacao, PerfumeBase, VarianteMl } from './types'

/**
 * Posicionamento contra concorrentes.
 *
 * A regra que manda: nenhuma recomendação pode furar o piso de margem
 * (margem alvo − 10 pontos). Se acompanhar o menor preço do mercado não cobre
 * o piso, a recomendação é manter o ideal — perder a guerra de preço é melhor
 * que vender no prejuízo.
 */

export type PosicaoMercado = 'acima' | 'na-media' | 'menor-preco'

export type TipoRecomendacao =
  | 'baixar'
  | 'subir'
  | 'manter-ideal'
  | 'saudavel'
  /** Base sem custo por ml: não há margem a calcular, logo não há recomendação. */
  | 'sem-custo'

export interface AnaliseMercado {
  base: PerfumeBase
  variante: VarianteMl
  /** Preços coletados dos concorrentes para este produto e variante. */
  precos: number[]
  menor: number
  nosso: number
  nossaMargem: number
  ideal: number
  posicao: PosicaoMercado
  /** Menor preço − R$ 0,10 arredondado para ,90 — o alvo para virar o menor. */
  alvoCompetitivo: number
  /** O alvo competitivo respeita o piso de margem. */
  podeCompetir: boolean
  /** Vendendo abaixo do preço ideal (margem menor que a alvo). */
  abaixoIdeal: boolean
  /** Cabe subir o preço e continuar o menor do mercado. */
  oportunidade: boolean
  recomendacao: TipoRecomendacao
  precoRecomendado: number
  frase: string
}

export function analisarMercado(
  base: PerfumeBase,
  variante: VarianteMl,
  precos: number[],
  nosso: number,
  p: ParametrosPrecificacao,
): AnaliseMercado {
  const calc = calcularPreco(base.custoPorMl, variante, p)
  const ideal = calc.sugerido
  const menor = Math.min(...precos)
  const maior = Math.max(...precos)

  // Sem custo por ml, `calcularPreco` cobre só taxas e fixos — o "ideal" sai
  // uma fração do preço real e TODA recomendação vira "baixe". Recomendar
  // preço a partir de custo zero é o erro mais caro que esta tela pode
  // cometer, então ela se cala em vez de sugerir.
  if (base.custoPorMl <= 0) {
    return {
      base, variante, precos, menor, nosso,
      nossaMargem: 0,
      ideal: 0,
      posicao: nosso > maior ? 'acima' : nosso < menor ? 'menor-preco' : 'na-media',
      alvoCompetitivo: 0,
      podeCompetir: false,
      abaixoIdeal: false,
      oportunidade: false,
      recomendacao: 'sem-custo',
      precoRecomendado: nosso,
      frase:
        'Sem recomendação: esta base não tem custo por ml cadastrado, e sem custo não há margem a proteger.',
    }
  }

  const posicao: PosicaoMercado =
    nosso > maior ? 'acima' : nosso < menor ? 'menor-preco' : 'na-media'

  // Dez centavos abaixo do menor, terminando em ,90. Se o arredondamento
  // devolver o próprio menor, desce um real para o alvo ficar de fato abaixo.
  let alvoCompetitivo = arredondaPreco(menor - 0.1)
  if (alvoCompetitivo >= menor) alvoCompetitivo = arredondaPreco(menor - 1.0)

  const margem = (preco: number) => margemDe(preco, calc.custoProduto, p)
  const podeCompetir = margem(alvoCompetitivo) >= pisoMargem(p)
  const nossaMargem = margem(nosso)
  const abaixoIdeal = nosso > 0 && nosso < ideal
  const oportunidade = nosso > 0 && nosso < alvoCompetitivo && nossaMargem < p.margemAlvo

  const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',')

  if (!podeCompetir) {
    return {
      base, variante, precos, menor, nosso, nossaMargem, ideal, posicao,
      alvoCompetitivo, podeCompetir, abaixoIdeal, oportunidade,
      recomendacao: 'manter-ideal',
      precoRecomendado: ideal,
      frase: `Manter o preço ideal · acompanhar o menor do mercado não cobre a margem mínima de ${fmt(pisoMargem(p))}%`,
    }
  }

  if (nosso > alvoCompetitivo) {
    return {
      base, variante, precos, menor, nosso, nossaMargem, ideal, posicao,
      alvoCompetitivo, podeCompetir, abaixoIdeal, oportunidade,
      recomendacao: 'baixar',
      precoRecomendado: alvoCompetitivo,
      frase: `Baixar e ${alvoCompetitivo < menor ? 'virar o menor preço' : 'empatar com o menor preço'} mantendo ${fmt(margem(alvoCompetitivo))}% de margem`,
    }
  }

  if (nosso < ideal) {
    return {
      base, variante, precos, menor, nosso, nossaMargem, ideal, posicao,
      alvoCompetitivo, podeCompetir, abaixoIdeal, oportunidade,
      recomendacao: 'subir',
      precoRecomendado: ideal,
      frase: `Subir para o ideal · hoje a margem está em ${fmt(nossaMargem)}%`,
    }
  }

  return {
    base, variante, precos, menor, nosso, nossaMargem, ideal, posicao,
    alvoCompetitivo, podeCompetir, abaixoIdeal, oportunidade,
    recomendacao: 'saudavel',
    precoRecomendado: nosso,
    frase: 'Preço saudável · nada a fazer',
  }
}

export type StatusFonte = 'nunca' | 'lida' | 'parcial' | 'bloqueada' | 'manual'

export interface FonteConcorrente {
  id: string
  nome: string
  dominio: string
  status: StatusFonte
  /**
   * Como o preço entra: `nuvemshop` lê sitemap + JSON-LD da vitrine,
   * `shopify` lê /products.json, `manual` só recebe preço digitado.
   */
  coleta: 'shopify' | 'nuvemshop' | 'manual'
  /** Quando foi a última tentativa. Vazio enquanto não houve nenhuma. */
  quando: string
  /** A mesma leitura, em ISO — decide se a coleta está velha. */
  lidaEm?: string | null
  itensLidos: number
  /** Motivo cru da última falha. É o que evita adivinhar por que não leu. */
  erro: string | null
}

export const ROTULO_FONTE: Record<StatusFonte, string> = {
  nunca: 'Nunca lida',
  lida: 'Lida',
  parcial: 'Parcial',
  bloqueada: 'Bloqueada',
  manual: 'Manual',
}

// ── Kits e combos ──────────────────────────────────────────────────────────

export interface ItemKit {
  /** Null para itens sem base (estojo, refil genérico). */
  baseId: string | null
  label: string
}

export interface Kit {
  id: string
  nome: string
  tag: 'Entrada' | 'Presente' | 'Sazonal' | 'Recompra'
  itens: ItemKit[]
  preco: number
  /** Custo somado dos produtos que compõem o kit, sem os fixos por pedido. */
  custoProdutos: number
  vendas30: number
}

export interface KitAvaliado {
  kit: Kit
  /** Mesma fórmula de margem das variantes — parâmetros iguais para tudo. */
  margem: number
  receita30: number
  /**
   * Derivado do estoque das bases: um kit com QUALQUER base esgotada fica
   * bloqueado. Item sem base (estojo) não bloqueia.
   */
  disponivel: boolean
  basesEsgotadas: string[]
}

export function avaliarKit(
  kit: Kit,
  bases: PerfumeBase[],
  p: ParametrosPrecificacao,
): KitAvaliado {
  const esgotadas = kit.itens
    .filter((i) => i.baseId !== null)
    .map((i) => bases.find((b) => b.id === i.baseId))
    .filter((b): b is PerfumeBase => Boolean(b && b.volumeMl === 0))
    .map((b) => b.nome)

  return {
    kit,
    margem: margemDe(kit.preco, kit.custoProdutos, p),
    receita30: kit.preco * kit.vendas30,
    disponivel: esgotadas.length === 0,
    basesEsgotadas: [...new Set(esgotadas)],
  }
}

export interface ResumoKits {
  ativos: number
  bloqueados: number
  vendas30: number
  receita30: number
  ticketMedio: number
  /** Margem média ponderada pela receita de cada kit. */
  margemMedia: number
}

export function resumirKits(avaliados: KitAvaliado[]): ResumoKits {
  const vendas = avaliados.reduce((a, k) => a + k.kit.vendas30, 0)
  const receita = avaliados.reduce((a, k) => a + k.receita30, 0)
  return {
    ativos: avaliados.length,
    bloqueados: avaliados.filter((k) => !k.disponivel).length,
    vendas30: vendas,
    receita30: receita,
    ticketMedio: vendas ? receita / vendas : 0,
    margemMedia: receita
      ? avaliados.reduce((a, k) => a + k.margem * k.receita30, 0) / receita
      : 0,
  }
}

// ── Casar título de concorrente com o nosso catálogo ───────────────────────

/**
 * Palavras que quase todo decant carrega e que por isso não distinguem nada.
 *
 * A lista é curta de propósito. "Intense", "Elixir", "Masculino", "Parfum" e
 * "Toilette" NÃO entram: neste catálogo elas separam produtos diferentes —
 * Bleu de Chanel Eau de Parfum e Eau de Toilette são duas bases, com preços
 * diferentes. Descartá-las por parecerem genéricas casaria uma com a outra.
 */
const GENERICAS = new Set([
  'decant',
  'decants',
  'fracionado',
  'fracionados',
  'perfume',
  'perfumes',
  'ml',
  'de',
  'da',
  'do',
  'the',
  'e',
  'com',
  'para',
])

/**
 * Concentração escrita por extenso e em sigla são a MESMA coisa.
 *
 * "Eau de Toilette" e "EDT" convivem no mesmo mercado, às vezes na mesma
 * loja. Sem juntar as duas, procurar por extenso não acha quem abreviou — e
 * a concentração é justamente o que separa dois produtos com preços
 * diferentes, então ignorá-la também não serve.
 *
 * A conversão é para a sigla porque ela é curta e inequívoca: "parfum"
 * sozinho aparece em "eau de parfum" e em "extrait de parfum".
 */
export function normalizarConcentracao(texto: string): string {
  return (
    texto
      // A ordem importa: "eau de parfum" antes de qualquer regra com
      // "parfum" solto, senão a primeira come parte da segunda.
      .replace(/\beau\s+de\s+toilette\b/gi, ' edt ')
      .replace(/\beau\s+de\s+parfum\b/gi, ' edp ')
      .replace(/\beau\s+de\s+cologne\b/gi, ' edc ')
      .replace(/\bextrait\s+de\s+parfum\b/gi, ' extrait ')
      .replace(/\beau\s+fraiche\b/gi, ' edf ')
  )
}

/** Como cada concentração pode aparecer escrita numa loja. */
const FORMAS_CONCENTRACAO: Record<string, string[]> = {
  edt: ['edt', 'eau de toilette'],
  edp: ['edp', 'eau de parfum'],
  edc: ['edc', 'eau de cologne'],
  edf: ['edf', 'eau fraiche'],
  extrait: ['extrait'],
}

/**
 * O que procurar no título do concorrente, agrupado.
 *
 * Cada grupo é uma exigência: o título precisa conter ALGUMA das formas do
 * grupo. Só a concentração tem mais de uma forma — o resto é a palavra tal
 * como foi digitada.
 */
export function formasDeBusca(termo: string): string[][] {
  return [...tokensDe(termo)].map((t) => FORMAS_CONCENTRACAO[t] ?? [t])
}

/** Sem acento, sem caixa, sem pontuação — e sem os números de volume. */
export function tokensDe(texto: string): Set<string> {
  return new Set(
    normalizarConcentracao(texto)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // "Man" e "Masculino" s\u00e3o a mesma informa\u00e7\u00e3o em l\u00ednguas diferentes \u2014 o
      // Club de Nuit Intense MAN \u00e9 o nosso "Masculino". "Male" fica de fora:
      // Le Male \u00e9 nome de produto, n\u00e3o p\u00fablico-alvo.
      .replace(/\b(?:man|men|homem|homens)\b/g, ' masculino ')
      .replace(/\b(?:woman|women|mulher|mulheres)\b/g, ' feminino ')
      .replace(/\bunisex\b/g, ' unissex ')
      .replace(/\d+\s*ml\b/g, ' ')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !GENERICAS.has(t) && !/^\d+$/.test(t)),
  )
}

export interface Casamento {
  baseId: string
  /** Mantido por compatibilidade: o casamento estrito é tudo ou nada. */
  score: number
}

/** As concentrações, já normalizadas para a sigla por `tokensDe`. */
const CONCENTRACOES = new Set(Object.keys(FORMAS_CONCENTRACAO))

/** Público-alvo, não produto. `tokensDe` converge man/woman para cá. */
const GENEROS = new Set(['masculino', 'feminino', 'unissex'])

/**
 * Palavras de anúncio que não distinguem produto nenhum.
 *
 * A lista é curta e inequívoca DE PROPÓSITO: "Intense", "Elixir" e "Extreme"
 * jamais entram aqui — são exatamente as palavras que separam um flanker do
 * perfume comum, com preços diferentes.
 */
const RUIDO_DE_ANUNCIO = new Set([
  'tester',
  'original',
  'importado',
  'oficial',
  'lacrado',
  'selado',
  'amostra',
])

/**
 * O título do concorrente fala DESTA base — nos dois sentidos.
 *
 * O casamento antigo media só a ida: quantas palavras nossas o título traz.
 * A volta era de graça, e nela morava o estrago — "Coco Mademoiselle Intense"
 * contém "Coco Mademoiselle" inteiro, então o flanker casava com o comum e o
 * preço de OUTRO perfume entrava na comparação de mercado.
 */
function casaEstrito(
  doTitulo: Set<string>,
  b: { nome: string; marca: string },
): boolean {
  const doNome = tokensDe(b.nome)
  const daMarca = tokensDe(b.marca)
  if (doNome.size === 0) return false

  // 1. Ida: tudo que NOMEIA o produto precisa estar no título — a palavra que
  //    falta é outro produto ("Dior Homme" não é o Dior Homme Intense).
  //    Gênero e concentração ficam fora da exigência: loja raramente escreve
  //    "Masculino", e quem anuncia "Luna Rossa Ocean Le Parfum" não repete o
  //    "Eau de Parfum" do nosso cadastro.
  for (const t of doNome) {
    if (GENEROS.has(t) || CONCENTRACOES.has(t) || RUIDO_DE_ANUNCIO.has(t)) continue
    if (!doTitulo.has(t)) return false
  }

  // 2. O que os dois lados DECLARAM não pode conflitar: EDT não é EDP, e o
  //    Woman não é o Man. Título calado não reprova — a ambiguidade que o
  //    silêncio cria morre na exigência de casamento único, logo abaixo.
  for (const grupo of [CONCENTRACOES, GENEROS]) {
    const daBase = [...doNome].filter((t) => grupo.has(t))
    const declarados = [...doTitulo].filter((t) => grupo.has(t))
    if (daBase.length && declarados.length && !declarados.some((t) => daBase.includes(t))) {
      return false
    }
  }

  // 3. Volta: NADA pode sobrar no título. A sobra é outro produto — Intense,
  //    Elixir, Extreme, L'Eau — nunca enfeite.
  for (const t of doTitulo) {
    if (doNome.has(t) || daMarca.has(t)) continue
    if (GENEROS.has(t) || CONCENTRACOES.has(t) || RUIDO_DE_ANUNCIO.has(t)) continue
    return false
  }
  return true
}

/**
 * Descobre de qual base nossa um título de concorrente fala.
 *
 * Devolve `null` quando não há certeza — e isso é o ponto. Um preço casado com
 * o perfume errado não fica só errado: ele entra na comparação de mercado e
 * empurra o preço de venda de OUTRO produto. Por isso o casamento é estrito
 * nos dois sentidos e precisa ser ÚNICO: título que serve a duas bases (sem
 * concentração, e temos EDP e EDT) vira trabalho manual, não palpite.
 */
export function casarTitulo(
  titulo: string,
  bases: { id: string; nome: string; marca: string }[],
): Casamento | null {
  const doTitulo = tokensDe(titulo)
  if (doTitulo.size === 0) return null

  const casadas = bases.filter((b) => casaEstrito(doTitulo, b))
  return casadas.length === 1 ? { baseId: casadas[0].id, score: 1 } : null
}

// ── Leitura da vitrine do concorrente ──────────────────────────────────────
//
// Tudo aqui é texto entrando e dado saindo: nada abre conexão. Ficam no
// domínio porque é onde o teste alcança — e porque errar a leitura de um
// preço aqui vira recomendação errada de preço de venda lá na frente.

/**
 * Página de UM produto, não a vitrine.
 *
 * `/produtos/` sozinho é a listagem, e ela também aparece no sitemap. Ler a
 * listagem trazia o card de cada produto — nome e "a partir de" — sem o
 * tamanho, porque o ml é variação e só existe na página do produto. Foi assim
 * que 2.639 preços foram lidos e nenhum servia.
 */
export function ehPaginaDeProduto(url: string): boolean {
  const caminho = url.replace(/^https?:\/\/[^/]+/i, '').replace(/[?#].*$/, '')
  const m = caminho.match(/\/produtos?\/([^/]+)/i) ?? caminho.match(/\/products?\/([^/]+)/i)
  if (!m) return false
  const slug = m[1]
  // Paginação da vitrine ("/produtos/page/2") não é produto.
  return slug.length > 1 && !/^(page|pagina)$/i.test(slug) && !/^\d+$/.test(slug)
}


export interface OfertaLd {
  price?: number | string
  priceSpecification?: { price?: number | string }
  /** AggregateOffer: a faixa de preço quando a página resume as variações. */
  lowPrice?: number | string
  highPrice?: number | string
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

export function precoDe(o: OfertaLd): number {
  const bruto = o.price ?? o.priceSpecification?.price ?? o.lowPrice
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

/** `&quot;` e companhia: o payload vem dentro de um atributo HTML. */
function desescapar(texto: string): string {
  return texto
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // Entidade numérica em qualquer base: &#34; e &#x22; são a mesma aspa, e
    // temas diferentes escolhem formas diferentes.
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    // O &amp; sai por último: antes, ele reintroduziria um & que viraria
    // entidade de novo na etapa seguinte.
    .replace(/&amp;/g, '&')
}

/** "34.90", "34,90", "R$ 34,90" e 34.9 chegam ao mesmo número. */
function numeroDe(valor: unknown): number {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0
  if (typeof valor !== 'string') return 0
  const limpo = valor.replace(/[^\d.,]/g, '')
  const n = Number(limpo.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}


/**
 * Nome do produto PRINCIPAL da página.
 *
 * Pegar o primeiro bloco JSON-LD não serve: a página de produto da Nuvemshop
 * traz também os relacionados do carrossel, cada um com o próprio Product. Se
 * o primeiro for um relacionado, o preço da página é gravado com o nome de
 * OUTRO perfume — foi o que fez um decant de 5 ml de Coco Mademoiselle
 * aparecer com dezenove preços entre R$ 39,90 e R$ 229,90.
 *
 * `og:title` é do documento, não de um card dentro dele. É a única fonte da
 * página que não tem como se referir ao vizinho.
 */
export function nomeDaPagina(html: string): string | null {
  const og =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1] ??
    null
  if (og) return desescapar(og).trim() || null

  const titulo = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  if (!titulo) return null
  // Corta só no pipe. Hífen NÃO serve de separador aqui: os títulos desta
  // loja são "(Decant) Armaf - Club de Nuit", e cortar no traço deixaria o
  // produto reduzido à marca.
  return desescapar(titulo).split('|')[0].trim() || null
}

export interface VarianteLida {
  rotulo: string
  preco: number
}

/** Centavos iguais são o mesmo preço, venha ele de string ou número. */
const emCentavos = (n: number) => Math.round(n * 100)

/**
 * Preços que o JSON-LD declara para o produto PRINCIPAL da página.
 *
 * É a referência que separa o payload do produto do payload de um widget.
 * O principal é o Product cujo nome mais se parece com o da página — nunca
 * um relacionado do carrossel, que tem JSON-LD próprio.
 */
export function precosDeReferencia(html: string): number[] {
  const produtos = produtosDoJsonLd(html).filter((p) => p.ofertas.length > 0)
  if (produtos.length === 0) return []

  let principal = produtos[0]
  const nome = nomeDaPagina(html)
  if (produtos.length > 1) {
    if (nome) {
      const alvo = tokensDe(nome)
      let melhorScore = -1
      for (const p of produtos) {
        const meus = tokensDe(p.nome)
        if (meus.size === 0) continue
        let acertos = 0
        for (const t of meus) if (alvo.has(t)) acertos++
        const score = acertos / meus.size
        if (score > melhorScore) {
          melhorScore = score
          principal = p
        }
      }
      // O "mais parecido" precisa CONDIZER com a página. No tema novo da Eau
      // de Leon o produto da página vira WebPage no JSON-LD e os Products são
      // só o carrossel: o menos diferente (um terço das palavras) virava
      // referência, validava o payload do vizinho, e o Erba Pura saiu gravado
      // com os preços do Asad. Referência que não fala da página não serve.
      if (melhorScore < 0.5) return []
    } else {
      principal = produtos.slice().sort((a, b) => b.ofertas.length - a.ofertas.length)[0]
    }
  }

  const precos = new Set<number>()
  for (const o of principal.ofertas) {
    for (const n of [precoDe(o), numeroDe(o.highPrice)]) {
      if (n > 0 && n <= 100_000) precos.add(emCentavos(n))
    }
  }
  return [...precos].map((c) => c / 100)
}

/**
 * Variações do produto, como o tema da Nuvemshop as publica.
 *
 * O ml está aqui e em nenhum outro lugar: o JSON-LD da página traz um preço
 * só, e o título do produto não diz o tamanho. Os nomes de campo variam entre
 * temas, então a leitura tenta os conhecidos em vez de assumir um.
 */
export function variantesDoHtml(html: string): VarianteLida[] {
  // TODAS as ocorrências, não a primeira.
  //
  // A aspa que fecha tem que ser a MESMA que abriu — sem a retrovisão, um
  // atributo delimitado por aspa simples terminava na primeira aspa dupla do
  // JSON e morria no parse. E a página costuma trazer o atributo mais de uma
  // vez: um template vazio, os cards do carrossel, e só então o produto de
  // verdade. Pegar o primeiro devolvia vazio e a loja saía sem preço nenhum.
  const candidatos = [
    ...[...html.matchAll(/data-variants=(["'])([\s\S]*?)\1/gi)].map((m) => m[2]),
    ...[...html.matchAll(/LS\.product\s*=\s*(\{[\s\S]*?\});/gi)].map((m) => m[1]),
  ].filter((t) => t.trim().length > 2)

  const payloads = candidatos.map(lerPayload).filter((p) => p.lidas.length > 0)
  if (payloads.length === 0) return []

  // A âncora mais forte é o ID, quando a página o declara: `LS.product.id`
  // diz de qual produto a página é, e cada variação do payload carrega o
  // `product_id` dono. É determinístico — nenhuma heurística de preço ou de
  // nome desempata melhor que "é o mesmo produto".
  const idPagina = idDoProdutoDaPagina(html)
  if (idPagina !== null) {
    const daPagina = payloads.filter((p) => p.donos.has(idPagina))
    if (daPagina.length > 0) {
      let melhor: VarianteLida[] = []
      for (const p of daPagina) if (p.lidas.length > melhor.length) melhor = p.lidas
      return melhor
    }
    // Todos os payloads declaram dono e nenhum é a página: são os cards do
    // carrossel. Foi assim que o Erba Pura saiu gravado com os preços do
    // Asad — gravar "o maior" aqui seria repetir o estrago.
    if (payloads.every((p) => p.donos.size > 0)) return []
  }

  // O payload precisa FALAR DA PÁGINA para valer. Numa loja, o payload com
  // mais variações era um widget presente em toda página — e 510 preços de
  // outro produto entraram com o nome do produto da página. Quando o JSON-LD
  // declara o preço do produto principal, só aceita payload que compartilhe
  // ao menos um preço com ele; sem interseção nenhuma, melhor devolver vazio
  // e deixar a leitura cair no próprio JSON-LD do que gravar preço alheio.
  const referencia = new Set(precosDeReferencia(html).map(emCentavos))
  const validos = referencia.size
    ? payloads.filter((p) => p.possiveis.some((n) => referencia.has(emCentavos(n))))
    : payloads
  if (referencia.size && validos.length === 0) return []

  // Entre os que falam da página, vale o que rende mais variações.
  let melhor: VarianteLida[] = []
  for (const p of validos) {
    if (p.lidas.length > melhor.length) melhor = p.lidas
  }
  return melhor
}

/**
 * O id que a página declara para o PRÓPRIO produto (`LS.product.id`).
 *
 * É a única identidade que um card de carrossel não tem como usurpar: cada
 * variação de payload diz de qual `product_id` ela é, e ou bate com o da
 * página, ou é vizinho.
 */
export function idDoProdutoDaPagina(html: string): number | null {
  const m = html.match(/LS\.product\s*=\s*\{[\s\S]{0,300}?\bid\s*:\s*(\d+)/i)
  return m ? Number(m[1]) : null
}

interface Payload {
  lidas: VarianteLida[]
  /** Todo número com cara de preço no payload — é contra ele que se valida. */
  possiveis: number[]
  /** `product_id` das variações: de quais produtos este payload fala. */
  donos: Set<number>
}

function lerPayload(bruto: string): Payload {
  const vazio: Payload = { lidas: [], possiveis: [], donos: new Set() }
  let dado: unknown
  try {
    dado = JSON.parse(desescapar(bruto))
  } catch {
    return vazio
  }

  const lista = Array.isArray(dado)
    ? dado
    : ((dado as { variants?: unknown[] }).variants ?? [])
  if (!Array.isArray(lista)) return vazio

  const lidas: VarianteLida[] = []
  const possiveis: number[] = []
  const donos = new Set<number>()
  for (const v of lista as Record<string, unknown>[]) {
    if (!v || typeof v !== 'object') continue

    const dono = Number(v.product_id)
    if (Number.isInteger(dono) && dono > 0) donos.add(dono)

    // Para a validação valem TODOS os campos de preço: o JSON-LD pode
    // publicar o promocional enquanto a leitura usa o cheio, e a diferença
    // não pode reprovar o payload legítimo.
    for (const campo of [v.price, v.promotional_price, v.price_number]) {
      const n = numeroDe(campo)
      if (n > 0 && n <= 100_000) possiveis.push(n)
    }

    // O rótulo pode estar em option0/1/2, em `name`, ou numa lista de valores.
    const partes = [v.option0, v.option1, v.option2, v.name, v.title]
      .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    const valores = Array.isArray(v.values)
      ? (v.values as unknown[]).filter((x): x is string => typeof x === 'string')
      : []
    const rotulo = [...partes, ...valores].join(' ').trim()
    if (!rotulo) continue

    const preco = numeroDe(v.price ?? v.promotional_price ?? v.price_number)
    // Preço absurdo é campo lido errado, não promoção: descartar é mais
    // honesto que publicar um "menor do mercado" de mentira.
    if (preco <= 0 || preco > 100_000) continue

    lidas.push({ rotulo, preco })
  }
  return { lidas, possiveis, donos }
}

/**
 * O nome de um bloco da página condiz com o nome DA página?
 *
 * Menos da metade das palavras em comum é vizinho de carrossel, não o
 * produto — e observação de carrossel grava o preço de OUTRO perfume com a
 * URL desta página.
 */
export function nomeCondiz(candidato: string, daPagina: string): boolean {
  const alvo = tokensDe(daPagina)
  const meus = tokensDe(candidato)
  if (meus.size === 0 || alvo.size === 0) return false
  let acertos = 0
  for (const t of meus) if (alvo.has(t)) acertos++
  return acertos / meus.size >= 0.5
}


// ── Busca por nome de perfume ──────────────────────────────────────────────

/**
 * Perfumes do catálogo que atendem ao que foi digitado.
 *
 * A comparação é por PALAVRAS, não por trecho contíguo. Quem digita "Bleu de
 * Chanel Eau de Parfum" não encontraria "Bleu de Chanel Masculino Eau de
 * Parfum (Decant)" num `includes`: basta uma palavra nossa no meio para o
 * trecho deixar de bater. E é exatamente esse o normal — cada loja escreve o
 * nome do mesmo perfume de um jeito, o que é a razão de este módulo existir.
 *
 * A ordem é por proximidade: entre duas bases que atendem, ganha a que tem
 * menos palavra sobrando. Assim "Eau de Parfum" não devolve o "Eau de
 * Toilette" na frente.
 */
export function buscarNoCatalogo<T extends { nome: string; marca: string }>(
  termo: string,
  bases: T[],
): T[] {
  const alvo = [...tokensDe(termo)]
  if (alvo.length === 0) return []

  return bases
    .map((b) => {
      const meus = tokensDe(`${b.nome} ${b.marca}`)
      const acertos = alvo.filter((t) => meus.has(t)).length
      return { base: b, acertos, sobrando: meus.size - acertos }
    })
    .filter((x) => x.acertos === alvo.length)
    .sort((a, b) => a.sobrando - b.sobrando)
    .map((x) => x.base)
}
