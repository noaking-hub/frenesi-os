import { NextResponse } from 'next/server'

import { importarCatalogo } from '@/app/(erp)/estoque/sincronia/actions'

/**
 * Importação do catálogo da Shopify para a tela, como rota — fora da fila
 * de Server Actions, para não segurar a navegação (ver api/tela/extrato).
 */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST() {
  return NextResponse.json(await importarCatalogo())
}
