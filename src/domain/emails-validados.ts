/**
 * Os HTMLs VALIDADOS dos e-mails da marca — aprovados pela operação, com a
 * logomarca e os ícones de redes no CDN da Brandfetch. São o PADRÃO dos
 * modelos: valem até alguém editar na Central de E-mails (o que fica salvo
 * no banco passa por cima). Cópias de referência em docs/emails/.
 */

export const HTML_VALIDADO_CARRINHO = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>FRENESI — seus decants ainda estão guardados</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; background-color:#070605; }
  table { border-collapse:separate; }
  img { border:0; outline:none; text-decoration:none; }
  @media only screen and (max-width:620px) {
    .w600 { width:100% !important; max-width:100% !important; }
    .win { width:100% !important; }
    .pad { padding-left:20px !important; padding-right:20px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#070605;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background-color:#070605; margin:0; padding:0;">
  <tr>
    <td align="center" style="padding:28px 12px 44px 12px; background-color:#070605;">

      <span style="display:none; font-size:1px; color:#070605; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">Seus decants continuam reservados — e seu cupom vale por 48 horas.</span>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="w600" style="width:600px; max-width:600px; background-color:#0B0907; border:1px solid #6B5836; border-radius:16px;">
        <tr>
          <td style="padding:8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="582" class="win" style="width:582px; border:1px solid #2E2718; border-radius:10px;">

              <tr>
                <td align="center" class="pad" style="padding:44px 40px 0 40px;">
                  <img src="https://cdn.brandfetch.io/id57Q-Qqep/w/172/h/36/theme/dark/logo.png?c=1bxvdhp5iks03yoj74edho5a5kjugzNRtiN" width="172" alt="FRENESI" style="display:block; width:172px; height:auto; border:0;" />
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="490" class="win" style="width:490px;">
                    <tr>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #6B5836; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                      <td align="center" valign="middle" style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#D4AF6A; padding:0 14px;">SUA SELE&Ccedil;&Atilde;O CONTINUA RESERVADA</td>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #6B5836; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:38px; line-height:48px; mso-line-height-rule:exactly; color:#F2ECDF;">{nome}, seus decants ainda est&atilde;o <em style="font-style:italic; color:#D4AF6A;">guardados</em></div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:25px; mso-line-height-rule:exactly; color:#A2957F; padding-top:20px;">As fragr&acirc;ncias que voc&ecirc; escolheu seguem separadas com o seu nome — mas os decants s&atilde;o produzidos em lotes limitados e a reserva n&atilde;o dura para sempre.</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:34px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="518" class="win" style="width:518px; border:1px solid #6B5836; border-radius:12px; background-color:#0D0B08;">
                    <tr>
                      <td align="center" style="padding:24px 26px 0 26px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="466" class="win" style="width:466px;">
                          <tr>
                            <td width="90" valign="middle" style="width:90px;"><div style="border-top:1px solid #4A3D25; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                            <td align="center" valign="middle" style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#D4AF6A; padding:0 12px;">NO SEU CARRINHO</td>
                            <td width="90" valign="middle" style="width:90px;"><div style="border-top:1px solid #4A3D25; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:18px 26px 0 26px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="466" class="win" style="width:466px; border:1px solid #2E2718; border-radius:8px; background-color:#0A0806;">
                          <tr>
                            <td style="padding:18px 20px; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#EDE6DA;">{itens}</td>
                          </tr>
                          <tr>
                            <td style="padding:0 20px;">
                              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="426" style="width:426px; border-top:1px dashed #3A3222;">
                                <tr>
                                  <td align="left" style="padding:16px 0 18px 0; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:3px; color:#A2957F;">TOTAL</td>
                                  <td align="right" style="padding:16px 0 18px 0; font-family:Georgia,'Times New Roman',serif; font-size:24px; line-height:28px; mso-line-height-rule:exactly; color:#D4AF6A;">{total}</td>
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
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="518" class="win" style="width:518px;">
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
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#D4AF6A;">&#9670;</div>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="518" class="win" style="width:518px; border:1px solid #6B5836; border-radius:12px; background-color:#0D0B08;">
                    <tr>
                      <td align="center" style="padding:28px 30px 30px 30px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#D4AF6A;">UM INCENTIVO PARA VOLTAR</div>
                        <div style="font-family:Georgia,'Times New Roman',serif; font-size:26px; line-height:34px; mso-line-height-rule:exactly; color:#F2ECDF; padding-top:14px;">{desconto}% de desconto com o c&oacute;digo</div>
                        <div style="padding-top:18px;">
                          <span style="display:inline-block; font-family:'Courier New',Courier,monospace; font-size:22px; line-height:28px; mso-line-height-rule:exactly; letter-spacing:7px; color:#E7CE9B; border:1px dashed #6B5836; border-radius:8px; padding:12px 28px;">{cupom}</span>
                        </div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; mso-line-height-rule:exactly; color:#A2957F; padding-top:16px;">V&aacute;lido por apenas <strong style="color:#E7CE9B;">48 horas</strong> &nbsp;&middot;&nbsp; aplique no checkout</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#D4AF6A;">&#9670;</div>
                </td>
              </tr>
              [[/cupom]]

              <tr>
                <td align="center" class="pad" style="padding:32px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:19px; line-height:26px; font-style:italic; mso-line-height-rule:exactly; color:#D4AF6A;">Frascos em decants premium!</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:22px; mso-line-height-rule:exactly; color:#A2957F; padding-top:10px;">Parcelamento em at&eacute; 6x sem juros ou +10% de desconto no PIX.</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:30px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="490" class="win" style="width:490px; border-top:1px solid #2E2718;">
                    <tr>
                      <td align="center" style="padding-top:26px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#D4AF6A;">ATENDIMENTO OFICIAL</div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:23px; mso-line-height-rule:exactly; color:#A2957F; padding-top:10px;">D&uacute;vidas sobre as fragr&acirc;ncias?<br />Fale com a gente no <a href="https://wa.me/5532998661887" style="color:#D4AF6A; text-decoration:underline;">WhatsApp (32)&nbsp;99866-1887</a>.</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 40px 0 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2px; color:#8A7B62; padding-bottom:12px;">@frenesiperfumes</div>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:auto;">
                    <tr>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://wa.me/5532998661887" style="display:inline-block; width:40px; height:40px; border:1px solid #6B5836; border-radius:50%; text-decoration:none; text-align:center;"><img src="https://cdn.brandfetch.io/whatsapp.com/w/48/theme/dark/fallback/404?c=1id1bN_oGG366WGvBYf" width="24" height="24" alt="WhatsApp" style="display:inline-block; width:24px; height:24px; border:0; margin-top:8px;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://instagram.com/frenesiperfumes" style="display:inline-block; width:40px; height:40px; border:1px solid #6B5836; border-radius:50%; text-decoration:none; text-align:center;"><img src="https://cdn.brandfetch.io/instagram.com/w/48/theme/dark/fallback/404?c=1id1bN_oGG366WGvBYf" width="24" height="24" alt="Instagram" style="display:inline-block; width:24px; height:24px; border:0; margin-top:8px;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://tiktok.com/@frenesiperfumes" style="display:inline-block; width:40px; height:40px; border:1px solid #6B5836; border-radius:50%; text-decoration:none; text-align:center;"><img src="https://cdn.brandfetch.io/tiktok.com/w/48/theme/dark/fallback/404?c=1id1bN_oGG366WGvBYf" width="24" height="24" alt="TikTok" style="display:inline-block; width:24px; height:24px; border:0; margin-top:8px;" /></a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:24px 40px 0 40px;">
                  <div style="font-family:Georgia,serif; font-size:10px; line-height:10px; color:#6B5836;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:16px 40px 40px 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; mso-line-height-rule:exactly; color:#6E6350;">Voc&ecirc; recebeu este e-mail porque iniciou uma compra em nossa loja.</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; mso-line-height-rule:exactly; padding-top:6px;"><a href="https://frenesiperfumes.com.br/descadastrar" style="color:#8A7B62; text-decoration:underline;">Cancelar inscri&ccedil;&atilde;o</a></div>
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
</html>
`

export const HTML_VALIDADO_GIFT = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>Feliz aniversário — um presente da FRENESI</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; background-color:#070605; }
  table { border-collapse:separate; }
  img { border:0; outline:none; text-decoration:none; }
  @media only screen and (max-width:620px) {
    .w600 { width:100% !important; max-width:100% !important; }
    .win { width:100% !important; }
    .pad { padding-left:20px !important; padding-right:20px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#070605;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background-color:#070605; margin:0; padding:0;">
  <tr>
    <td align="center" style="padding:28px 12px 44px 12px; background-color:#070605;">

      <span style="display:none; font-size:1px; color:#070605; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">Um presente da FRENESI para o seu anivers&aacute;rio — {desconto}% de desconto para celebrar.</span>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="w600" style="width:600px; max-width:600px; background-color:#0B0907; border:1px solid #6B5836; border-radius:16px;">
        <tr>
          <td style="padding:8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="582" class="win" style="width:582px; border:1px solid #2E2718; border-radius:10px;">

              <tr>
                <td align="center" class="pad" style="padding:44px 40px 0 40px;">
                  <img src="https://cdn.brandfetch.io/id57Q-Qqep/w/172/h/36/theme/dark/logo.png?c=1bxvdhp5iks03yoj74edho5a5kjugzNRtiN" width="172" alt="FRENESI" style="display:block; width:172px; height:auto; border:0;" />
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="490" class="win" style="width:490px;">
                    <tr>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #6B5836; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                      <td align="center" valign="middle" style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#D4AF6A; padding:0 14px;">HOJE O DIA &Eacute; SEU</td>
                      <td width="60" valign="middle" style="width:60px;"><div style="border-top:1px solid #6B5836; height:1px; line-height:1px; font-size:0;">&nbsp;</div></td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 50px 0 50px;">
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:38px; line-height:48px; mso-line-height-rule:exactly; color:#F2ECDF;">Feliz anivers&aacute;rio, {nome}</div>
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:24px; line-height:32px; font-style:italic; mso-line-height-rule:exactly; color:#D4AF6A; padding-top:8px;">o presente de hoje &eacute; por nossa conta</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:25px; mso-line-height-rule:exactly; color:#A2957F; padding-top:20px;">Datas especiais pedem fragr&acirc;ncias especiais. Para celebrar com voc&ecirc;, preparamos um mimo exclusivo de anivers&aacute;rio — v&aacute;lido em toda a nossa cole&ccedil;&atilde;o de decants.</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:34px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#D4AF6A;">&#9670;</div>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="518" class="win" style="width:518px; border:1px solid #6B5836; border-radius:12px; background-color:#0D0B08;">
                    <tr>
                      <td align="center" style="padding:28px 30px 30px 30px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#D4AF6A;">O SEU PRESENTE</div>
                        <div style="font-family:Georgia,'Times New Roman',serif; font-size:26px; line-height:34px; mso-line-height-rule:exactly; color:#F2ECDF; padding-top:14px;">{desconto}% de desconto com o c&oacute;digo</div>
                        <div style="padding-top:18px;">
                          <span style="display:inline-block; font-family:'Courier New',Courier,monospace; font-size:22px; line-height:28px; mso-line-height-rule:exactly; letter-spacing:7px; color:#E7CE9B; border:1px dashed #6B5836; border-radius:8px; padding:12px 28px;">{cupom}</span>
                        </div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; mso-line-height-rule:exactly; color:#A2957F; padding-top:16px;">Seu presente &eacute; v&aacute;lido por <strong style="color:#E7CE9B;">{validade} dias</strong> &nbsp;&middot;&nbsp; aplique no checkout</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" class="pad" style="padding:10px 32px 0 32px;">
                  <div style="font-family:Georgia,serif; font-size:12px; line-height:12px; color:#D4AF6A;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="518" class="win" style="width:518px;">
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
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:19px; line-height:26px; font-style:italic; mso-line-height-rule:exactly; color:#D4AF6A;">Frascos em decants premium!</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:22px; mso-line-height-rule:exactly; color:#A2957F; padding-top:10px;">Parcelamento em at&eacute; 6x sem juros ou +10% de desconto no PIX.</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:30px 46px 0 46px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="490" class="win" style="width:490px; border-top:1px solid #2E2718;">
                    <tr>
                      <td align="center" style="padding-top:26px;">
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#D4AF6A;">ATENDIMENTO OFICIAL</div>
                        <div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:23px; mso-line-height-rule:exactly; color:#A2957F; padding-top:10px;">D&uacute;vidas sobre as fragr&acirc;ncias?<br />Fale com a gente no <a href="https://wa.me/5532998661887" style="color:#D4AF6A; text-decoration:underline;">WhatsApp (32)&nbsp;99866-1887</a>.</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:26px 40px 0 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:2px; color:#8A7B62; padding-bottom:12px;">@frenesiperfumes</div>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:auto;">
                    <tr>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://wa.me/5532998661887" style="display:inline-block; width:40px; height:40px; border:1px solid #6B5836; border-radius:50%; text-decoration:none; text-align:center;"><img src="https://cdn.brandfetch.io/whatsapp.com/w/48/theme/dark/fallback/404?c=1id1bN_oGG366WGvBYf" width="24" height="24" alt="WhatsApp" style="display:inline-block; width:24px; height:24px; border:0; margin-top:8px;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://instagram.com/frenesiperfumes" style="display:inline-block; width:40px; height:40px; border:1px solid #6B5836; border-radius:50%; text-decoration:none; text-align:center;"><img src="https://cdn.brandfetch.io/instagram.com/w/48/theme/dark/fallback/404?c=1id1bN_oGG366WGvBYf" width="24" height="24" alt="Instagram" style="display:inline-block; width:24px; height:24px; border:0; margin-top:8px;" /></a>
                      </td>
                      <td align="center" style="padding:0 7px;">
                        <a href="https://tiktok.com/@frenesiperfumes" style="display:inline-block; width:40px; height:40px; border:1px solid #6B5836; border-radius:50%; text-decoration:none; text-align:center;"><img src="https://cdn.brandfetch.io/tiktok.com/w/48/theme/dark/fallback/404?c=1id1bN_oGG366WGvBYf" width="24" height="24" alt="TikTok" style="display:inline-block; width:24px; height:24px; border:0; margin-top:8px;" /></a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:24px 40px 0 40px;">
                  <div style="font-family:Georgia,serif; font-size:10px; line-height:10px; color:#6B5836;">&#9670;</div>
                </td>
              </tr>

              <tr>
                <td align="center" class="pad" style="padding:16px 40px 40px 40px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; mso-line-height-rule:exactly; color:#6E6350;">Voc&ecirc; recebeu este e-mail porque faz parte da comunidade FRENESI.</div>
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; mso-line-height-rule:exactly; padding-top:6px;"><a href="https://frenesiperfumes.com.br/descadastrar" style="color:#8A7B62; text-decoration:underline;">Cancelar inscri&ccedil;&atilde;o</a></div>
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
</html>
`
