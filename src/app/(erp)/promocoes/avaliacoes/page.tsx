import { repositorio } from '@/data/repository'

import { AvaliacoesCliente } from './AvaliacoesCliente'

export default async function Avaliacoes() {
  const avaliacoes = await repositorio().avaliacoesCupons()
  return <AvaliacoesCliente avaliacoes={avaliacoes} />
}
