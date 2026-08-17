import 'server-only'

import { NextResponse } from 'next/server'

import { sessaoAtual } from '@/data/sessao'
import { supabaseConfigurado } from '@/data/supabase'

/**
 * Segunda tranca das rotas chamadas pelas telas do ERP.
 *
 * O middleware já barra quem não tem sessão, e por um tempo isso pareceu
 * bastar — até que `/api/crm` inteiro entrou na lista de rotas abertas e
 * levou junto duas rotas que disparam e-mail em massa e criam cupom real na
 * Yampi. Uma linha numa lista de prefixos não deveria ser tudo que separa a
 * internet da caixa de entrada dos clientes.
 *
 * Então cada rota confere por conta própria. Se um dia alguém reabrir o
 * prefixo por engano — para consertar uma integração, na pressa — a rota
 * continua fechada.
 *
 * Sem Supabase configurado o ERP roda aberto de propósito (modo de
 * desenvolvimento local, documentado no middleware). Aqui vale o mesmo, e
 * pelo mesmo motivo: exigir sessão onde não há autenticação nenhuma travaria
 * o desenvolvimento sem proteger nada.
 */
export async function exigeSessao(): Promise<NextResponse | null> {
  if (!supabaseConfigurado()) return null
  const usuario = await sessaoAtual()
  if (usuario) return null
  return NextResponse.json(
    { ok: false, erro: 'Faça login no ERP para executar esta ação.' },
    { status: 401 },
  )
}
