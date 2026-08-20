import Link from 'next/link'

import { carregarPedidos } from '@/data/consultas'
import { lerContas } from '@/data/financeiro'
import { repositorio } from '@/data/repository'
import { shopifyConfigurada } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { disponivelDe } from '@/domain'

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
        // O FORMULÁRIO da venda manual mora no Financeiro (um só formulário,
        // uma só verdade), mas a PORTA fica também aqui: quem pensa "vou
        // lançar um pedido" procura em Pedidos, e o link abre o formulário já
        // aberto do outro lado.
        acao={
          <Link
            href="/financeiro/lancamentos?venda=nova"
            className="font-sans hover:brightness-110"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 30,
              padding: '0 13px',
              fontWeight: 600,
              fontSize: 11,
              lineHeight: 1,
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,.14)',
              background: 'transparent',
              color: 'var(--color-corrente)',
              whiteSpace: 'nowrap',
            }}
          >
            + Venda manual
          </Link>
        }
      />
      <PedidosCliente itens={itens} filaInicial={fila ? FILA_POR_SLUG[fila] : undefined} />
    </div>
  )
}
