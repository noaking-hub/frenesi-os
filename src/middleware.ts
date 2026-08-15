import { NextResponse, type NextRequest } from 'next/server'

import { createServerClient, type CookieOptions } from '@supabase/ssr'

/**
 * A tranca do ERP.
 *
 * Fica no middleware, e não em cada página, porque proteção por página é uma
 * lista que alguém esquece de atualizar — e a tela esquecida é justamente a
 * nova, a que ninguém revisou. Aqui o padrão é NEGAR: tudo exige sessão,
 * menos o que está explicitamente aberto abaixo.
 *
 * Além de barrar, o middleware renova o token da sessão. É o único lugar que
 * pode escrever cookie antes da renderização — sem isso, quem passa do prazo
 * do token seria deslogado no meio do trabalho.
 */

/** O que é público, e por quê. */
const ABERTO = [
  // Tela de login e o retorno do OAuth do próprio ERP.
  '/entrar',
  '/api/auth',
  // Portal do cliente: quem abre devolução não tem — nem deve ter — conta.
  '/devolucoes',
  // Webhooks e rotinas: autenticam por token próprio no cabeçalho, não por
  // sessão de navegador. Exigir cookie aqui quebraria as integrações — e a
  // quebra é MUDA: o agendador recebe o redirect para /entrar, a página de
  // login responde 200, e a rotina "sucede" sem ter rodado. Foi exatamente
  // assim que o pulso de pedidos ficou surdo até a rota entrar nesta lista.
  '/api/frenet',
  '/api/melhorenvio',
  '/api/crm',
  '/api/financeiro',
  '/api/tela',
  '/api/pedidos/pulso',
  '/api/diagnostico',
  '/api/pagarme',
]

/** Os períodos do Dashboard. Lista fechada: cookie não escolhe consulta. */
const PERIODOS_LEMBRADOS = new Set(['hoje', 'ontem', '7d', '30d', 'mes', 'mes-anterior'])

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // devolucoes.frenesiperfumes.com.br É o portal, não uma rota dele: a raiz
  // do host serve o portal (rewrite, o cliente nunca vê /devolucoes) e
  // nenhuma tela do ERP responde por esse endereço — o cliente que trocar a
  // URL cai de volta no portal, não numa tela de login que não é para ele.
  const host = req.headers.get('host') ?? ''
  if (host.split(':')[0].startsWith('devolucoes.')) {
    if (pathname === '/' || pathname.startsWith('/devolucoes')) {
      const destino = req.nextUrl.clone()
      // O POST das server actions vai para a URL da página — na raiz do
      // host — e precisa do MESMO rewrite do GET para achar o handler.
      if (!pathname.startsWith('/devolucoes')) destino.pathname = '/devolucoes'
      return NextResponse.rewrite(destino)
    }
    const raiz = req.nextUrl.clone()
    raiz.pathname = '/'
    raiz.search = ''
    return NextResponse.redirect(raiz)
  }

  if (ABERTO.some((rota) => pathname === rota || pathname.startsWith(`${rota}/`))) {
    return NextResponse.next()
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // Sem autenticação configurada o ERP roda aberto, como antes — é o modo de
  // desenvolvimento local. Em produção as duas variáveis existem, e a partir
  // daí não há caminho sem sessão.
  if (!url || !chave) return NextResponse.next()

  let resposta = NextResponse.next({ request: req })

  const sb = createServerClient(url, chave, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (novos: { name: string; value: string; options?: CookieOptions }[]) => {
        for (const { name, value } of novos) req.cookies.set(name, value)
        resposta = NextResponse.next({ request: req })
        for (const { name, value, options } of novos) resposta.cookies.set(name, value, options)
      },
    },
  })

  const {
    data: { user },
  } = await sb.auth.getUser()

  if (!user) {
    const destino = req.nextUrl.clone()
    destino.pathname = '/entrar'
    // Guarda para onde a pessoa ia: depois de entrar, ela continua o que
    // estava fazendo em vez de cair no Dashboard e ter que navegar de novo.
    destino.searchParams.set('de', `${pathname}${req.nextUrl.search}`)
    return NextResponse.redirect(destino)
  }

  /**
   * Lembra o período escolhido no Dashboard.
   *
   * O filtro vive na URL — é o que deixa o alerta abrir a fila exata e o link
   * ser compartilhável —, mas quem trabalha na tela todo dia escolhe "Mês
   * atual" uma vez e não quer reescolher a cada visita. O cookie guarda a
   * ÚLTIMA escolha; a URL continua mandando quando existe.
   *
   * Aqui, e não na página, porque componente de servidor não pode escrever
   * cookie durante a renderização — o middleware é o único ponto do caminho
   * que pode, e ele já passa por toda requisição.
   */
  if (pathname === '/') {
    const periodo = req.nextUrl.searchParams.get('periodo')
    if (periodo && PERIODOS_LEMBRADOS.has(periodo)) {
      resposta.cookies.set('frenesi-periodo', periodo, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
      })
    }
  }

  return resposta
}

export const config = {
  // Tudo, menos os arquivos estáticos e as imagens da marca — pedir sessão
  // para um PNG faria os ícones dos e-mails pararem de carregar.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|marca/|assets/|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
}
