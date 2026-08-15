'use server'

import { revalidatePath } from 'next/cache'

import { OPERADOR } from '@/data/operador'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

export type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

/**
 * Ações da Conciliação.
 *
 * O restante do Financeiro migrou para `acoes-gerenciais.ts`, que fala o
 * vocabulário novo — natureza, competência, transferência, parcela. Só o que
 * é específico de repasse continua aqui: conciliar um crédito não passa por
 * nenhum desses conceitos, e movê-lo junto só embaralharia os dois assuntos.
 */

function falha(e: { message?: string; details?: string }, padrao: string) {
  return { ok: false as const, erro: e.message || e.details || padrao }
}

function exigeSupabase(acao: string) {
  return supabaseConfigurado()
    ? null
    : { ok: false as const, erro: `O Supabase precisa estar configurado para ${acao}.` }
}

/** Informa quanto a plataforma creditou de um pedido. */
export async function conciliarRepasse(pedidoId: string, recebido: number): Promise<Resposta> {
  const bloqueio = exigeSupabase('conciliar repasses')
  if (bloqueio) return bloqueio
  if (!Number.isFinite(recebido) || recebido < 0) {
    return { ok: false, erro: 'O valor recebido não pode ser negativo.' }
  }

  const { error } = await supabaseServer().rpc('conciliar_repasse', {
    p_pedido_id: pedidoId,
    p_recebido: recebido,
    p_quando: null,
    p_operador: OPERADOR,
  })
  if (error) {
    console.error('[financeiro] conciliar_repasse falhou:', error)
    return falha(error, 'Falha ao conciliar o repasse.')
  }

  revalidatePath('/financeiro/conciliacao')
  revalidatePath('/financeiro')
  return { ok: true }
}

/**
 * Gera a previsão de repasse dos pedidos que ainda não têm linha.
 *
 * Fica separado da importação de pedidos porque a taxa vigente pode mudar
 * entre uma coisa e outra, e a taxa fica congelada na linha do repasse.
 */
export async function preverRepasses(): Promise<Resposta<{ novos: number }>> {
  const bloqueio = exigeSupabase('prever repasses')
  if (bloqueio) return bloqueio

  const { data, error } = await supabaseServer().rpc('prever_repasses')
  if (error) {
    console.error('[financeiro] prever_repasses falhou:', error)
    return falha(error, 'Falha ao prever os repasses.')
  }

  revalidatePath('/financeiro/conciliacao')
  revalidatePath('/financeiro')
  return { ok: true, novos: Number(data) }
}
