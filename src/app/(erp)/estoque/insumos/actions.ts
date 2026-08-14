'use server'

import { revalidatePath } from 'next/cache'

import { OPERADOR } from '@/data/operador'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

export type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

function exige(acao: string) {
  return supabaseConfigurado()
    ? null
    : { ok: false as const, erro: `O Supabase precisa estar configurado para ${acao}.` }
}

/** Entrada de insumo. O custo médio se refaz no banco, como nos lotes. */
export async function comprarInsumo(
  insumoId: string,
  unidades: number,
  custoTotal: number,
  fornecedor: string,
): Promise<Resposta<{ saldo: number }>> {
  const bloqueio = exige('registrar compras de insumo')
  if (bloqueio) return bloqueio
  if (!(unidades > 0)) return { ok: false, erro: 'Informe quantas unidades entraram.' }
  if (!(custoTotal >= 0)) return { ok: false, erro: 'Informe o custo total da compra.' }

  const { data, error } = await supabaseServer().rpc('registrar_compra_insumo', {
    p_insumo_id: insumoId,
    p_unidades: Math.round(unidades),
    p_custo_total: custoTotal,
    p_fornecedor: fornecedor.trim() || null,
    p_operador: OPERADOR,
  })
  if (error) return { ok: false, erro: error.message }

  revalidatePath('/', 'layout')
  return { ok: true, saldo: Number(data ?? 0) }
}

/** Contagem física: o saldo passa a ser o contado, com motivo obrigatório. */
export async function ajustarInsumo(
  insumoId: string,
  unidades: number,
  motivo: string,
): Promise<Resposta<{ saldo: number }>> {
  const bloqueio = exige('ajustar insumos')
  if (bloqueio) return bloqueio
  if (!(unidades >= 0)) return { ok: false, erro: 'O saldo contado não pode ser negativo.' }
  if (!motivo.trim()) return { ok: false, erro: 'Diga o motivo do ajuste — ele fica no histórico.' }

  const { data, error } = await supabaseServer().rpc('ajustar_insumo', {
    p_insumo_id: insumoId,
    p_unidades: Math.round(unidades),
    p_motivo: motivo.trim(),
    p_operador: OPERADOR,
  })
  if (error) return { ok: false, erro: error.message }

  revalidatePath('/', 'layout')
  return { ok: true, saldo: Number(data ?? 0) }
}

/** Quanto comprar antes de faltar: o mínimo que dispara o alerta. */
export async function definirMinimo(insumoId: string, minimo: number): Promise<Resposta> {
  const bloqueio = exige('definir o mínimo')
  if (bloqueio) return bloqueio
  if (!(minimo >= 0)) return { ok: false, erro: 'O mínimo não pode ser negativo.' }

  const { error } = await supabaseServer()
    .from('insumos')
    .update({ minimo: Math.round(minimo) })
    .eq('id', insumoId)
  if (error) return { ok: false, erro: error.message }

  revalidatePath('/', 'layout')
  return { ok: true }
}

export interface MovimentoInsumo {
  quando: string
  tipo: string
  unidades: number
  saldo: number | null
  descricao: string
  responsavel: string | null
}

/** Histórico do item — é o que prova de onde veio cada unidade. */
export async function historicoDoInsumo(insumoId: string): Promise<MovimentoInsumo[]> {
  if (!supabaseConfigurado()) return []
  const { data } = await supabaseServer()
    .from('insumo_movimentacoes')
    .select('ocorrida_em, tipo, unidades, saldo, descricao, responsavel')
    .eq('insumo_id', insumoId)
    .order('ocorrida_em', { ascending: false })
    .limit(20)

  return ((data ?? []) as unknown as {
    ocorrida_em: string
    tipo: string
    unidades: number
    saldo: number | null
    descricao: string
    responsavel: string | null
  }[]).map((m) => ({
    quando: new Date(m.ocorrida_em).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    }),
    tipo: m.tipo,
    unidades: m.unidades,
    saldo: m.saldo,
    descricao: m.descricao,
    responsavel: m.responsavel,
  }))
}
