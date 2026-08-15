import { avisosDeDevolucaoLigados } from '@/data/notificacoes'
import { repositorio } from '@/data/repository'
import { supabaseConfigurado } from '@/data/supabase'

import { DevolucoesCliente } from './DevolucoesCliente'

export const dynamic = 'force-dynamic'

export default async function Devolucoes() {
  const solicitacoes = await repositorio().solicitacoes()
  return (
    <DevolucoesCliente
      solicitacoes={solicitacoes}
      ligado={supabaseConfigurado()}
      // A tela precisa saber se o cliente está sendo avisado de verdade:
      // aprovar uma devolução achando que o código foi por e-mail, quando a
      // trava está desligada, deixa o cliente esperando por nada.
      avisosLigados={avisosDeDevolucaoLigados()}
    />
  )
}
