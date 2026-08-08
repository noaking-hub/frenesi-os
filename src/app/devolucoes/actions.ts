'use server'

import { repositorio } from '@/data/repository'
import type { Pedido } from '@/domain'

/**
 * Busca os pedidos do cliente pelo e-mail ou CPF informado no passo 1.
 *
 * A elegibilidade NÃO é decidida aqui: o portal aplica `statusDevolucao` sobre
 * os dias desde a entrega, a mesma função que o ERP usa. Assim o cliente e o
 * operador nunca veem prazos diferentes para o mesmo pedido.
 */
export async function buscarPedidos(
  metodo: 'email' | 'cpf',
  identificacao: string,
): Promise<Pedido[]> {
  const alvo =
    metodo === 'cpf'
      ? identificacao.replace(/\D/g, '')
      : identificacao.trim().toLowerCase()

  if (!alvo) return []

  const pedidos = await repositorio().pedidos()

  return pedidos
    .filter((p) => (metodo === 'cpf' ? p.cpf === alvo : p.email.toLowerCase() === alvo))
    .sort((a, b) => b.id.localeCompare(a.id))
}
