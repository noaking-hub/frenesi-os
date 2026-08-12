'use server'

import { redirect } from 'next/navigation'

import { autenticacaoConfigurada, registrarAcesso, supabaseDaSessao } from '@/data/sessao'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

/**
 * Entrada no ERP.
 *
 * O erro devolvido é sempre o mesmo, dê a senha errada ou o e-mail inexistente:
 * distinguir os dois transforma a tela de login num verificador de quem tem
 * conta aqui. E quem tenta invadir começa por essa lista.
 */
export async function entrar(
  _estado: { erro: string } | null,
  form: FormData,
): Promise<{ erro: string } | null> {
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  const senha = String(form.get('senha') ?? '')
  const de = String(form.get('de') ?? '')

  if (!email || !senha) return { erro: 'Informe e-mail e senha.' }
  if (!autenticacaoConfigurada() || !supabaseConfigurado()) {
    return {
      erro: 'A autenticação não está configurada neste ambiente. Defina NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    }
  }

  const sb = await supabaseDaSessao()
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha })

  if (error || !data.user) {
    // Credencial errada e serviço quebrado são problemas diferentes, e tratar
    // os dois como "não confere" mandou uma investigação inteira para o lado
    // errado: o login estava falhando por erro de schema no Supabase, e a
    // tela dizia que a senha estava errada. O texto genérico continua para o
    // caso legítimo (400), porque distinguir "e-mail não existe" de "senha
    // errada" entrega a lista de quem tem conta aqui.
    const status = error?.status ?? 0
    if (status >= 500 || status === 0) {
      console.error('[entrar] o Supabase não respondeu ao login:', error?.message)
      return {
        erro: 'O serviço de autenticação não respondeu. Tente de novo em instantes — se insistir, é falha do Supabase, não da sua senha.',
      }
    }
    return { erro: 'E-mail ou senha não conferem.' }
  }

  const { data: perfil } = await supabaseServer()
    .from('usuarios')
    .select('id, ativo')
    .eq('id', data.user.id)
    .maybeSingle()

  // Credencial válida mas sem perfil ativo no ERP: a sessão é desfeita na
  // hora, senão o cookie ficaria valendo para as rotas de API.
  if (!perfil || !(perfil as { ativo: boolean }).ativo) {
    await sb.auth.signOut()
    return { erro: 'Este acesso está desativado. Fale com quem administra o ERP.' }
  }

  await registrarAcesso(data.user.id)
  // Volta para onde a pessoa ia antes de ser barrada — e só para dentro do
  // próprio ERP: um "de" apontando para fora seria redirecionamento aberto.
  redirect(de.startsWith('/') && !de.startsWith('//') ? de : '/')
}

export async function sair(): Promise<void> {
  if (autenticacaoConfigurada()) {
    const sb = await supabaseDaSessao()
    await sb.auth.signOut()
  }
  redirect('/entrar')
}
