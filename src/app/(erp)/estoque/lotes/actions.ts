'use server'

import { revalidatePath } from 'next/cache'

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
  })
  if (error) {
    console.error('[compras] registrar_compra falhou:', error)
    return { ok: false, erro: error.message || error.details || 'Falha ao registrar a compra.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, loteId: String(data) }
}
