import { repositorio } from '@/data/repository'

import { CarrinhosCliente } from './CarrinhosCliente'

export default async function Carrinhos() {
  const carrinhos = await repositorio().carrinhos()
  return <CarrinhosCliente carrinhos={carrinhos} />
}
