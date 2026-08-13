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
 *
 * O controle não é retroativo, e isso é regra da operação, não limitação: só
 * entra o perfume cujo vidro lacrado teve a compra lançada AQUI. Perfume que
 * já era vendido antes do ERP não tem frasco registrado nem saldo — descontar
 * dele criaria negativo a partir de um número que nunca existiu. Duas guardas
 * garantem isso: os 609 pedidos anteriores à virada estão marcados como fora
 * do controle, e a função pula item cuja base não tem compra lançada.
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
    // Pedido anterior à virada nunca baixa: o perfume dele saiu de um frasco
    // que o ERP nunca viu, e descontá-lo criaria saldo negativo a partir de um
    // número que jamais existiu.
    .eq('estoque_fora_do_controle', false)
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

/**
 * Confirma a entrega em mãos e baixa o estoque na mesma transação.
 *
 * Entrega local não passa por faturamento — não sai nota — e nenhuma
 * transportadora vai confirmar o que a própria operação entregou. Sem esta
 * ação o pedido fica parado em "pago" para sempre, e o perfume que saiu do
 * frasco nunca sai do saldo. Eram 23 pedidos nessa situação quando o buraco
 * foi encontrado.
 */
export async function confirmarEntregaLocal(
  pedidoId: string,
  operador = 'Operação',
): Promise<{ ok: true; mlConsumido: number } | { ok: false; erro: string }> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado.' }
  }
  if (!pedidoId.trim()) return { ok: false, erro: 'Informe o pedido.' }

  const { data, error } = await supabaseServer().rpc('entregar_pedido_local', {
    p_pedido_id: pedidoId,
    p_operador: operador,
  })
  if (error) {
    console.error('[estoque] entregar_pedido_local falhou:', error)
    return { ok: false, erro: error.message || 'Falha ao confirmar a entrega.' }
  }
  return { ok: true, mlConsumido: Number(data) || 0 }
}
