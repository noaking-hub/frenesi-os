'use server'

import { revalidatePath } from 'next/cache'

import {
  cancelarCompraACaminho,
  ligarItemAoLote,
  receberItem,
  salvarCompraACaminho,
  type CompraParaGravar,
} from '@/data/compras-a-caminho'

/**
 * As ações da tela de compras a caminho.
 *
 * Cada uma revalida a própria página, e só ela: este módulo não move estoque,
 * então não há saldo em outra tela para invalidar. Quando o item virar lote,
 * quem revalida o estoque é a compra de frasco — o passo que a pessoa dá lá,
 * de propósito.
 */

function atualizarTela() {
  revalidatePath('/estoque/a-caminho')
}

export async function salvarCompra(c: CompraParaGravar) {
  const r = await salvarCompraACaminho(c)
  if (r.ok) atualizarTela()
  return r
}

export async function marcarRecebido(itemId: string, quantidade: number, ocorrencia?: string | null) {
  const r = await receberItem(itemId, quantidade, ocorrencia)
  if (r.ok) atualizarTela()
  return r
}

export async function vincularLote(itemId: string, loteId: string | null) {
  const r = await ligarItemAoLote(itemId, loteId)
  if (r.ok) atualizarTela()
  return r
}

export async function cancelarCompra(id: string, motivo: string) {
  const r = await cancelarCompraACaminho(id, motivo)
  if (r.ok) atualizarTela()
  return r
}
