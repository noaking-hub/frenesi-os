import { repositorio } from '@/data/repository'

import { DevolucoesCliente } from './DevolucoesCliente'

export default async function Devolucoes() {
  const solicitacoes = await repositorio().solicitacoes()
  return <DevolucoesCliente solicitacoes={solicitacoes} />
}
