'use server'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { VARIANTES, buscarNoCatalogo, formasDeBusca } from '@/domain'
import type { VarianteMl } from '@/domain'

/**
 * Consulta de preço de um perfume, meu contra o dos concorrentes.
 *
 * Quando a busca encontra um perfume do NOSSO catálogo, a comparação usa só
 * os preços CASADOS com ele — pelo casamento estrito ou por nome ensinado.
 * Era por texto ("toda palavra digitada aparece no título"), e texto mistura
 * família: buscar "Coco Mademoiselle" trazia o Intense junto, e o "menor do
 * mercado" saía de OUTRO produto. O que o texto acha e o casamento recusa
 * não some: aparece como "fora da comparação", para conferir e ensinar.
 *
 * Sem perfume nosso na busca, vale o texto puro — quem explora o mercado de
 * algo que não vendemos não tem casamento para usar.
 */

export interface PrecoDeFonte {
  fonte: string
  preco: number
  titulo: string
  url: string | null
}

export interface LinhaComparativo {
  variante: VarianteMl
  /** Nosso preço publicado, quando existe para esta variante. */
  nosso: number | null
  porFonte: Record<string, PrecoDeFonte>
  menor: number | null
  /** Quanto o nosso está acima do menor do mercado, em reais. */
  diferenca: number | null
}

export interface TituloForaDaComparacao {
  titulo: string
  fonte: string
}

export interface ResultadoBusca {
  termo: string
  /** Perfume do nosso catálogo que casou com o termo. */
  nosso: { id: string; nome: string; marca: string } | null
  /** Outros do nosso catálogo que também casam — para trocar sem redigitar. */
  alternativas: { id: string; nome: string; marca: string }[]
  /** Colunas da tabela, na ordem: uma por loja com preço encontrado. */
  fontes: string[]
  linhas: LinhaComparativo[]
  /** Títulos achados no mercado, para conferir se a busca pegou o certo. */
  encontrados: number
  /**
   * O texto achou, o casamento recusou: outro produto da mesma família
   * (Intense, Elixir) ou título ainda sem vínculo. Visível de propósito —
   * esconder faria a comparação parecer completa quando falta loja.
   */
  foraDaComparacao: TituloForaDaComparacao[]
  /** Sem Supabase não há preço guardado — e isso não é "nada encontrado". */
  semBanco: boolean
  /** Quando nada casa com TODAS as palavras: títulos que casam com alguma. */
  parecidos: string[]
}

interface PrecoLido {
  fonte: string
  titulo: string
  preco: number
  variante: VarianteMl
  url: string | null
  baseId: string | null
}

async function buscar(termo: string, baseIdForcado?: string): Promise<ResultadoBusca | null> {
  const limpo = termo.trim()
  if (limpo.length < 3) return null
  if (!supabaseConfigurado()) {
    return {
      termo: limpo,
      nosso: null,
      alternativas: [],
      fontes: [],
      linhas: [],
      encontrados: 0,
      foraDaComparacao: [],
      semBanco: true,
      parecidos: [],
    }
  }

  const sb = supabaseServer()

  // A busca não depende da grafia exata: acento sai dos dois lados e a
  // concentração aceita as duas formas (EDT e Eau de Toilette).
  const grupos = formasDeBusca(limpo).slice(0, 6)

  const [{ data: bases }, { data: precos }] = await Promise.all([
    sb.from('perfumes_base').select('id, nome, marca').eq('ativo', true).limit(500),
    sb
      .from('concorrente_precos')
      .select('titulo, preco, variante, url, base_id, concorrentes(nome)')
      .not('variante', 'is', null)
      .limit(8000),
  ])

  const candidatos = buscarNoCatalogo(limpo, bases ?? [])
  const nosso =
    (baseIdForcado ? (bases ?? []).find((b) => b.id === baseIdForcado) : null) ??
    candidatos[0] ??
    null

  const normaliza = (t: string) =>
    t
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')

  const todos: PrecoLido[] = ((precos ?? []) as unknown as {
    titulo: string
    preco: number | string
    variante: number
    url: string | null
    base_id: string | null
    concorrentes: { nome: string } | null
  }[]).map((p) => ({
    fonte: p.concorrentes?.nome ?? '—',
    titulo: p.titulo,
    preco: Number(p.preco),
    variante: p.variante as VarianteMl,
    url: p.url,
    baseId: p.base_id,
  }))

  const casaComTexto = (p: PrecoLido) => {
    const alvo = normaliza(p.titulo)
    return (grupos.length ? grupos : [[limpo]]).every((formas) =>
      formas.some((f) => alvo.includes(normaliza(f))),
    )
  }

  // Com perfume nosso: só o que está CASADO com ele entra na comparação —
  // inclusive títulos ensinados com grafia que a busca por texto não acharia.
  const observados = nosso ? todos.filter((p) => p.baseId === nosso.id) : todos.filter(casaComTexto)

  const foraDaComparacao: TituloForaDaComparacao[] = []
  if (nosso) {
    const vistos = new Set<string>()
    for (const p of todos) {
      if (p.baseId === nosso.id || !casaComTexto(p)) continue
      const curto = p.titulo.replace(/\s*\d+\s*ml\b.*$/i, '').trim()
      const chave = `${p.fonte}|${curto}`
      if (vistos.has(chave)) continue
      vistos.add(chave)
      if (foraDaComparacao.length < 8) foraDaComparacao.push({ titulo: curto, fonte: p.fonte })
    }
  }

  let nossosPrecos: Partial<Record<VarianteMl, number>> = {}
  if (nosso) {
    const { data } = await sb
      .from('produtos_derivados')
      .select('variante, preco_praticado')
      .eq('base_id', nosso.id)
    nossosPrecos = Object.fromEntries(
      (data ?? [])
        .filter((d) => Number(d.preco_praticado) > 0)
        .map((d) => [d.variante as VarianteMl, Number(d.preco_praticado)]),
    )
  }

  // Nada casou com todas as palavras? Oferece o que casa com ALGUMA — é o
  // que transforma "nada encontrado" em "você quis dizer".
  const parecidos: string[] = []
  if (!nosso && observados.length === 0) {
    const vistos = new Set<string>()
    for (const p of todos) {
      const alvo = normaliza(p.titulo)
      if (grupos.some((formas) => formas.some((f) => alvo.includes(normaliza(f))))) {
        const curto = p.titulo.replace(/\s*\d+\s*ml\b.*$/i, '').trim()
        if (!vistos.has(curto)) {
          vistos.add(curto)
          if (vistos.size <= 10) parecidos.push(curto)
        }
      }
    }
  }

  const fontes = [...new Set(observados.map((o) => o.fonte))].sort()

  const linhas: LinhaComparativo[] = VARIANTES.map((v) => {
    const daVariante = observados.filter((o) => o.variante === v)
    const porFonte: Record<string, PrecoDeFonte> = {}
    for (const o of daVariante) {
      const atual = porFonte[o.fonte]
      // Mesma loja com dois preços para o mesmo tamanho: vale o menor, que é
      // o que o cliente pagaria lá.
      if (!atual || o.preco < atual.preco) {
        porFonte[o.fonte] = { fonte: o.fonte, preco: o.preco, titulo: o.titulo, url: o.url }
      }
    }
    const valores = Object.values(porFonte).map((p) => p.preco)
    const menor = valores.length ? Math.min(...valores) : null
    const meu = nossosPrecos[v] ?? null
    return {
      variante: v,
      nosso: meu,
      porFonte,
      menor,
      diferenca: meu !== null && menor !== null ? meu - menor : null,
    }
  }).filter((l) => l.nosso !== null || Object.keys(l.porFonte).length > 0)

  return {
    termo: limpo,
    nosso,
    alternativas: candidatos.filter((c) => c.id !== nosso?.id).slice(0, 5),
    fontes,
    linhas,
    encontrados: observados.length,
    foraDaComparacao,
    semBanco: false,
    parecidos,
  }
}

export async function buscarPrecos(termo: string): Promise<ResultadoBusca | null> {
  return buscar(termo)
}

/**
 * Troca o perfume da comparação — e refaz o LADO DO MERCADO junto.
 *
 * Antes só o nosso preço trocava e a tabela de mercado ficava a da busca
 * anterior: escolher o Eau de Toilette mostrava os preços do Eau de Parfum.
 */
export async function buscarPrecosDaBase(
  termo: string,
  baseId: string,
): Promise<ResultadoBusca | null> {
  return buscar(termo, baseId)
}
