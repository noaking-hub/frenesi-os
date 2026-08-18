'use server'

import { revalidatePath } from 'next/cache'

import { operadorAtual } from '@/data/operador'
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
    p_frasco: v.frasco,
    p_valvula: v.valvula,
    p_tampa: v.tampa,
    p_etiqueta: v.etiqueta,
    p_caixa: v.caixa,
    p_plastico_bolha: v.plasticoBolha,
    p_sacola_antifraude: v.sacolaAntifraude,
    p_frete_subsidio: v.freteSubsidio,
    p_antifraude: v.antifraude,
    p_perda_pct: v.perdaPct,
    p_margem_alvo: v.margemAlvo,
    p_operador: await operadorAtual(),
    p_ads_mensal: v.adsMensal ?? null,
  })
  if (error) {
    console.error('[parametros] salvar_parametros falhou:', error)
    return { ok: false, erro: error.message || error.details || 'Falha ao salvar os parâmetros.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

export type RespostaAds = { ok: true } | { ok: false; erro: string }

/**
 * Grava o ADS derivado do gasto mensal, mantendo as demais taxas.
 *
 * Guarda o valor mensal junto com o percentual: é o que deixa o ERP avisar
 * quando os dois deixarem de bater. A receita muda todo mês, o percentual
 * não — sem o valor guardado ele envelheceria calado, e todo preço ficaria
 * com o marketing subestimado sem ninguém perceber.
 */
export async function ajustarAds(adsPct: number, gastoMensal: number): Promise<RespostaAds> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para salvar parâmetros.' }
  }
  if (!Number.isFinite(adsPct) || adsPct < 0 || adsPct >= 100) {
    return { ok: false, erro: 'Percentual de ADS fora da faixa aceitável.' }
  }
  if (!Number.isFinite(gastoMensal) || gastoMensal < 0) {
    return { ok: false, erro: 'Informe o gasto mensal com tráfego pago.' }
  }

  const { error } = await supabaseServer().rpc('ajustar_ads_parametro', {
    p_ads_pct: Number(adsPct.toFixed(3)),
    p_ads_mensal: Number(gastoMensal.toFixed(2)),
    p_operador: await operadorAtual(),
  })
  if (error) {
    console.error('[parametros] ajustar_ads_parametro falhou:', error)
    return { ok: false, erro: error.message || error.details || 'Falha ao ajustar o ADS.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Grava o custo de receber medido no extrato.
 *
 * Só o intermediador muda; o resto do parâmetro vigente é copiado pela função
 * do banco. Reescrever a linha inteira daqui obrigaria esta tela a conhecer
 * campos que ela não edita, e o primeiro esquecido zeraria um custo em
 * silêncio.
 */
export async function ajustarIntermediador(pct: number): Promise<RespostaAds> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para salvar parâmetros.' }
  }
  if (!Number.isFinite(pct) || pct < 0 || pct >= 100) {
    return { ok: false, erro: 'Percentual de intermediador fora da faixa aceitável.' }
  }

  const { error } = await supabaseServer().rpc('ajustar_intermediador_parametro', {
    p_intermediador_pct: Number(pct.toFixed(3)),
    p_operador: await operadorAtual(),
  })
  if (error) {
    console.error('[parametros] ajustar_intermediador_parametro falhou:', error)
    return { ok: false, erro: error.message || error.details || 'Falha ao ajustar o intermediador.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Grava o desconto de Pix do checkout e a fatia medida no extrato. */
export async function ajustarPix(descontoPct: number, fatiaPct: number): Promise<RespostaAds> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para salvar parâmetros.' }
  }
  if (!Number.isFinite(descontoPct) || descontoPct < 0 || descontoPct >= 100) {
    return { ok: false, erro: 'Desconto de Pix fora da faixa aceitável.' }
  }
  if (!Number.isFinite(fatiaPct) || fatiaPct < 0 || fatiaPct > 100) {
    return { ok: false, erro: 'Fatia de Pix fora da faixa aceitável.' }
  }

  const { error } = await supabaseServer().rpc('ajustar_pix_parametro', {
    p_desconto_pct: Number(descontoPct.toFixed(3)),
    p_fatia_pct: Number(fatiaPct.toFixed(3)),
    p_operador: await operadorAtual(),
  })
  if (error) {
    console.error('[parametros] ajustar_pix_parametro falhou:', error)
    return { ok: false, erro: error.message || error.details || 'Falha ao ajustar o Pix.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
