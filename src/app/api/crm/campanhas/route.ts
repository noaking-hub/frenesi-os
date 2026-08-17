import { NextResponse } from 'next/server'

import { rodarCampanhas } from '@/data/campanhas'

/**
 * A rodada automática das campanhas de relacionamento.
 *
 * Chamada pelo pg_cron a cada hora, com `Authorization: Bearer $CRON_SEGREDO`
 * — a MESMA forma das outras rotinas agendadas. A primeira versão desta rota
 * inventou um header próprio (`x-cron-segredo`) e tomou 401 do próprio
 * agendador: convenção divergente não falha na revisão, falha em produção, e
 * neste caso falharia calada num 401 que o pg_net registra sem alarde.
 *
 * A rota é pública na internet; sem o segredo qualquer um dispararia e-mail em
 * nome da marca.
 *
 * `?dispensar=1` roda a CARGA INICIAL: percorre os mesmos candidatos e carimba
 * todos como dispensados, sem mandar nada. É o que torna ligar uma campanha
 * seguro — sem ela, a primeira rodada do carrinho despeja dias de abandono
 * acumulado no mesmo minuto.
 */
export const dynamic = 'force-dynamic'
// 26s é o teto real da Netlify, e não os 300 que a documentação promete. A
// rodada tem teto próprio de 25 e-mails justamente para caber aqui.
export const maxDuration = 26

export async function POST(pedido: Request) {
  const esperado = process.env.CRON_SEGREDO
  const enviado = pedido.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (esperado && enviado !== esperado) {
    return NextResponse.json(
      { ok: false, erro: 'Não autorizado. Mande CRON_SEGREDO em Authorization: Bearer.' },
      { status: 401 },
    )
  }

  const url = new URL(pedido.url)
  try {
    const resultados = await rodarCampanhas({
      apenasDispensar: url.searchParams.get('dispensar') === '1',
      somente: url.searchParams.get('campanha') ?? undefined,
    })
    return NextResponse.json({ ok: true, quando: new Date().toISOString(), resultados })
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    console.error('[campanhas] rodada falhou:', erro)
    return NextResponse.json({ ok: false, erro }, { status: 500 })
  }
}
