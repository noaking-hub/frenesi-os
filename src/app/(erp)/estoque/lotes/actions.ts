'use server'

import { revalidatePath } from 'next/cache'

import { operadorAtual } from '@/data/operador'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

export type RespostaCompra = { ok: true; loteId: string } | { ok: false; erro: string }

/**
 * Registra a compra de um frasco chamando `registrar_compra()` no banco:
 * UMA ação que gera o lote, a movimentação de entrada e atualiza volume e
 * custo médio ponderado da base — nunca três escritas soltas.
 */
export async function registrarCompra(dados: {
  baseId: string
  volumeMl: number
  custoTotal: number
  fornecedor: string
}): Promise<RespostaCompra> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para registrar compras.' }
  }
  if (!dados.baseId) return { ok: false, erro: 'Escolha o perfume base.' }
  if (!(dados.volumeMl > 0)) return { ok: false, erro: 'Informe o volume comprado em ml.' }
  if (!(dados.custoTotal > 0)) return { ok: false, erro: 'Informe o custo total da compra.' }
  if (!dados.fornecedor.trim()) return { ok: false, erro: 'Informe o fornecedor.' }

  const { data, error } = await supabaseServer().rpc('registrar_compra', {
    p_base_id: dados.baseId,
    p_volume_ml: dados.volumeMl,
    p_custo_total: dados.custoTotal,
    p_fornecedor: dados.fornecedor.trim(),
    p_operador: await operadorAtual(),
  })
  if (error) {
    console.error('[compras] registrar_compra falhou:', error)
    return { ok: false, erro: error.message || error.details || 'Falha ao registrar a compra.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, loteId: String(data) }
}

export type RespostaEncerramento = { ok: true; perdaMl: number } | { ok: false; erro: string }

/**
 * Declara o frasco vazio chamando `encerrar_lote()`: fecha o lote, baixa a
 * perda real do estoque e lança o ajuste, tudo numa transação. É aqui que a
 * perda deixa de ser o parâmetro estimado e passa a ser medida.
 */
export async function encerrarLote(loteId: string): Promise<RespostaEncerramento> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para encerrar lotes.' }
  }
  if (!loteId) return { ok: false, erro: 'Escolha o lote a encerrar.' }

  const { data, error } = await supabaseServer().rpc('encerrar_lote', {
    p_lote_id: loteId,
    p_operador: await operadorAtual(),
  })
  if (error) {
    console.error('[lotes] encerrar_lote falhou:', error)
    return { ok: false, erro: error.message || error.details || 'Falha ao encerrar o lote.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, perdaMl: Number(data) }
}

export type RespostaEstorno = { ok: true } | { ok: false; erro: string }

/**
 * Desfaz uma compra lançada por engano chamando `estornar_compra()`: devolve
 * volume e custo médio ao que eram e apaga o lote, deixando o ajuste na
 * trilha de movimentações. O banco recusa lote encerrado ou com saídas —
 * nesses o estorno falsificaria histórico de produção e venda.
 */
export async function estornarCompra(loteId: string): Promise<RespostaEstorno> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para estornar compras.' }
  }
  if (!loteId) return { ok: false, erro: 'Escolha o lote a estornar.' }

  const { error } = await supabaseServer().rpc('estornar_compra', {
    p_lote_id: loteId,
    p_operador: await operadorAtual(),
  })
  if (error) {
    console.error('[lotes] estornar_compra falhou:', error)
    return { ok: false, erro: error.message || error.details || 'Falha ao estornar a compra.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

export type RespostaSaida = { ok: true; saldoMl: number } | { ok: false; erro: string }

/**
 * Baixa ml de um lote fora do fluxo de produção.
 *
 * Existe por causa da virada para o ERP: frasco comprado antes, do qual parte
 * já tinha sido vendida. Sem lançar essa saída, o volume só sumiria ao
 * declarar o frasco vazio — e seria contado como PERDA TÉCNICA, que entra no
 * custo de todo preço calculado.
 */
export async function registrarSaidaLote(dados: {
  loteId: string
  volumeMl: number
  motivo: string
  unidades?: number | null
  variante?: number | null
}): Promise<RespostaSaida> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para lançar saídas.' }
  }
  if (!dados.loteId) return { ok: false, erro: 'Escolha o lote.' }
  if (!(dados.volumeMl > 0)) return { ok: false, erro: 'Informe o volume que saiu, em ml.' }
  if (!dados.motivo.trim()) return { ok: false, erro: 'Informe o motivo da saída.' }

  const { data, error } = await supabaseServer().rpc('registrar_saida_lote', {
    p_lote_id: dados.loteId,
    p_ml: dados.volumeMl,
    p_motivo: dados.motivo.trim(),
    p_unidades: dados.unidades ?? null,
    p_variante: dados.variante ?? null,
    p_operador: await operadorAtual(),
  })
  if (error) {
    console.error('[lotes] registrar_saida_lote falhou:', error)
    return { ok: false, erro: error.message || error.details || 'Falha ao lançar a saída.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, saldoMl: Number(data) }
}

/**
 * Corrige uma saída lançada à mão.
 *
 * Quem digita erra: 5 ml viram 50, o motivo sai trocado. Sem correção, o
 * número errado fica no extrato inflando o consumido do lote — e, no
 * encerramento, distorce a perda real medida, que é o número que entra no
 * custo de todo preço calculado.
 */
export async function editarSaidaLote(dados: {
  saidaId: string
  volumeMl: number
  motivo: string
}): Promise<RespostaSaida> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para corrigir saídas.' }
  }
  if (!dados.saidaId) return { ok: false, erro: 'Escolha a saída a corrigir.' }
  if (!(dados.volumeMl > 0)) return { ok: false, erro: 'Informe o volume que saiu, em ml.' }
  if (!dados.motivo.trim()) return { ok: false, erro: 'Informe o motivo da saída.' }

  const { data, error } = await supabaseServer().rpc('editar_saida_lote', {
    p_saida_id: dados.saidaId,
    p_ml: dados.volumeMl,
    p_motivo: dados.motivo.trim(),
    p_operador: await operadorAtual(),
  })
  if (error) {
    console.error('[lotes] editar_saida_lote falhou:', error)
    return { ok: false, erro: error.message || error.details || 'Falha ao corrigir a saída.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, saldoMl: Number(data) }
}

/** Apaga uma saída lançada à mão e devolve o volume ao estoque. */
export async function estornarSaidaLote(saidaId: string): Promise<RespostaSaida> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para estornar saídas.' }
  }
  if (!saidaId) return { ok: false, erro: 'Escolha a saída a estornar.' }

  const { data, error } = await supabaseServer().rpc('estornar_saida_lote', {
    p_saida_id: saidaId,
    p_operador: await operadorAtual(),
  })
  if (error) {
    console.error('[lotes] estornar_saida_lote falhou:', error)
    return { ok: false, erro: error.message || error.details || 'Falha ao estornar a saída.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, saldoMl: Number(data) }
}

export type RespostaParametro = { ok: true } | { ok: false; erro: string }

/**
 * Leva o parâmetro de perda ao que os lotes encerrados mediram. Grava uma
 * nova vigência em vez de editar a atual — o preço de ontem continua
 * explicável pelo parâmetro de ontem.
 */
export async function ajustarPerdaParametro(perdaPct: number): Promise<RespostaParametro> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para ajustar parâmetros.' }
  }
  if (!Number.isFinite(perdaPct) || perdaPct < 0 || perdaPct >= 100) {
    return { ok: false, erro: 'Percentual de perda fora da faixa aceitável.' }
  }

  const { error } = await supabaseServer().rpc('ajustar_perda_parametro', {
    p_perda_pct: Number(perdaPct.toFixed(3)),
    p_operador: await operadorAtual(),
  })
  if (error) {
    console.error('[lotes] ajustar_perda_parametro falhou:', error)
    return { ok: false, erro: error.message || error.details || 'Falha ao ajustar o parâmetro.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
