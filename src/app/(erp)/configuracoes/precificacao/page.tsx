import { carregarLotes } from '@/data/consultas'
import { repositorio } from '@/data/repository'

import { ParametrosCliente } from './ParametrosCliente'

export default async function ParametrosPrecificacao() {
  const [parametros, lotes] = await Promise.all([repositorio().parametros(), carregarLotes()])

  // A perda real medida nos lotes encerrados entra como referência do campo
  // "Perda técnica" — é a MESMA média da tela de Lotes, não outra conta.
  return <ParametrosCliente parametros={parametros} perdaRealMedia={lotes.perda.mediaPct} />
}
