/**
 * Os HTMLs VALIDADOS dos e-mails da marca. A logomarca vem do CDN da
 * Brandfetch; os ícones de redes são os PNGs da operação, servidos por uma
 * URL pública estável (edge function do Supabase) — assim carregam no Gmail
 * seja o envio local ou da Netlify. O ?v=2 do TikTok fura o cache do proxy
 * do Gmail, que guardou a primeira publicação (corrompida) por um ano.
 * São o PADRÃO dos modelos: valem até alguém editar na Central de E-mails.
 * Cópias de referência em docs/emails/.
 *
 * FUNDO CLARO. Nasceram escuros — preto com moldura dourada — e ficava
 * bonito no navegador e ruim na caixa de entrada: e-mail escuro chega no
 * meio de uma lista de e-mails claros, o Gmail em modo claro desenha uma
 * mancha preta, e quem lê no celular com pouca luz vê o ouro sumir. A
 * paleta agora é a MESMA do portal de devoluções — creme #EDE6DA, cartão
 * #FFFDF9, tinta #241F18, ouro #8A6A2F — porque o cliente que recebe o
 * aviso e clica no link precisa reconhecer o mesmo lugar. O botão continua
 * dourado sólido: é a única superfície de destaque, e é ele que a pessoa
 * tem que achar sem procurar.
 */

export const HTML_VALIDADO_CARRINHO = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title>FRENESI — seus produtos ainda estão guardados</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; background-color:#EDE6DA; }
  table { border-collapse:separate; }
  img { border:0; outline:none; text-decoration:none; }
  @media only screen and (max-width:620px) {
    .w600 { width:100% !important; max-width:100% !important; }
    .win { width:100% !important; }
    .pad { padding-left:20px !important; padding-right:20px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#EDE6DA;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background-color:#EDE6DA; margin:0; padding:0;">
  <tr>
    <td align="center" style="padding:28px 12px 44px 12px; background-color:#EDE6DA;">

      <span style="display:none; font-size:1px; color:#EDE6DA; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">Seus produtos continuam reservados — e seu cupom vale por 48 horas.</span>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" class="w600" style="width:680px; max-width:680px; background-color:#FFFDF9; border:1px solid #D8C49B; border-radius:16px;">
        <tr>
          <td style="padding:8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="662" class="win" style="width:662px; border:1px solid #E4DAC5; border-radius:10px;">

              <tr>
                <td align="center" class="pad" style="padding:44px 40px 0 40px;">
                  <img src="https://cdn.brandfetch.io/frenesiperfumes.com.br/w/172/h/36/theme/light/fallback/404/type/logo?c=1id1bN_oGG366WGvBYf" width="172" alt="FRENESI" style="display:block; width:172px; height:auto; border:0;" />
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="570" class="win" style="width:570px;">
                    <tr>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #D8C49B; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                      <td align="center" valign="middle" style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F; padding:0 14px;">SUA SELE&Ccedil;&Atilde;O CONTINUA RESERVADA</td>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #D8C49B; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:38px; line-height:48px; mso-line-height-rule:exactly; color:#241F18;">{nome}, seus produtos ainda est&atilde;o <em style="font-style:italic; color:#8A6A2F;">guardados</em></div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:25px; mso-line-height-rule:exactly; color:#6B6355; padding-top:20px;">Os produtos que voc&ecirc; escolheu seguem separados com o seu nome — mas o estoque &eacute; limitado e a reserva n&atilde;o dura para sempre.</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:34px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px; border:1px solid #D8C49B; border-radius:12px; background-color:#FAF6EE;">
                    <tr>
                      <td align="center" style="padding:24px 26px 0 26px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="546" class="win" style="width:546px;">
                          <tr>
                            <td width="90" valign="middle" style="width:90px;"><div style="border-top:1px solid #DCCFB1; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                            <td align="center" valign="middle" style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F; padding:0 12px;">NO SEU CARRINHO</td>
                            <td width="90" valign="middle" style="width:90px;"><div style="border-top:1px solid #DCCFB1; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:18px 26px 0 26px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="546" class="win" style="width:546px; border:1px solid #E4DAC5; border-radius:8px; background-color:#F4EFE3;">
                          <tr>
                            <td style="padding:18px 20px; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#241F18;">{itens}</td>
                          </tr>
                          <tr>
                            <td style="padding:0 20px;">
                              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="506" style="width:506px; border-top:1px dashed #DFD4BC;">
                                <tr>
                                  <td align="left" style="padding:16px 0 18px 0; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:3px; color:#6B6355;">TOTAL</td>
                                  <td align="right" style="padding:16px 0 18px 0; font-family:Georgia,'Times New Roman',serif; font-size:24px; line-height:28px; mso-line-height-rule:exactly; color:#8A6A2F;">{total}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr><td style="height:24px; line-height:24px; font-size:0;">&nbsp;</td></tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:34px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px;">
                    <tr>
                      <td bgcolor="#D4AF6A" align="center" style="background-color:#D4AF6A; background-image:linear-gradient(180deg,#EAC97E,#C89A4E); border-radius:10px; padding:19px 20px;">
                        <a href="{link}" style="display:block; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2.5px; color:#14100A; text-decoration:none; font-weight:bold;">FINALIZAR MINHA COMPRA</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              [[cupom]]
              <tr>
                <td align="center" class="pad" style="padding:2px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#8A6A2F;">&#9670;</div>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px; border:1px solid #D8C49B; border-radius:12px; background-color:#FAF6EE;">
                    <tr>
                      <td align="center" style="padding:28px 30px 30px 30px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">UM INCENTIVO PARA VOLTAR</div>
                        <div style="font-family:Georgia,'Times New Roman',serif; font-size:26px; line-height:34px; mso-line-height-rule:exactly; color:#241F18; padding-top:14px;">{desconto}% de desconto com o c&oacute;digo</div>
                        <div style="padding-top:18px;">
                          <span style="display:inline-block; font-family:'Courier New',Courier,monospace; font-size:22px; line-height:28px; mso-line-height-rule:exactly; letter-spacing:7px; color:#5E4A1E; border:1px dashed #D8C49B; border-radius:8px; padding:12px 28px;">{cupom}</span>
                        </div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; mso-line-height-rule:exactly; color:#6B6355; padding-top:16px;">V&aacute;lido por apenas <strong style="color:#5E4A1E;">48 horas</strong> &nbsp;&middot;&nbsp; aplique no checkout</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#8A6A2F;">&#9670;</div>
                </td>
              </tr>
              [[/cupom]]

              <tr>
                <td align="center" class="pad" style="padding:32px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:19px; line-height:26px; font-style:italic; mso-line-height-rule:exactly; color:#8A6A2F;">Sele&ccedil;&atilde;o premium, pronta para envio!</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:22px; mso-line-height-rule:exactly; color:#6B6355; padding-top:10px;">Parcelamento em at&eacute; 6x sem juros ou +10% de desconto no PIX.</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:30px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="570" class="win" style="width:570px; border-top:1px solid #E4DAC5;">
                    <tr>
                      <td align="center" style="padding-top:26px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">ATENDIMENTO OFICIAL</div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:23px; mso-line-height-rule:exactly; color:#6B6355; padding-top:10px;">D&uacute;vidas sobre as fragr&acirc;ncias?<br />Fale com a gente no <a href="https://wa.me/5532998661887" style="color:#8A6A2F; text-decoration:underline;">WhatsApp (32)&nbsp;99866-1887</a>.</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 40px 0 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2px; color:#7A7263; padding-bottom:12px;">@frenesiperfumes</div>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:auto;">
                    <tr>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://wa.me/5532998661887" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-whatsapp.png" width="40" height="40" alt="WhatsApp" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://instagram.com/frenesiperfumes" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-instagram.png" width="40" height="40" alt="Instagram" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://tiktok.com/@frenesiperfumes" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-tiktok.png?v=2" width="40" height="40" alt="TikTok" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:24px 40px 0 40px;">
                  <div style="font-family:Georgia,serif; font-size:10px; line-height:10px; color:#D8C49B;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:16px 40px 40px 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; mso-line-height-rule:exactly; color:#8A8274;">Voc&ecirc; recebeu este e-mail porque iniciou uma compra em nossa loja.</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; mso-line-height-rule:exactly; padding-top:6px;"><a href="https://frenesiperfumes.com.br/descadastrar" style="color:#7A7263; text-decoration:underline;">Cancelar inscri&ccedil;&atilde;o</a></div>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

export const HTML_VALIDADO_GIFT = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title>Feliz aniversário — um presente da FRENESI</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; background-color:#EDE6DA; }
  table { border-collapse:separate; }
  img { border:0; outline:none; text-decoration:none; }
  @media only screen and (max-width:620px) {
    .w600 { width:100% !important; max-width:100% !important; }
    .win { width:100% !important; }
    .pad { padding-left:20px !important; padding-right:20px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#EDE6DA;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background-color:#EDE6DA; margin:0; padding:0;">
  <tr>
    <td align="center" style="padding:28px 12px 44px 12px; background-color:#EDE6DA;">

      <span style="display:none; font-size:1px; color:#EDE6DA; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">Um presente da FRENESI para o seu anivers&aacute;rio — {desconto}% de desconto para celebrar.</span>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" class="w600" style="width:680px; max-width:680px; background-color:#FFFDF9; border:1px solid #D8C49B; border-radius:16px;">
        <tr>
          <td style="padding:8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="662" class="win" style="width:662px; border:1px solid #E4DAC5; border-radius:10px;">

              <tr>
                <td align="center" class="pad" style="padding:44px 40px 0 40px;">
                  <img src="https://cdn.brandfetch.io/frenesiperfumes.com.br/w/172/h/36/theme/light/fallback/404/type/logo?c=1id1bN_oGG366WGvBYf" width="172" alt="FRENESI" style="display:block; width:172px; height:auto; border:0;" />
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="570" class="win" style="width:570px;">
                    <tr>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #D8C49B; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                      <td align="center" valign="middle" style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F; padding:0 14px;">HOJE O DIA &Eacute; SEU</td>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #D8C49B; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:38px; line-height:48px; mso-line-height-rule:exactly; color:#241F18;">Feliz anivers&aacute;rio, {nome}</div>
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:24px; line-height:32px; font-style:italic; mso-line-height-rule:exactly; color:#8A6A2F; padding-top:8px;">o presente de hoje &eacute; por nossa conta</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:25px; mso-line-height-rule:exactly; color:#6B6355; padding-top:20px;">Datas especiais pedem fragr&acirc;ncias especiais. Para celebrar com voc&ecirc;, preparamos um mimo exclusivo de anivers&aacute;rio — v&aacute;lido em toda a nossa cole&ccedil;&atilde;o.</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:34px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#8A6A2F;">&#9670;</div>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px; border:1px solid #D8C49B; border-radius:12px; background-color:#FAF6EE;">
                    <tr>
                      <td align="center" style="padding:28px 30px 30px 30px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">O SEU PRESENTE</div>
                        <div style="font-family:Georgia,'Times New Roman',serif; font-size:26px; line-height:34px; mso-line-height-rule:exactly; color:#241F18; padding-top:14px;">{desconto}% de desconto com o c&oacute;digo</div>
                        <div style="padding-top:18px;">
                          <span style="display:inline-block; font-family:'Courier New',Courier,monospace; font-size:22px; line-height:28px; mso-line-height-rule:exactly; letter-spacing:7px; color:#5E4A1E; border:1px dashed #D8C49B; border-radius:8px; padding:12px 28px;">{cupom}</span>
                        </div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; mso-line-height-rule:exactly; color:#6B6355; padding-top:16px;">Seu presente &eacute; v&aacute;lido por <strong style="color:#5E4A1E;">{validade} dias</strong> &nbsp;&middot;&nbsp; aplique no checkout</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#8A6A2F;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px;">
                    <tr>
                      <td bgcolor="#D4AF6A" align="center" style="background-color:#D4AF6A; background-image:linear-gradient(180deg,#EAC97E,#C89A4E); border-radius:10px; padding:19px 20px;">
                        <a href="https://frenesiperfumes.com.br" style="display:block; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2.5px; color:#14100A; text-decoration:none; font-weight:bold;">RESGATAR MEU PRESENTE</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:32px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:19px; line-height:26px; font-style:italic; mso-line-height-rule:exactly; color:#8A6A2F;">Sele&ccedil;&atilde;o premium, pronta para envio!</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:22px; mso-line-height-rule:exactly; color:#6B6355; padding-top:10px;">Parcelamento em at&eacute; 6x sem juros ou +10% de desconto no PIX.</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:30px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="570" class="win" style="width:570px; border-top:1px solid #E4DAC5;">
                    <tr>
                      <td align="center" style="padding-top:26px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">ATENDIMENTO OFICIAL</div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:23px; mso-line-height-rule:exactly; color:#6B6355; padding-top:10px;">D&uacute;vidas sobre as fragr&acirc;ncias?<br />Fale com a gente no <a href="https://wa.me/5532998661887" style="color:#8A6A2F; text-decoration:underline;">WhatsApp (32)&nbsp;99866-1887</a>.</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 40px 0 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2px; color:#7A7263; padding-bottom:12px;">@frenesiperfumes</div>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:auto;">
                    <tr>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://wa.me/5532998661887" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-whatsapp.png" width="40" height="40" alt="WhatsApp" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://instagram.com/frenesiperfumes" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-instagram.png" width="40" height="40" alt="Instagram" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://tiktok.com/@frenesiperfumes" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-tiktok.png?v=2" width="40" height="40" alt="TikTok" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:24px 40px 0 40px;">
                  <div style="font-family:Georgia,serif; font-size:10px; line-height:10px; color:#D8C49B;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:16px 40px 40px 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; mso-line-height-rule:exactly; color:#8A8274;">Voc&ecirc; recebeu este e-mail porque faz parte da comunidade FRENESI.</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; mso-line-height-rule:exactly; padding-top:6px;"><a href="https://frenesiperfumes.com.br/descadastrar" style="color:#7A7263; text-decoration:underline;">Cancelar inscri&ccedil;&atilde;o</a></div>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

export const HTML_VALIDADO_CASHBACK = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title>FRENESI — seu cashback está esperando</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; background-color:#EDE6DA; }
  table { border-collapse:separate; }
  img { border:0; outline:none; text-decoration:none; }
  @media only screen and (max-width:620px) {
    .w600 { width:100% !important; max-width:100% !important; }
    .win { width:100% !important; }
    .pad { padding-left:20px !important; padding-right:20px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#EDE6DA;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background-color:#EDE6DA; margin:0; padding:0;">
  <tr>
    <td align="center" style="padding:28px 12px 44px 12px; background-color:#EDE6DA;">

      <span style="display:none; font-size:1px; color:#EDE6DA; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">Voc&ecirc; tem {saldo} em cashback na FRENESI — v&aacute;lido at&eacute; {validade}.</span>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" class="w600" style="width:680px; max-width:680px; background-color:#FFFDF9; border:1px solid #D8C49B; border-radius:16px;">
        <tr>
          <td style="padding:8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="662" class="win" style="width:662px; border:1px solid #E4DAC5; border-radius:10px;">

              <tr>
                <td align="center" class="pad" style="padding:44px 40px 0 40px;">
                  <img src="https://cdn.brandfetch.io/frenesiperfumes.com.br/w/172/h/36/theme/light/fallback/404/type/logo?c=1id1bN_oGG366WGvBYf" width="172" alt="FRENESI" style="display:block; width:172px; height:auto; border:0;" />
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="570" class="win" style="width:570px;">
                    <tr>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #D8C49B; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                      <td align="center" valign="middle" style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F; padding:0 14px;">VOC&Ecirc; TEM SALDO NA FRENESI</td>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #D8C49B; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:38px; line-height:48px; mso-line-height-rule:exactly; color:#241F18;">{nome}, seu cashback est&aacute; esperando</div>
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:24px; line-height:32px; font-style:italic; mso-line-height-rule:exactly; color:#8A6A2F; padding-top:8px;">e ele tem prazo para ser usado</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:25px; mso-line-height-rule:exactly; color:#6B6355; padding-top:20px;">O cashback das suas compras anteriores continua dispon&iacute;vel na sua conta — mas ele expira. D&aacute; para usar em qualquer produto da loja, direto no checkout.</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:34px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#8A6A2F;">&#9670;</div>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px; border:1px solid #D8C49B; border-radius:12px; background-color:#FAF6EE;">
                    <tr>
                      <td align="center" style="padding:28px 30px 30px 30px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">O SEU SALDO</div>
                        <div style="font-family:Georgia,'Times New Roman',serif; font-size:26px; line-height:34px; mso-line-height-rule:exactly; color:#241F18; padding-top:14px;">Voc&ecirc; tem para usar agora</div>
                        <div style="padding-top:18px;">
                          <span style="display:inline-block; font-family:Georgia,'Times New Roman',serif; font-size:36px; line-height:44px; mso-line-height-rule:exactly; color:#5E4A1E; border:1px dashed #D8C49B; border-radius:8px; padding:14px 36px;">{saldo}</span>
                        </div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; mso-line-height-rule:exactly; color:#6B6355; padding-top:16px;">V&aacute;lido at&eacute; <strong style="color:#5E4A1E;">{validade}</strong> &nbsp;&middot;&nbsp; o desconto entra sozinho no checkout</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#8A6A2F;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px;">
                    <tr>
                      <td bgcolor="#D4AF6A" align="center" style="background-color:#D4AF6A; background-image:linear-gradient(180deg,#EAC97E,#C89A4E); border-radius:10px; padding:19px 20px;">
                        <a href="https://frenesiperfumes.com.br" style="display:block; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2.5px; color:#14100A; text-decoration:none; font-weight:bold;">USAR MEU CASHBACK</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:32px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:19px; line-height:26px; font-style:italic; mso-line-height-rule:exactly; color:#8A6A2F;">Sele&ccedil;&atilde;o premium, pronta para envio!</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:22px; mso-line-height-rule:exactly; color:#6B6355; padding-top:10px;">Parcelamento em at&eacute; 6x sem juros ou +10% de desconto no PIX.</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:30px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="570" class="win" style="width:570px; border-top:1px solid #E4DAC5;">
                    <tr>
                      <td align="center" style="padding-top:26px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">ATENDIMENTO OFICIAL</div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:23px; mso-line-height-rule:exactly; color:#6B6355; padding-top:10px;">D&uacute;vidas sobre as fragr&acirc;ncias?<br />Fale com a gente no <a href="https://wa.me/5532998661887" style="color:#8A6A2F; text-decoration:underline;">WhatsApp (32)&nbsp;99866-1887</a>.</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 40px 0 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2px; color:#7A7263; padding-bottom:12px;">@frenesiperfumes</div>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:auto;">
                    <tr>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://wa.me/5532998661887" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-whatsapp.png" width="40" height="40" alt="WhatsApp" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://instagram.com/frenesiperfumes" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-instagram.png" width="40" height="40" alt="Instagram" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://tiktok.com/@frenesiperfumes" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-tiktok.png?v=2" width="40" height="40" alt="TikTok" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:24px 40px 0 40px;">
                  <div style="font-family:Georgia,serif; font-size:10px; line-height:10px; color:#D8C49B;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:16px 40px 40px 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; mso-line-height-rule:exactly; color:#8A8274;">Voc&ecirc; recebeu este e-mail porque faz parte da comunidade FRENESI.</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; mso-line-height-rule:exactly; padding-top:6px;"><a href="https://frenesiperfumes.com.br/descadastrar" style="color:#7A7263; text-decoration:underline;">Cancelar inscri&ccedil;&atilde;o</a></div>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`


/**
 * Aviso de ENVIO. Mesma moldura validada dos outros três.
 *
 * O bloco em destaque aqui não é cupom nem saldo: é o CÓDIGO DE RASTREIO, que
 * é o que o cliente veio buscar. O botão leva à página da transportadora com
 * o código embutido — Frenet para Correios e Jadlog, Melhor Rastreio para
 * J&T, Total e Buslog. Placeholders: {nome}, {pedido}, {codigo},
 * {transportadora}, {link}.
 */
export const HTML_VALIDADO_ENVIO = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title>FRENESI &mdash; seu pedido est&aacute; a caminho</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; background-color:#EDE6DA; }
  table { border-collapse:separate; }
  img { border:0; outline:none; text-decoration:none; }
  @media only screen and (max-width:620px) {
    .w600 { width:100% !important; max-width:100% !important; }
    .win { width:100% !important; }
    .pad { padding-left:20px !important; padding-right:20px !important; }
    .cod { font-size:24px !important; letter-spacing:2px !important; padding:14px 18px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#EDE6DA;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background-color:#EDE6DA; margin:0; padding:0;">
  <tr>
    <td align="center" style="padding:28px 12px 44px 12px; background-color:#EDE6DA;">

      <span style="display:none; font-size:1px; color:#EDE6DA; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">Seu pedido saiu daqui &mdash; o c&oacute;digo de rastreio est&aacute; neste e-mail.</span>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" class="w600" style="width:680px; max-width:680px; background-color:#FFFDF9; border:1px solid #D8C49B; border-radius:16px;">
        <tr>
          <td style="padding:8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="662" class="win" style="width:662px; border:1px solid #E4DAC5; border-radius:10px;">

              <tr>
                <td align="center" class="pad" style="padding:44px 40px 0 40px;">
                  <img src="https://cdn.brandfetch.io/frenesiperfumes.com.br/w/172/h/36/theme/light/fallback/404/type/logo?c=1id1bN_oGG366WGvBYf" width="172" alt="FRENESI" style="display:block; width:172px; height:auto; border:0;" />
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="570" class="win" style="width:570px;">
                    <tr>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #D8C49B; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                      <td align="center" valign="middle" style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F; padding:0 14px;">PEDIDO {pedido}</td>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #D8C49B; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:38px; line-height:48px; mso-line-height-rule:exactly; color:#241F18;">{titulo}</div>
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:24px; line-height:32px; font-style:italic; mso-line-height-rule:exactly; color:#8A6A2F; padding-top:8px;">j&aacute; saiu daqui</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:25px; mso-line-height-rule:exactly; color:#6B6355; padding-top:20px;">{mensagem}</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:34px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#8A6A2F;">&#9670;</div>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px; border:1px solid #D8C49B; border-radius:12px; background-color:#FAF6EE;">
                    <tr>
                      <td align="center" style="padding:28px 30px 30px 30px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">C&Oacute;DIGO DE RASTREIO</div>
                        <div style="font-family:Georgia,'Times New Roman',serif; font-size:26px; line-height:34px; mso-line-height-rule:exactly; color:#241F18; padding-top:14px;">{transportadora}</div>
                        <div style="padding-top:18px;">
                          <span class="cod" style="display:inline-block; font-family:'Courier New',Courier,monospace; font-size:30px; line-height:38px; letter-spacing:3px; mso-line-height-rule:exactly; color:#5E4A1E; border:1px dashed #D8C49B; border-radius:8px; padding:14px 30px;">{codigo}</span>
                        </div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; mso-line-height-rule:exactly; color:#6B6355; padding-top:16px;">Toque no bot&atilde;o abaixo &mdash; a p&aacute;gina abre com o c&oacute;digo j&aacute; preenchido</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#8A6A2F;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px;">
                    <tr>
                      <td bgcolor="#D4AF6A" align="center" style="background-color:#D4AF6A; background-image:linear-gradient(180deg,#EAC97E,#C89A4E); border-radius:10px; padding:19px 20px;">
                        <a href="{link}" style="display:block; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2.5px; color:#14100A; text-decoration:none; font-weight:bold;">ACOMPANHAR ENTREGA</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:32px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:19px; line-height:26px; font-style:italic; mso-line-height-rule:exactly; color:#8A6A2F;">Fracionado do frasco original, lacrado e conferido.</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:22px; mso-line-height-rule:exactly; color:#6B6355; padding-top:10px;">Se algo chegar diferente do esperado, responda este e-mail que a gente resolve.</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:30px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="570" class="win" style="width:570px; border-top:1px solid #E4DAC5;">
                    <tr>
                      <td align="center" style="padding-top:26px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">ATENDIMENTO OFICIAL</div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:23px; mso-line-height-rule:exactly; color:#6B6355; padding-top:10px;">D&uacute;vidas sobre a entrega?<br />Fale com a gente no <a href="https://wa.me/5532998661887" style="color:#8A6A2F; text-decoration:underline;">WhatsApp (32)&nbsp;99866-1887</a>.</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 40px 0 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2px; color:#7A7263; padding-bottom:12px;">@frenesiperfumes</div>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:auto;">
                    <tr>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://wa.me/5532998661887" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-whatsapp.png" width="40" height="40" alt="WhatsApp" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://instagram.com/frenesiperfumes" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-instagram.png" width="40" height="40" alt="Instagram" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://tiktok.com/@frenesiperfumes" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-tiktok.png?v=2" width="40" height="40" alt="TikTok" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:24px 40px 0 40px;">
                  <div style="font-family:Georgia,serif; font-size:10px; line-height:10px; color:#D8C49B;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:16px 40px 40px 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; mso-line-height-rule:exactly; color:#8A8274;">Voc&ecirc; recebeu este e-mail porque tem um pedido na FRENESI.</div>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`


/**
 * Aviso de ENTREGA concluída. Mesma moldura do de envio, miolo trocado.
 *
 * Literal próprio, e não uma derivação por substituição de texto: o HTML do
 * envio é editável na Central de E-mails, e um derivado quebraria em silêncio
 * na primeira edição que alguém fizesse lá.
 *
 * Sem código: o objeto chegou, não há o que rastrear. O botão convida a voltar
 * à loja. Placeholders: {nome}, {pedido}, {transportadora}, {link}.
 */
export const HTML_VALIDADO_ENTREGUE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title>FRENESI &mdash; seu pedido chegou</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; background-color:#EDE6DA; }
  table { border-collapse:separate; }
  img { border:0; outline:none; text-decoration:none; }
  @media only screen and (max-width:620px) {
    .w600 { width:100% !important; max-width:100% !important; }
    .win { width:100% !important; }
    .pad { padding-left:20px !important; padding-right:20px !important; }
    .cod { font-size:24px !important; letter-spacing:2px !important; padding:14px 18px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#EDE6DA;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background-color:#EDE6DA; margin:0; padding:0;">
  <tr>
    <td align="center" style="padding:28px 12px 44px 12px; background-color:#EDE6DA;">

      <span style="display:none; font-size:1px; color:#EDE6DA; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">A entrega do seu pedido foi confirmada.</span>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" class="w600" style="width:680px; max-width:680px; background-color:#FFFDF9; border:1px solid #D8C49B; border-radius:16px;">
        <tr>
          <td style="padding:8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="662" class="win" style="width:662px; border:1px solid #E4DAC5; border-radius:10px;">

              <tr>
                <td align="center" class="pad" style="padding:44px 40px 0 40px;">
                  <img src="https://cdn.brandfetch.io/frenesiperfumes.com.br/w/172/h/36/theme/light/fallback/404/type/logo?c=1id1bN_oGG366WGvBYf" width="172" alt="FRENESI" style="display:block; width:172px; height:auto; border:0;" />
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="570" class="win" style="width:570px;">
                    <tr>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #D8C49B; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                      <td align="center" valign="middle" style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F; padding:0 14px;">PEDIDO {pedido}</td>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #D8C49B; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:38px; line-height:48px; mso-line-height-rule:exactly; color:#241F18;">{nome}, seu pedido chegou</div>
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:24px; line-height:32px; font-style:italic; mso-line-height-rule:exactly; color:#8A6A2F; padding-top:8px;">entrega confirmada</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:25px; mso-line-height-rule:exactly; color:#6B6355; padding-top:20px;">{transportadora} confirmou a entrega. Esperamos que voc&ecirc; goste &mdash; e que o pr&oacute;ximo frasco j&aacute; esteja na sua lista.</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:34px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#8A6A2F;">&#9670;</div>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px; border:1px solid #D8C49B; border-radius:12px; background-color:#FAF6EE;">
                    <tr>
                      <td align="center" style="padding:28px 30px 30px 30px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">ENTREGA CONFIRMADA</div>
                        <div style="font-family:Georgia,'Times New Roman',serif; font-size:26px; line-height:34px; mso-line-height-rule:exactly; color:#241F18; padding-top:14px;">Pedido {pedido}</div>
                        <div style="padding-top:18px;">
                          <span style="display:inline-block; font-family:Georgia,'Times New Roman',serif; font-size:34px; line-height:42px; mso-line-height-rule:exactly; color:#5E4A1E; border:1px dashed #D8C49B; border-radius:8px; padding:12px 34px;">&#10003; Recebido</span>
                        </div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; mso-line-height-rule:exactly; color:#6B6355; padding-top:16px;">Se algo n&atilde;o estiver como voc&ecirc; esperava, responda este e-mail</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#8A6A2F;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px;">
                    <tr>
                      <td bgcolor="#D4AF6A" align="center" style="background-color:#D4AF6A; background-image:linear-gradient(180deg,#EAC97E,#C89A4E); border-radius:10px; padding:19px 20px;">
                        <a href="{link}" style="display:block; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2.5px; color:#14100A; text-decoration:none; font-weight:bold;">VER NOVIDADES DA LOJA</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:32px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:19px; line-height:26px; font-style:italic; mso-line-height-rule:exactly; color:#8A6A2F;">Obrigado por comprar com a gente.</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:22px; mso-line-height-rule:exactly; color:#6B6355; padding-top:10px;">Se gostou, conta pra gente &mdash; e se n&atilde;o gostou, conta tamb&eacute;m.</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:30px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="570" class="win" style="width:570px; border-top:1px solid #E4DAC5;">
                    <tr>
                      <td align="center" style="padding-top:26px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">ATENDIMENTO OFICIAL</div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:23px; mso-line-height-rule:exactly; color:#6B6355; padding-top:10px;">Alguma coisa fora do lugar?<br />Fale com a gente no <a href="https://wa.me/5532998661887" style="color:#8A6A2F; text-decoration:underline;">WhatsApp (32)&nbsp;99866-1887</a>.</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 40px 0 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2px; color:#7A7263; padding-bottom:12px;">@frenesiperfumes</div>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:auto;">
                    <tr>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://wa.me/5532998661887" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-whatsapp.png" width="40" height="40" alt="WhatsApp" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://instagram.com/frenesiperfumes" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-instagram.png" width="40" height="40" alt="Instagram" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://tiktok.com/@frenesiperfumes" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-tiktok.png?v=2" width="40" height="40" alt="TikTok" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:24px 40px 0 40px;">
                  <div style="font-family:Georgia,serif; font-size:10px; line-height:10px; color:#D8C49B;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:16px 40px 40px 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; mso-line-height-rule:exactly; color:#8A8274;">Voc&ecirc; recebeu este e-mail porque tem um pedido na FRENESI.</div>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`


/**
 * Devolução ABERTA (confirmação ao cliente) e devolução APROVADA (código de
 * postagem reversa). Mesma moldura validada dos demais; literais próprios
 * pelo mesmo motivo do aviso de entrega — derivado por substituição quebraria
 * em silêncio na primeira edição do modelo de envio.
 *
 * Tom sóbrio de propósito: nada de "vamos cuidar disso" — a linguagem casual
 * já foi reprovada pela operação no portal, e e-mail transacional é o lugar
 * mais formal da relação. Na aprovada, a agência é FIXA — a postagem reversa
 * sai sempre pelos Correios, regra da operação — e a plataforma da etiqueta
 * (Frenet) nunca aparece: não significa nada para quem recebe.
 *
 * Placeholders da aberta: {nome}, {pedido}, {protocolo}.
 * Placeholders da aprovada: {nome}, {protocolo}, {reverso}. A ag&ecirc;ncia &eacute; fixa: a reversa sai SEMPRE pelos Correios.
 */
export const HTML_VALIDADO_DEVOLUCAO_ABERTA = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title>FRENESI &mdash; solicita&ccedil;&atilde;o de devolu&ccedil;&atilde;o registrada</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; background-color:#EDE6DA; }
  table { border-collapse:separate; }
  img { border:0; outline:none; text-decoration:none; }
  @media only screen and (max-width:620px) {
    .w600 { width:100% !important; max-width:100% !important; }
    .win { width:100% !important; }
    .pad { padding-left:20px !important; padding-right:20px !important; }
    .cod { font-size:24px !important; letter-spacing:2px !important; padding:14px 18px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#EDE6DA;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background-color:#EDE6DA; margin:0; padding:0;">
  <tr>
    <td align="center" style="padding:28px 12px 44px 12px; background-color:#EDE6DA;">

      <span style="display:none; font-size:1px; color:#EDE6DA; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">Sua solicita&ccedil;&atilde;o de devolu&ccedil;&atilde;o foi registrada &mdash; o protocolo est&aacute; neste e-mail.</span>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" class="w600" style="width:680px; max-width:680px; background-color:#FFFDF9; border:1px solid #D8C49B; border-radius:16px;">
        <tr>
          <td style="padding:8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="662" class="win" style="width:662px; border:1px solid #E4DAC5; border-radius:10px;">

              <tr>
                <td align="center" class="pad" style="padding:44px 40px 0 40px;">
                  <img src="https://cdn.brandfetch.io/frenesiperfumes.com.br/w/172/h/36/theme/light/fallback/404/type/logo?c=1id1bN_oGG366WGvBYf" width="172" alt="FRENESI" style="display:block; width:172px; height:auto; border:0;" />
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="570" class="win" style="width:570px;">
                    <tr>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #D8C49B; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                      <td align="center" valign="middle" style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F; padding:0 14px;">DEVOLU&Ccedil;&Atilde;O &middot; PEDIDO {pedido}</td>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #D8C49B; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:38px; line-height:48px; mso-line-height-rule:exactly; color:#241F18;">{nome}, sua solicita&ccedil;&atilde;o foi registrada</div>
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:24px; line-height:32px; font-style:italic; mso-line-height-rule:exactly; color:#8A6A2F; padding-top:8px;">devolu&ccedil;&atilde;o em an&aacute;lise</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:25px; mso-line-height-rule:exactly; color:#6B6355; padding-top:20px;">Mantenha o produto na embalagem original, com o lacre como est&aacute;. Voc&ecirc; n&atilde;o precisa fazer nada agora &mdash; nossa equipe conduz a an&aacute;lise e retorna com o resultado.</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:34px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#8A6A2F;">&#9670;</div>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px; border:1px solid #D8C49B; border-radius:12px; background-color:#FAF6EE;">
                    <tr>
                      <td align="center" style="padding:28px 30px 30px 30px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">PROTOCOLO DA DEVOLU&Ccedil;&Atilde;O</div>
                        <div style="font-family:Georgia,'Times New Roman',serif; font-size:26px; line-height:34px; mso-line-height-rule:exactly; color:#241F18; padding-top:14px;">Pedido {pedido}</div>
                        <div style="padding-top:18px;">
                          <span class="cod" style="display:inline-block; font-family:'Courier New',Courier,monospace; font-size:30px; line-height:38px; letter-spacing:3px; mso-line-height-rule:exactly; color:#5E4A1E; border:1px dashed #D8C49B; border-radius:8px; padding:14px 30px;">{protocolo}</span>
                        </div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; mso-line-height-rule:exactly; color:#6B6355; padding-top:16px;">Guarde este n&uacute;mero &mdash; &eacute; por ele que acompanhamos o seu caso</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#8A6A2F;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px;">
                    <tr>
                      <td bgcolor="#D4AF6A" align="center" style="background-color:#D4AF6A; background-image:linear-gradient(180deg,#EAC97E,#C89A4E); border-radius:10px; padding:19px 20px;">
                        <a href="https://wa.me/5532998661887" style="display:block; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2.5px; color:#14100A; text-decoration:none; font-weight:bold;">FALAR COM O ATENDIMENTO</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:32px 50px 0 50px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="470" class="win" style="width:470px;">
                    <tr>
                      <td width="30" valign="top" style="width:30px; padding-bottom:16px;"><div style="width:22px; height:22px; border:1px solid #D8C49B; border-radius:50%; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:22px; color:#8A6A2F; text-align:center;">1</div></td>
                      <td valign="top" align="left" style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#6B6355; padding-bottom:16px; padding-left:12px;"><span style="color:#241F18;">An&aacute;lise da solicita&ccedil;&atilde;o</span> em at&eacute; 1 dia &uacute;til</td>
                    </tr>
                    <tr>
                      <td width="30" valign="top" style="width:30px; padding-bottom:16px;"><div style="width:22px; height:22px; border:1px solid #D8C49B; border-radius:50%; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:22px; color:#8A6A2F; text-align:center;">2</div></td>
                      <td valign="top" align="left" style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#6B6355; padding-bottom:16px; padding-left:12px;"><span style="color:#241F18;">C&oacute;digo de postagem</span> enviado ap&oacute;s a aprova&ccedil;&atilde;o, sem custo</td>
                    </tr>
                    <tr>
                      <td width="30" valign="top" style="width:30px;"><div style="width:22px; height:22px; border:1px solid #D8C49B; border-radius:50%; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:22px; color:#8A6A2F; text-align:center;">3</div></td>
                      <td valign="top" align="left" style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#6B6355; padding-left:12px;"><span style="color:#241F18;">Reembolso ou troca</span> em at&eacute; 5 dias &uacute;teis ap&oacute;s a confer&ecirc;ncia</td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:30px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="570" class="win" style="width:570px; border-top:1px solid #E4DAC5;">
                    <tr>
                      <td align="center" style="padding-top:26px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">ATENDIMENTO OFICIAL</div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:23px; mso-line-height-rule:exactly; color:#6B6355; padding-top:10px;">D&uacute;vidas sobre a devolu&ccedil;&atilde;o?<br />Fale com a gente no <a href="https://wa.me/5532998661887" style="color:#8A6A2F; text-decoration:underline;">WhatsApp (32)&nbsp;99866-1887</a>.</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 40px 0 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2px; color:#7A7263; padding-bottom:12px;">@frenesiperfumes</div>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:auto;">
                    <tr>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://wa.me/5532998661887" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-whatsapp.png" width="40" height="40" alt="WhatsApp" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://instagram.com/frenesiperfumes" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-instagram.png" width="40" height="40" alt="Instagram" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://tiktok.com/@frenesiperfumes" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-tiktok.png?v=2" width="40" height="40" alt="TikTok" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:24px 40px 0 40px;">
                  <div style="font-family:Georgia,serif; font-size:10px; line-height:10px; color:#D8C49B;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:16px 40px 40px 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; mso-line-height-rule:exactly; color:#8A8274;">Voc&ecirc; recebeu este e-mail porque registrou uma devolu&ccedil;&atilde;o na FRENESI.</div>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

export const HTML_VALIDADO_DEVOLUCAO_APROVADA = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title>FRENESI &mdash; devolu&ccedil;&atilde;o aprovada</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; background-color:#EDE6DA; }
  table { border-collapse:separate; }
  img { border:0; outline:none; text-decoration:none; }
  @media only screen and (max-width:620px) {
    .w600 { width:100% !important; max-width:100% !important; }
    .win { width:100% !important; }
    .pad { padding-left:20px !important; padding-right:20px !important; }
    .cod { font-size:24px !important; letter-spacing:2px !important; padding:14px 18px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#EDE6DA;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background-color:#EDE6DA; margin:0; padding:0;">
  <tr>
    <td align="center" style="padding:28px 12px 44px 12px; background-color:#EDE6DA;">

      <span style="display:none; font-size:1px; color:#EDE6DA; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">Devolu&ccedil;&atilde;o aprovada &mdash; o c&oacute;digo de postagem est&aacute; neste e-mail.</span>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" class="w600" style="width:680px; max-width:680px; background-color:#FFFDF9; border:1px solid #D8C49B; border-radius:16px;">
        <tr>
          <td style="padding:8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="662" class="win" style="width:662px; border:1px solid #E4DAC5; border-radius:10px;">

              <tr>
                <td align="center" class="pad" style="padding:44px 40px 0 40px;">
                  <img src="https://cdn.brandfetch.io/frenesiperfumes.com.br/w/172/h/36/theme/light/fallback/404/type/logo?c=1id1bN_oGG366WGvBYf" width="172" alt="FRENESI" style="display:block; width:172px; height:auto; border:0;" />
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="570" class="win" style="width:570px;">
                    <tr>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #D8C49B; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                      <td align="center" valign="middle" style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F; padding:0 14px;">DEVOLU&Ccedil;&Atilde;O {protocolo}</td>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #D8C49B; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:38px; line-height:48px; mso-line-height-rule:exactly; color:#241F18;">{nome}, sua devolu&ccedil;&atilde;o foi aprovada</div>
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:24px; line-height:32px; font-style:italic; mso-line-height-rule:exactly; color:#8A6A2F; padding-top:8px;">postagem sem custo</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:25px; mso-line-height-rule:exactly; color:#6B6355; padding-top:20px;">Leve o produto na embalagem original, com o lacre como est&aacute;, a uma ag&ecirc;ncia dos Correios e apresente o c&oacute;digo abaixo no balc&atilde;o. N&atilde;o &eacute; preciso imprimir etiqueta.</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:34px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#8A6A2F;">&#9670;</div>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px; border:1px solid #D8C49B; border-radius:12px; background-color:#FAF6EE;">
                    <tr>
                      <td align="center" style="padding:28px 30px 30px 30px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">C&Oacute;DIGO DE POSTAGEM REVERSA</div>
                        <div style="font-family:Georgia,'Times New Roman',serif; font-size:26px; line-height:34px; mso-line-height-rule:exactly; color:#241F18; padding-top:14px;">Ag&ecirc;ncia dos Correios</div>
                        <div style="padding-top:18px;">
                          <span class="cod" style="display:inline-block; font-family:'Courier New',Courier,monospace; font-size:30px; line-height:38px; letter-spacing:3px; mso-line-height-rule:exactly; color:#5E4A1E; border:1px dashed #D8C49B; border-radius:8px; padding:14px 30px;">{reverso}</span>
                        </div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; mso-line-height-rule:exactly; color:#6B6355; padding-top:16px;">Apresente este c&oacute;digo no balc&atilde;o da ag&ecirc;ncia</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#8A6A2F;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px;">
                    <tr>
                      <td bgcolor="#D4AF6A" align="center" style="background-color:#D4AF6A; background-image:linear-gradient(180deg,#EAC97E,#C89A4E); border-radius:10px; padding:19px 20px;">
                        <a href="https://wa.me/5532998661887" style="display:block; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2.5px; color:#14100A; text-decoration:none; font-weight:bold;">TIRAR D&Uacute;VIDAS NO WHATSAPP</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:32px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:19px; line-height:26px; font-style:italic; mso-line-height-rule:exactly; color:#8A6A2F;">Recebido aqui, o produto passa pela confer&ecirc;ncia final.</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:22px; mso-line-height-rule:exactly; color:#6B6355; padding-top:10px;">O reembolso ou a troca &eacute; conclu&iacute;do em at&eacute; 5 dias &uacute;teis ap&oacute;s a confer&ecirc;ncia.</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:30px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="570" class="win" style="width:570px; border-top:1px solid #E4DAC5;">
                    <tr>
                      <td align="center" style="padding-top:26px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">ATENDIMENTO OFICIAL</div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:23px; mso-line-height-rule:exactly; color:#6B6355; padding-top:10px;">D&uacute;vidas sobre a postagem?<br />Fale com a gente no <a href="https://wa.me/5532998661887" style="color:#8A6A2F; text-decoration:underline;">WhatsApp (32)&nbsp;99866-1887</a>.</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 40px 0 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2px; color:#7A7263; padding-bottom:12px;">@frenesiperfumes</div>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:auto;">
                    <tr>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://wa.me/5532998661887" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-whatsapp.png" width="40" height="40" alt="WhatsApp" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://instagram.com/frenesiperfumes" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-instagram.png" width="40" height="40" alt="Instagram" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://tiktok.com/@frenesiperfumes" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-tiktok.png?v=2" width="40" height="40" alt="TikTok" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:24px 40px 0 40px;">
                  <div style="font-family:Georgia,serif; font-size:10px; line-height:10px; color:#D8C49B;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:16px 40px 40px 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; mso-line-height-rule:exactly; color:#8A8274;">Voc&ecirc; recebeu este e-mail porque registrou uma devolu&ccedil;&atilde;o na FRENESI.</div>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`


/**
 * Devolução CONCLUÍDA — o fecho do caso, com a resolução em destaque.
 *
 * O builder compõe os placeholders por resolução: reembolso mostra o VALOR no
 * quadro tracejado (e o comprovante segue anexo ao e-mail); troca mostra o
 * número do novo pedido; cupom aponta para o atendimento. Placeholders:
 * {nome}, {protocolo}, {resolucao}, {destaque}, {corpo}, {nota}.
 */
export const HTML_VALIDADO_DEVOLUCAO_CONCLUIDA = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title>FRENESI &mdash; devolu&ccedil;&atilde;o conclu&iacute;da</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; background-color:#EDE6DA; }
  table { border-collapse:separate; }
  img { border:0; outline:none; text-decoration:none; }
  @media only screen and (max-width:620px) {
    .w600 { width:100% !important; max-width:100% !important; }
    .win { width:100% !important; }
    .pad { padding-left:20px !important; padding-right:20px !important; }
    .cod { font-size:24px !important; letter-spacing:2px !important; padding:14px 18px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#EDE6DA;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background-color:#EDE6DA; margin:0; padding:0;">
  <tr>
    <td align="center" style="padding:28px 12px 44px 12px; background-color:#EDE6DA;">

      <span style="display:none; font-size:1px; color:#EDE6DA; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">Sua devolu&ccedil;&atilde;o foi conclu&iacute;da &mdash; os detalhes est&atilde;o neste e-mail.</span>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" class="w600" style="width:680px; max-width:680px; background-color:#FFFDF9; border:1px solid #D8C49B; border-radius:16px;">
        <tr>
          <td style="padding:8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="662" class="win" style="width:662px; border:1px solid #E4DAC5; border-radius:10px;">

              <tr>
                <td align="center" class="pad" style="padding:44px 40px 0 40px;">
                  <img src="https://cdn.brandfetch.io/frenesiperfumes.com.br/w/172/h/36/theme/light/fallback/404/type/logo?c=1id1bN_oGG366WGvBYf" width="172" alt="FRENESI" style="display:block; width:172px; height:auto; border:0;" />
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="570" class="win" style="width:570px;">
                    <tr>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #D8C49B; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                      <td align="center" valign="middle" style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F; padding:0 14px;">DEVOLU&Ccedil;&Atilde;O {protocolo}</td>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #D8C49B; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:38px; line-height:48px; mso-line-height-rule:exactly; color:#241F18;">{nome}, sua devolu&ccedil;&atilde;o foi conclu&iacute;da</div>
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:24px; line-height:32px; font-style:italic; mso-line-height-rule:exactly; color:#8A6A2F; padding-top:8px;">caso encerrado</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:25px; mso-line-height-rule:exactly; color:#6B6355; padding-top:20px;">{corpo}</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:34px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#8A6A2F;">&#9670;</div>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px; border:1px solid #D8C49B; border-radius:12px; background-color:#FAF6EE;">
                    <tr>
                      <td align="center" style="padding:28px 30px 30px 30px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">RESOLU&Ccedil;&Atilde;O DA DEVOLU&Ccedil;&Atilde;O</div>
                        <div style="font-family:Georgia,'Times New Roman',serif; font-size:26px; line-height:34px; mso-line-height-rule:exactly; color:#241F18; padding-top:14px;">{resolucao}</div>
                        <div style="padding-top:18px;">
                          <span class="cod" style="display:inline-block; font-family:'Courier New',Courier,monospace; font-size:30px; line-height:38px; letter-spacing:3px; mso-line-height-rule:exactly; color:#5E4A1E; border:1px dashed #D8C49B; border-radius:8px; padding:14px 30px;">{destaque}</span>
                        </div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; mso-line-height-rule:exactly; color:#6B6355; padding-top:16px;">{nota}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#8A6A2F;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px;">
                    <tr>
                      <td bgcolor="#D4AF6A" align="center" style="background-color:#D4AF6A; background-image:linear-gradient(180deg,#EAC97E,#C89A4E); border-radius:10px; padding:19px 20px;">
                        <a href="https://wa.me/5532998661887" style="display:block; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2.5px; color:#14100A; text-decoration:none; font-weight:bold;">FALAR COM O ATENDIMENTO</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:32px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:19px; line-height:26px; font-style:italic; mso-line-height-rule:exactly; color:#8A6A2F;">Agradecemos a confian&ccedil;a.</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:22px; mso-line-height-rule:exactly; color:#6B6355; padding-top:10px;">Qualquer d&uacute;vida sobre a conclus&atilde;o, fale com o atendimento.</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:30px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="570" class="win" style="width:570px; border-top:1px solid #E4DAC5;">
                    <tr>
                      <td align="center" style="padding-top:26px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">ATENDIMENTO OFICIAL</div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:23px; mso-line-height-rule:exactly; color:#6B6355; padding-top:10px;">D&uacute;vidas sobre a devolu&ccedil;&atilde;o?<br />Fale com a gente no <a href="https://wa.me/5532998661887" style="color:#8A6A2F; text-decoration:underline;">WhatsApp (32)&nbsp;99866-1887</a>.</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 40px 0 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2px; color:#7A7263; padding-bottom:12px;">@frenesiperfumes</div>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:auto;">
                    <tr>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://wa.me/5532998661887" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-whatsapp.png" width="40" height="40" alt="WhatsApp" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://instagram.com/frenesiperfumes" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-instagram.png" width="40" height="40" alt="Instagram" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://tiktok.com/@frenesiperfumes" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-tiktok.png?v=2" width="40" height="40" alt="TikTok" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:24px 40px 0 40px;">
                  <div style="font-family:Georgia,serif; font-size:10px; line-height:10px; color:#D8C49B;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:16px 40px 40px 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; mso-line-height-rule:exactly; color:#8A8274;">Voc&ecirc; recebeu este e-mail porque registrou uma devolu&ccedil;&atilde;o na FRENESI.</div>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`


/**
 * Pedido de NOVAS FOTOS — o e-mail que devolve a bola ao cliente.
 *
 * Nasceu como reaproveitamento do template de conclusão, e isso saiu errado
 * em produção: os textos fixos da moldura ("sua devolução foi concluída",
 * "caso encerrado", "Agradecemos a confiança") não são placeholders, então o
 * cliente recebeu um pedido de fotos com cara de caso encerrado. Aqui o
 * desenho é o mesmo, os textos são os certos, e o botão leva ao portal —
 * é lá que o reenvio acontece.
 *
 * Placeholders: {nome}, {protocolo}, {resolucao}, {destaque}, {corpo}, {nota}.
 */
export const HTML_VALIDADO_DEVOLUCAO_NOVAS_FOTOS = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title>FRENESI &mdash; precisamos de novas fotos</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; background-color:#EDE6DA; }
  table { border-collapse:separate; }
  img { border:0; outline:none; text-decoration:none; }
  @media only screen and (max-width:620px) {
    .w600 { width:100% !important; max-width:100% !important; }
    .win { width:100% !important; }
    .pad { padding-left:20px !important; padding-right:20px !important; }
    .cod { font-size:24px !important; letter-spacing:2px !important; padding:14px 18px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#EDE6DA;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background-color:#EDE6DA; margin:0; padding:0;">
  <tr>
    <td align="center" style="padding:28px 12px 44px 12px; background-color:#EDE6DA;">

      <span style="display:none; font-size:1px; color:#EDE6DA; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">Precisamos de novas fotos para seguir com a an&aacute;lise da sua devolu&ccedil;&atilde;o.</span>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" class="w600" style="width:680px; max-width:680px; background-color:#FFFDF9; border:1px solid #D8C49B; border-radius:16px;">
        <tr>
          <td style="padding:8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="662" class="win" style="width:662px; border:1px solid #E4DAC5; border-radius:10px;">

              <tr>
                <td align="center" class="pad" style="padding:44px 40px 0 40px;">
                  <img src="https://cdn.brandfetch.io/frenesiperfumes.com.br/w/172/h/36/theme/light/fallback/404/type/logo?c=1id1bN_oGG366WGvBYf" width="172" alt="FRENESI" style="display:block; width:172px; height:auto; border:0;" />
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="570" class="win" style="width:570px;">
                    <tr>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #D8C49B; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                      <td align="center" valign="middle" style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F; padding:0 14px;">DEVOLU&Ccedil;&Atilde;O {protocolo}</td>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #D8C49B; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:38px; line-height:48px; mso-line-height-rule:exactly; color:#241F18;">{nome}, precisamos de novas fotos</div>
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:24px; line-height:32px; font-style:italic; mso-line-height-rule:exactly; color:#8A6A2F; padding-top:8px;">a an&aacute;lise continua assim que elas chegarem</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:25px; mso-line-height-rule:exactly; color:#6B6355; padding-top:20px;">{corpo}</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:34px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#8A6A2F;">&#9670;</div>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px; border:1px solid #D8C49B; border-radius:12px; background-color:#FAF6EE;">
                    <tr>
                      <td align="center" style="padding:28px 30px 30px 30px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">O QUE PRECISAMOS</div>
                        <div style="font-family:Georgia,'Times New Roman',serif; font-size:26px; line-height:34px; mso-line-height-rule:exactly; color:#241F18; padding-top:14px;">{resolucao}</div>
                        <div style="padding-top:18px;">
                          <span class="cod" style="display:inline-block; font-family:'Courier New',Courier,monospace; font-size:30px; line-height:38px; letter-spacing:3px; mso-line-height-rule:exactly; color:#5E4A1E; border:1px dashed #D8C49B; border-radius:8px; padding:14px 30px;">{destaque}</span>
                        </div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; mso-line-height-rule:exactly; color:#6B6355; padding-top:16px;">{nota}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#8A6A2F;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px;">
                    <tr>
                      <td bgcolor="#D4AF6A" align="center" style="background-color:#D4AF6A; background-image:linear-gradient(180deg,#EAC97E,#C89A4E); border-radius:10px; padding:19px 20px;">
                        <a href="https://devolucoes.frenesiperfumes.com.br" style="display:block; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2.5px; color:#14100A; text-decoration:none; font-weight:bold;">REENVIAR NO PORTAL</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:32px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:19px; line-height:26px; font-style:italic; mso-line-height-rule:exactly; color:#8A6A2F;">Estamos aguardando as suas fotos.</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:22px; mso-line-height-rule:exactly; color:#6B6355; padding-top:10px;">Entre no portal com o protocolo e o e-mail da compra para reenviar.</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:30px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="570" class="win" style="width:570px; border-top:1px solid #E4DAC5;">
                    <tr>
                      <td align="center" style="padding-top:26px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">ATENDIMENTO OFICIAL</div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:23px; mso-line-height-rule:exactly; color:#6B6355; padding-top:10px;">D&uacute;vidas sobre a devolu&ccedil;&atilde;o?<br />Fale com a gente no <a href="https://wa.me/5532998661887" style="color:#8A6A2F; text-decoration:underline;">WhatsApp (32)&nbsp;99866-1887</a>.</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 40px 0 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2px; color:#7A7263; padding-bottom:12px;">@frenesiperfumes</div>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:auto;">
                    <tr>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://wa.me/5532998661887" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-whatsapp.png" width="40" height="40" alt="WhatsApp" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://instagram.com/frenesiperfumes" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-instagram.png" width="40" height="40" alt="Instagram" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://tiktok.com/@frenesiperfumes" style="display:inline-block; text-decoration:none;"><img src="https://gxzvlknlxwihooqgctst.supabase.co/functions/v1/marca/icon-tiktok.png?v=2" width="40" height="40" alt="TikTok" style="display:block; width:40px; height:40px; border:0;" /></a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:24px 40px 0 40px;">
                  <div style="font-family:Georgia,serif; font-size:10px; line-height:10px; color:#D8C49B;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:16px 40px 40px 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; mso-line-height-rule:exactly; color:#8A8274;">Voc&ecirc; recebeu este e-mail porque registrou uma devolu&ccedil;&atilde;o na FRENESI.</div>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
