'use server'

import { revalidatePath } from 'next/cache'

import { OPERADOR } from '@/data/operador'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { sobraParaProduto } from '@/domain'
import type { ParametrosPrecificacao } from '@/domain'

export type RespostaParametros = { ok: true } | { ok: false; erro: string }

/**
 * Salva os parâmetros chamando `salvar_parametros()`, que grava uma NOVA
 * vigência em vez de sobrescrever a atual — o preço praticado ontem continua
 * explicável pelo parâmetro que valia ontem.
 */
export async function salvarParametros(v: ParametrosPrecificacao): Promise<RespostaParametros> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para salvar parâmetros.' }
  }

  const numeros = Object.values(v)
  if (numeros.some((n) => !Number.isFinite(n))) {
    return { ok: false, erro: 'Há campo em branco ou com valor inválido.' }
  }
  // Taxas + margem acima de 100% tornam o denominador do preço ideal
  // negativo: o preço "ideal" sairia negativo ou explodiria.
  if (sobraParaProduto(v) <= 0) {
    return {
      ok: false,
      erro: 'A soma das taxas com a margem alvo passa de 100%. Reduza a margem ou as taxas.',
    }
  }

  const { error } = await supabaseServer().rpc('salvar_parametros', {
    p_intermediador_pct: v.intermediadorPct,
    p_intermediador_fixo: v.intermediadorFixo,
    p_checkout_pct: v.checkoutPct,
    p_imposto_pct: v.impostoPct,
    p_ads_pct: v.adsPct,
    p_insumos: v.insumos,
    p_frete_subsidio: v.freteSubsidio,
    p_antifraude: v.antifraude,
    p_perda_pct: v.perdaPct,
    p_margem_alvo: v.margemAlvo,
    p_operador: OPERADOR,
  })
  if (error) {
    console.error('[parametros] salvar_parametros falhou:', error)
    return { ok: false, erro: error.message || error.details || 'Falha ao salvar os parâmetros.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
