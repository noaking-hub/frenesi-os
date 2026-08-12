'use server'

import { revalidatePath } from 'next/cache'

import { sessaoAtual, supabaseDaSessao } from '@/data/sessao'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

export type Resposta = { ok: true; recado: string } | { ok: false; erro: string }

/** O nome que aparece no topo e nas telas. O e-mail é a credencial: muda em outro lugar. */
export async function salvarPerfil(nome: string): Promise<Resposta> {
  const eu = await sessaoAtual()
  if (!eu) return { ok: false, erro: 'Sua sessão expirou. Entre de novo.' }

  const limpo = nome.trim()
  if (limpo.length < 2) return { ok: false, erro: 'Informe o nome como ele deve aparecer no sistema.' }

  const { error } = await supabaseServer().from('usuarios').update({ nome: limpo }).eq('id', eu.id)
  if (error) return { ok: false, erro: error.message }

  revalidatePath('/', 'layout')
  return { ok: true, recado: 'Nome atualizado.' }
}

/**
 * Troca de senha.
 *
 * A senha atual é conferida antes — o Supabase permite trocar só com a sessão
 * aberta, e sem essa checagem quem sentasse na máquina destravada de alguém
 * trocaria a senha e tomaria a conta.
 */
export async function trocarSenha(atual: string, nova: string, confirmacao: string): Promise<Resposta> {
  const eu = await sessaoAtual()
  if (!eu) return { ok: false, erro: 'Sua sessão expirou. Entre de novo.' }

  if (nova.length < 10) {
    return { ok: false, erro: 'A senha nova precisa ter pelo menos 10 caracteres.' }
  }
  if (nova !== confirmacao) return { ok: false, erro: 'A confirmação não bate com a senha nova.' }
  if (nova === atual) return { ok: false, erro: 'A senha nova é igual à atual.' }

  const sb = await supabaseDaSessao()
  const { error: erroConfere } = await sb.auth.signInWithPassword({
    email: eu.email,
    password: atual,
  })
  if (erroConfere) return { ok: false, erro: 'A senha atual não confere.' }

  const { error } = await sb.auth.updateUser({ password: nova })
  if (error) return { ok: false, erro: error.message }

  return { ok: true, recado: 'Senha trocada. Ela já vale no próximo acesso.' }
}

// ── Gestão de usuários (só quem é dono) ────────────────────────────────────

export interface UsuarioDoErp {
  id: string
  nome: string
  email: string
  papel: 'dono' | 'operacao'
  ativo: boolean
  ultimoAcessoEm: string | null
}

async function exigirDono(): Promise<{ erro: string } | null> {
  const eu = await sessaoAtual()
  if (!eu) return { erro: 'Sua sessão expirou. Entre de novo.' }
  if (eu.papel !== 'dono') return { erro: 'Só quem é dono administra os acessos.' }
  if (!supabaseConfigurado()) return { erro: 'O Supabase precisa estar configurado.' }
  return null
}

export async function listarUsuarios(): Promise<UsuarioDoErp[]> {
  const eu = await sessaoAtual()
  if (!eu || eu.papel !== 'dono' || !supabaseConfigurado()) return []

  const { data, error } = await supabaseServer()
    .from('usuarios')
    .select('id, nome, email, papel, ativo, ultimo_acesso_em')
    .order('criado_em', { ascending: true })
  if (error) throw error

  return ((data ?? []) as Record<string, unknown>[]).map((u) => ({
    id: String(u.id),
    nome: String(u.nome),
    email: String(u.email),
    papel: u.papel as 'dono' | 'operacao',
    ativo: Boolean(u.ativo),
    ultimoAcessoEm: (u.ultimo_acesso_em as string | null) ?? null,
  }))
}

/**
 * Cria o acesso de alguém.
 *
 * O e-mail já entra confirmado: quem cria é o dono, dentro do sistema — exigir
 * que a pessoa confirme um link antes de trabalhar só adicionaria um passo que
 * falha em caixa de spam.
 */
export async function criarUsuario(dados: {
  nome: string
  email: string
  senha: string
  papel: 'dono' | 'operacao'
}): Promise<Resposta> {
  const barrado = await exigirDono()
  if (barrado) return { ok: false, erro: barrado.erro }

  const nome = dados.nome.trim()
  const email = dados.email.trim().toLowerCase()
  if (nome.length < 2) return { ok: false, erro: 'Informe o nome da pessoa.' }
  if (!/.+@.+\..+/.test(email)) return { ok: false, erro: 'Informe um e-mail válido.' }
  if (dados.senha.length < 10) {
    return { ok: false, erro: 'A senha inicial precisa ter pelo menos 10 caracteres.' }
  }

  const sb = supabaseServer()
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: dados.senha,
    email_confirm: true,
  })
  if (error || !data.user) {
    return { ok: false, erro: error?.message ?? 'O Supabase não criou a credencial.' }
  }

  const { error: erroPerfil } = await sb
    .from('usuarios')
    .insert({ id: data.user.id, nome, email, papel: dados.papel })
  if (erroPerfil) {
    // Sem perfil o acesso não vale nada e ainda ocuparia o e-mail: desfaz.
    await sb.auth.admin.deleteUser(data.user.id)
    return { ok: false, erro: erroPerfil.message }
  }

  revalidatePath('/configuracoes/usuarios')
  return { ok: true, recado: `${nome} já pode entrar. Passe a senha por um canal seguro.` }
}

/** Liga e desliga o acesso sem apagar o histórico de quem fez o quê. */
export async function alternarAtivo(id: string, ativo: boolean): Promise<Resposta> {
  const barrado = await exigirDono()
  if (barrado) return { ok: false, erro: barrado.erro }

  const eu = await sessaoAtual()
  if (eu?.id === id && !ativo) {
    return { ok: false, erro: 'Você não pode desativar o próprio acesso — ficaria de fora do sistema.' }
  }

  const { error } = await supabaseServer().from('usuarios').update({ ativo }).eq('id', id)
  if (error) return { ok: false, erro: error.message }

  revalidatePath('/configuracoes/usuarios')
  return { ok: true, recado: ativo ? 'Acesso reativado.' : 'Acesso desativado.' }
}

/** Redefine a senha de alguém que a perdeu. */
export async function redefinirSenha(id: string, nova: string): Promise<Resposta> {
  const barrado = await exigirDono()
  if (barrado) return { ok: false, erro: barrado.erro }
  if (nova.length < 10) return { ok: false, erro: 'A senha precisa ter pelo menos 10 caracteres.' }

  const { error } = await supabaseServer().auth.admin.updateUserById(id, { password: nova })
  if (error) return { ok: false, erro: error.message }

  return { ok: true, recado: 'Senha redefinida. Passe por um canal seguro e peça a troca no primeiro acesso.' }
}
