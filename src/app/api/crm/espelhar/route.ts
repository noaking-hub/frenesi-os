import { NextResponse } from 'next/server'

import { sincronizarCashbackYampi } from '@/data/cashback'
import { importarAniversariosYampi } from '@/data/giftback'

/**
 * Espelho diário do CRM: carteiras de cashback e aniversários da Yampi.
 *
 * Quem chama é o agendador da Netlify (Bearer CRON_SEGREDO), de madrugada —
 * a tela então já abre com o retrato do dia, e a atualização ao abrir só
 * corre atrás do que envelheceu. O segredo importa: a rota abre centenas de
 * consultas na Yampi e não pode ser pública.
 */
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
      { erro: 'Não autorizado. Defina CRON_SEGREDO e mande o mesmo valor em Authorization: Bearer.' },
      { status: 401 },
    )
  }

  const inicio = Date.now()
  const resultado: {
    cashback: { lidos: number; comSaldo: number; completo: boolean } | { erro: string }
    aniversarios: { lidos: number; atualizados: number } | { erro: string } | 'sem tempo nesta rodada'
  } = { cashback: { lidos: 0, comSaldo: 0, completo: false }, aniversarios: 'sem tempo nesta rodada' }

  // Carteiras primeiro: é a varredura longa. Se não couber inteira, o resto
  // fica para a rodada de amanhã — o upsert é idempotente.
  try {
    let pagina: number | null = 1
    let lidos = 0
    let comSaldo = 0
    while (pagina !== null && Date.now() - inicio < 200_000) {
      const r = await sincronizarCashbackYampi(pagina, 50_000)
      lidos += r.lidos
      comSaldo += r.comSaldo
      pagina = r.proximaPagina
    }
    resultado.cashback = { lidos, comSaldo, completo: pagina === null }
  } catch (e) {
    resultado.cashback = { erro: e instanceof Error ? e.message : String(e) }
  }

  if (Date.now() - inicio < 240_000) {
    try {
      resultado.aniversarios = await importarAniversariosYampi()
    } catch (e) {
      resultado.aniversarios = { erro: e instanceof Error ? e.message : String(e) }
    }
  }

  return NextResponse.json({ ok: true, ...resultado })
}
