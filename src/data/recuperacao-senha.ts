import 'server-only'

import { entregar, emailConfigurado } from '@/data/email'
import { urlDoErp } from '@/data/enderecos'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

/**
 * "Esqueci a senha" — o link que devolve o acesso.
 *
 * O token NÃO é nosso. Quem o cria, guarda e expira é o Supabase Auth, pelo
 * `generateLink`; nós só entregamos o link. É a diferença entre usar uma
 * primitiva de segurança testada por muita gente e escrever a nossa — e a
 * nossa teria que acertar sozinha validade, uso único, comparação em tempo
 * constante e invalidação depois da troca.
 *
 * O que é nosso é a ENTREGA, e isso também é decisão: o e-mail sai pelo mesmo
 * provedor e pelo mesmo domínio verificado dos e-mails da operação. O envio
 * padrão do Supabase vem de um remetente compartilhado, com limite de poucas
 * mensagens por hora — exatamente o tipo de detalhe que só aparece no dia em
 * que alguém precisa entrar e o e-mail não chega.
 */

export function recuperacaoConfigurada(): boolean {
  return supabaseConfigurado() && emailConfigurado()
}

/**
 * Gera o link e manda.
 *
 * Devolve sempre `enviado: false` sem erro quando o e-mail não existe — quem
 * decide o que dizer ao usuário é a camada de cima, e ela diz a MESMA frase
 * nos dois casos. Uma tela que responde "não encontrei esse e-mail" é um
 * verificador de quem tem conta na empresa, de graça e sem login.
 */
export async function enviarLinkDeRedefinicao(
  email: string,
): Promise<{ enviado: boolean; erro?: string }> {
  const alvo = email.trim().toLowerCase()
  if (!recuperacaoConfigurada()) {
    return { enviado: false, erro: 'A recuperação de senha não está configurada neste ambiente.' }
  }

  // Sem `redirectTo`: o link pronto do Supabase (`action_link`) não é usado, e
  // pedir um redirecionamento que ainda não está na lista de permitidos do
  // projeto só criaria uma dependência de configuração para falhar depois.
  // O que aproveitamos é o `hashed_token` — o token de uso único.
  const { data, error } = await supabaseServer().auth.admin.generateLink({
    type: 'recovery',
    email: alvo,
  })

  if (error || !data?.properties?.hashed_token) {
    // E-mail sem conta é o caso esperado, não uma falha: silêncio de propósito.
    return { enviado: false }
  }

  // Montamos a URL em vez de usar `action_link` porque o link pronto do
  // Supabase passa pelo domínio DELES antes de voltar para cá. Apontando
  // direto para o ERP, quem recebe o e-mail vê o endereço da própria empresa —
  // e um link de redefinição de senha que aponta para um domínio estranho é a
  // primeira coisa que ensina alguém a clicar em link de phishing.
  const link = new URL(`${urlDoErp()}/api/auth/confirmar`)
  link.searchParams.set('token_hash', data.properties.hashed_token)
  link.searchParams.set('tipo', 'recovery')
  link.searchParams.set('proximo', '/redefinir-senha')

  await entregar({
    para: alvo,
    assunto: 'FRENESI OS — redefinir sua senha de acesso',
    html: htmlDoLink(link.toString()),
  })

  return { enviado: true }
}

/**
 * O e-mail.
 *
 * Sóbrio de propósito: é comunicação de sistema, não peça de marketing. Nada
 * de imagem remota, nada de rastreador — só o botão, o endereço em texto para
 * quem não confia em botão, e a linha que diz o que fazer se o pedido não foi
 * seu. Essa última linha é a que transforma um e-mail inesperado em aviso de
 * invasão em vez de mistério.
 */
function htmlDoLink(link: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark light" />
<title>Redefinir sua senha do FRENESI OS</title>
</head>
<body style="margin:0; padding:0; background-color:#070605;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background-color:#070605;">
  <tr>
    <td align="center" style="padding:36px 14px 48px 14px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="width:520px; max-width:100%; background-color:#0B0907; border:1px solid #6B5836; border-radius:16px;">
        <tr>
          <td style="padding:36px 38px 30px 38px;">

            <div style="font-family:Arial,Helvetica,sans-serif; font-size:10px; letter-spacing:4px; color:#D4AF6A; text-transform:uppercase;">FRENESI OS</div>

            <div style="font-family:Georgia,'Times New Roman',serif; font-size:27px; line-height:36px; color:#F2ECDF; padding-top:18px;">Redefinir sua <em style="color:#D4AF6A;">senha</em></div>

            <div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:23px; color:#A2957F; padding-top:16px;">
              Algu&eacute;m pediu para redefinir a senha de acesso ao sistema com este e-mail. Se foi voc&ecirc;, use o bot&atilde;o abaixo. O link vale por <strong style="color:#F2ECDF;">1 hora</strong> e s&oacute; pode ser usado uma vez.
            </div>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">
              <tr>
                <td style="border-radius:11px; background-color:#D4AF6A;">
                  <a href="${link}" style="display:inline-block; padding:14px 26px; font-family:Arial,Helvetica,sans-serif; font-size:13px; font-weight:bold; letter-spacing:1.4px; text-transform:uppercase; color:#14110C; text-decoration:none;">Escolher nova senha</a>
                </td>
              </tr>
            </table>

            <div style="font-family:Arial,Helvetica,sans-serif; font-size:11.5px; line-height:20px; color:#7A7062; padding-top:24px;">
              Se o bot&atilde;o n&atilde;o funcionar, copie e cole este endere&ccedil;o no navegador:<br />
              <span style="color:#A2957F; word-break:break-all;">${link}</span>
            </div>

            <div style="border-top:1px solid #2E2718; margin-top:26px; padding-top:18px; font-family:Arial,Helvetica,sans-serif; font-size:11.5px; line-height:20px; color:#7A7062;">
              <strong style="color:#A2957F;">N&atilde;o foi voc&ecirc;?</strong> Ignore esta mensagem — sua senha atual continua valendo e nada muda. Mas se isso se repetir, algu&eacute;m est&aacute; tentando entrar: troque a senha e avise quem administra o ERP.
            </div>

          </td>
        </tr>
      </table>
      <div style="font-family:Arial,Helvetica,sans-serif; font-size:10px; letter-spacing:2px; color:#4A443C; padding-top:18px; text-transform:uppercase;">Mensagem autom&aacute;tica do sistema · n&atilde;o responda</div>
    </td>
  </tr>
</table>
</body>
</html>`
}
