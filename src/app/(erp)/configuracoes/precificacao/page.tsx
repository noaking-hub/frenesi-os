import { carregarLotes } from '@/data/consultas'
import { custoPorMeio } from '@/data/extrato'
import { repositorio } from '@/data/repository'

import { CustoDeReceber } from './CustoDeReceber'
import { ParametrosCliente } from './ParametrosCliente'
import { RateioMarketing } from './RateioMarketing'

export const dynamic = 'force-dynamic'

export default async function ParametrosPrecificacao() {
  const repo = repositorio()
  const [parametros, lotes, receita, meios] = await Promise.all([
    repo.parametros(),
    carregarLotes(),
    repo.receitaMensal(),
    custoPorMeio(),
  ])

  // A perda real medida nos lotes encerrados entra como referência do campo
  // "Perda técnica" — é a MESMA média da tela de Lotes, não outra conta.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <CustoDeReceber parametros={parametros} meios={meios} />
      <RateioMarketing parametros={parametros} receita={receita} />
      <ParametrosCliente parametros={parametros} perdaRealMedia={lotes.perda.mediaPct} />
    </div>
  )
}
