import { EstadoVazio } from '@/components/erp/primitivos'
import { carteirasYampi } from '@/data/cashback'
import { yampiConfigurada } from '@/data/yampi'

import { CashbackCliente } from './CashbackCliente'

export const dynamic = 'force-dynamic'

export default async function Cashback() {
  if (!yampiConfigurada()) {
    return (
      <EstadoVazio
        titulo="Yampi não configurada"
        instrucao="O cashback é gerido pelo checkout da Yampi — o ERP espelha as carteiras de lá. Configure as credenciais no .env.local."
      />
    )
  }
  const { carteiras, ultimaSincronizacao } = await carteirasYampi()
  return <CashbackCliente carteiras={carteiras} ultimaSincronizacao={ultimaSincronizacao} />
}
