import { NextResponse } from 'next/server'

import { sincronizarCashbackYampi } from '@/data/cashback'

/**
 * Sincronização do espelho de cashback, em rodadas.
 *
 * São centenas de consultas de carteira (uma por cliente) — não cabe numa
 * Server Action nem numa execução só. Cada chamada processa até ~3 minutos
 * e devolve a página onde parou; a tela repete até `proximaPagina` vir nula.
 */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST(pedido: Request) {
  let corpo: { pagina?: number }
  try {
    corpo = await pedido.json()
  } catch {
    corpo = {}
  }
  try {
    const r = await sincronizarCashbackYampi(Math.max(1, Number(corpo.pagina) || 1), 200_000)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({
      ok: false,
      erro: e instanceof Error ? e.message : String(e),
    })
  }
}
