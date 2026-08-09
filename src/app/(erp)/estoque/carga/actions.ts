'use server'

import { revalidatePath } from 'next/cache'

import { OPERADOR } from '@/data/operador'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

export type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

export interface ItemCarga {
  baseId: string
  volumeMl: number
  custoPorMl: number
}

/**
 * Declara de uma vez o que já está na prateleira.
 *
 * Vai tudo numa chamada só porque é uma transação só: se a décima linha
 * estiver errada, nenhuma das nove anteriores entra. Meia carga gravada é
 * pior que nenhuma — o operador não teria como saber onde parou.
 */
export async function carregarEstoqueInicial(
  itens: ItemCarga[],
): Promise<Resposta<{ gravadas: number }>> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para a carga inicial.' }
  }
  if (itens.length === 0) {
    return { ok: false, erro: 'Preencha volume e custo de ao menos um perfume.' }
  }

  const invalido = itens.find(
    (i) => !i.baseId || !(i.volumeMl > 0) || !(i.custoPorMl > 0) || !Number.isFinite(i.volumeMl),
  )
  if (invalido) {
    return {
      ok: false,
      erro: `“${invalido.baseId}” está com volume ou custo por ml em branco — as duas colunas são obrigatórias.`,
    }
  }

  const { data, error } = await supabaseServer().rpc('carregar_estoque_inicial', {
    p_itens: itens.map((i) => ({
      base_id: i.baseId,
      volume_ml: i.volumeMl,
      custo_por_ml: i.custoPorMl,
    })),
    p_operador: OPERADOR,
  })
  if (error) {
    console.error('[carga] carregar_estoque_inicial falhou:', error)
    return { ok: false, erro: error.message || error.details || 'Falha na carga inicial.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, gravadas: Number(data) }
}
