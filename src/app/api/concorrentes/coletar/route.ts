import { NextResponse } from 'next/server'

import { coletarConcorrente, mensagemDe } from '@/data/concorrentes'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

/**
 * Coleta diária dos preços de concorrente.
 *
 * Existe para o preço estar atualizado quando alguém consultar, sem depender
 * de lembrar de clicar. Quem chama é um agendador de fora — Vercel Cron,
 * GitHub Actions, cron do servidor — batendo em:
 *
 *     POST /api/concorrentes/coletar
 *     Authorization: Bearer $CRON_SEGREDO
 *
 * O segredo não é ornamento: a rota abre dezenas de requisições para lojas de
 * terceiros, e uma URL pública que faz isso vira ferramenta de abuso na mão
 * de quem descobrir o endereço.
 */

/** A leitura de várias lojas passa muito do limite padrão de execução. */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

function autorizado(req: Request): boolean {
  const esperado = process.env.CRON_SEGREDO
  if (!esperado) return false
  const enviado = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return enviado === esperado
}

export async function POST(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json(
      {
        erro:
          'Não autorizado. Defina CRON_SEGREDO no ambiente e mande o mesmo valor em ' +
          'Authorization: Bearer.',
      },
      { status: 401 },
    )
  }
  if (!supabaseConfigurado()) {
    return NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 500 })
  }

  const sb = supabaseServer()
  // A mais velha primeiro: com o teto de produtos maior, nem toda loja cabe
  // numa execução — o rodízio garante que nenhuma fica para trás.
  const { data, error } = await sb
    .from('concorrentes')
    .select('id, nome, ultima_leitura')
    .eq('ativo', true)
    .neq('coleta', 'manual')
    .order('ultima_leitura', { ascending: true, nullsFirst: true })
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })

  const inicio = Date.now()
  const resultado: { fonte: string; lidos: number; casados: number; erro: string | null }[] = []
  for (const f of data ?? []) {
    if (Date.now() - inicio > 230_000) {
      resultado.push({ fonte: f.nome, lidos: 0, casados: 0, erro: 'sem tempo nesta rodada — fica para a próxima (rodízio pela leitura mais velha)' })
      continue
    }
    try {
      const r = await coletarConcorrente(f.id)
      resultado.push({ fonte: f.nome, lidos: r.lidos, casados: r.casados, erro: null })
    } catch (e) {
      // Uma loja fora do ar não pode impedir a leitura das outras: o preço de
      // mercado com três lojas de quatro continua servindo para decidir.
      resultado.push({ fonte: f.nome, lidos: 0, casados: 0, erro: mensagemDe(e) })
    }
  }

  return NextResponse.json({ quando: new Date().toISOString(), fontes: resultado })
}

/** GET só para conferir que a rota está no ar; não coleta nada. */
export async function GET() {
  return NextResponse.json({
    rota: 'coleta de preços de concorrente',
    como: 'POST com Authorization: Bearer $CRON_SEGREDO',
    configurado: Boolean(process.env.CRON_SEGREDO),
  })
}
