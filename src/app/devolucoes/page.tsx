import type { Metadata } from 'next'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

import { PortalDevolucoes } from './PortalDevolucoes'

export const metadata: Metadata = {
  title: 'Devoluções · FRENESI',
  description: 'Abra a devolução do seu pedido em poucos passos.',
}

export const dynamic = 'force-dynamic'

/**
 * O contato do rodapé vem do cadastro da empresa — nunca de um número escrito
 * no código. Cadastro vazio = linha ausente: pior que não ter contato é o
 * cliente falar com o WhatsApp de um estranho.
 */
async function contatoDaEmpresa(): Promise<{ telefone: string; email: string }> {
  if (!supabaseConfigurado()) return { telefone: '', email: '' }
  try {
    const { data } = await supabaseServer()
      .from('empresa')
      .select('telefone, email')
      .limit(1)
      .maybeSingle()
    return { telefone: data?.telefone ?? '', email: data?.email ?? '' }
  } catch {
    return { telefone: '', email: '' }
  }
}

export default async function Devolucoes() {
  // Os pedidos só são carregados depois que o cliente se identifica no passo 1
  // (server action `buscarPedidos`) — nada de pedido de terceiro no HTML inicial.
  const contato = await contatoDaEmpresa()
  return <PortalDevolucoes contato={contato} />
}
