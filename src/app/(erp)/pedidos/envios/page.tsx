import { carregarPedidos } from '@/data/consultas'
import { avisosDePedidoLigados } from '@/data/notificacoes'
import { sessaoAtual } from '@/data/sessao'
import { shopifyConfigurada } from '@/data/shopify'

import { EnviosCliente } from './EnviosCliente'

export const dynamic = 'force-dynamic'

export default async function RastreamentoEEntregas() {
  const [itens, sessao] = await Promise.all([carregarPedidos(), sessaoAtual()])

  // Esta tela começa onde a expedição termina: só entra pedido que já tem
  // código, já saiu ou é entrega local. O que ainda está na fila de expedição
  // pertence a Todos os pedidos — e é a MESMA fonte de dados nas duas telas,
  // para elas nunca discordarem sobre um pedido.
  const relevantes = itens.filter(
    (i) =>
      i.pedido.rastreio ||
      i.pedido.situacao === 'enviado' ||
      i.pedido.situacao === 'entregue' ||
      i.pedido.entregaLocal,
  )

  return (
    <EnviosCliente
      itens={relevantes}
      shopifyLigada={shopifyConfigurada()}
      avisosLigados={avisosDePedidoLigados()}
      // Pré-preenche com quem está logado: o teste é para si mesmo, e digitar
      // o próprio e-mail toda vez é atrito sem motivo.
      emailDoOperador={sessao?.email ?? null}
    />
  )
}
