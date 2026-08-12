import 'server-only'

import { cookies } from 'next/headers'

import { createServerClient, type CookieOptions } from '@supabase/ssr'

import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * Sessão de quem está usando o ERP.
 *
 * A credencial vive no Supabase Auth; aqui só se lê o cookie de sessão e se
 * junta o perfil de negócio (nome, papel, ativo). Duas chaves diferentes, e a
 * diferença importa: a PÚBLICA valida a sessão do visitante — é ela que o
 * navegador pode ver — e a de serviço faz o trabalho administrativo, que
 * nunca sai do servidor.
 */

export type PapelUsuario = 'dono' | 'operacao'

export interface UsuarioSessao {
  id: string
  nome: string
  email: string
  papel: PapelUsuario
  ativo: boolean
}

export function autenticacaoConfigurada(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}

/**
 * Cliente ligado aos cookies desta requisição.
 *
 * Server Component não pode escrever cookie — e o Supabase tenta, ao renovar o
 * token. O `try/catch` no set é o padrão da própria biblioteca: quem renova de
 * verdade é o middleware, que roda antes e pode escrever.
 */
export async function supabaseDaSessao() {
  const jar = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (novos: { name: string; value: string; options?: CookieOptions }[]) => {
          try {
            for (const { name, value, options } of novos) jar.set(name, value, options)
          } catch {
            /* Server Component: o middleware já renovou. */
          }
        },
      },
    },
  )
}

/**
 * Quem está logado agora — ou null.
 *
 * `getUser()` e não `getSession()`: o segundo devolve o que está no cookie sem
 * verificar assinatura, e um cookie forjado passaria. Este custa uma ida ao
 * Supabase e é o único que confirma que a sessão é real.
 */
export async function sessaoAtual(): Promise<UsuarioSessao | null> {
  if (!autenticacaoConfigurada() || !supabaseConfigurado()) return null

  const sb = await supabaseDaSessao()
  const { data, error } = await sb.auth.getUser()
  if (error || !data.user) return null

  const { data: perfil } = await supabaseServer()
    .from('usuarios')
    .select('id, nome, email, papel, ativo')
    .eq('id', data.user.id)
    .maybeSingle()

  // Usuário do Auth sem perfil no ERP não entra: alguém criado direto no painel
  // do Supabase não deveria ganhar acesso ao sistema por isso.
  if (!perfil) return null

  const u = perfil as unknown as UsuarioSessao
  if (!u.ativo) return null
  return u
}

/** Marca o acesso — é o que responde "quem entrou e quando" sem auditoria pesada. */
export async function registrarAcesso(id: string): Promise<void> {
  if (!supabaseConfigurado()) return
  await supabaseServer()
    .from('usuarios')
    .update({ ultimo_acesso_em: new Date().toISOString() })
    .eq('id', id)
}
