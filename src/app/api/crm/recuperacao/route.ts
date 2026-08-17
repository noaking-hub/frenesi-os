import { NextResponse } from 'next/server'

import { exigeSessao } from '@/app/api/exige-sessao'

import { enviarEmailsCarrinho, type CupomEnvio } from '@/app/(erp)/crm/carrinhos/actions'

/**
 * Envio em massa da recuperação de carrinho, por rodadas.
 *
 * Uma Server Action serializa por aba e travaria a navegação por minutos —
 * exatamente o problema que as rotas /api/tela/* resolveram. Aqui cada
 * chamada processa até ~3,5 minutos (folga sobre o teto de 5 da função) e
 * devolve o que faltou em `naoProcessados`; a tela chama de novo com essa
 * lista até vir vazia, mostrando progresso real. Como quem já recebeu nos
 * últimos 7 dias é pulado, retomar depois de uma queda não duplica e-mail.
 */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST(pedido: Request) {
  const semSessao = await exigeSessao()
  if (semSessao) return semSessao

  let corpo: { ids?: string[]; cupom?: CupomEnvio | null; forcar?: boolean }
  try {
    corpo = await pedido.json()
  } catch {
    return NextResponse.json({ ok: false, erro: 'Corpo inválido.' }, { status: 400 })
  }
  if (!Array.isArray(corpo.ids) || corpo.ids.length === 0) {
    return NextResponse.json({ ok: false, erro: 'Nenhum carrinho informado.' }, { status: 400 })
  }

  const r = await enviarEmailsCarrinho(
    corpo.ids.map(String),
    corpo.cupom ?? null,
    Boolean(corpo.forcar),
    210_000,
  )
  return NextResponse.json(r)
}
