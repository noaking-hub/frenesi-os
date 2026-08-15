import { NextResponse } from 'next/server'

import Dashboard from '@/app/(erp)/page'
import DashboardFinanceiro from '@/app/(erp)/financeiro/page'
import Lancamentos from '@/app/(erp)/financeiro/lancamentos/page'
import ContasECaixas from '@/app/(erp)/financeiro/contas/page'
import FluxoDeCaixa from '@/app/(erp)/financeiro/fluxo-de-caixa/page'
import Dre from '@/app/(erp)/financeiro/dre/page'
import Conciliacao from '@/app/(erp)/financeiro/conciliacao/page'
import Categorias from '@/app/(erp)/financeiro/categorias/page'
import ConfiguracoesFinanceiras from '@/app/(erp)/financeiro/configuracoes/page'
import Extrato from '@/app/(erp)/financeiro/extrato/page'
import IntegracaoContabil from '@/app/(erp)/financeiro/contabil/page'

/**
 * Aferição de saúde das telas COM OS DADOS REAIS.
 *
 * O banco vazio do ambiente de desenvolvimento não exercita os mesmos
 * caminhos que a produção: um campo nulo num pedido antigo, uma categoria
 * sem nome, uma série com um dia só. Quando uma tela quebra em produção, o
 * navegador mostra um 500 genérico e o stack fica preso no log da função —
 * esta rota executa cada página aqui dentro, onde dá para capturar o erro,
 * e devolve a exceção verdadeira.
 *
 * Executar o componente da página avalia os loaders e todas as expressões
 * do JSX (props e filhos), que é onde mora a lógica dependente de dado; os
 * componentes de apresentação que ele instancia são formatadores puros.
 *
 *     POST /api/diagnostico
 *     Authorization: Bearer $CRON_SEGREDO
 */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

function autorizado(req: Request): boolean {
  const esperado = process.env.CRON_SEGREDO
  if (!esperado) return false
  const enviado = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return enviado === esperado
}

type Resultado = { tela: string; ok: boolean; ms: number; erro?: string; stack?: string }

export async function POST(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  }

  const vazio = () => Promise.resolve({})
  const telas: { tela: string; rodar: () => Promise<unknown> }[] = [
    { tela: '/', rodar: () => Dashboard({ searchParams: vazio() }) },
    { tela: '/financeiro', rodar: () => DashboardFinanceiro({ searchParams: vazio() }) },
    { tela: '/financeiro/lancamentos', rodar: () => Lancamentos({ searchParams: vazio() }) },
    { tela: '/financeiro/contas', rodar: () => ContasECaixas() },
    { tela: '/financeiro/fluxo-de-caixa', rodar: () => FluxoDeCaixa({ searchParams: vazio() }) },
    { tela: '/financeiro/dre', rodar: () => Dre({ searchParams: vazio() }) },
    { tela: '/financeiro/dre?regime=caixa', rodar: () => Dre({ searchParams: Promise.resolve({ regime: 'caixa' }) }) },
    { tela: '/financeiro/conciliacao', rodar: () => Conciliacao({ searchParams: vazio() }) },
    { tela: '/financeiro/categorias', rodar: () => Categorias() },
    { tela: '/financeiro/configuracoes', rodar: () => ConfiguracoesFinanceiras() },
    { tela: '/financeiro/extrato', rodar: () => Extrato({ searchParams: vazio() }) },
    { tela: '/financeiro/contabil', rodar: () => IntegracaoContabil() },
  ]

  const resultados: Resultado[] = []
  for (const { tela, rodar } of telas) {
    const inicio = Date.now()
    try {
      await rodar()
      resultados.push({ tela, ok: true, ms: Date.now() - inicio })
    } catch (e) {
      const erro = e instanceof Error ? e : new Error(String(e))
      resultados.push({
        tela,
        ok: false,
        ms: Date.now() - inicio,
        erro: erro.message,
        stack: (erro.stack ?? '').split('\n').slice(0, 14).join('\n'),
      })
    }
  }

  return NextResponse.json({
    quando: new Date().toISOString(),
    quebradas: resultados.filter((r) => !r.ok).length,
    resultados,
  })
}
