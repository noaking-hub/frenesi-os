import { repositorio } from '@/data/repository'
import { carregarEstoque } from '@/data/consultas'

import { ConversasCliente } from './ConversasCliente'

export default async function Conversas() {
  const repo = repositorio()
  const [comandos, contas, estoque] = await Promise.all([
    repo.iaComandos(),
    repo.contas(),
    carregarEstoque(),
  ])

  // A resposta automática sobre o Baccarat usa a MESMA cobertura da tela de
  // Estoque — a IA não tem uma segunda opinião sobre o estoque.
  const bac = estoque.coberturas.find((c) => c.base.id === 'bac')
  const inter = contas.find((c) => c.id === 'inter')

  return (
    <ConversasCliente
      comandos={comandos}
      saldoInter={inter?.saldo ?? 0}
      coberturaBac={bac ? { volumeMl: bac.base.volumeMl, dias: bac.dias } : null}
    />
  )
}
