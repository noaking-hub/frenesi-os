import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { conferenciaDeContas, lerExtrato, resumoDoExtrato } from '@/data/extrato'
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
export default async function Extrato() {
  const [linhas, contas, categorias, resumo] = await Promise.all([
    // Só o que precisa de decisão. O crédito de venda já casado com pedido
    // não tem categoria a escolher nem saldo a mover — pedir confirmação
    // para ele era inventar trabalho.
    lerExtrato({ situacao: 'a-decidir', limite: 400 }),
    conferenciaDeContas(),
    lerCategorias(),
    resumoDoExtrato(),
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
        linhas={linhas}
        contas={contas}
        categorias={categorias}
        gatewayLigado={mercadoPagoConfigurado()}
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
