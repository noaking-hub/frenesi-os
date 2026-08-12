import { EstadoVazio } from '@/components/erp/primitivos'
import { carteirasYampi, metricasDoPeriodo } from '@/data/cashback'
import { yampiConfigurada } from '@/data/yampi'
import type { Periodo } from '@/domain'

import { CashbackCliente } from './CashbackCliente'

export const dynamic = 'force-dynamic'

const PERIODO_INICIAL: Periodo = 'mes'

export default async function Cashback() {
  if (!yampiConfigurada()) {
    return (
      <EstadoVazio
        titulo="Yampi não configurada"
        instrucao="O cashback é gerido pelo checkout da Yampi — o ERP espelha as carteiras de lá. Configure as credenciais no .env.local."
      />
    )
  }
  const [{ carteiras, ultimaSincronizacao }, metricas] = await Promise.all([
    carteirasYampi(),
    metricasDoPeriodo(PERIODO_INICIAL),
  ])
  return (
    <CashbackCliente
      carteiras={carteiras}
      ultimaSincronizacao={ultimaSincronizacao}
      metricasIniciais={metricas}
      periodoInicial={PERIODO_INICIAL}
    />
  )
}
