import { repositorio } from '@/data/repository'

import { ClientesCliente } from './ClientesCliente'

export default async function Clientes() {
  const repo = repositorio()
  const [clientes, saldos] = await Promise.all([repo.clientes(), repo.saldosCashback()])
  return <ClientesCliente clientes={clientes} saldos={saldos} />
}
