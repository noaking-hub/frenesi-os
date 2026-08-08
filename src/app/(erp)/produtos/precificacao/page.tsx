import { EstadoVazio } from '@/components/erp/primitivos'
import { repositorio } from '@/data/repository'

import { PrecificacaoCliente } from './PrecificacaoCliente'

export default async function Precificacao() {
  const repo = repositorio()
  const [bases, parametros, precos] = await Promise.all([
    repo.perfumesBase(),
    repo.parametros(),
    repo.precoPraticado(),
  ])

  // Sem perfume base não há o que precificar — a tela diz isso em vez de quebrar.
  if (bases.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhum perfume base cadastrado"
        instrucao="Cadastre o primeiro perfume em Produtos → Catálogo para calcular preços."
      />
    )
  }

  return <PrecificacaoCliente bases={bases} parametros={parametros} precos={precos} />
}
