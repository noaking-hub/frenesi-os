import 'server-only'

import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * A baixa de estoque que acontece no faturamento.
 *
 * O modelo antigo esperava um passo de produção entre a compra do frasco e a
 * venda: envasar tirava ml e criava decants prontos, e a venda baixava os
 * decants. A FRENESI fraciona sob demanda — não há decant na prateleira — e
 * esse passo nunca aconteceu: zero unidades envasadas em toda a história do
 * ERP, contra 1.373 itens vendidos. O ml só caía pelas correções manuais.
 *
 * Agora são dois passos: compra soma, faturamento tira. O trabalho pesado está
 * em `baixar_estoque_do_pedido()`, no banco, porque a baixa precisa ser
 * atômica: ou o pedido inteiro sai do estoque, ou nada sai. Item a item, uma
 * falha no terceiro perfume deixaria o pedido meio baixado e ninguém saberia
 * qual metade.
 */

export interface ResultadoBaixaEstoque {
  /** Pedidos faturados que ainda não tinham baixado estoque. */
  candidatos: number
  baixados: number
  mlConsumido: number
  falhas: { pedido: string; erro: string }[]
}

/**
 * Baixa o estoque dos pedidos que chegaram ao faturamento.
 *
 * Também cobre `enviado` e `entregue`: um pedido pode passar direto de pago a
 * enviado se a Yampi pular o status de faturamento, e esperar por um momento
 * que não vai acontecer deixaria o ml preso para sempre.
 *
 * Rodar de novo é seguro — a função no banco recusa pedido já baixado.
 */
export async function baixarEstoqueDosFaturados(limite = 100): Promise<ResultadoBaixaEstoque> {
  if (!supabaseConfigurado()) {
    throw new Error('O Supabase precisa estar configurado para baixar estoque.')
  }

  const sb = supabaseServer()
  const { data, error } = await sb
    .from('pedidos')
    .select('id')
    .in('situacao', ['faturado', 'enviado', 'entregue'])
    .is('estoque_baixado_em', null)
    .order('comprado_em', { ascending: true })
    .limit(limite)
  if (error) throw error

  const fila = (data ?? []) as { id: string }[]
  const resultado: ResultadoBaixaEstoque = {
    candidatos: fila.length,
    baixados: 0,
    mlConsumido: 0,
    falhas: [],
  }

  for (const p of fila) {
    try {
      const { data: ml, error: erroBaixa } = await sb.rpc('baixar_estoque_do_pedido', {
        p_pedido_id: p.id,
        p_operador: 'Faturamento automático',
      })
      if (erroBaixa) throw erroBaixa
      // Zero significa "já estava baixado" — não é falha, e contar como
      // sucesso inflaria o relatório da rodada.
      if (Number(ml) > 0) {
        resultado.baixados++
        resultado.mlConsumido += Number(ml)
      }
    } catch (e) {
      resultado.falhas.push({
        pedido: p.id,
        erro: e instanceof Error ? e.message : String(e),
      })
    }
  }

  resultado.mlConsumido = Math.round(resultado.mlConsumido * 10) / 10
  return resultado
}

export interface AcertoHistorico {
  pedidos: number
  mlPorBase: { base: string; perfume: string; ml: number }[]
  mlTotal: number
}

/**
 * Quanto ml as vendas antigas consumiram e o estoque nunca baixou.
 *
 * Só CALCULA — não escreve nada. O acerto de um passivo de meses é decisão de
 * quem responde pelo estoque, e um número desses precisa ser olhado antes de
 * virar movimentação. `baixarEstoqueDosFaturados` faz o lançamento quando a
 * operação mandar.
 */
export async function calcularAcertoHistorico(): Promise<AcertoHistorico> {
  if (!supabaseConfigurado()) throw new Error('O Supabase precisa estar configurado.')

  const { data, error } = await supabaseServer().rpc('estoque_nao_baixado')
  if (error) throw error

  const linhas = (data ?? []) as { base_id: string; perfume: string; ml: number }[]
  return {
    pedidos: linhas.length ? Number((linhas[0] as unknown as { pedidos: number }).pedidos ?? 0) : 0,
    mlPorBase: linhas.map((l) => ({ base: l.base_id, perfume: l.perfume, ml: Number(l.ml) })),
    mlTotal: Math.round(linhas.reduce((s, l) => s + Number(l.ml), 0) * 10) / 10,
  }
}
