import 'server-only'

/**
 * Turnstile — a checagem de "é gente?" da Cloudflare.
 *
 * Escolhido em vez do reCAPTCHA por dois motivos práticos: não pede que o
 * usuário selecione semáforos, e não manda o comportamento de quem trabalha
 * aqui para a máquina de publicidade do Google.
 *
 * DESLIGADO ENQUANTO NÃO HOUVER CHAVE — e isso é deliberado. Um cadeado que
 * tranca antes de existir chave é um cadeado que deixa o dono do ERP do lado
 * de fora. Enquanto `TURNSTILE_SECRET_KEY` não estiver definida, a porta
 * continua exigindo senha e contando tentativas; o que falta é só a camada
 * contra robô. `docs/SEGURANCA-LOGIN.md` explica como ligar.
 */

const VERIFICACAO = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export function turnstileConfigurado(): boolean {
  return Boolean(
    process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  )
}

export interface ResultadoTurnstile {
  ok: boolean
  erro?: string
}

/**
 * Confere o token que o widget produziu no navegador.
 *
 * O token é de uso único e vale poucos minutos — quem tentar reaproveitar um
 * recebe `timeout-or-duplicate` da própria Cloudflare, que é justamente o que
 * impede gravar uma resposta válida e repetir mil vezes.
 */
export async function conferirTurnstile(
  token: string | null,
  ip: string | null,
): Promise<ResultadoTurnstile> {
  if (!turnstileConfigurado()) return { ok: true }
  if (!token) return { ok: false, erro: 'A verificação de segurança não foi concluída.' }

  const corpo = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY!,
    response: token,
  })
  if (ip) corpo.set('remoteip', ip)

  try {
    const r = await fetch(VERIFICACAO, {
      method: 'POST',
      body: corpo,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    const dados = (await r.json()) as { success?: boolean; 'error-codes'?: string[] }
    if (dados.success) return { ok: true }

    const codigos = dados['error-codes'] ?? []
    // Token repetido ou vencido é o caso comum de quem deixou a aba aberta: a
    // mensagem manda recarregar em vez de acusar a pessoa de ser um robô.
    if (codigos.includes('timeout-or-duplicate')) {
      return { ok: false, erro: 'A verificação expirou. Recarregue a página e tente de novo.' }
    }
    console.error('[turnstile] recusou:', codigos.join(', '))
    return { ok: false, erro: 'A verificação de segurança não passou. Tente de novo.' }
  } catch (e) {
    // A Cloudflare fora do ar não pode derrubar o login do ERP inteiro. Cai
    // para o que sempre houve — senha e contagem de tentativas — e registra.
    console.error('[turnstile] não respondeu:', e)
    return { ok: true }
  }
}
