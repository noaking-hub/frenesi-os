'use server'

import { revalidatePath } from 'next/cache'

import { reenfileirarAviso } from '@/data/notificacoes'
import { OPERADOR } from '@/data/operador'
import { salvarRegraDeEnvio } from '@/data/regras-de-envio'
import { sessaoAtual } from '@/data/sessao'
import type { RegraDeEnvio } from '@/domain'
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

/**
 * Grava a regra de disparo de uma campanha.
 *
 * A validação acontece de novo em `salvarRegraDeEnvio`, do lado do banco, e
 * isso não é redundância: server action é endpoint HTTP como outro qualquer, e
 * uma regra com o segundo toque antes do primeiro gravada por fora mandaria
 * "última chance" antes de "esqueceu algo?" sem ninguém ter clicado em nada
 * errado.
 */
export async function salvarRegra(
  regra: RegraDeEnvio,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (supabaseConfigurado() && !(await sessaoAtual())) {
    return { ok: false, erro: 'Faça login no ERP para mudar as regras de envio.' }
  }

  const r = await salvarRegraDeEnvio(regra, OPERADOR)
  if (r.ok) revalidatePath('/configuracoes/notificacoes')
  return r
}
