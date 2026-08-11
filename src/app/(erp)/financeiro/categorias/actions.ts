'use server'

import { revalidatePath } from 'next/cache'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

export type RespostaRegra = { ok: true; mensagem: string } | { ok: false; erro: string }

/**
 * Cria a regra e já varre o extrato: quem cadastra o motoboy quer ver as
 * linhas dele classificadas agora, não na próxima importação.
 */
export async function criarRegraCategoria(
  padrao: string,
  categoria: string,
): Promise<RespostaRegra> {
  if (!supabaseConfigurado()) return { ok: false, erro: 'Supabase não configurado.' }
  const texto = padrao.trim()
  if (texto.length < 4) {
    return { ok: false, erro: 'O padrão precisa de pelo menos 4 letras — curto demais casaria com tudo.' }
  }
  try {
    const sb = supabaseServer()
    const { error } = await sb.from('regras_categoria').insert({ padrao: texto, categoria })
    if (error) throw error
    const { data } = await sb.rpc('aplicar_regras_categoria')
    const aplicadas = Number((data as { aplicadas?: number } | null)?.aplicadas ?? 0)
    revalidatePath('/financeiro/categorias')
    revalidatePath('/financeiro/extrato')
    return {
      ok: true,
      mensagem: aplicadas
        ? `Regra criada — ${aplicadas} movimento(s) do extrato já classificados por ela.`
        : 'Regra criada. Vale para tudo que chegar daqui em diante.',
    }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

export async function removerRegraCategoria(id: string): Promise<RespostaRegra> {
  if (!supabaseConfigurado()) return { ok: false, erro: 'Supabase não configurado.' }
  try {
    const { error } = await supabaseServer().from('regras_categoria').delete().eq('id', id)
    if (error) throw error
    revalidatePath('/financeiro/categorias')
    return { ok: true, mensagem: 'Regra removida. Lançamentos já criados por ela continuam.' }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}
