'use server'

import { revalidatePath } from 'next/cache'

import { OPERADOR } from '@/data/operador'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

export type RespostaCompra = { ok: true; loteId: string } | { ok: false; erro: string }

/**
 * Registra a compra de um frasco chamando `registrar_compra()` no banco:
 * UMA ação que gera o lote, a movimentação de entrada e atualiza volume e
 * custo médio ponderado da base — nunca três escritas soltas.
 */
export async function registrarCompra(dados: {
  baseId: string
  volumeMl: number
  custoTotal: number
  fornecedor: string
}): Promise<RespostaCompra> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para registrar compras.' }
  }
  if (!dados.baseId) return { ok: false, erro: 'Escolha o perfume base.' }
  if (!(dados.volumeMl > 0)) return { ok: false, erro: 'Informe o volume comprado em ml.' }
  if (!(dados.custoTotal > 0)) return { ok: false, erro: 'Informe o custo total da compra.' }
  if (!dados.fornecedor.trim()) return { ok: false, erro: 'Informe o fornecedor.' }

  const { data, error } = await supabaseServer().rpc('registrar_compra', {
    p_base_id: dados.baseId,
    p_volume_ml: dados.volumeMl,
    p_custo_total: dados.custoTotal,
    p_fornecedor: dados.fornecedor.trim(),
    p_operador: OPERADOR,
  })
  if (error) {
    console.error('[compras] registrar_compra falhou:', error)
    return { ok: false, erro: error.message || error.details || 'Falha ao registrar a compra.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, loteId: String(data) }
}

export type RespostaEncerramento = { ok: true; perdaMl: number } | { ok: false; erro: string }

/**
 * Declara o frasco vazio chamando `encerrar_lote()`: fecha o lote, baixa a
 * perda real do estoque e lança o ajuste, tudo numa transação. É aqui que a
 * perda deixa de ser o parâmetro estimado e passa a ser medida.
 */
export async function encerrarLote(loteId: string): Promise<RespostaEncerramento> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para encerrar lotes.' }
  }
  if (!loteId) return { ok: false, erro: 'Escolha o lote a encerrar.' }

  const { data, error } = await supabaseServer().rpc('encerrar_lote', {
    p_lote_id: loteId,
    p_operador: OPERADOR,
  })
  if (error) {
    console.error('[lotes] encerrar_lote falhou:', error)
    return { ok: false, erro: error.message || error.details || 'Falha ao encerrar o lote.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, perdaMl: Number(data) }
}

export type RespostaParametro = { ok: true } | { ok: false; erro: string }

/**
 * Leva o parâmetro de perda ao que os lotes encerrados mediram. Grava uma
 * nova vigência em vez de editar a atual — o preço de ontem continua
 * explicável pelo parâmetro de ontem.
 */
export async function ajustarPerdaParametro(perdaPct: number): Promise<RespostaParametro> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para ajustar parâmetros.' }
  }
  if (!Number.isFinite(perdaPct) || perdaPct < 0 || perdaPct >= 100) {
    return { ok: false, erro: 'Percentual de perda fora da faixa aceitável.' }
  }

  const { error } = await supabaseServer().rpc('ajustar_perda_parametro', {
    p_perda_pct: Number(perdaPct.toFixed(3)),
    p_operador: OPERADOR,
  })
  if (error) {
    console.error('[lotes] ajustar_perda_parametro falhou:', error)
    return { ok: false, erro: error.message || error.details || 'Falha ao ajustar o parâmetro.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
