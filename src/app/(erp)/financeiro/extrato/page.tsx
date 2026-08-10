import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { conferenciaDeContas, lerExtrato } from '@/data/extrato'
import { mercadoPagoConfigurado } from '@/data/mercadopago'
import { faltaParaSicoob, sicoobConfigurado } from '@/data/sicoob'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { brl, pad2, resumirExtrato } from '@/domain'

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
  const [linhas, contas, categorias] = await Promise.all([
    lerExtrato({ situacao: 'todas', limite: 400 }),
    conferenciaDeContas(),
    lerCategorias(),
  ])

  const resumo = resumirExtrato(linhas)
  const faltaNoBanco = faltaParaSicoob()

  const kpis: Kpi[] = [
    {
      label: 'A classificar',
      valor: pad2(resumo.aClassificar),
      hint: resumo.aClassificar
        ? 'Cada linha aqui é dinheiro que se moveu e o DRE ainda não viu'
        : 'Todo movimento lido já virou lançamento',
      tom: resumo.aClassificar ? 'atencao' : 'ok',
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
      hint: `${resumo.linhas} linha(s) no extrato · ${resumo.ignoradas} dispensada(s)`,
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
    {
      label: 'Banco',
      valor: sicoobConfigurado() ? 'API' : 'OFX',
      hint: sicoobConfigurado()
        ? 'API do Sicoob configurada'
        : 'A API exige certificado digital; o OFX do internet banking funciona hoje',
      tom: sicoobConfigurado() ? 'ok' : 'info',
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
        bancoLigado={sicoobConfigurado()}
        faltaNoBanco={faltaNoBanco}
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
