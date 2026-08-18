'use server'

import { revalidatePath } from 'next/cache'

import { operadorAtual } from '@/data/operador'
import { mensagemDe } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import type { EstadoOcorrencia, TipoOcorrencia } from '@/domain'

export type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

function exigeSupabase(acao: string) {
  return supabaseConfigurado()
    ? null
    : { ok: false as const, erro: `O Supabase precisa estar configurado para ${acao}.` }
}

/**
 * Abre as ocorrências que os dados já denunciam.
 *
 * O valor está em antecipar: hoje o pedido parado só vira ocorrência quando o
 * cliente reclama. Rodar isto todo dia é seguro — a unicidade é por pedido e
 * tipo enquanto a ocorrência estiver aberta.
 */
export async function varrerParados(): Promise<Resposta<{ novas: number }>> {
  const bloqueio = exigeSupabase('varrer os pedidos parados')
  if (bloqueio) return bloqueio

  const { data, error } = await supabaseServer().rpc('varrer_ocorrencias', {
    p_dias: 15,
    p_responsavel: await operadorAtual(),
    p_janela_dias: 90,
  })
  if (error) {
    console.error('[ocorrencias] varrer_ocorrencias falhou:', error)
    return { ok: false, erro: mensagemDe(error) }
  }

  revalidatePath('/', 'layout')
  return { ok: true, novas: Number(data) }
}

export async function registrarOcorrencia(dados: {
  pedidoId: string
  tipo: TipoOcorrencia
  acao: string
  prazoDias: number
}): Promise<Resposta<{ id: string }>> {
  const bloqueio = exigeSupabase('registrar ocorrências')
  if (bloqueio) return bloqueio
  if (!dados.pedidoId.trim()) return { ok: false, erro: 'Informe o pedido.' }

  const { data, error } = await supabaseServer().rpc('abrir_ocorrencia', {
    p_pedido_id: dados.pedidoId.trim(),
    p_tipo: dados.tipo,
    p_acao: dados.acao,
    p_prazo_dias: dados.prazoDias,
    p_responsavel: await operadorAtual(),
    p_origem: 'Manual',
  })
  if (error) {
    console.error('[ocorrencias] abrir_ocorrencia falhou:', error)
    return { ok: false, erro: mensagemDe(error) }
  }

  revalidatePath('/', 'layout')
  return { ok: true, id: String(data) }
}

export async function moverOcorrencia(
  id: string,
  estado: EstadoOcorrencia,
  acao: string,
  desfecho: string,
): Promise<Resposta> {
  const bloqueio = exigeSupabase('mover ocorrências')
  if (bloqueio) return bloqueio

  const { error } = await supabaseServer().rpc('mover_ocorrencia', {
    p_id: id,
    p_estado: estado,
    p_acao: acao,
    p_desfecho: desfecho,
  })
  if (error) {
    console.error('[ocorrencias] mover_ocorrencia falhou:', error)
    return { ok: false, erro: mensagemDe(error) }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
