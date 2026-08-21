import { carregarPedidos } from '@/data/consultas'
import { avisosDePedidoLigados } from '@/data/notificacoes'
import { sessaoAtual } from '@/data/sessao'
import { shopifyConfigurada } from '@/data/shopify'

import { pedidosAguardandoRastreio } from './actions'
import { EnviosCliente } from './EnviosCliente'
import { FilaDeRastreio } from './FilaDeRastreio'

export const dynamic = 'force-dynamic'

export default async function RastreamentoEEntregas() {
  const [itens, sessao, pendentes] = await Promise.all([
    carregarPedidos(),
    sessaoAtual(),
    pedidosAguardandoRastreio(),
  ])

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

  // A fila de digitação vem ANTES da tela: ela é a lista do que ainda não
  // entrou aqui. O filtro acima exige código — sem esta seção, justamente os
  // pedidos que precisam de ação seriam os únicos invisíveis na tela de
  // envios, que é onde alguém os procuraria.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      <FilaDeRastreio pendentes={pendentes} />
      <EnviosCliente
        itens={relevantes}
        shopifyLigada={shopifyConfigurada()}
        avisosLigados={avisosDePedidoLigados()}
        // Pré-preenche com quem está logado: o teste é para si mesmo, e digitar
        // o próprio e-mail toda vez é atrito sem motivo.
        emailDoOperador={sessao?.email ?? null}
      />
    </div>
  )
}
