import { NextResponse, type NextRequest } from 'next/server'

import { supabaseDaSessao } from '@/data/sessao'

/**
 * O clique no link do e-mail de redefinição.
 *
 * Aqui o token de uso único vira sessão. `verifyOtp` é quem confere validade,
 * prazo e reuso — tudo do lado do Supabase — e, dando certo, grava o cookie.
 * A partir daí a pessoa pode trocar a senha, e SÓ isso: a tela seguinte não
 * oferece nada além do formulário de nova senha.
 *
 * Rota, e não página, porque escrever cookie durante a renderização de um
 * Server Component não é possível. E `GET`, porque quem chama é o clique num
 * e-mail.
 *
 * O token viaja na URL — é assim que todo link de e-mail funciona — e por isso
 * ele é de uso único e some da barra de endereços no redirecionamento logo
 * abaixo: o histórico do navegador não guarda um token ainda válido.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const tokenHash = p.get('token_hash')
  const tipo = p.get('tipo') ?? p.get('type') ?? 'recovery'
  const proximo = p.get('proximo') ?? '/redefinir-senha'

  const falhou = (motivo: string) => {
    const url = req.nextUrl.clone()
    url.pathname = '/entrar'
    url.search = ''
    url.searchParams.set('recado', motivo)
    return NextResponse.redirect(url)
  }

  if (!tokenHash) return falhou('link-incompleto')
  if (tipo !== 'recovery') return falhou('link-invalido')

  const sb = await supabaseDaSessao()
  const { error } = await sb.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
  // Link vencido e link já usado chegam iguais aqui, e é o que a tela diz: o
  // caminho é o mesmo nos dois casos — pedir outro.
  if (error) return falhou('link-vencido')

  const destino = req.nextUrl.clone()
  destino.search = ''
  destino.pathname = proximo.startsWith('/') && !proximo.startsWith('//') ? proximo : '/redefinir-senha'
  return NextResponse.redirect(destino)
}
