import 'server-only'

import { extrairErros, rotinasDoentes, type RodadaRegistrada, type RotinaDoente } from '@/domain'

import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * O diário de bordo das rotinas: cada rodada grava um resumo, a vigília lê.
 *
 * Registrar NUNCA derruba a rotina — saúde é passageiro, não piloto. Qualquer
 * falha aqui vira log de servidor e a rodada segue.
 */
export async function registrarSaudeDaRotina(
  rotina: string,
  relatorio: unknown,
  duracaoMs?: number,
): Promise<void> {
  if (!supabaseConfigurado()) return
  try {
    const { error } = await supabaseServer().from('rotinas_saude').insert({
      rotina,
      erros: extrairErros(relatorio),
      duracao_ms: typeof duracaoMs === 'number' ? Math.round(duracaoMs) : null,
    })
    if (error) console.error('[saude] falha ao registrar rodada:', error.message)
  } catch (e) {
    console.error('[saude] falha ao registrar rodada:', e)
  }
}

/**
 * Os pontos falhando em rodadas seguidas, para a fila de prioridades.
 *
 * Janela de 48 h e não "as últimas N": rotina parada não gera linha nenhuma, e
 * contar por quantidade faria um erro de semana passada parecer atual.
 */
export async function rotinasComErroPersistente(): Promise<RotinaDoente[]> {
  if (!supabaseConfigurado()) return []
  const desde = new Date(Date.now() - 48 * 3_600_000).toISOString()
  const { data, error } = await supabaseServer()
    .from('rotinas_saude')
    .select('rotina, rodada_em, erros')
    .gte('rodada_em', desde)
    .order('rodada_em', { ascending: false })
    .limit(400)
  if (error) {
    console.error('[saude] falha ao ler rodadas:', error.message)
    return []
  }
  const rodadas: RodadaRegistrada[] = ((data ?? []) as {
    rotina: string
    rodada_em: string
    erros: unknown
  }[]).map((l) => ({
    rotina: l.rotina,
    rodadaEm: l.rodada_em,
    erros: Array.isArray(l.erros) ? (l.erros as RodadaRegistrada['erros']) : [],
  }))
  return rotinasDoentes(rodadas)
}

/** Faxina: o diário não precisa de mais que 30 dias. Chamada pela vigília. */
export async function limparSaudeAntiga(): Promise<void> {
  if (!supabaseConfigurado()) return
  const corte = new Date(Date.now() - 30 * 86_400_000).toISOString()
  await supabaseServer().from('rotinas_saude').delete().lt('rodada_em', corte)
}
