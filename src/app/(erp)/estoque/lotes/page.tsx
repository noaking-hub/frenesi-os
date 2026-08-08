import { EstadoVazio } from '@/components/erp/primitivos'
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

  // Sem lote registrado não há perda a apurar — melhor dizer do que quebrar.
  if (lotes.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhum lote registrado"
        instrucao="Registre a compra de um frasco de perfume base para acompanhar a perda real."
      />
    )
  }

  return (
    <LotesCliente
      lotes={lotes}
      parametros={parametros}
      perda={perda}
      conciliacao={conciliacao}
    />
  )
}
