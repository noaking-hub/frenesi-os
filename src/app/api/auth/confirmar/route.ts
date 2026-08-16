import { NextResponse, type NextRequest } from 'next/server'

import { createServerClient, type CookieOptions } from '@supabase/ssr'

import { noErp } from '@/data/enderecos'

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
 * DUAS COISAS AQUI PARECEM DETALHE E SÃO O CONSERTO DE UM BUG REAL.
 *
 * A primeira: o destino é montado com `noErp()`, a partir do domínio público,
 * e nunca com `req.nextUrl`. Dentro da função da Netlify, `req.nextUrl`
 * devolve a URL imutável do deploy — `https://6a81...--erp-frenesi.netlify.app`.
 * O cookie era gravado para `erp.frenesiperfumes.com.br`, o navegador ia para o
 * host do deploy, e lá o cookie não existia: a pessoa clicava no link de
 * redefinir senha e caía numa tela pedindo a senha que ela tinha esquecido.
 *
 * A segunda: o cookie é escrito DIRETO na resposta que vai ser devolvida, e
 * não pelo cliente compartilhado da sessão — aquele engole falha de escrita num
 * `catch` vazio, porque em Server Component escrever cookie é proibido mesmo.
 * Num handler que existe justamente para gravar sessão, silêncio na escrita é o
 * pior comportamento possível.
 *
 * O token viaja na URL — é assim que todo link de e-mail funciona — e por isso
 * ele é de uso único e some da barra de endereços no redirecionamento.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const tokenHash = p.get('token_hash')
  const tipo = p.get('tipo') ?? p.get('type') ?? 'recovery'
  const proximo = p.get('proximo') ?? '/redefinir-senha'

  const falhou = (motivo: string) =>
    NextResponse.redirect(noErp(`/entrar?recado=${encodeURIComponent(motivo)}`))

  if (!tokenHash) return falhou('link-incompleto')
  if (tipo !== 'recovery') return falhou('link-invalido')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !chave) return falhou('sem-autenticacao')

  // A resposta é criada ANTES da verificação porque é nela que o cookie será
  // gravado. Invertendo a ordem, o `setAll` não teria onde escrever.
  const resposta = NextResponse.redirect(noErp(proximo))

  const sb = createServerClient(url, chave, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (novos: { name: string; value: string; options?: CookieOptions }[]) => {
        for (const { name, value, options } of novos) resposta.cookies.set(name, value, options)
      },
    },
  })

  const { error } = await sb.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
  // Link vencido e link já usado chegam iguais aqui, e é o que a tela diz: o
  // caminho é o mesmo nos dois casos — pedir outro.
  if (error) {
    console.error('[auth/confirmar] verifyOtp recusou:', error.message)
    return falhou('link-vencido')
  }

  return resposta
}
