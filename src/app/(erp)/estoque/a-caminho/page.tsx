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
  const repo = repositorio()
  const [compras, bases, lotes] = await Promise.all([
    lerComprasACaminho(),
    repo.perfumesBase(),
    repo.lotes(),
  ])
  return <ACaminhoCliente compras={compras} bases={bases} lotes={lotes} hoje={hojeEmSaoPaulo()} />
}
