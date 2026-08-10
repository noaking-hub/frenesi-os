import { repositorio } from '@/data/repository'
import { shopifyConfigurada } from '@/data/shopify'
import { yampiConfigurada } from '@/data/yampi'

import { EnviosCliente } from './EnviosCliente'

export const dynamic = 'force-dynamic'

export default async function RastreamentoEEntregas() {
  const envios = await repositorio().envios()
  return (
    <EnviosCliente
      envios={envios}
      yampiLigada={yampiConfigurada()}
      shopifyLigada={shopifyConfigurada()}
    />
  )
}
