import { repositorio } from '@/data/repository'

import { RegrasCliente } from './RegrasCliente'

export default async function Regras() {
  const regras = await repositorio().iaRegras()
  return <RegrasCliente regras={regras} />
}
