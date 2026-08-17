'use server'

import { assinaturaConfere, descadastrar, reativar } from '@/data/descadastro'

/**
 * As duas ações da página pública de descadastro.
 *
 * A autorização é a assinatura do link, conferida AQUI e não só na renderização
 * — a página pode ser lida por quem quiser, mas gravar exige provar que o link
 * saiu de um e-mail nosso. Sem isso, conhecer o e-mail de alguém bastaria para
 * tirá-lo da lista (ou colocá-lo de volta).
 */

type Resposta = { ok: true } | { ok: false; erro: string }

const RECUSA =
  'Este link não confere. Abra o link direto do e-mail que você recebeu.'

export async function confirmarDescadastro(email: string, assinatura: string): Promise<Resposta> {
  if (!assinaturaConfere(email, assinatura)) return { ok: false, erro: RECUSA }
  try {
    await descadastrar(email, 'link do e-mail')
    return { ok: true }
  } catch (e) {
    console.error('[descadastro] falhou:', e)
    return {
      ok: false,
      erro: 'Não conseguimos registrar agora. Tente de novo em alguns minutos.',
    }
  }
}

export async function voltarParaLista(email: string, assinatura: string): Promise<Resposta> {
  if (!assinaturaConfere(email, assinatura)) return { ok: false, erro: RECUSA }
  try {
    await reativar(email)
    return { ok: true }
  } catch (e) {
    console.error('[descadastro] reativação falhou:', e)
    return {
      ok: false,
      erro: 'Não conseguimos registrar agora. Tente de novo em alguns minutos.',
    }
  }
}
