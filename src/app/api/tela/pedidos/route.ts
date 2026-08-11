import { NextResponse } from 'next/server'

import { importarDaYampi, sincronizarEnvios } from '@/app/(erp)/pedidos/actions'

/**
 * Sincronia de pedidos para a tela, como rota — fora da fila de Server
 * Actions, para não segurar a navegação enquanto importa (ver
 * api/tela/extrato). `dias: 0` pula a importação e só espelha envios.
 */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { dias?: number; espelhar?: boolean }
  const dias = Math.max(0, Math.min(365, Math.round(corpo.dias ?? 10)))

  const importacao = dias > 0 ? await importarDaYampi(dias) : null
  const envios = corpo.espelhar ? await sincronizarEnvios() : null
  return NextResponse.json({ importacao, envios })
}
