/**
 * A conta da Curadoria Olfativa: perfil do lead e recomendação por afinidade.
 *
 * O quiz guarda, em cada clique, o PERFIL de quem clicou (gênero, acorde,
 * estilo, clima, ocasião…). Isso permite recomendar sem catálogo de notas: o
 * perfume certo para um lead é o que pessoas de perfil parecido clicaram.
 *
 * A primeira versão tratava TUDO como semelhança — e recomendou perfume
 * feminino para um perfil que declarou masculino, porque "clima quente"
 * combinava. A lição virou regra: gênero é FILTRO, não semelhança; os
 * atributos têm peso (acorde e estilo dizem mais que período do dia); e
 * recomendação fraca não sai — melhor a tela admitir que ainda não sabe do
 * que sugerir errado com número na frente.
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

export type GeneroDePerfume = 'masculino' | 'feminino' | 'unissex'

/**
 * O gênero pelo NOME do produto — na loja ele está sempre lá ("… Feminino
 * Eau de Parfum"). Nome sem marcação fica null e é tratado como neutro.
 */
export function generoDoPerfume(nome: string): GeneroDePerfume | null {
  const n = nome.toLowerCase()
  if (/unissex|unisex/.test(n)) return 'unissex'
  if (/masculin|homme|\bmen\b|for him/.test(n)) return 'masculino'
  if (/feminin|femme|\bwomen\b|for her/.test(n)) return 'feminino'
  return null
}

const ehPerguntaDeGenero = (pergunta: string) => /genero|gênero|gender/i.test(pergunta)

/** Quanto cada pergunta pesa na afinidade. Acorde e estilo definem o perfume. */
function pesoDaPergunta(pergunta: string): number {
  if (/acorde|familia|família|nota|estilo|intensidade/i.test(pergunta)) return 2
  return 1
}

export interface CliqueComPerfil {
  perfume: string
  pares: [string, string][]
}

export interface Recomendacao {
  nome: string
  /** 0 a 1 — a fração PONDERADA do perfil coberta pelo clique mais parecido. */
  afinidade: number
  cliques: number
}

/** Abaixo disto a recomendação não sai: sugerir fraco é pior que calar. */
export const AFINIDADE_MINIMA = 0.4

/**
 * Os perfumes clicados por quem tem o perfil mais parecido com o do lead.
 *
 * Regras, na ordem em que eliminam:
 * 1. GÊNERO é eliminatório — lead masculino nunca recebe perfume feminino
 *    (unissex e nome sem marcação passam).
 * 2. A afinidade é ponderada: acorde/estilo/intensidade valem o dobro de
 *    clima/ocasião/período; gênero fica fora da conta (já foi filtro).
 * 3. Vale o MELHOR clique de cada perfume; popularidade desempata.
 * 4. Abaixo de AFINIDADE_MINIMA — ou com perfil de menos de 2 atributos —
 *    não há recomendação. A lista vazia é a resposta honesta.
 */
export function recomendacoesPorAfinidade(
  perfilDoLead: [string, string][],
  cliques: CliqueComPerfil[],
  limite = 5,
  excluir: ReadonlySet<string> = new Set(),
): Recomendacao[] {
  const generoDoLead = perfilDoLead.find(([p]) => ehPerguntaDeGenero(p))?.[1]?.toLowerCase() ?? null
  const relevantes = perfilDoLead.filter(([p]) => !ehPerguntaDeGenero(p))
  if (relevantes.length < 2 || cliques.length === 0) return []

  const doLead = new Set(relevantes.map(([p, v]) => `${p}→${v}`))
  const pesoTotal = relevantes.reduce((a, [p]) => a + pesoDaPergunta(p), 0)

  const porPerfume = new Map<string, { afinidade: number; cliques: number }>()
  for (const c of cliques) {
    if (!c.perfume || excluir.has(c.perfume)) continue

    if (generoDoLead) {
      const doPerfume = generoDoPerfume(c.perfume)
      if (doPerfume && doPerfume !== 'unissex' && doPerfume !== generoDoLead) continue
    }

    const pesoCasado = c.pares
      .filter(([p, v]) => !ehPerguntaDeGenero(p) && doLead.has(`${p}→${v}`))
      .reduce((a, [p]) => a + pesoDaPergunta(p), 0)
    const afinidade = pesoTotal > 0 ? pesoCasado / pesoTotal : 0

    const atual = porPerfume.get(c.perfume) ?? { afinidade: 0, cliques: 0 }
    porPerfume.set(c.perfume, {
      afinidade: Math.max(atual.afinidade, afinidade),
      cliques: atual.cliques + 1,
    })
  }

  return [...porPerfume.entries()]
    .map(([nome, r]) => ({ nome, afinidade: Math.round(r.afinidade * 100) / 100, cliques: r.cliques }))
    .filter((r) => r.afinidade >= AFINIDADE_MINIMA)
    .sort((a, b) => b.afinidade - a.afinidade || b.cliques - a.cliques)
    .slice(0, limite)
}
