import { notFound } from 'next/navigation'

import { produto360 } from '@/data/consultas'
import { repositorio } from '@/data/repository'
import { avaliarProduto } from '@/domain'

import { Produto360Cliente } from './Produto360Cliente'

export const dynamic = 'force-dynamic'

/**
 * Produto 360º — a tela detalhada do perfume-base, principal evolução do
 * módulo no escopo: cadastro, variantes, estoque, custos, vendas,
 * integrações e histórico num lugar só, sem duplicar operação de Estoque ou
 * Produção (aqui só se LÊ; movimentar é lá).
 */
export default async function Produto360({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const baseId = decodeURIComponent(id)

  const repo = repositorio()
  const [bases, derivados, parametros, dados] = await Promise.all([
    repo.perfumesBaseTodos(),
    repo.produtosDerivados(),
    repo.parametros(),
    produto360(baseId),
  ])

  const base = bases.find((b) => b.id === baseId)
  if (!base) notFound()

  return (
    <Produto360Cliente
      avaliacao={avaliarProduto(base, derivados, parametros)}
      dados={dados}
    />
  )
}
