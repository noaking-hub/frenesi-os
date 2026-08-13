import { carregarPedidos } from '@/data/consultas'
import { shopifyConfigurada } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

import { ImportarPedidos } from './ImportarPedidos'
import { PedidosCliente } from './PedidosCliente'

export const dynamic = 'force-dynamic'

/**
 * Quando a Yampi foi importada pela última vez.
 *
 * A tela NÃO sincroniza mais ao abrir: quem mantém o dado em dia é a rotina de
 * hora em hora, no servidor. O que a tela faz é DIZER quando foi a última
 * leitura — sem essa informação, a única forma de responder "os dados estão
 * velhos?" seria sincronizar de novo, que é exatamente o que ela fazia sozinha
 * e deixava a tela nascer carregando.
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
