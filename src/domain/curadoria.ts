/**
 * A conta da Curadoria Olfativa: perfil do lead e recomendação por afinidade.
 *
 * O quiz guarda, em cada clique, o PERFIL de quem clicou (gênero, clima,
 * estilo, ocasião…). Isso permite recomendar sem catálogo de notas: o
 * perfume certo para um lead é o que pessoas de perfil PARECIDO clicaram.
 * É filtragem colaborativa em miniatura — honesta com o dado que existe, e
 * melhora sozinha a cada interação nova do quiz.
 */

/** `{genero:'feminino', familias:['doce','floral']}` → pares pergunta→valor. */
export function paresDePerfil(respostas: unknown): [string, string][] {
  if (!respostas || typeof respostas !== 'object') return []
  const saida: [string, string][] = []
  for (const [chave, valor] of Object.entries(respostas as Record<string, unknown>)) {
    if (valor == null) continue
    if (Array.isArray(valor)) {
      for (const v of valor) if (typeof v === 'string' || typeof v === 'number') saida.push([chave, String(v)])
    } else if (typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean') {
      saida.push([chave, String(valor)])
    }
  }
  return saida
}

export interface CliqueComPerfil {
  perfume: string
  pares: [string, string][]
}

export interface Recomendacao {
  nome: string
  /** 0 a 1 — a fração do perfil do lead coberta pelo clique mais parecido. */
  afinidade: number
  cliques: number
}

/**
 * Os perfumes clicados por quem tem o perfil mais parecido com o do lead.
 *
 * A afinidade de um perfume é a do MELHOR clique dele (não a média): um
 * clique idêntico ao perfil do lead vale recomendação cheia, mesmo que o
 * perfume também tenha sido clicado por perfis distantes. Empate decide por
 * popularidade — mais cliques, mais confiança.
 */
export function recomendacoesPorAfinidade(
  perfilDoLead: [string, string][],
  cliques: CliqueComPerfil[],
  limite = 5,
): Recomendacao[] {
  if (perfilDoLead.length === 0 || cliques.length === 0) return []
  const doLead = new Set(perfilDoLead.map(([p, v]) => `${p}→${v}`))

  const porPerfume = new Map<string, { afinidade: number; cliques: number }>()
  for (const c of cliques) {
    if (!c.perfume) continue
    const iguais = c.pares.filter(([p, v]) => doLead.has(`${p}→${v}`)).length
    const afinidade = iguais / doLead.size
    const atual = porPerfume.get(c.perfume) ?? { afinidade: 0, cliques: 0 }
    porPerfume.set(c.perfume, {
      afinidade: Math.max(atual.afinidade, afinidade),
      cliques: atual.cliques + 1,
    })
  }

  return [...porPerfume.entries()]
    .map(([nome, r]) => ({ nome, afinidade: Math.round(r.afinidade * 100) / 100, cliques: r.cliques }))
    .filter((r) => r.afinidade > 0)
    .sort((a, b) => b.afinidade - a.afinidade || b.cliques - a.cliques)
    .slice(0, limite)
}
