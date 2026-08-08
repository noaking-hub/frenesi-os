import { carregarLotes } from '@/data/consultas'
import { repositorio } from '@/data/repository'

import { LotesCliente } from './LotesCliente'

export default async function LotesEPerdaReal() {
  const repo = repositorio()
  const [lotes, parametros, { perda, conciliacao }] = await Promise.all([
    repo.lotes(),
    repo.parametros(),
    carregarLotes(),
  ])

  return (
    <LotesCliente
      lotes={lotes}
      parametros={parametros}
      perda={perda}
      conciliacao={conciliacao}
    />
  )
}
