import { repositorio } from '@/data/repository'

import { ClientesCliente } from './ClientesCliente'

export default async function Clientes() {
  const clientes = await repositorio().clientes()
  return <ClientesCliente clientes={clientes} />
}
