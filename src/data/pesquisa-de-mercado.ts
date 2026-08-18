import 'server-only'

import {
  CONCORRENTES,
  extrairCartoes,
  filtrarERanquear,
  primeiraPalavra,
  urlDeBusca,
  type CartaoDeProduto,
  type Concorrente,
} from '@/domain'

import { operadorAtual } from './operador'
import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * A pesquisa de mercado que roda no servidor: busca a página de cada
 * concorrente, extrai os cartões e devolve tudo numa passada.
 *
 * As seis lojas são consultadas EM PARALELO com prazo individual — a função
 * da Netlify corta perto de 26 s, e uma loja fora do ar não pode custar a
 * rodada. Loja que falha volta com o erro escrito, nunca em silêncio.
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

export interface ReferenciaFrenesi {
  nome: string
  imagem: string | null
  variante: string
  preco: number
}

export interface PesquisaDeMercado {
  termo: string
  palavra: string
  vitrines: VitrineDaLoja[]
  /** Como a FRENESI está vendendo o mesmo perfume, para a régua ficar na tela. */
  frenesi: ReferenciaFrenesi[]
  executadaEm: string
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

async function vitrineDoConcorrente(c: Concorrente, palavra: string): Promise<VitrineDaLoja> {
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
    let cartoes = filtrarERanquear(extrairCartoes(html, c.dominio), palavra)
    if (!cartoes.length) {
      cartoes = filtrarERanquear(await sugestaoShopify(c, palavra), palavra)
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

/** Como a FRENESI vende o mesmo perfume — a régua do comparativo. */
async function referenciaFrenesi(palavra: string): Promise<ReferenciaFrenesi[]> {
  if (!supabaseConfigurado() || !palavra) return []
  const { data } = await supabaseServer()
    .from('perfumes_base')
    .select('nome, imagem_url, produtos_derivados(variante, preco_praticado)')
    .ilike('nome', `%${palavra}%`)
    .eq('ativo', true)
    .limit(6)

  const linhas = (data ?? []) as unknown as {
    nome: string
    imagem_url: string | null
    produtos_derivados: { variante: string; preco_praticado: number | string | null }[] | null
  }[]

  return linhas.flatMap((p) =>
    (p.produtos_derivados ?? [])
      .filter((d) => Number(d.preco_praticado) > 0)
      .map((d) => ({
        nome: p.nome,
        imagem: p.imagem_url,
        variante: d.variante,
        preco: Number(d.preco_praticado),
      })),
  )
}

export async function pesquisarMercado(termo: string): Promise<PesquisaDeMercado> {
  const palavra = primeiraPalavra(termo)
  if (!palavra) throw new Error('Diga o nome do perfume a pesquisar.')

  const [vitrines, frenesi] = await Promise.all([
    Promise.all(CONCORRENTES.map((c) => vitrineDoConcorrente(c, palavra))),
    referenciaFrenesi(palavra),
  ])

  const pesquisa: PesquisaDeMercado = {
    termo: termo.trim(),
    palavra,
    vitrines,
    frenesi,
    executadaEm: new Date().toISOString(),
  }

  // O histórico não pode derrubar a pesquisa: quem pediu quer os preços.
  try {
    if (supabaseConfigurado()) {
      await supabaseServer()
        .from('pesquisas_de_mercado')
        .insert({
          termo: pesquisa.termo,
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
    }
  } catch (e) {
    console.error('[pesquisa-de-mercado] histórico não gravado:', e)
  }

  return pesquisa
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
