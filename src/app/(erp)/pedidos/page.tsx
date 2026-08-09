import { carregarPedidos } from '@/data/consultas'
import { shopifyConfigurada } from '@/data/shopify'

import { ImportarPedidos } from './ImportarPedidos'
import { PedidosCliente } from './PedidosCliente'

export default async function Pedidos() {
  const itens = await carregarPedidos()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ImportarPedidos configurada={shopifyConfigurada()} total={itens.length} />
      <PedidosCliente itens={itens} />
    </div>
  )
}
