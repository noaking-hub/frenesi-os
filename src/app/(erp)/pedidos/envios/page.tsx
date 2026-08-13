import { avisosDePedidoLigados } from '@/data/notificacoes'
import { repositorio } from '@/data/repository'
import { sessaoAtual } from '@/data/sessao'
import { shopifyConfigurada } from '@/data/shopify'
import { yampiConfigurada } from '@/data/yampi'

import { EnviosCliente } from './EnviosCliente'

export const dynamic = 'force-dynamic'

export default async function RastreamentoEEntregas() {
  const [envios, sessao] = await Promise.all([repositorio().envios(), sessaoAtual()])
  return (
    <EnviosCliente
      envios={envios}
      yampiLigada={yampiConfigurada()}
      shopifyLigada={shopifyConfigurada()}
      avisosLigados={avisosDePedidoLigados()}
      // Pré-preenche com quem está logado: o teste é para si mesmo, e digitar
      // o próprio e-mail toda vez é atrito sem motivo.
      emailDoOperador={sessao?.email ?? null}
    />
  )
}
