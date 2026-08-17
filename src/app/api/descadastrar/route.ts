import { NextResponse, type NextRequest } from 'next/server'

import { assinaturaConfere, descadastrar } from '@/data/descadastro'

/**
 * Descadastro em UM clique — o endpoint do `List-Unsubscribe-Post` (RFC 8058).
 *
 * É o Gmail ou o Outlook que chama esta rota, sem navegador e sem cookie,
 * quando a pessoa usa o "Cancelar inscrição" nativo ao lado do remetente. Ele
 * manda um POST com corpo `List-Unsubscribe=One-Click` e espera 2xx.
 *
 * Sair por aqui é o melhor desfecho possível: quem não acha o botão marca
 * "isto é spam", e denúncia de spam derruba a reputação do domínio — levando
 * junto os avisos de pedido, que não têm nada a ver com divulgação.
 *
 * A autorização é a assinatura do link, a mesma da página.
 */
export const maxDuration = 15

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const email = (url.searchParams.get('e') ?? '').trim().toLowerCase()
  const assinatura = url.searchParams.get('t') ?? ''

  if (!email || !assinaturaConfere(email, assinatura)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  try {
    await descadastrar(email, 'um clique no cliente de e-mail')
  } catch (e) {
    console.error('[descadastro] um clique falhou:', e)
    // 500 faz o cliente de e-mail repetir; é o comportamento certo aqui,
    // porque a pessoa já pediu para sair e a repetição é barata.
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
