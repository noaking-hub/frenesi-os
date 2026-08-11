'use server'

import { revalidatePath } from 'next/cache'

import { gravarModeloEmail, type ChaveModelo } from '@/data/modelo-email'
import type { ModeloEmailRecuperacao } from '@/domain'

/** Salva um modelo da Central de E-mails — o próximo envio já sai com ele. */
export async function salvarModelo(
  chave: ChaveModelo,
  m: ModeloEmailRecuperacao,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!m.assunto?.trim()) return { ok: false, erro: 'O assunto não pode ficar vazio.' }
  const html = m.html?.trim() ?? ''
  if (!html && [m.titulo, m.mensagem, m.textoBotao].some((c) => !c || !c.trim())) {
    return { ok: false, erro: 'Título, mensagem e texto do botão não podem ficar vazios na moldura da marca.' }
  }
  if (chave === 'carrinho' && html && !/\{itens\}/.test(html)) {
    return {
      ok: false,
      erro: 'O HTML precisa conter {itens} — sem ele o cliente recebe um e-mail de carrinho sem os produtos.',
    }
  }
  try {
    await gravarModeloEmail(chave, {
      assunto: m.assunto.trim(),
      titulo: m.titulo.trim(),
      mensagem: m.mensagem.trim(),
      textoBotao: m.textoBotao.trim(),
      html: html || null,
    })
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
  revalidatePath('/crm/emails')
  revalidatePath('/crm/carrinhos')
  return { ok: true }
}
