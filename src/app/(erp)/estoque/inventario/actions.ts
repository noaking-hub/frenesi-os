'use server'

import { revalidatePath } from 'next/cache'

import { OPERADOR } from '@/data/operador'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

export type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

function falha(e: { message?: string; details?: string }, padrao: string) {
  return { ok: false as const, erro: e.message || e.details || padrao }
}

function exigeSupabase(acao: string) {
  return supabaseConfigurado()
    ? null
    : { ok: false as const, erro: `O Supabase precisa estar configurado para ${acao}.` }
}

/** Abre a contagem congelando o volume de sistema de cada base. */
export async function abrirInventario(
  somenteComVolume: boolean,
): Promise<Resposta<{ inventarioId: string }>> {
  const bloqueio = exigeSupabase('abrir contagens')
  if (bloqueio) return bloqueio

  const { data, error } = await supabaseServer().rpc('abrir_inventario', {
    p_operador: OPERADOR,
    p_somente_com_volume: somenteComVolume,
  })
  if (error) {
    console.error('[inventario] abrir_inventario falhou:', error)
    return falha(error, 'Falha ao abrir a contagem.')
  }

  revalidatePath('/', 'layout')
  return { ok: true, inventarioId: String(data) }
}

/** Grava o volume físico contado de uma base. Contar zero é uma contagem. */
export async function registrarContagem(
  inventarioId: string,
  baseId: string,
  contadoMl: number,
): Promise<Resposta> {
  const bloqueio = exigeSupabase('registrar contagens')
  if (bloqueio) return bloqueio
  if (!Number.isFinite(contadoMl) || contadoMl < 0) {
    return { ok: false, erro: 'O volume contado não pode ser negativo.' }
  }

  const { error } = await supabaseServer().rpc('registrar_contagem', {
    p_inventario_id: inventarioId,
    p_base_id: baseId,
    p_contado_ml: contadoMl,
    p_operador: OPERADOR,
  })
  if (error) {
    console.error('[inventario] registrar_contagem falhou:', error)
    return falha(error, 'Falha ao registrar a contagem.')
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Confirma a contagem: gera um ajuste de estoque por divergência, cada um com
 * seu lançamento em Movimentações.
 */
export async function confirmarInventario(
  inventarioId: string,
): Promise<Resposta<{ ajustes: number }>> {
  const bloqueio = exigeSupabase('confirmar inventários')
  if (bloqueio) return bloqueio

  const { data, error } = await supabaseServer().rpc('fechar_inventario', {
    p_inventario_id: inventarioId,
    p_operador: OPERADOR,
  })
  if (error) {
    console.error('[inventario] fechar_inventario falhou:', error)
    return falha(error, 'Falha ao confirmar o inventário.')
  }

  revalidatePath('/', 'layout')
  return { ok: true, ajustes: Number(data) }
}

/** Desfaz uma abertura errada. Contagem fechada é histórico e não se apaga. */
export async function cancelarInventario(inventarioId: string): Promise<Resposta> {
  const bloqueio = exigeSupabase('cancelar contagens')
  if (bloqueio) return bloqueio

  const { error } = await supabaseServer().rpc('cancelar_inventario', {
    p_inventario_id: inventarioId,
  })
  if (error) {
    console.error('[inventario] cancelar_inventario falhou:', error)
    return falha(error, 'Falha ao cancelar a contagem.')
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
