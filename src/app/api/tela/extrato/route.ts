import { NextResponse } from 'next/server'

import { atualizarExtrato } from '@/app/(erp)/financeiro/extrato/actions'

/**
 * Atualização do extrato para a tela, como rota — e não Server Action.
 *
 * O Next enfileira Server Actions por aba e segura QUALQUER navegação
 * enquanto uma está no ar. Uma importação de extrato leva minutos quando o
 * relatório fica pronto, e clicar em outro menu no meio dela travava o ERP
 * inteiro. Rota não entra nessa fila: a importação segue e a navegação flui.
 */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as {
    de?: string
    ate?: string
    pedir?: boolean
  }
  const r = await atualizarExtrato(corpo.de ?? '', corpo.ate ?? '', Boolean(corpo.pedir))
  return NextResponse.json(r)
}
