'use server'

import { revalidatePath } from 'next/cache'

import { avisarDevolucaoAprovada } from '@/data/notificacoes'
import { mensagemDe } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import type { StatusSolicitacao, VarianteMl } from '@/domain'

export type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

function exigeSupabase(acao: string) {
  return supabaseConfigurado()
    ? null
    : { ok: false as const, erro: `O Supabase precisa estar configurado para ${acao}.` }
}

/** Move a devolução no fluxo. O reverso só é gravado quando informado. */
export async function moverSolicitacao(
  protocolo: string,
  status: StatusSolicitacao,
  nota = '',
  reverso = '',
): Promise<Resposta> {
  const bloqueio = exigeSupabase('mover devoluções')
  if (bloqueio) return bloqueio

  const { error } = await supabaseServer().rpc('mover_solicitacao_devolucao', {
    p_protocolo: protocolo,
    p_status: status,
    p_nota: nota,
    p_reverso: reverso,
  })
  if (error) {
    console.error('[devolucoes] mover_solicitacao_devolucao falhou:', error)
    return { ok: false, erro: mensagemDe(error) }
  }

  // Reverso recém-gerado dispara o e-mail de aprovação — pronto, mas atrás da
  // trava AVISOS_DE_PEDIDO; desligado, o fato só entra no log.
  if (status === 'Aguardando postagem' && reverso.trim()) {
    await avisarDevolucaoAprovada(protocolo)
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Registra o volume medido de cada item recebido.
 *
 * É a medição que decide se a devolução é aceita — não o que o cliente
 * declarou. Por isso ela entra só por aqui, com o pacote na bancada, e nunca
 * pelo portal.
 */
export async function conferirDevolucao(
  protocolo: string,
  itens: { perfume: string; variante: VarianteMl; medidoMl: number; observacao: string }[],
  lacre: string,
): Promise<Resposta> {
  const bloqueio = exigeSupabase('registrar a conferência')
  if (bloqueio) return bloqueio
  if (itens.length === 0) return { ok: false, erro: 'Informe ao menos um item medido.' }

  const { error } = await supabaseServer().rpc('conferir_devolucao', {
    p_protocolo: protocolo,
    p_itens: itens.map((i) => ({
      perfume: i.perfume,
      variante: i.variante,
      medido_ml: i.medidoMl,
      observacao: i.observacao,
    })),
    p_lacre: lacre,
  })
  if (error) {
    console.error('[devolucoes] conferir_devolucao falhou:', error)
    return { ok: false, erro: mensagemDe(error) }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
