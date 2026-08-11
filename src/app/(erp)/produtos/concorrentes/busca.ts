'use server'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { VARIANTES, buscarNoCatalogo, formasDeBusca } from '@/domain'
import type { VarianteMl } from '@/domain'

/**
 * Consulta de preço de um perfume, meu contra o dos concorrentes.
 *
 * A busca é por TEXTO, não pelo casamento com o catálogo. Isso é deliberado:
 * exigir que cada título do concorrente estivesse ligado a uma base nossa
 * fazia a consulta depender de um trabalho de cadastro que não interessa a
 * quem só quer saber por quanto o vizinho vende o Idôle. Quem digita o nome
 * do perfume sabe o que procura melhor que qualquer casamento automático.
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
  /** Sem Supabase não há preço guardado — e isso não é "nada encontrado". */
  semBanco: boolean
  /** Quando nada casa com TODAS as palavras: títulos que casam com alguma. */
  parecidos: string[]
}

export async function buscarPrecos(termo: string): Promise<ResultadoBusca | null> {
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
      semBanco: true,
      parecidos: [],
    }
  }

  const sb = supabaseServer()

  // A busca NÃO depende do catálogo nem da grafia exata: os preços coletados
  // vêm inteiros e o casamento acontece aqui, com acento removido dos dois
  // lados. Antes o filtro era ilike no banco — e "Idôle" digitado não achava
  // "Idole" gravado (nem o contrário), o que parecia exigir cadastro prévio.
  // Cada palavra digitada precisa aparecer no título; a concentração aceita
  // as duas formas (EDT e Eau de Toilette).
  const grupos = formasDeBusca(limpo).slice(0, 6)

  const [{ data: bases }, { data: precos }] = await Promise.all([
    sb.from('perfumes_base').select('id, nome, marca').eq('ativo', true).limit(500),
    sb
      .from('concorrente_precos')
      .select('titulo, preco, variante, url, concorrentes(nome)')
      .not('variante', 'is', null)
      .limit(8000),
  ])

  const candidatos = buscarNoCatalogo(limpo, bases ?? [])
  const nosso = candidatos[0] ?? null

  const normaliza = (t: string) =>
    t
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')

  const observados = ((precos ?? []) as unknown as {
    titulo: string
    preco: number | string
    variante: number
    url: string | null
    concorrentes: { nome: string } | null
  }[])
    .filter((p) => {
      const alvo = normaliza(p.titulo)
      return (grupos.length ? grupos : [[limpo]]).every((formas) =>
        formas.some((f) => alvo.includes(normaliza(f))),
      )
    })
    .map((p) => ({
      fonte: p.concorrentes?.nome ?? '—',
      titulo: p.titulo,
      preco: Number(p.preco),
      variante: p.variante as VarianteMl,
      url: p.url,
    }))

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
  let parecidos: string[] = []
  if (observados.length === 0) {
    const vistos = new Set<string>()
    for (const p of (precos ?? []) as unknown as { titulo: string }[]) {
      const alvo = normaliza(p.titulo)
      if ((grupos.length ? grupos : [[limpo]]).some((formas) => formas.some((f) => alvo.includes(normaliza(f))))) {
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
    alternativas: candidatos.slice(1, 6),
    fontes,
    linhas,
    encontrados: observados.length,
    semBanco: false,
    parecidos,
  }
}

/** Troca o perfume do nosso lado sem refazer a busca de mercado. */
export async function buscarPrecosDaBase(termo: string, baseId: string): Promise<ResultadoBusca | null> {
  const r = await buscarPrecos(termo)
  if (!r) return null
  const escolhido = [r.nosso, ...r.alternativas].find((b) => b?.id === baseId) ?? r.nosso
  if (!escolhido || escolhido.id === r.nosso?.id) return r

  const sb = supabaseServer()
  const { data } = await sb
    .from('produtos_derivados')
    .select('variante, preco_praticado')
    .eq('base_id', escolhido.id)
  const meus = Object.fromEntries(
    (data ?? [])
      .filter((d) => Number(d.preco_praticado) > 0)
      .map((d) => [d.variante as VarianteMl, Number(d.preco_praticado)]),
  ) as Partial<Record<VarianteMl, number>>

  const linhas = r.linhas.map((l) => {
    const meu = meus[l.variante] ?? null
    return { ...l, nosso: meu, diferenca: meu !== null && l.menor !== null ? meu - l.menor : null }
  })

  return {
    ...r,
    nosso: escolhido,
    alternativas: [r.nosso, ...r.alternativas].filter(
      (b): b is { id: string; nome: string; marca: string } => Boolean(b) && b!.id !== escolhido.id,
    ),
    linhas,
  }
}
