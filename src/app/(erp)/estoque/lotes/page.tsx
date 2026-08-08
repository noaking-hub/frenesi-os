import { EstadoVazio } from '@/components/erp/primitivos'
import { carregarLotes } from '@/data/consultas'
import { repositorio } from '@/data/repository'

import { CompraFrasco } from './CompraFrasco'
import { LotesCliente } from './LotesCliente'

export default async function LotesEPerdaReal() {
  const repo = repositorio()
  const [lotes, bases, parametros, { perda, conciliacao }] = await Promise.all([
    repo.lotes(),
    repo.perfumesBase(),
    repo.parametros(),
    carregarLotes(),
  ])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <CompraFrasco bases={bases} />

      {lotes.length === 0 ? (
        // Sem lote registrado não há perda a apurar — melhor dizer do que quebrar.
        <EstadoVazio
          titulo="Nenhum lote registrado"
          instrucao="Use “Registrar compra de frasco” acima — a compra cria o lote, dá entrada no volume e define o custo por ml."
        />
      ) : (
        <LotesCliente
          lotes={lotes}
          parametros={parametros}
          perda={perda}
          conciliacao={conciliacao}
        />
      )}
    </div>
  )
}
