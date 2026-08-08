import { carregarPedidos } from '@/data/consultas'

import { PedidosCliente } from './PedidosCliente'

export default async function Pedidos() {
  const itens = await carregarPedidos()
  return <PedidosCliente itens={itens} />
}
