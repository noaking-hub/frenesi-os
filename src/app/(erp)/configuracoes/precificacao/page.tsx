import { carregarLotes } from '@/data/consultas'
import { repositorio } from '@/data/repository'

import { ParametrosCliente } from './ParametrosCliente'
import { RateioMarketing } from './RateioMarketing'

export default async function ParametrosPrecificacao() {
  const repo = repositorio()
  const [parametros, lotes, receita] = await Promise.all([
    repo.parametros(),
    carregarLotes(),
    repo.receitaMensal(),
  ])

  // A perda real medida nos lotes encerrados entra como referência do campo
  // "Perda técnica" — é a MESMA média da tela de Lotes, não outra conta.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <RateioMarketing parametros={parametros} receita={receita} />
      <ParametrosCliente parametros={parametros} perdaRealMedia={lotes.perda.mediaPct} />
    </div>
  )
}
