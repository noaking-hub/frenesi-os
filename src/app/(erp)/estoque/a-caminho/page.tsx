import { lerComprasACaminho } from '@/data/compras-a-caminho'
import { repositorio } from '@/data/repository'
import { hojeEmSaoPaulo } from '@/domain'

import { ACaminhoCliente } from './ACaminhoCliente'

/**
 * O que foi comprado e ainda não chegou.
 *
 * Sem cache de build: "atrasada" depende do dia de hoje, e uma página
 * pré-renderizada no deploy congelaria a data — a compra continuaria "a
 * caminho" uma semana depois do prazo.
 */
export const dynamic = 'force-dynamic'

export default async function ComprasACaminho() {
  const [compras, bases] = await Promise.all([lerComprasACaminho(), repositorio().perfumesBase()])
  return <ACaminhoCliente compras={compras} bases={bases} hoje={hojeEmSaoPaulo()} />
}
