import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { repositorio } from '@/data/repository'
import { apurarInventario, brl, pad2, plural, volume } from '@/domain'

import { InventarioCliente } from './InventarioCliente'

/**
 * Estoque nunca pode vir do cache do build.
 *
 * Sem isto a página é pré-renderizada no deploy e congela: reserva muda a
 * cada pedido pago, baixa muda a cada faturamento, e a tela mostraria o
 * saldo de horas atrás com cara de saldo atual.
 */
export const dynamic = 'force-dynamic'


export default async function Inventario() {
  const repo = repositorio()
  const [contagens, bases, aberto] = await Promise.all([
    repo.inventario(),
    repo.perfumesBase(),
    repo.inventarioAberto(),
  ])
  const inv = apurarInventario(contagens)

  // Custo médio por ml ponderado pelo volume em estoque — não é constante.
  const volumeTotal = bases.reduce((a, b) => a + b.volumeMl, 0)
  const custoMedioPorMl = volumeTotal
    ? bases.reduce((a, b) => a + b.volumeMl * b.custoPorMl, 0) / volumeTotal
    : 0

  const kpis: Kpi[] = [
    {
      label: 'Bases contadas',
      valor: `${inv.contadas} de ${inv.total}`,
      hint: !aberto
        ? 'Nenhuma contagem aberta'
        : inv.pendentes
          ? plural(inv.pendentes, 'base ainda sem contagem', 'bases ainda sem contagem')
          : 'Contagem completa',
      tom: !aberto ? 'neutro' : inv.pendentes ? 'atencao' : 'ok',
    },
    {
      label: 'Sem divergência',
      valor: pad2(inv.semDivergencia),
      hint: 'Sistema bate com o físico',
      tom: 'ok',
    },
    {
      label: 'Com divergência',
      valor: pad2(inv.divergentes),
      hint: inv.divergentes ? 'Precisa de ajuste no estoque' : 'Nada a ajustar',
      tom: inv.divergentes ? 'erro' : 'ok',
    },
    {
      label: 'Diferença líquida',
      valor: `${inv.diferencaLiquidaMl >= 0 ? '+' : '−'} ${volume(Math.abs(inv.diferencaLiquidaMl))}`,
      hint: 'Contado menos sistema',
      tom: inv.diferencaLiquidaMl === 0 ? 'ok' : 'erro',
    },
    {
      label: 'Impacto no custo',
      valor: brl(Math.abs(inv.diferencaLiquidaMl) * custoMedioPorMl),
      hint: custoMedioPorMl
        ? `Pelo custo médio de ${brl(custoMedioPorMl)}/ml`
        : 'Sem custo cadastrado nas bases',
      tom: inv.diferencaLiquidaMl === 0 ? 'ok' : 'erro',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />
      <InventarioCliente inv={inv} aberto={aberto} />
    </div>
  )
}
