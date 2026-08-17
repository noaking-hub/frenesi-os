import 'server-only'

/**
 * Envio de e-mail transacional.
 *
 * O provedor é um detalhe trocável — o que não é trocável é a regra de que
 * nada sai daqui sem passar pelo log de `notificacoes_enviadas`, que é quem
 * garante um e-mail por fato. Este arquivo só sabe entregar; decidir o que
 * merece ser entregue é do domínio.
 */

function limpa(valor: string | undefined): string {
  return (valor ?? '').trim().replace(/^["']|["']$/g, '')
}

export function credenciaisEmail() {
  return {
    chave: limpa(process.env.RESEND_API_KEY),
    // Precisa ser um domínio verificado no provedor. Remetente em domínio não
    // autenticado é entregue na caixa de spam, quando é entregue.
    remetente: limpa(process.env.EMAIL_REMETENTE),
    responder: limpa(process.env.EMAIL_RESPONDER_PARA),
  }
}

/**
 * A URL PÚBLICA do ERP — a que os e-mails usam para servir imagem.
 *
 * A logomarca e os ícones das redes precisam de endereço absoluto: cliente de
 * e-mail não tem "origem". Ela vem de `URL`, que a Netlify define com o
 * domínio principal do site (e não com a URL do deploy, que muda a cada
 * publicação e deixaria a logo quebrada nos e-mails antigos).
 */
export function siteDoErp(): string {
  const bruto =
    process.env.URL?.trim() ||
    process.env.NEXT_PUBLIC_URL?.trim() ||
    'https://erp.frenesiperfumes.com.br'
  return bruto.replace(/\/+$/, '')
}

export function emailConfigurado(): boolean {
  const { chave, remetente } = credenciaisEmail()
  return Boolean(chave && remetente)
}

export interface Anexo {
  nome: string
  /** Conteúdo em texto; vai codificado em base64 para o provedor. */
  conteudo?: string
  /** Binário (PDF, imagem) já em base64 — texto re-codificado corromperia. */
  conteudoBase64?: string
}

export interface Entrega {
  para: string
  assunto: string
  html: string
  /** Arquivos que seguem junto — o razão do mês para o escritório, por exemplo. */
  anexos?: Anexo[]
  /**
   * URL de descadastro, para os cabeçalhos `List-Unsubscribe`.
   *
   * Só em MARKETING. Gmail e Outlook mostram um "Cancelar inscrição" nativo ao
   * lado do remetente quando o cabeçalho existe, e quem sai por ali não
   * denuncia como spam — que é o que derruba a reputação do domínio e leva
   * junto os avisos de pedido. O `List-Unsubscribe-Post` é o que faz esse
   * botão funcionar com UM clique, sem abrir o navegador (RFC 8058).
   */
  descadastrar?: string
}

/**
 * Entrega uma mensagem. Devolve o id do provedor, que é o que permite
 * rastrear a entrega depois — sem ele, "enviado" é só uma afirmação nossa.
 */
export async function entregar(m: Entrega): Promise<{ id: string }> {
  const { chave, remetente, responder } = credenciaisEmail()
  if (!chave || !remetente) {
    throw new Error(
      'Configure RESEND_API_KEY e EMAIL_REMETENTE no .env.local. O remetente precisa estar num ' +
        'domínio verificado no provedor — sem SPF e DKIM, o e-mail cai em spam.',
    )
  }

  const resposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${chave}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: remetente,
      to: [m.para],
      subject: m.assunto,
      // `{site}` resolvido AQUI, e não em cada remetente.
      //
      // A logomarca dos modelos é servida pelo próprio ERP, o que exige um
      // endereço absoluto no HTML. Deixar essa substituição a cargo de quem
      // chama já custou uma logo quebrada: três dos remetentes aplicavam,
      // os avisos de pedido e de devolução não — e ninguém percebia, porque a
      // logo vinha de um CDN de terceiro que não precisava disso. Uma vez
      // aqui vale para todos, inclusive os que forem escritos amanhã.
      html: m.html.split('{site}').join(siteDoErp()),
      ...(responder ? { reply_to: responder } : {}),
      ...(m.descadastrar
        ? {
            headers: {
              'List-Unsubscribe': `<${m.descadastrar}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          }
        : {}),
      ...(m.anexos?.length
        ? {
            attachments: m.anexos.map((a) => ({
              filename: a.nome,
              content: a.conteudoBase64 ?? Buffer.from(a.conteudo ?? '', 'utf8').toString('base64'),
            })),
          }
        : {}),
    }),
    cache: 'no-store',
  })

  if (resposta.status === 401 || resposta.status === 403) {
    throw new Error('O provedor recusou a chave de API. Gere outra e atualize o .env.local.')
  }
  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '')
    throw new Error(
      `O provedor respondeu ${resposta.status}${detalhe ? ` — ${detalhe.slice(0, 200)}` : ''}.`,
    )
  }

  const corpo = (await resposta.json()) as { id?: string }
  return { id: corpo.id ?? '' }
}

/**
 * Corpo da mensagem na identidade da marca.
 *
 * Tabela e estilo em linha não são desleixo: cliente de e-mail ignora folha
 * de estilo externa e boa parte ignora até `<style>` no cabeçalho.
 */
export function montarHtml({
  titulo,
  saudacao,
  corpo,
  acao,
}: {
  titulo: string
  saudacao: string
  corpo: string[]
  acao?: { texto: string; url: string }
}): string {
  const paragrafos = corpo
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3a3733">${p}</p>`,
    )
    .join('')

  const botao = acao
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0">
         <tr><td style="background:#1a1a1a;border-radius:8px">
           <a href="${acao.url}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:600;color:#efd18c;text-decoration:none">${acao.texto}</a>
         </td></tr>
       </table>`
    : ''

  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:0;background:#f6f4f0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f0;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
        <tr><td style="background:#111112;padding:26px 30px">
          <span style="font-family:Georgia,serif;font-size:22px;letter-spacing:.14em;color:#efd18c">FRENESI</span>
        </td></tr>
        <tr><td style="padding:30px">
          <h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:21px;line-height:1.3;color:#1a1a1a;font-weight:600">${titulo}</h1>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3a3733">${saudacao}</p>
          ${paragrafos}
          ${botao}
        </td></tr>
        <tr><td style="padding:18px 30px 26px;border-top:1px solid #ece8e1">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#8a857d">
            Frenesi Perfumes · este aviso foi enviado porque você tem um pedido conosco.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
