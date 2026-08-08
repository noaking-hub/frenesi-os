import { repositorio } from '@/data/repository'

import { LogsCliente } from './LogsCliente'

export default async function Logs() {
  const registros = await repositorio().auditoria()
  return <LogsCliente registros={registros} />
}
