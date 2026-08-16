/**
 * Os endereços públicos do sistema.
 *
 * Existe porque a URL da requisição NÃO serve para montar redirecionamento
 * aqui, e isso custou um bug inteiro para descobrir: dentro de uma função da
 * Netlify, `req.nextUrl` devolve a URL IMUTÁVEL DO DEPLOY —
 * `https://6a81957f...--erp-frenesi.netlify.app` — e não o domínio público.
 *
 * O estrago é silencioso e específico: o cookie de sessão é gravado para
 * `erp.frenesiperfumes.com.br`, o navegador é mandado para o host do deploy, e
 * lá o cookie não existe. A pessoa clica no link de redefinir senha, chega numa
 * tela de login pedindo a senha que ela justamente esqueceu, e nada no caminho
 * explica por quê.
 *
 * Por isso todo endereço que sai daqui para o navegador, para um e-mail ou para
 * um terceiro é montado a partir destas constantes, nunca da requisição.
 */

function limpar(valor: string | undefined, padrao: string): string {
  const bruto = (valor ?? '').trim().replace(/\/$/, '')
  return bruto || padrao
}

/** O ERP. Configurável porque o domínio pode mudar; o padrão não é adivinhado. */
export function urlDoErp(): string {
  return limpar(process.env.NEXT_PUBLIC_URL_DO_ERP, 'https://erp.frenesiperfumes.com.br')
}

/** O portal público de devoluções, que mora em subdomínio próprio. */
export function urlDoPortal(): string {
  return limpar(process.env.NEXT_PUBLIC_URL_DO_PORTAL, 'https://devolucoes.frenesiperfumes.com.br')
}

/**
 * Um endereço absoluto do ERP, a partir de um caminho.
 *
 * Rejeita `//outro.site` — que o navegador leria como protocolo relativo e
 * seguiria para fora do ERP. É a mesma trava do `de` no login: caminho vindo da
 * URL é entrada de terceiro até prova em contrário.
 */
export function noErp(caminho: string): URL {
  const seguro = caminho.startsWith('/') && !caminho.startsWith('//') ? caminho : '/'
  return new URL(seguro, urlDoErp())
}
