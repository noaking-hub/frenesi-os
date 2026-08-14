import { carregarLotes } from '@/data/consultas'
import { repositorio } from '@/data/repository'

import { ProducaoCliente } from './ProducaoCliente'

/**
 * Estoque nunca pode vir do cache do build.
 *
 * Sem isto a página é pré-renderizada no deploy e congela: reserva muda a
 * cada pedido pago, baixa muda a cada faturamento, e a tela mostraria o
 * saldo de horas atrás com cara de saldo atual.
 */
export const dynamic = 'force-dynamic'


export default async function Producao() {
  const repo = repositorio()
  const [ordens, bases, parametros, movimentacoes, { perda }] = await Promise.all([
    repo.ordens(),
    repo.perfumesBase(),
    repo.parametros(),
    repo.movimentacoes(),
    carregarLotes(),
  ])

  // Custo do volume baixado em produção: cada saída ao custo por ml da base.
  // Derivado do extrato, não um número à parte.
  const custoProduzido = movimentacoes
    .filter((m) => m.tipo === 'saida')
    .reduce((a, m) => {
      const base = bases.find((b) => b.id === m.baseId)
      return a + Math.abs(m.volumeMl) * (base?.custoPorMl ?? 0)
    }, 0)

  return (
    <ProducaoCliente
      ordens={ordens}
      bases={bases}
      parametros={parametros}
      movimentacoes={movimentacoes}
      perda={perda}
      custoProduzido={custoProduzido}
    />
  )
}
