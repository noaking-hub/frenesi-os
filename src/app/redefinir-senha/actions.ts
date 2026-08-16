'use server'

import { limparFalhas } from '@/data/acesso'
import { supabaseDaSessao } from '@/data/sessao'
import { validarSenhaNova } from '@/domain'

/**
 * Grava a senha nova.
 *
 * Quem chega aqui já provou ser dono da caixa de e-mail — o link de uso único
 * virou sessão na rota de confirmação. Por isso esta ação NÃO pede a senha
 * antiga: quem esqueceu a senha não teria como informá-la, e exigir seria
 * transformar a recuperação num beco sem saída.
 *
 * O que ela faz de importante, além de gravar, é derrubar as OUTRAS sessões.
 * Se a senha foi trocada porque alguém suspeita de invasão, deixar a sessão do
 * invasor viva torna a troca inútil — ele continuaria dentro com o cookie que
 * já tinha.
 */
export async function definirNovaSenha(
  _estado: { erro?: string; ok?: boolean } | null,
  form: FormData,
): Promise<{ erro?: string; ok?: boolean } | null> {
  const nova = String(form.get('senha') ?? '')
  const confirmacao = String(form.get('confirmacao') ?? '')

  const sb = await supabaseDaSessao()
  const { data, error: erroSessao } = await sb.auth.getUser()
  if (erroSessao || !data.user) {
    return { erro: 'O link expirou antes de você concluir. Peça outro na tela de entrada.' }
  }

  const veredito = validarSenhaNova(nova, confirmacao, data.user.email ?? '')
  if (!veredito.ok) return { erro: veredito.erro }

  const { error } = await sb.auth.updateUser({ password: nova })
  if (error) return { erro: error.message }

  // A conta volta a zero no placar de tentativas: o motivo de estar travada
  // era justamente não lembrar a senha, e isso acabou de ser resolvido.
  if (data.user.email) await limparFalhas(data.user.email)

  // Falhar aqui não desfaz a troca — a senha nova já vale. Por isso o catch:
  // o pior desfecho é uma sessão antiga sobreviver, e derrubar a resposta por
  // causa disso deixaria o usuário achando que a troca não funcionou.
  await sb.auth.signOut({ scope: 'others' }).catch(() => {})

  return { ok: true }
}
