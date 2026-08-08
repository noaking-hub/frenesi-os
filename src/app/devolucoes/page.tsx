import type { Metadata } from 'next'

import { PortalDevolucoes } from './PortalDevolucoes'

export const metadata: Metadata = {
  title: 'Devoluções · FRENESI',
  description: 'Abra a devolução do seu pedido em poucos passos.',
}

export default function Devolucoes() {
  // Os pedidos só são carregados depois que o cliente se identifica no passo 1
  // (server action `buscarPedidos`) — nada de pedido de terceiro no HTML inicial.
  return <PortalDevolucoes />
}
