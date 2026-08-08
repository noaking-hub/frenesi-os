import { repositorio } from '@/data/repository'

import { RodizioCliente } from './RodizioCliente'

export default async function Ofertas() {
  const repo = repositorio()
  const [vitrine, bases, parametros] = await Promise.all([
    repo.vitrine(),
    repo.perfumesBase(),
    repo.parametros(),
  ])
  return <RodizioCliente vitrine={vitrine} bases={bases} parametros={parametros} />
}
