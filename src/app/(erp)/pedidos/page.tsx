import { carregarPedidos } from '@/data/consultas'
import { shopifyConfigurada } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

import { ImportarPedidos } from './ImportarPedidos'
import { PedidosCliente, type Fila } from './PedidosCliente'

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

/** `?fila=` na URL abre direto numa fila — é o que torna as filas linkáveis. */
const FILA_POR_SLUG: Record<string, Fila> = {
  aguardando: 'Aguardando envio',
  transito: 'Em trânsito',
  'saiu-para-entrega': 'Saiu para entrega',
  entregues: 'Entregues',
  ocorrencia: 'Com ocorrência',
  devolucoes: 'Devoluções',
}

export default async function Pedidos({
  searchParams,
}: {
  searchParams: Promise<{ fila?: string }>
}) {
  const [itens, sincronizadoEm, { fila }] = await Promise.all([
    carregarPedidos(),
    ultimaSincroniaYampi(),
    searchParams,
  ])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ImportarPedidos
        configurada={shopifyConfigurada()}
        total={itens.length}
        sincronizadoEm={sincronizadoEm}
      />
      <PedidosCliente itens={itens} filaInicial={fila ? FILA_POR_SLUG[fila] : undefined} />
    </div>
  )
}
