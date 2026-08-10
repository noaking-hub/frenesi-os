import { repositorio } from '@/data/repository'
import { supabaseConfigurado } from '@/data/supabase'

import { DevolucoesCliente } from './DevolucoesCliente'

export const dynamic = 'force-dynamic'

export default async function Devolucoes() {
  const solicitacoes = await repositorio().solicitacoes()
  return <DevolucoesCliente solicitacoes={solicitacoes} ligado={supabaseConfigurado()} />
}
