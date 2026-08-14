import { NextResponse } from 'next/server'

import { coletarConcorrente, mensagemDe } from '@/data/concorrentes'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

/**
 * Coleta dos preços de concorrente, uma FATIA por chamada.
 *
 * Existe para o preço estar atualizado quando alguém consultar, sem depender
 * de lembrar de clicar. Quem chama é o agendador do banco (pg_cron), batendo
 * de 5 em 5 minutos numa janela da manhã em:
 *
 *     POST /api/concorrentes/coletar
 *     Authorization: Bearer $CRON_SEGREDO
 *
 * Cada chamada avança a fonte em andamento — ou começa pela de leitura mais
 * velha — pelo que couber em ~14 s. Era uma chamada única de minutos, e a
 * Netlify corta a função em ~26 s: a coleta morria antes de gravar qualquer
 * coisa, todo dia, sem deixar rastro.
 *
 * O segredo não é ornamento: a rota abre dezenas de requisições para lojas de
 * terceiros, e uma URL pública que faz isso vira ferramenta de abuso na mão
 * de quem descobrir o endereço.
 */

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/** Quanto uma fatia pode gastar lendo. 14 s + a pior página (10 s) < 26 s. */
const PRAZO_DA_FATIA_MS = 14_000

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
  // A leitura mais velha primeiro — rodízio: nenhuma fonte fica para trás.
  const { data, error } = await sb
    .from('concorrentes')
    .select('id, nome, coleta_indice, ultima_leitura')
    .eq('ativo', true)
    .neq('coleta', 'manual')
    .order('ultima_leitura', { ascending: true, nullsFirst: true })
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })

  // Passada aberta tem prioridade sobre o rodízio: fatiar duas lojas ao mesmo
  // tempo faria as duas passadas levarem o dobro para fechar.
  const fonte = (data ?? []).find((f) => f.coleta_indice !== null) ?? (data ?? [])[0]
  if (!fonte) {
    return NextResponse.json({
      quando: new Date().toISOString(),
      nota: 'nenhuma fonte com leitura automática cadastrada',
    })
  }

  try {
    const r = await coletarConcorrente(fonte.id, { prazoMs: PRAZO_DA_FATIA_MS })
    return NextResponse.json({ quando: new Date().toISOString(), fonte: fonte.nome, ...r })
  } catch (e) {
    return NextResponse.json({
      quando: new Date().toISOString(),
      fonte: fonte.nome,
      erro: mensagemDe(e),
    })
  }
}

/** GET só para conferir que a rota está no ar; não coleta nada. */
export async function GET() {
  return NextResponse.json({
    rota: 'coleta de preços de concorrente (em fatias)',
    como: 'POST com Authorization: Bearer $CRON_SEGREDO — cada chamada avança uma fatia',
    configurado: Boolean(process.env.CRON_SEGREDO),
  })
}
