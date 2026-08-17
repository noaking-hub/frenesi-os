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
  // Descadastro de e-mail: a página e o endpoint de um clique do Gmail. Quem
  // quer sair da lista não vai criar conta para isso, e o cliente de e-mail
  // que chama o POST não tem cookie nenhum. O que autoriza é a assinatura do
  // link, conferida na própria rota.
  '/descadastrar',
  '/api/descadastrar',
  // Webhooks e rotinas: autenticam por token próprio no cabeçalho, não por
  // sessão de navegador. Exigir cookie aqui quebraria as integrações — e a
  // quebra é MUDA: o agendador recebe o redirect para /entrar, a página de
  // login responde 200, e a rotina "sucede" sem ter rodado. Foi exatamente
  // assim que o pulso de pedidos ficou surdo até a rota entrar nesta lista.
  '/api/frenet',
  '/api/melhorenvio',
  // Só o ESPELHO do CRM, que é agendado e confere CRON_SEGREDO. O prefixo
  // inteiro estava aberto, e com ele duas rotas sem verificação nenhuma:
  // `/api/crm/recuperacao` dispara e-mail para até mil clientes e CRIA CUPOM
  // REAL na Yampi (um `{tipo:'unico',pct:99}` passava, porque a validação só
  // recusa 100% ou mais), e `/api/crm/cashback` escreve no banco com service
  // role. As duas são chamadas pelo navegador de quem já está logado, então
  // o cookie vai junto e nada quebra ao fechar. O repositório é público: o
  // formato do corpo estava documentado para quem lesse o código.
  '/api/crm/espelhar',
  '/api/financeiro',
  '/api/pedidos/pulso',
  // Os avisos ao cliente, agendados de dez em dez minutos. Estavam DE FORA
  // desta lista e a falha era exatamente a que o comentário acima descreve: o
  // agendador recebia o redirect para /entrar, a página de login respondia
  // 200 com HTML, e a rotina "sucedia" sem ter enviado nada. Só apareceu
  // porque o histórico do pg_net guarda o corpo da resposta.
  '/api/pedidos/avisos',
  '/api/diagnostico',
  '/api/pagarme',
  '/api/pagaleve',
  // A vigília do Gerente é agendada e autentica por CRON_SEGREDO. Só ELA, e
  // não `/api/assessor` inteiro: a conversa e a confirmação de ações são
  // chamadas pelo navegador e continuam exigindo sessão. Abrir o prefixo todo
  // deixaria qualquer um perguntar o saldo do caixa sem estar logado.
  '/api/assessor/vigilia',
  // Webhook do WhatsApp: a Meta chama sem cookie. O GET confere o
  // `WHATSAPP_VERIFY_TOKEN` e o POST confere a assinatura HMAC-SHA256 do
  // corpo cru contra o `WHATSAPP_APP_SECRET`. Sem o segredo, a rota recusa
  // tudo — antes ela aceitava qualquer POST e confiava no número que o
  // próprio corpo declarava.
  '/api/whatsapp',
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
    // O descadastro responde nos DOIS domínios: o link já saiu em e-mails
    // apontando para um deles, e redirecionar para a raiz do portal deixaria
    // quem clicou olhando um formulário de devolução sem entender por quê.
    if (pathname.startsWith('/descadastrar') || pathname.startsWith('/api/descadastrar')) {
      return NextResponse.next()
    }
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
    destino.search = ''
    // Quem chega em /redefinir-senha sem sessão veio de um link de e-mail que
    // não valeu. Mandá-lo para o login com "de=/redefinir-senha" seria pedir
    // justamente a senha que ele esqueceu, sem dizer o que houve. O recado é
    // outro, e é o único útil aqui: peça outro link.
    //
    // A rota fica PROTEGIDA de propósito, e não aberta. Aberta, o middleware
    // devolveria cedo e ninguém renovaria o token — e a renovação só pode
    // acontecer aqui, no único ponto do caminho que grava cookie. Uma sessão de
    // recuperação vencida seria renovada pelo Server Component, que não pode
    // gravar: o Supabase rotacionaria o refresh token do lado dele, o navegador
    // ficaria com o token já queimado, e ao enviar o formulário a pessoa leria
    // "o link expirou" logo depois de a tela ter aberto normalmente.
    if (pathname === '/redefinir-senha') {
      destino.searchParams.set('recado', 'link-vencido')
    } else {
      // Guarda para onde a pessoa ia: depois de entrar, ela continua o que
      // estava fazendo em vez de cair no Dashboard e ter que navegar de novo.
      destino.searchParams.set('de', `${pathname}${req.nextUrl.search}`)
    }
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
