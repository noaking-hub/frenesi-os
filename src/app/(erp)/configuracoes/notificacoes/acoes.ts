'use server'

import { revalidatePath } from 'next/cache'

import { reenfileirarAviso } from '@/data/notificacoes'
import { sessaoAtual } from '@/data/sessao'
import { supabaseConfigurado } from '@/data/supabase'

/**
 * Devolve um aviso que falhou para a fila.
 *
 * A checagem de sessão se repete aqui, e não só na tela: tela esconde, mas
 * quem esconde não protege. Quem protege é o servidor, em cada chamada.
 */
export async function reenviarAviso(
  chave: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (supabaseConfigurado() && !(await sessaoAtual())) {
    return { ok: false, erro: 'Faça login no ERP para reenviar avisos.' }
  }

  const r = await reenfileirarAviso(chave)
  if (r.ok) revalidatePath('/configuracoes/notificacoes')
  return r
}
