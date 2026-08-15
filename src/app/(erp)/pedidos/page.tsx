import { carregarPedidos } from '@/data/consultas'
import { lerContas } from '@/data/financeiro'
import { repositorio } from '@/data/repository'
import { shopifyConfigurada } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { disponivelDe } from '@/domain'

import { ImportarPedidos } from './ImportarPedidos'
import { PedidosCliente, type Fila } from './PedidosCliente'
import { VendaManual, type BaseParaVenda, type ContaParaVenda } from './VendaManual'

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

/**
 * O que a venda manual precisa saber para não pedir nada digitado.
 *
 * Os tamanhos de decant NÃO são uma lista fixa no código: eles saem das
 * variantes que o catálogo realmente pratica. Uma lista chumbada aqui
 * ofereceria um tamanho que ninguém envasa no dia em que o catálogo mudasse,
 * e o preço praticado — que já existe por variante — é o mesmo número que o
 * operador digitaria à mão.
 */
async function dadosDaVendaManual(): Promise<{
  bases: BaseParaVenda[]
  contas: ContaParaVenda[]
  tamanhos: number[]
}> {
  const [perfumes, derivados, contas] = await Promise.all([
    repositorio().perfumesBase(),
    repositorio().produtosDerivados(),
    lerContas(),
  ])

  const precosPorBase = new Map<string, Record<string, number>>()
  for (const d of derivados) {
    if (!(d.precoPraticado > 0)) continue
    const atual = precosPorBase.get(d.baseId) ?? {}
    atual[String(d.variante)] = d.precoPraticado
    precosPorBase.set(d.baseId, atual)
  }

  return {
    bases: perfumes.map((b) => ({
      id: b.id,
      nome: b.nome,
      marca: b.marca,
      // Disponível, não físico: reserva é pedido pago à espera de envase, e
      // vendê-la de novo no balcão deixaria o cliente da loja sem o dele.
      disponivelMl: disponivelDe(b),
      precos: precosPorBase.get(b.id) ?? {},
    })),
    contas: contas
      .filter((c) => c.ativa)
      .map((c) => ({ id: c.id, nome: c.nome, principal: c.principal })),
    tamanhos: [...new Set(derivados.map((d) => d.variante))].sort((a, b) => a - b),
  }
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
  const [itens, sincronizadoEm, venda, { fila }] = await Promise.all([
    carregarPedidos(),
    ultimaSincroniaYampi(),
    dadosDaVendaManual(),
    searchParams,
  ])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ImportarPedidos
        configurada={shopifyConfigurada()}
        total={itens.length}
        sincronizadoEm={sincronizadoEm}
        // Na mesma barra do "Sincronizar agora": as duas são a origem de um
        // pedido no ERP — uma traz o que a loja vendeu, a outra registra o que
        // foi vendido fora dela.
        acao={
          <VendaManual bases={venda.bases} contas={venda.contas} tamanhos={venda.tamanhos} />
        }
      />
      <PedidosCliente itens={itens} filaInicial={fila ? FILA_POR_SLUG[fila] : undefined} />
    </div>
  )
}
