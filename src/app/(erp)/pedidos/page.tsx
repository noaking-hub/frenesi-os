import { carregarPedidos } from '@/data/consultas'
import { shopifyConfigurada } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

import { ImportarPedidos } from './ImportarPedidos'
import { PedidosCliente } from './PedidosCliente'

export const dynamic = 'force-dynamic'

/**
 * Quando a Yampi foi importada pela última vez.
 *
 * É o que permite à tela sincronizar sozinha ao abrir — sem isso, "manter em
 * dia" dependeria de alguém lembrar de clicar, e quem esquece não descobre
 * que esqueceu.
 */
async function ultimaSincroniaYampi(): Promise<string | null> {
  if (!supabaseConfigurado()) return null
  const { data } = await supabaseServer()
    .from('sincronizacoes')
    .select('executada_em')
    .eq('origem', 'yampi')
    .eq('tipo', 'pedidos')
    .order('executada_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.executada_em as string) ?? null
}

export default async function Pedidos() {
  const [itens, sincronizadoEm] = await Promise.all([carregarPedidos(), ultimaSincroniaYampi()])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ImportarPedidos
        configurada={shopifyConfigurada()}
        total={itens.length}
        sincronizadoEm={sincronizadoEm}
      />
      <PedidosCliente itens={itens} />
    </div>
  )
}
