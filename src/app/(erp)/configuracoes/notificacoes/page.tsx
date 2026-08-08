import { repositorio } from '@/data/repository'

import { NotificacoesCliente } from './NotificacoesCliente'

export default async function Notificacoes() {
  const regras = await repositorio().notificacoes()
  return <NotificacoesCliente regras={regras} />
}
