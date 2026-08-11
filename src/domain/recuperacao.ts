import { brl } from './format'

/**
 * O e-mail de recuperação de carrinho, escrito pela marca — não pelo gateway.
 *
 * O da Yampi é genérico de propósito: serve qualquer loja. Este aqui é da
 * FRENESI: preto e dourado, chama a pessoa pelo nome, lista exatamente os
 * decants que ficaram para trás e, quando a operação quiser, leva um cupom.
 * HTML de e-mail é tabela com estilo inline — é o que os clientes de e-mail
 * entendem; classe e flexbox morrem no Gmail.
 */

export interface DadosEmailCarrinho {
  /** Nome do cliente como veio do checkout; null vira saudação neutra. */
  nome: string | null
  itens: string[]
  valor: number
  /** Para onde o botão aponta: o link do carrinho, ou a home da loja. */
  linkCheckout: string | null
  cupom?: { codigo: string; pct: number } | null
}

const escapaHtml = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function emailRecuperacao(d: DadosEmailCarrinho): { assunto: string; html: string } {
  const primeiroNome = d.nome?.trim().split(/\s+/)[0] ?? null
  const assunto = primeiroNome
    ? `${primeiroNome}, seus decants ainda estão guardados`
    : 'Seus decants ainda estão guardados'

  const linhasItens = d.itens
    .map(
      (i) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #EDE6D6;font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.5;color:#1A1A1A;">
            ${escapaHtml(i)}
          </td>
        </tr>`,
    )
    .join('')

  const blocoCupom = d.cupom
    ? `
      <tr>
        <td style="padding:22px 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px dashed #B08D3E;border-radius:10px;">
            <tr>
              <td style="padding:16px 20px;text-align:center;">
                <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8A7440;">
                  ${d.cupom.pct}% de desconto para fechar hoje
                </p>
                <p style="margin:0;font-family:'Courier New',Courier,monospace;font-weight:bold;font-size:20px;letter-spacing:.08em;color:#1A1A1A;">
                  ${escapaHtml(d.cupom.codigo)}
                </p>
                <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8A8374;">
                  É só aplicar no checkout · uso único
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : ''

  const botao = d.linkCheckout
    ? `
      <tr>
        <td style="padding:26px 0 6px;text-align:center;">
          <a href="${escapaHtml(d.linkCheckout)}"
             style="display:inline-block;background:#141414;color:#EFD18C;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:13px;letter-spacing:.08em;text-transform:uppercase;padding:15px 34px;border-radius:8px;">
            Concluir meu pedido
          </a>
        </td>
      </tr>`
    : ''

  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#F6F1E7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F1E7;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
            <tr>
              <td style="padding:0 0 22px;text-align:center;">
                <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;letter-spacing:.34em;color:#141414;">FRENESI</p>
                <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#8A7440;">decants de perfumaria</p>
              </td>
            </tr>
            <tr>
              <td style="background:#FFFDF8;border:1px solid #EAE2CF;border-radius:14px;padding:34px 36px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td>
                      <p style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:1.35;color:#1A1A1A;">
                        ${primeiroNome ? `${escapaHtml(primeiroNome)}, ` : ''}deixamos tudo separado.
                      </p>
                      <p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.65;color:#4C463A;">
                        Você montou um carrinho na FRENESI e não finalizou — acontece.
                        ${d.itens.length === 1 ? 'O seu decant continua aqui' : 'Os seus decants continuam aqui'},
                        fracionados do frasco original e prontos para envio.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#8A7440;">No seu carrinho</p>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        ${linhasItens}
                        <tr>
                          <td style="padding:12px 0 0;text-align:right;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#4C463A;">
                            Total: <strong style="color:#1A1A1A;font-size:15px;">${brl(d.valor)}</strong>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  ${blocoCupom}
                  ${botao}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 10px 0;text-align:center;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#9A927F;">
                  Alguma dúvida sobre um perfume? É só responder este e-mail.<br>
                  Você recebeu esta mensagem porque deixou itens no carrinho da FRENESI.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { assunto, html }
}
