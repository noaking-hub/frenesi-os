import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { repositorio } from '@/data/repository'
import { brl, pad2, volume } from '@/domain'

import { CargaCliente } from './CargaCliente'

export default async function CargaInicial() {
  const bases = (await repositorio().perfumesBase()).filter((b) => b.ativo !== false)

  const comVolume = bases.filter((b) => b.volumeMl > 0)
  const semCusto = bases.filter((b) => b.volumeMl > 0 && b.custoPorMl <= 0)
  const mlTotal = bases.reduce((a, b) => a + b.volumeMl, 0)
  const valorEstoque = bases.reduce((a, b) => a + b.volumeMl * b.custoPorMl, 0)

  const kpis: Kpi[] = [
    {
      label: 'Bases com estoque',
      valor: `${comVolume.length} de ${bases.length}`,
      hint: comVolume.length
        ? `${bases.length - comVolume.length} ainda zeradas`
        : 'Nenhuma base tem volume — o ERP não consegue calcular nada ainda',
      tom: comVolume.length === 0 ? 'erro' : comVolume.length < bases.length ? 'atencao' : 'ok',
    },
    {
      label: 'Volume em estoque',
      valor: volume(mlTotal),
      hint: 'Soma de todos os frascos base',
      tom: mlTotal > 0 ? 'ok' : 'erro',
    },
    {
      label: 'Custo do estoque',
      valor: brl(valorEstoque),
      hint: 'Volume × custo por ml de cada base',
      tom: 'neutro',
    },
    {
      label: 'Com volume, sem custo',
      valor: pad2(semCusto.length),
      // Sem custo por ml a Precificação não tem de onde partir: o preço ideal
      // sai de um custo, e um custo zero devolveria margem infinita.
      hint: semCusto.length ? 'A Precificação não funciona nestas' : 'Toda base com volume tem custo',
      tom: semCusto.length ? 'erro' : 'ok',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />
      <CargaCliente bases={bases} />
    </div>
  )
}
