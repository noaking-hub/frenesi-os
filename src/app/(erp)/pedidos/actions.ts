'use server'

import { revalidatePath } from 'next/cache'

import { derivarConsumoDiario, importarPedidosShopify, mensagemDe } from '@/data/shopify'
import type { ResultadoPedidos } from '@/data/shopify'

export type RespostaPedidos =
  | { ok: true; resultado: ResultadoPedidos & { basesComConsumo: number } }
  | { ok: false; erro: string }

/**
 * Importa os pedidos da Shopify e, na sequência, deriva o consumo diário de
 * cada base das vendas pagas.
 *
 * As duas coisas andam juntas de propósito: o consumo é o que sustenta a
 * cobertura ("acaba em X dias") em Estoque e a fila de reposição. Importar
 * venda sem recalcular consumo deixaria a cobertura apontando para um número
 * digitado à mão, agora desatualizado.
 */
export async function importarPedidos(dias = 60): Promise<RespostaPedidos> {
  try {
    const resultado = await importarPedidosShopify(dias)
    const { bases } = await derivarConsumoDiario(30)
    revalidatePath('/', 'layout')
    return { ok: true, resultado: { ...resultado, basesComConsumo: bases } }
  } catch (e) {
    console.error('[shopify] importação de pedidos falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}
