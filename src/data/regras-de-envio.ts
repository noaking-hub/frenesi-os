import 'server-only'

import type { CampanhaDeEnvio, RegraDeEnvio, ToqueDeCarrinho } from '@/domain'
import { problemasDaRegra } from '@/domain'

import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * As regras de disparo das campanhas de relacionamento, lidas e gravadas.
 *
 * A forma e a validação moram em `src/domain/regras-de-envio.ts`; aqui é só a
 * ponte com a tabela. A separação existe porque a pergunta "este carrinho já
 * merece o segundo toque?" precisa ser testável sem banco.
 */

interface LinhaRegra {
  campanha: string
  nome: string
  ligada: boolean
  yampi_tambem_envia: boolean
  observacao: string | null
  parametros: Record<string, unknown> | null
  atualizada_em: string | null
  atualizada_por: string | null
}

function numeroOuIndefinido(v: unknown): number | undefined {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function traduzir(l: LinhaRegra): RegraDeEnvio {
  const p = l.parametros ?? {}
  const toquesCrus = Array.isArray(p.toques) ? (p.toques as Record<string, unknown>[]) : undefined

  return {
    campanha: l.campanha as CampanhaDeEnvio,
    nome: l.nome,
    ligada: l.ligada,
    yampiTambemEnvia: l.yampi_tambem_envia,
    observacao: l.observacao,
    atualizadaEm: l.atualizada_em,
    atualizadaPor: l.atualizada_por,
    toques: toquesCrus?.map(
      (t): ToqueDeCarrinho => ({ horas: Number(t.horas) || 0, cupom: Boolean(t.cupom) }),
    ),
    janelaMaxDias: numeroOuIndefinido(p.janela_max_dias),
    // `dias_antes` chega número no aniversário e lista no cashback — a mesma
    // ideia com cardinalidade diferente. Unificar num array só faria a tela do
    // aniversário exibir uma lista de um item.
    diasAntes: Array.isArray(p.dias_antes)
      ? (p.dias_antes as unknown[]).map((d) => Number(d)).filter((d) => Number.isFinite(d))
      : numeroOuIndefinido(p.dias_antes),
    cupomPct: numeroOuIndefinido(p.cupom_pct),
    cupomValidadeDias: numeroOuIndefinido(p.cupom_validade_dias),
  }
}

export async function lerRegrasDeEnvio(): Promise<RegraDeEnvio[]> {
  if (!supabaseConfigurado()) return []
  const { data, error } = await supabaseServer()
    .from('regras_de_envio')
    .select('*')
    // Ordem da jornada do cliente, não alfabética: carrinho vem antes da
    // compra, aniversário e cashback vêm depois dela.
    .order('campanha')
  if (error) {
    console.error('[regras] falha ao ler:', error.message)
    return []
  }
  const ordem: CampanhaDeEnvio[] = ['carrinho', 'aniversario', 'cashback']
  return ((data ?? []) as unknown as LinhaRegra[])
    .map(traduzir)
    .sort((a, b) => ordem.indexOf(a.campanha) - ordem.indexOf(b.campanha))
}

export async function lerRegra(campanha: CampanhaDeEnvio): Promise<RegraDeEnvio | null> {
  const todas = await lerRegrasDeEnvio()
  return todas.find((r) => r.campanha === campanha) ?? null
}

/**
 * Grava a regra depois de conferir, e devolve o motivo quando recusa.
 *
 * A validação roda AQUI também, e não só na tela: server action é endpoint
 * HTTP, e uma regra com o segundo toque antes do primeiro gravada por fora
 * mandaria "última chance" antes de "esqueceu algo?" sem ninguém ter clicado
 * em nada errado.
 */
export async function salvarRegraDeEnvio(
  regra: RegraDeEnvio,
  operador: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para salvar regras.' }
  }
  const problemas = problemasDaRegra(regra)
  if (problemas.length > 0) return { ok: false, erro: problemas.join(' ') }

  const parametros: Record<string, unknown> = {}
  if (regra.toques) parametros.toques = regra.toques
  if (regra.janelaMaxDias !== undefined) parametros.janela_max_dias = regra.janelaMaxDias
  if (regra.diasAntes !== undefined) parametros.dias_antes = regra.diasAntes
  if (regra.cupomPct !== undefined) parametros.cupom_pct = regra.cupomPct
  if (regra.cupomValidadeDias !== undefined) parametros.cupom_validade_dias = regra.cupomValidadeDias

  const { error } = await supabaseServer()
    .from('regras_de_envio')
    .update({
      ligada: regra.ligada,
      parametros,
      atualizada_em: new Date().toISOString(),
      atualizada_por: operador,
    })
    .eq('campanha', regra.campanha)
  if (error) {
    console.error('[regras] falha ao salvar:', error.message)
    return { ok: false, erro: error.message }
  }
  return { ok: true }
}
