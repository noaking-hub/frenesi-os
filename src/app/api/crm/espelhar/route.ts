import { NextResponse } from 'next/server'

import { fatiaDoEspelhoDeCashback } from '@/data/cashback'
import { importarAniversariosYampi } from '@/data/giftback'

/**
 * Espelho do CRM: carteiras de cashback e aniversários da Yampi.
 *
 * Esta rota prometia `maxDuration = 300` e gastava até 200s num laço, pedindo
 * fatias de 50s. A Netlify encerra a função síncrona em ~26s. Não era uma
 * folga otimista: era uma rotina desenhada para um tempo que não existe, e o
 * resultado foi quatro madrugadas seguidas sem UMA carteira atualizada — a
 * execução era cortada no meio da primeira fatia, e a página onde ela estava
 * morria junto, porque vivia numa variável local. No dia seguinte recomeçava
 * da página 1 e era cortada no mesmo lugar. A cauda do cadastro nunca foi
 * lida.
 *
 * Agora é UMA fatia por chamada, com marcador em tabela e orçamento que cabe.
 * O cashback roda de hora em hora (a passada inteira fecha em poucas horas); o
 * aniversário, uma vez por dia, que é a cadência do fato.
 *
 * `?etapa=cashback|aniversarios` escolhe o que rodar. Sem parâmetro, roda as
 * duas — é o comportamento antigo, para quem chamar à mão.
 */
export const maxDuration = 26
export const dynamic = 'force-dynamic'

/** O que sobra dos 26s depois da margem para responder. */
const PRAZO_DA_FATIA_MS = 18_000

function autorizado(req: Request): boolean {
  const esperado = process.env.CRON_SEGREDO
  if (!esperado) return false
  const enviado = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return enviado === esperado
}

export async function POST(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json(
      { erro: 'Não autorizado. Defina CRON_SEGREDO e mande o mesmo valor em Authorization: Bearer.' },
      { status: 401 },
    )
  }

  const etapa = new URL(req.url).searchParams.get('etapa')
  const saida: Record<string, unknown> = { quando: new Date().toISOString() }

  if (!etapa || etapa === 'cashback') {
    try {
      saida.cashback = await fatiaDoEspelhoDeCashback(PRAZO_DA_FATIA_MS)
    } catch (e) {
      saida.cashback = { erro: e instanceof Error ? e.message : String(e) }
    }
  }

  if (!etapa || etapa === 'aniversarios') {
    try {
      saida.aniversarios = await importarAniversariosYampi()
    } catch (e) {
      saida.aniversarios = { erro: e instanceof Error ? e.message : String(e) }
    }
  }

  return NextResponse.json({ ok: true, ...saida })
}
