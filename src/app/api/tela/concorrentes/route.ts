import { NextResponse } from 'next/server'

import { vascularPrecos } from '@/app/(erp)/produtos/concorrentes/actions'

/**
 * Coleta de preços de concorrente para a tela, como rota — fora da fila de
 * Server Actions: a varredura abre dezenas de requisições e demora, e não
 * pode segurar a navegação (ver api/tela/extrato).
 */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST() {
  return NextResponse.json(await vascularPrecos())
}
