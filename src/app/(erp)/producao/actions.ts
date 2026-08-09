'use server'

import { revalidatePath } from 'next/cache'

import { OPERADOR } from '@/data/operador'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

export type RespostaOrdem = { ok: true; ordemId: string } | { ok: false; erro: string }
export type RespostaEnvase = { ok: true; baixadoMl: number } | { ok: false; erro: string }

function mensagem(e: { message?: string; details?: string }, padrao: string): string {
  return e.message || e.details || padrao
}

/**
 * Abre a ordem de envase. Não mexe no estoque: enquanto o decant não foi
 * envasado, o líquido continua na base.
 */
export async function abrirOrdem(dados: {
  baseId: string
  variante: number
  quantidade: number
  motivo: string
}): Promise<RespostaOrdem> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para abrir ordens.' }
  }
  if (!dados.baseId) return { ok: false, erro: 'Escolha o perfume base.' }
  if (!(dados.quantidade > 0)) return { ok: false, erro: 'Informe a quantidade a produzir.' }

  const { data, error } = await supabaseServer().rpc('abrir_ordem_producao', {
    p_base_id: dados.baseId,
    p_variante: dados.variante,
    p_quantidade: Math.floor(dados.quantidade),
    p_motivo: dados.motivo.trim() || 'Ordem manual',
    p_responsavel: OPERADOR,
  })
  if (error) {
    console.error('[producao] abrir_ordem_producao falhou:', error)
    return { ok: false, erro: mensagem(error, 'Falha ao abrir a ordem.') }
  }

  revalidatePath('/', 'layout')
  return { ok: true, ordemId: String(data) }
}

/**
 * Conclui o envase — a única ação da tela que move estoque. Baixa o líquido
 * da base, rateia o consumo nos lotes abertos, lança a saída e faz os decants
 * existirem como unidades vendáveis.
 */
export async function concluirEnvase(
  ordemId: string,
  envasadas: number,
): Promise<RespostaEnvase> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para concluir ordens.' }
  }
  if (!ordemId) return { ok: false, erro: 'Escolha a ordem a concluir.' }
  if (!(envasadas > 0)) return { ok: false, erro: 'Informe quantas unidades foram envasadas.' }

  const { data, error } = await supabaseServer().rpc('concluir_ordem_producao', {
    p_ordem_id: ordemId,
    p_envasadas: Math.floor(envasadas),
    p_operador: OPERADOR,
  })
  if (error) {
    console.error('[producao] concluir_ordem_producao falhou:', error)
    return { ok: false, erro: mensagem(error, 'Falha ao concluir o envase.') }
  }

  revalidatePath('/', 'layout')
  return { ok: true, baixadoMl: Number(data) }
}
