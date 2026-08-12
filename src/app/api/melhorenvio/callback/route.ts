import { NextResponse } from 'next/server'

import { trocarCodigoPorToken } from '@/data/melhorenvio'

/**
 * Volta da autorização do Melhor Envio.
 *
 * Não dá para exigir sessão aqui: quem chama é o navegador vindo do Melhor
 * Envio. O que amarra a chamada ao nosso início é o `state`, comparado com o
 * cookie gravado na ida — sem ele, qualquer um poderia postar um código e
 * conectar OUTRA conta ao nosso ERP.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const codigo = url.searchParams.get('code')
  const estado = url.searchParams.get('state')
  const esperado = req.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('me_estado='))
    ?.slice('me_estado='.length)

  const destino = new URL('/configuracoes/integracoes', url.origin)

  if (!codigo || !estado || !esperado || estado !== esperado) {
    destino.searchParams.set('me', 'estado-invalido')
    return NextResponse.redirect(destino)
  }

  try {
    await trocarCodigoPorToken(codigo)
    destino.searchParams.set('me', 'conectado')
  } catch (e) {
    console.error('[melhorenvio] troca de código falhou:', e)
    destino.searchParams.set('me', 'falhou')
  }

  const resposta = NextResponse.redirect(destino)
  resposta.cookies.delete('me_estado')
  return resposta
}
