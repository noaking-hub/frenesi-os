import 'server-only'

import { operadorAtual } from './operador'
import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * Presets do gerador de imagens.
 *
 * `valores` é o estado completo dos controles da cena. O servidor não valida
 * campo a campo de propósito: o motor no cliente preenche qualquer ausência
 * com o padrão, então um preset de versão antiga continua abrindo — só sem os
 * controles que ainda não existiam quando ele foi salvo.
 */

export interface PresetDoGerador {
  id: string
  nome: string
  valores: Record<string, unknown>
}

export async function lerPresetsDoGerador(): Promise<PresetDoGerador[]> {
  if (!supabaseConfigurado()) return []
  const { data, error } = await supabaseServer()
    .from('gerador_presets')
    .select('id, nome, valores')
    .order('nome')
  if (error) throw error
  return (data ?? []) as PresetDoGerador[]
}

export async function salvarPresetDoGerador(
  nome: string,
  valores: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!supabaseConfigurado()) return { ok: false, erro: 'O Supabase precisa estar configurado.' }
  const limpo = nome.trim()
  if (!limpo) return { ok: false, erro: 'Dê um nome ao preset.' }
  if (limpo.length > 60) return { ok: false, erro: 'O nome do preset pode ter até 60 caracteres.' }

  // Mesmo nome sobrescreve: é o comportamento que o gerador original tinha, e
  // é o que se espera de "salvar de novo com o mesmo nome".
  const { error } = await supabaseServer()
    .from('gerador_presets')
    .upsert(
      {
        nome: limpo,
        valores,
        criado_por: await operadorAtual(),
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'nome' },
    )
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}

export async function excluirPresetDoGerador(
  id: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!supabaseConfigurado()) return { ok: false, erro: 'O Supabase precisa estar configurado.' }
  const { error } = await supabaseServer().from('gerador_presets').delete().eq('id', id)
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}
