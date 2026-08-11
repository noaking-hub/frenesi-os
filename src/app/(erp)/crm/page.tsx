import { carregarPerfisClientes } from '@/data/perfis-clientes'

import { ClientesCliente } from './ClientesCliente'

export const dynamic = 'force-dynamic'

export default async function Clientes() {
  const perfis = await carregarPerfisClientes()
  return <ClientesCliente perfis={perfis} />
}
