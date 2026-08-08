import { repositorio } from '@/data/repository'

import { EnviosCliente } from './EnviosCliente'

export default async function RastreamentoEEntregas() {
  const envios = await repositorio().envios()
  return <EnviosCliente envios={envios} />
}
