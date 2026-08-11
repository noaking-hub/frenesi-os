import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { lerExtrato, resumoDoExtrato, ultimaAtualizacao } from '@/data/extrato'
import { mercadoPagoConfigurado } from '@/data/mercadopago'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { brl, pad2, plural } from '@/domain'

import { ExtratoCliente } from './ExtratoCliente'

export const dynamic = 'force-dynamic'

/**
 * Financeiro → Extrato.
 *
 * O ERP tinha lançamentos digitados e repasses previstos; faltava o fato. Esta
 * tela é onde o dinheiro real entra: o Mercado Pago conta quanto sobrou de
 * cada venda depois da tarifa, o banco conta o resto do movimento, e a fila de
 * classificação transforma cada linha em lançamento com categoria.
 */
/** O que a URL carrega. Filtro na URL é filtro que sobrevive ao F5. */
interface Busca {
  situacao?: string
  tipo?: string
  de?: string
  ate?: string
  busca?: string
}

export default async function Extrato({
  searchParams,
}: {
  searchParams: Promise<Busca>
}) {
  const sp = await searchParams
  const filtro = {
    // Por padrão, só o que precisa de decisão. O crédito de venda já casado
    // com pedido não tem categoria a escolher nem saldo a mover — pedir
    // confirmação para ele era inventar trabalho.
    situacao: sp.situacao === 'todas' ? ('todas' as const) : ('a-decidir' as const),
    tipo:
      sp.tipo === 'entrada' || sp.tipo === 'saida'
        ? (sp.tipo as 'entrada' | 'saida')
        : undefined,
    de: sp.de || undefined,
    ate: sp.ate || undefined,
    busca: sp.busca || undefined,
    limite: 400,
  }

  const [pagina, categorias, resumo, atualizadoEm] = await Promise.all([
    lerExtrato(filtro),
    lerCategorias(),
    resumoDoExtrato(),
    ultimaAtualizacao(),
  ])

  const kpis: Kpi[] = [
    {
      label: 'Precisam de você',
      valor: pad2(resumo.aDecidir),
      hint: resumo.aDecidir
        ? 'Despesas a categorizar e entradas sem pedido correspondente'
        : 'Nada pendente de decisão',
      tom: resumo.aDecidir ? 'atencao' : 'ok',
    },
    {
      label: 'Vendas conciliadas',
      valor: pad2(resumo.conciliadas),
      hint: 'Crédito casado com o pedido — nada a fazer nelas',
      tom: 'ok',
    },
    {
      label: 'Entradas lidas',
      valor: brl(resumo.entradas),
      hint: 'Crédito de venda e demais recebimentos do extrato',
      tom: 'ok',
    },
    {
      label: 'Saídas lidas',
      valor: brl(resumo.saidas),
      hint: 'Tarifas, fornecedores, estornos',
      tom: 'erro',
    },
    {
      label: 'Movimento líquido',
      valor: brl(resumo.saldo),
      hint: `${plural(resumo.linhas, 'linha lida', 'linhas lidas')} no extrato`,
      tom: resumo.saldo >= 0 ? 'ok' : 'erro',
    },
    {
      label: 'Gateway',
      valor: mercadoPagoConfigurado() ? 'Ligado' : 'Desligado',
      hint: mercadoPagoConfigurado()
        ? 'Mercado Pago responde com a tarifa real de cada venda'
        : 'Falta MERCADOPAGO_ACCESS_TOKEN',
      tom: mercadoPagoConfigurado() ? 'ok' : 'atencao',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />
      <ExtratoCliente
        linhas={pagina.linhas}
        total={pagina.total}
        filtro={{
          situacao: filtro.situacao,
          tipo: filtro.tipo ?? '',
          de: filtro.de ?? '',
          ate: filtro.ate ?? '',
          busca: filtro.busca ?? '',
        }}
        categorias={categorias}
        gatewayLigado={mercadoPagoConfigurado()}
        atualizadoEm={atualizadoEm}
      />
    </div>
  )
}

async function lerCategorias(): Promise<{ nome: string; natureza: string }[]> {
  if (!supabaseConfigurado()) return []
  const { data } = await supabaseServer()
    .from('categorias_financeiras')
    .select('nome, natureza')
    .eq('ativa', true)
    .order('nome')
  return (data ?? []).map((c) => ({ nome: c.nome as string, natureza: c.natureza as string }))
}
