import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { autenticacaoConfigurada, supabaseDaSessao } from '@/data/sessao'

import { FormularioNovaSenha } from './FormularioNovaSenha'

export const metadata: Metadata = {
  title: 'Nova senha · FRENESI OS',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * Escolher a senha nova.
 *
 * Só chega aqui quem veio do link do e-mail — a rota de confirmação trocou o
 * token por uma sessão antes de redirecionar. Sem sessão, esta tela não tem o
 * que fazer e devolve para a entrada com o motivo, em vez de mostrar um
 * formulário que falharia no envio.
 *
 * `getUser()` direto, e não `sessaoAtual()`: quem está redefinindo a senha
 * precisa conseguir fazê-lo mesmo que o perfil no ERP esteja desativado — a
 * senha é da credencial, e a permissão de entrar é conferida depois, no login.
 */
export default async function RedefinirSenha() {
  if (!autenticacaoConfigurada()) redirect('/entrar')

  const sb = await supabaseDaSessao()
  const { data } = await sb.auth.getUser()
  if (!data.user) redirect('/entrar?recado=link-vencido')

  return <FormularioNovaSenha email={data.user.email ?? ''} />
}
