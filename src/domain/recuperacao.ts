import { brl } from './format'
import {
  HTML_VALIDADO_CARRINHO,
  HTML_VALIDADO_CASHBACK,
  HTML_VALIDADO_GIFT,
} from './emails-validados'

/**
 * O e-mail de recuperação de carrinho, escrito pela marca — não pelo gateway.
 *
 * O da Yampi é genérico de propósito: serve qualquer loja. Este aqui é da
 * FRENESI: preto e dourado, chama a pessoa pelo nome, lista exatamente os
 * decants que ficaram para trás e, quando a operação quiser, leva um cupom.
 * HTML de e-mail é tabela com estilo inline — é o que os clientes de e-mail
 * entendem; classe e flexbox morrem no Gmail.
 */

/**
 * A foto de um item do carrinho, casada com o CATÁLOGO pelo nome.
 *
 * A Yampi não manda a imagem no payload do carrinho, mas o item carrega o
 * nome exato do produto da loja — e o catálogo tem a miniatura de quase
 * todos (é a mesma que a confirmação de pagamento usa). O casamento é por
 * prefixo, com o nome MAIS LONGO vencendo: "Polo Black Masculino…" não pode
 * casar com "Polo Masculino…" só porque os dois começam com Polo.
 */
export function imagemDoCatalogoParaItem(
  rotulo: string,
  catalogo: { nome: string; imagem: string | null }[],
): string | null {
  const alvo = semAcentoMinusculo(rotulo.replace(/^\d+\s*[×x]\s*/, ''))
  if (!alvo) return null
  let melhor: { tamanho: number; imagem: string | null } | null = null
  for (const c of catalogo) {
    const nome = semAcentoMinusculo(c.nome)
    if (!nome || !alvo.startsWith(nome)) continue
    if (!melhor || nome.length > melhor.tamanho) melhor = { tamanho: nome.length, imagem: c.imagem }
  }
  return melhor?.imagem ?? null
}

const semAcentoMinusculo = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

export interface DadosEmailCarrinho {
  /** Nome do cliente como veio do checkout; null vira saudação neutra. */
  nome: string | null
  itens: string[]
  valor: number
  /** Para onde o botão aponta: o link do carrinho, ou a home da loja. */
  linkCheckout: string | null
  /** Foto de cada item, alinhada por índice com `itens`. */
  imagens?: (string | null)[]
  cupom?: { codigo: string; pct: number } | null
}

/**
 * Os textos do e-mail, editáveis pela tela de Carrinhos.
 *
 * `{nome}` vira o primeiro nome do cliente (e some com elegância quando o
 * checkout não trouxe nome); `{total}` vira o valor do carrinho. A moldura —
 * logotipo, lista de itens, cupom, botão — é fixa; o que a operação ajusta é
 * a voz.
 */
export interface ModeloEmailRecuperacao {
  assunto: string
  titulo: string
  /** Parágrafos separados por linha em branco. */
  mensagem: string
  textoBotao: string
  /**
   * Modo "HTML do zero": quando preenchido, este é o DOCUMENTO INTEIRO do
   * e-mail, escrito pela operação. Placeholders: {nome}, {total}, {itens}
   * (tabela pronta com os produtos e o total), {link} (URL do carrinho),
   * e o bloco condicional [[cupom]] … {cupom} … {desconto} … [[/cupom]],
   * que some inteiro quando o envio não leva cupom. Vazio ou nulo, vale a
   * moldura da marca com os textos acima.
   */
  html?: string | null
}

export const MODELO_PADRAO: ModeloEmailRecuperacao = {
  assunto: '{nome}, seus produtos ainda estão guardados',
  titulo: '{nome}, deixamos tudo separado.',
  mensagem:
    'Você montou um carrinho na FRENESI e não finalizou — acontece. Seus produtos continuam aqui, separados e prontos para envio.',
  textoBotao: 'Concluir meu pedido',
  html: HTML_VALIDADO_CARRINHO,
}

/** Aplica {nome} e {total}; sem nome, remove o placeholder sem deixar cicatriz. */
export function preencherModelo(texto: string, nome: string | null, total: string): string {
  const comTotal = texto.split('{total}').join(total)
  if (nome) return comTotal.split('{nome}').join(nome)
  const sem = comTotal.replace(/\{nome\}\s*,?\s*/gi, '').trimStart()
  return sem.charAt(0).toUpperCase() + sem.slice(1)
}

const escapaHtml = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Preenche o campo vivo {site} — a URL onde o PRÓPRIO ERP está no ar, usada
 * pelos templates para servir as imagens de /marca (ícones das redes). Fica
 * fora do render porque cada lado sabe sua URL de um jeito: o servidor pela
 * variável de ambiente, a prévia no navegador por window.location.origin.
 */
export function aplicarSite(html: string, site: string | null | undefined): string {
  return html.split('{site}').join((site ?? '').trim().replace(/\/+$/, ''))
}

export function emailRecuperacao(
  d: DadosEmailCarrinho,
  modelo: ModeloEmailRecuperacao = MODELO_PADRAO,
): { assunto: string; html: string } {
  const primeiroNome = d.nome?.trim().split(/\s+/)[0] || null
  const total = brl(d.valor)
  const assunto = preencherModelo(modelo.assunto, primeiroNome, total)

  // Modo HTML do zero: o documento é da operação; o código só preenche.
  if (modelo.html && modelo.html.trim()) {
    return {
      assunto,
      html: renderHtmlProprio(modelo.html, d, primeiroNome, total),
    }
  }

  const titulo = preencherModelo(modelo.titulo, primeiroNome, total)
  const paragrafos = modelo.mensagem
    .split(/\n\s*\n|\n/)
    .map((p) => preencherModelo(p.trim(), primeiroNome, total))
    .filter(Boolean)

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
            ${escapaHtml(modelo.textoBotao)}
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
                        ${escapaHtml(titulo)}
                      </p>
                      ${paragrafos
                        .map(
                          (p) =>
                            `<p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.65;color:#4C463A;">${escapaHtml(p)}</p>`,
                        )
                        .join('')}
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

/**
 * A lista de itens para o modo HTML próprio: herda cor e fonte do template
 * (impor cores claras num e-mail escuro foi o que deixou o bloco ilegível),
 * traz a foto do produto quando o carrinho a informa, e NÃO repete o total —
 * o template tem a própria linha {total}.
 */
function tabelaDeItens(itens: string[], imagens?: (string | null)[]): string {
  // Quando QUALQUER item tem foto, todas as linhas ganham a célula de 54px —
  // vazia nas que não têm. Sem isso, a linha sem foto tem uma célula a menos
  // e o texto dela cai espremido na coluna estreita da imagem.
  const temFoto = Boolean(imagens?.some(Boolean))
  const linhas = itens
    .map((i, indice) => {
      const img = imagens?.[indice]
      const foto = !temFoto
        ? ''
        : img
          ? `<td width="98" valign="middle" style="width:98px; padding:9px 16px 9px 0;"><img src="${escapaHtml(img)}" width="82" height="82" alt="" style="display:block; width:82px; height:82px; border-radius:8px; border:0;" /></td>`
          : `<td width="98" valign="middle" style="width:98px; padding:9px 16px 9px 0;">&nbsp;</td>`
      return `<tr>${foto}<td valign="middle" style="padding:9px 0; font-family:inherit; font-size:inherit; line-height:inherit; color:inherit;">${escapaHtml(i)}</td></tr>`
    })
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linhas}</table>`
}

/**
 * Preenche o HTML escrito pela operação.
 *
 * O bloco [[cupom]]…[[/cupom]] sai inteiro quando não há cupom — prometer
 * desconto sem código seria pior que não prometer. Os valores substituídos
 * são escapados; a estrutura é toda de quem escreveu o documento.
 */
function renderHtmlProprio(
  htmlModelo: string,
  d: DadosEmailCarrinho,
  primeiroNome: string | null,
  total: string,
): string {
  const comCupom = d.cupom
    ? htmlModelo.replace(/\[\[\/?cupom\]\]/gi, '')
    : htmlModelo.replace(/\[\[cupom\]\][\s\S]*?\[\[\/cupom\]\]/gi, '')

  return preencherModelo(
    comCupom
      .split('{itens}')
      .join(tabelaDeItens(d.itens, d.imagens))
      .split('{link}')
      .join(escapaHtml(d.linkCheckout ?? '#'))
      .split('{cupom}')
      .join(escapaHtml(d.cupom?.codigo ?? ''))
      .split('{desconto}')
      .join(String(d.cupom?.pct ?? '')),
    primeiroNome,
    total,
  )
}

/**
 * E-mail de aniversário (Giftback): parabéns da marca com um cupom-presente
 * de uso único. Mesma moldura visual da recuperação — é a mesma marca
 * falando, em outra data. Os textos são editáveis na Central de E-mails;
 * além de {nome}, valem {cupom}, {desconto} e {validade}.
 */
export const MODELO_GIFT_PADRAO: ModeloEmailRecuperacao = {
  assunto: 'Feliz aniversário, {nome} — um presente da FRENESI',
  titulo: '{nome}, hoje o dia é seu.',
  mensagem:
    'Feliz aniversário! Para celebrar com a fragrância que você ama — ou uma nova para marcar o ano — deixamos um presente no seu nome.',
  textoBotao: 'Escolher meu presente',
  html: HTML_VALIDADO_GIFT,
}

export function emailGiftback(
  d: {
    nome: string | null
    cupom: { codigo: string; pct: number }
    validadeDias: number
    lojaUrl: string | null
  },
  modelo: ModeloEmailRecuperacao = MODELO_GIFT_PADRAO,
): { assunto: string; html: string } {
  const primeiroNome = d.nome?.trim().split(/\s+/)[0] || null
  const preenche = (t: string) =>
    preencherModelo(
      t
        .split('{cupom}')
        .join(d.cupom.codigo)
        .split('{desconto}')
        .join(String(d.cupom.pct))
        .split('{validade}')
        .join(String(d.validadeDias)),
      primeiroNome,
      '',
    )
  const assunto = preenche(modelo.assunto)

  // Modo HTML do zero: o documento é da operação; aqui só se preenche.
  if (modelo.html && modelo.html.trim()) {
    const doc = modelo.html
      .replace(/\[\[\/?cupom\]\]/gi, '')
      .split('{cupom}')
      .join(escapaHtml(d.cupom.codigo))
      .split('{desconto}')
      .join(String(d.cupom.pct))
      .split('{validade}')
      .join(String(d.validadeDias))
      .split('{link}')
      .join(escapaHtml(d.lojaUrl ?? '#'))
    return { assunto, html: preencherModelo(doc, primeiroNome, '') }
  }

  const titulo = preenche(modelo.titulo)
  const paragrafos = modelo.mensagem
    .split(/\n\s*\n|\n/)
    .map((p) => preenche(p.trim()))
    .filter(Boolean)

  const botao = d.lojaUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:26px 0 6px;text-align:center;"><a href="${escapaHtml(d.lojaUrl)}" style="display:inline-block;background:#141414;color:#EFD18C;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:13px;letter-spacing:.08em;text-transform:uppercase;padding:15px 34px;border-radius:8px;">${escapaHtml(preenche(modelo.textoBotao))}</a></td></tr></table>`
    : ''

  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#F6F1E7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F1E7;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr><td style="padding:0 0 22px;text-align:center;">
            <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;letter-spacing:.34em;color:#141414;">FRENESI</p>
            <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#8A7440;">decants de perfumaria</p>
          </td></tr>
          <tr><td style="background:#FFFDF8;border:1px solid #EAE2CF;border-radius:14px;padding:34px 36px;">
            <p style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.35;color:#1A1A1A;">
              ${escapaHtml(titulo)}
            </p>
            ${paragrafos
              .map(
                (p) =>
                  `<p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.65;color:#4C463A;">${escapaHtml(p)}</p>`,
              )
              .join('')}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px dashed #B08D3E;border-radius:10px;">
              <tr><td style="padding:16px 20px;text-align:center;">
                <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8A7440;">${d.cupom.pct}% de presente de aniversário</p>
                <p style="margin:0;font-family:'Courier New',Courier,monospace;font-weight:bold;font-size:20px;letter-spacing:.08em;color:#1A1A1A;">${escapaHtml(d.cupom.codigo)}</p>
                <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8A8374;">só seu · uso único · vale por ${d.validadeDias} ${d.validadeDias === 1 ? 'dia' : 'dias'}</p>
              </td></tr>
            </table>
            ${botao}
          </td></tr>
          <tr><td style="padding:20px 10px 0;text-align:center;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#9A927F;">
              Com carinho, FRENESI. Você recebeu este e-mail porque é cliente da casa.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
  return { assunto, html }
}

/**
 * Ponto de partida do modo HTML do zero: um documento completo e testado em
 * cliente de e-mail (tabelas + estilo inline), já com todos os placeholders
 * no lugar. Melhor editar em cima de algo que funciona do que começar de uma
 * página em branco e descobrir no Gmail o que quebrou.
 */
export const HTML_BASE_RECUPERACAO = `<!doctype html>
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
                <p style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:1.35;color:#1A1A1A;">
                  {nome}, deixamos tudo separado.
                </p>
                <p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.65;color:#4C463A;">
                  Você montou um carrinho na FRENESI e não finalizou — acontece.
                  Seus decants continuam aqui, fracionados do frasco original e prontos para envio.
                </p>
                <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#8A7440;">No seu carrinho</p>
                {itens}
                <p style="margin:12px 0 0;text-align:right;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#4C463A;">Total: <strong style="color:#1A1A1A;font-size:15px;">{total}</strong></p>
                [[cupom]]
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;border:1px dashed #B08D3E;border-radius:10px;">
                  <tr>
                    <td style="padding:16px 20px;text-align:center;">
                      <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8A7440;">{desconto}% de desconto para fechar hoje</p>
                      <p style="margin:0;font-family:'Courier New',Courier,monospace;font-weight:bold;font-size:20px;letter-spacing:.08em;color:#1A1A1A;">{cupom}</p>
                      <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8A8374;">É só aplicar no checkout · uso único</p>
                    </td>
                  </tr>
                </table>
                [[/cupom]]
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:26px 0 6px;text-align:center;">
                      <a href="{link}" style="display:inline-block;background:#141414;color:#EFD18C;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:13px;letter-spacing:.08em;text-transform:uppercase;padding:15px 34px;border-radius:8px;">Concluir meu pedido</a>
                    </td>
                  </tr>
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

/**
 * Aviso de cashback prestes a vencer.
 *
 * Terceiro e-mail da marca, mesma moldura validada. Aqui não há cupom: o
 * saldo já está na conta do cliente e entra sozinho no checkout — o que o
 * e-mail faz é lembrar que ele existe e que tem prazo. Placeholders:
 * {nome}, {saldo}, {validade} (a data, por extenso) e {link}.
 */
export const MODELO_CASHBACK_PADRAO: ModeloEmailRecuperacao = {
  assunto: '{nome}, você tem {saldo} de cashback esperando',
  titulo: '{nome}, seu cashback está esperando.',
  mensagem:
    'O cashback das suas compras anteriores continua disponível na sua conta — mas ele expira. Dá para usar em qualquer produto da loja, direto no checkout.',
  textoBotao: 'Usar meu cashback',
  html: HTML_VALIDADO_CASHBACK,
}

export function emailCashback(
  d: { nome: string | null; saldo: number; validade: string | null; lojaUrl: string | null },
  modelo: ModeloEmailRecuperacao = MODELO_CASHBACK_PADRAO,
): { assunto: string; html: string } {
  const primeiroNome = d.nome?.trim().split(/\s+/)[0] || null
  const saldo = brl(d.saldo)
  const validade = d.validade ?? 'em breve'
  const preenche = (t: string) =>
    preencherModelo(t.split('{saldo}').join(saldo).split('{validade}').join(validade), primeiroNome, saldo)

  const assunto = preenche(modelo.assunto)

  if (modelo.html && modelo.html.trim()) {
    const doc = preenche(modelo.html).split('{link}').join(escapaHtml(d.lojaUrl ?? '#'))
    return { assunto, html: doc }
  }

  const paragrafos = modelo.mensagem
    .split(/\n\s*\n|\n/)
    .map((p) => preenche(p.trim()))
    .filter(Boolean)
  const botao = d.lojaUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:26px 0 6px;text-align:center;"><a href="${escapaHtml(d.lojaUrl)}" style="display:inline-block;background:#141414;color:#EFD18C;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:13px;letter-spacing:.08em;text-transform:uppercase;padding:15px 34px;border-radius:8px;">${escapaHtml(preenche(modelo.textoBotao))}</a></td></tr></table>`
    : ''

  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#F6F1E7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F1E7;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr><td style="padding:0 0 22px;text-align:center;">
            <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;letter-spacing:.34em;color:#141414;">FRENESI</p>
          </td></tr>
          <tr><td style="background:#FFFDF8;border:1px solid #EAE2CF;border-radius:14px;padding:34px 36px;">
            <p style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.35;color:#1A1A1A;">${escapaHtml(preenche(modelo.titulo))}</p>
            ${paragrafos
              .map(
                (p) =>
                  `<p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.65;color:#4C463A;">${escapaHtml(p)}</p>`,
              )
              .join('')}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px dashed #B08D3E;border-radius:10px;">
              <tr><td style="padding:16px 20px;text-align:center;">
                <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8A7440;">Seu saldo</p>
                <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;color:#1A1A1A;">${escapaHtml(saldo)}</p>
                <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8A8374;">válido até ${escapaHtml(validade)}</p>
              </td></tr>
            </table>
            ${botao}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
  return { assunto, html }
}
