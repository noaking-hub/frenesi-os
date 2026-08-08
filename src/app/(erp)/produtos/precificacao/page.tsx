import { repositorio } from '@/data/repository'

import { PrecificacaoCliente } from './PrecificacaoCliente'

export default async function Precificacao() {
  const repo = repositorio()
  const [bases, parametros, precos] = await Promise.all([
    repo.perfumesBase(),
    repo.parametros(),
    repo.precoPraticado(),
  ])

  return <PrecificacaoCliente bases={bases} parametros={parametros} precos={precos} />
}
