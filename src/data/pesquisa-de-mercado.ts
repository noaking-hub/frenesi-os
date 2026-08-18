import 'server-only'

import {
  CONCORRENTES,
  extrairCartoes,
  extrairVariacoes,
  extrairVariacoesShopify,
  filtrarERanquear,
  primeiraPalavra,
  urlDeBusca,
  type CartaoDeProduto,
  type Concorrente,
  type VariacaoDeProduto,
} from '@/domain'

import { operadorAtual } from './operador'
import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * A pesquisa de mercado que roda no servidor: busca a página de UM
 * concorrente por chamada, extrai os cartões e devolve.
 *
 * Uma loja por invocação de propósito: a primeira versão consultava as seis
 * numa server action só, e a soma — partida fria, seis buscas, banco —
 * encostava no teto da função da Netlify; quando estourava, o navegador
 * recebia o 502 como página de erro. Fatiado, cada chamada fica folgada, o
 * resultado chega progressivo e loja fora do ar custa só a própria vitrine.
 */

const PRAZO_POR_LOJA_MS = 9_000

export interface VitrineDaLoja {
  chave: string
  nome: string
  dominio: string
  /** O link da busca no site — para abrir a loja com a consulta pronta. */
  busca: string
  cartoes: CartaoDeProduto[]
  erro: string | null
}

async function paginaDeBusca(url: string, referer: string): Promise<string> {
  const controle = new AbortController()
  const corte = setTimeout(() => controle.abort(), PRAZO_POR_LOJA_MS)
  try {
    const r = await fetch(url, {
      signal: controle.signal,
      headers: {
        // O mesmo disfarce do price-lab: sem User-Agent de navegador algumas
        // lojas devolvem a casca vazia de JavaScript.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        Referer: referer,
      },
      cache: 'no-store',
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.text()
  } finally {
    clearTimeout(corte)
  }
}

/**
 * O plano B das lojas Shopify: `search/suggest.json` responde produtos mesmo
 * quando a página de busca é montada por JavaScript e chega vazia ao scraper.
 * Veio do price-lab, onde já salvava exatamente esse caso.
 */
async function sugestaoShopify(c: Concorrente, palavra: string): Promise<CartaoDeProduto[]> {
  const url =
    `${c.dominio}/search/suggest.json?q=${encodeURIComponent(palavra)}` +
    `&resources[type]=product&resources[limit]=24`
  const controle = new AbortController()
  const corte = setTimeout(() => controle.abort(), PRAZO_POR_LOJA_MS)
  try {
    const r = await fetch(url, {
      signal: controle.signal,
      headers: { Accept: 'application/json', Referer: c.dominio },
      cache: 'no-store',
    })
    if (!r.ok) return []
    const j = (await r.json().catch(() => null)) as {
      resources?: { results?: { products?: { title?: string; url?: string; image?: string; price?: string }[] } }
    } | null
    const produtos = j?.resources?.results?.products ?? []
    return produtos
      .filter((p) => p.url)
      .map((p) => ({
        titulo: p.title ?? '(sem título)',
        url: /^https?:/i.test(p.url!) ? p.url! : `${c.dominio}${p.url}`,
        preco: p.price ? Number.parseFloat(String(p.price).replace(',', '.')) || null : null,
        imagem: p.image ? (p.image.startsWith('//') ? `https:${p.image}` : p.image) : null,
      }))
  } catch {
    return []
  } finally {
    clearTimeout(corte)
  }
}

export async function vitrineDoConcorrente(c: Concorrente, termo: string): Promise<VitrineDaLoja> {
  // A LOJA é buscada pela primeira palavra (captura as variações); o FILTRO
  // respeita o termo inteiro — "Polo Black" não é a família Polo completa.
  const palavra = primeiraPalavra(termo)
  const busca = urlDeBusca(c, palavra)
  const base: VitrineDaLoja = {
    chave: c.chave,
    nome: c.nome,
    dominio: c.dominio,
    busca,
    cartoes: [],
    erro: null,
  }
  try {
    const html = await paginaDeBusca(busca, c.dominio)
    let cartoes = filtrarERanquear(extrairCartoes(html, c.dominio), termo)
    if (!cartoes.length) {
      cartoes = filtrarERanquear(await sugestaoShopify(c, palavra), termo)
    }
    return { ...base, cartoes }
  } catch (e) {
    return {
      ...base,
      erro:
        e instanceof Error && e.name === 'AbortError'
          ? 'a loja não respondeu no prazo'
          : e instanceof Error
            ? e.message
            : String(e),
    }
  }
}

/**
 * Grava a pesquisa no histórico — chamada UMA vez por rodada, quando as seis
 * vitrines já responderam. Nunca derruba nada: histórico é memória, não
 * requisito.
 */
export async function registrarPesquisa(
  termo: string,
  palavra: string,
  vitrines: Pick<VitrineDaLoja, 'chave' | 'cartoes' | 'erro'>[],
): Promise<void> {
  try {
    if (!supabaseConfigurado()) return
    await supabaseServer()
      .from('pesquisas_de_mercado')
      .insert({
        termo: termo.trim(),
        palavra,
        resultados: vitrines.map((v) => ({
          chave: v.chave,
          total: v.cartoes.length,
          menor_preco: v.cartoes.reduce<number | null>(
            (min, c) => (c.preco !== null && (min === null || c.preco < min) ? c.preco : min),
            null,
          ),
          erro: v.erro,
        })),
        total: vitrines.reduce((s, v) => s + v.cartoes.length, 0),
        executada_por: await operadorAtual(),
      })
  } catch (e) {
    console.error('[pesquisa-de-mercado] histórico não gravado:', e)
  }
}

export interface PesquisaAnterior {
  id: string
  termo: string
  total: number
  executadaEm: string
}

export async function pesquisasAnteriores(limite = 12): Promise<PesquisaAnterior[]> {
  if (!supabaseConfigurado()) return []
  const { data } = await supabaseServer()
    .from('pesquisas_de_mercado')
    .select('id, termo, total, executada_em')
    .order('executada_em', { ascending: false })
    .limit(limite)
  return ((data ?? []) as { id: string; termo: string; total: number; executada_em: string }[]).map(
    (l) => ({ id: l.id, termo: l.termo, total: l.total, executadaEm: l.executada_em }),
  )
}

export type RespostaVariacoes =
  | { ok: true; variacoes: VariacaoDeProduto[] }
  | { ok: false; erro: string }

/**
 * As variações (tamanho × preço) de um produto no site do concorrente.
 *
 * Só aceita URL das lojas pesquisadas: esta função busca na internet em nome
 * do servidor, e aceitar URL livre seria um proxy aberto com o IP da loja.
 * A fonte é o `LS.variants` da página (Nuvemshop, que é a plataforma das
 * lojas sondadas); loja Shopify cai no `.js` do produto como plano B.
 */
export async function variacoesDoProduto(url: string): Promise<RespostaVariacoes> {
  let alvo: URL
  try {
    alvo = new URL(url)
  } catch {
    return { ok: false, erro: 'Endereço de produto inválido.' }
  }
  const hospedeiro = alvo.hostname.replace(/^www\./, '')
  const daPesquisa = CONCORRENTES.some((c) => {
    const dominio = new URL(c.dominio).hostname.replace(/^www\./, '')
    return hospedeiro === dominio || hospedeiro.endsWith(`.${dominio}`)
  })
  if (!daPesquisa) return { ok: false, erro: 'A URL não pertence a nenhuma loja pesquisada.' }

  try {
    const html = await paginaDeBusca(alvo.toString(), `${alvo.origin}/`)
    const variacoes = extrairVariacoes(html)
    if (variacoes.length) return { ok: true, variacoes }
  } catch {
    /* a página pode ter caído; o plano B ainda vale */
  }

  if (/\/products\//.test(alvo.pathname)) {
    try {
      const corpo = await paginaDeBusca(
        `${alvo.origin}${alvo.pathname.replace(/\/$/, '')}.js`,
        `${alvo.origin}/`,
      )
      const variacoes = extrairVariacoesShopify(corpo)
      if (variacoes.length) return { ok: true, variacoes }
    } catch {
      /* sem .js também; a resposta honesta vem abaixo */
    }
  }

  return { ok: false, erro: 'A loja não expôs as variações desta página — abra o produto no site.' }
}
