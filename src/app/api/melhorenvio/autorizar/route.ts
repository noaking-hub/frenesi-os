import { NextResponse } from 'next/server'

import { melhorEnvioConfigurado, urlDeAutorizacao } from '@/data/melhorenvio'
import { sessaoAtual } from '@/data/sessao'

/**
 * Começa a autorização do Melhor Envio.
 *
 * Exige sessão de DONO: quem clica aqui está ligando a conta de frete da
 * empresa a este sistema — e o retorno grava um token que gasta em nome dela.
 * A rota vive fora do middleware (o caminho /api/melhorenvio é aberto, porque
 * o callback vem do Melhor Envio sem cookie nosso), então a checagem é feita
 * aqui, explicitamente.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const eu = await sessaoAtual()
  if (!eu || eu.papel !== 'dono') {
    return NextResponse.json({ erro: 'Só quem é dono conecta integrações.' }, { status: 403 })
  }
  if (!melhorEnvioConfigurado()) {
    return NextResponse.json(
      { erro: 'Defina MELHORENVIO_CLIENT_ID e MELHORENVIO_CLIENT_SECRET no ambiente.' },
      { status: 400 },
    )
  }

  // O state amarra a volta a este início — sem ele, um terceiro poderia
  // disparar o callback e ligar a conta dele à nossa.
  const estado = crypto.randomUUID()
  const resposta = NextResponse.redirect(urlDeAutorizacao(estado))
  resposta.cookies.set('me_estado', estado, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return resposta
}
