/**
 * Quais avisos um pedido merece, e quando.
 *
 * Regra de ouro do módulo: **um evento, um e-mail, para sempre**. O cliente
 * que recebe dois avisos do mesmo fato desconfia da loja — e desconfia mais
 * do segundo que do primeiro. Por isso cada aviso tem uma chave derivada do
 * fato que o gerou, e não do momento em que a rotina rodou.
 */

export type EventoNotificacao =
  | 'pedido_pago'
  | 'pedido_faturado'
  | 'pedido_enviado'
  | 'pedido_entregue'
  | 'devolucao_recebida'
  | 'cashback_creditado'
  | 'cashback_expirando'

export interface PedidoNotificavel {
  id: string
  email: string
  cliente: string
  pagamento: 'pago' | 'pendente' | 'divergente'
  envio: 'nao_iniciado' | 'aguardando_envio' | 'enviado' | 'entregue' | 'retido' | 'atrasado'
  rastreio: string | null
  /** Chave da NF, quando o Olist já faturou. */
  notaFiscal: string | null
}

export interface AvisoPendente {
  /** `YP-1234|pedido_enviado` — deriva do FATO, não do instante da rotina. */
  chave: string
  pedidoId: string
  evento: EventoNotificacao
  email: string
  cliente: string
}

/** Ordem em que os avisos fazem sentido para quem compra. */
const SEQUENCIA: EventoNotificacao[] = [
  'pedido_pago',
  'pedido_faturado',
  'pedido_enviado',
  'pedido_entregue',
]

/**
 * Avisos que este pedido já merece, no estado em que está.
 *
 * Devolve TODOS os que se aplicam, não só o último: um pedido importado já
 * entregue precisa da trilha inteira registrada, senão o histórico do cliente
 * fica com buracos. Cabe a quem envia decidir o que já foi mandado — é o log
 * que sabe disso, não esta função.
 */
export function avisosDe(p: PedidoNotificavel): AvisoPendente[] {
  if (!p.email) return []

  const merecidos = new Set<EventoNotificacao>()
  if (p.pagamento === 'pago') merecidos.add('pedido_pago')
  if (p.notaFiscal) merecidos.add('pedido_faturado')
  if (p.envio === 'enviado' || p.envio === 'entregue') merecidos.add('pedido_enviado')
  if (p.envio === 'entregue') merecidos.add('pedido_entregue')

  return SEQUENCIA.filter((e) => merecidos.has(e)).map((evento) => ({
    chave: `${p.id}|${evento}`,
    pedidoId: p.id,
    evento,
    email: p.email,
    cliente: p.cliente,
  }))
}

/**
 * Um pedido que chegou entregue nunca precisou dos avisos do meio.
 *
 * Mandar "seu pedido foi pago" para quem já recebeu o perfume há duas semanas
 * é pior que silêncio: denuncia que o sistema acabou de ser ligado. Ao
 * importar histórico, os avisos anteriores ao estado atual entram no log como
 * dispensados, sem sair e-mail.
 */
export function apenasOAtual(avisos: AvisoPendente[]): {
  enviar: AvisoPendente[]
  dispensar: AvisoPendente[]
} {
  if (avisos.length === 0) return { enviar: [], dispensar: [] }
  const ultimo = avisos[avisos.length - 1]
  return { enviar: [ultimo], dispensar: avisos.slice(0, -1) }
}

export const ASSUNTO: Record<EventoNotificacao, string> = {
  pedido_pago: 'Pagamento confirmado · pedido {pedido}',
  pedido_faturado: 'Nota fiscal emitida · pedido {pedido}',
  // "Enviado" e "saiu para entrega" são fatos diferentes, e o segundo é o que
  // o cliente espera no dia da chegada. Prometer o errado no assunto gera
  // frustração exatamente no aviso que deveria acalmar.
  pedido_enviado: 'Seu pedido foi enviado · {pedido}',
  pedido_entregue: 'Seu pedido chegou · {pedido}',
  devolucao_recebida: 'Recebemos sua devolução · {pedido}',
  cashback_creditado: 'Você ganhou cashback na Frenesi',
  cashback_expirando: 'Seu cashback está perto de expirar',
}

/** Rótulo humano do evento, para a tela de log. */
export const ROTULO_EVENTO: Record<EventoNotificacao, string> = {
  pedido_pago: 'Pagamento confirmado',
  pedido_faturado: 'Nota fiscal emitida',
  pedido_enviado: 'Pedido enviado',
  pedido_entregue: 'Pedido entregue',
  devolucao_recebida: 'Devolução recebida',
  cashback_creditado: 'Cashback creditado',
  cashback_expirando: 'Cashback expirando',
}

// ── Modelo do aviso de envio ────────────────────────────────────────────────

/**
 * O e-mail que o cliente recebe quando o pedido sai daqui.
 *
 * Mesma moldura validada dos outros avisos da marca. O que muda é o miolo, e
 * ele existe para responder às duas perguntas que o cliente faria em seguida:
 * **qual é o código** e **onde eu acompanho**. Por isso o código aparece em
 * destaque, monoespaçado e selecionável, e o botão leva direto à página da
 * transportadora com ele embutido — sem digitar nada.
 *
 * Placeholders: {nome}, {pedido}, {codigo}, {transportadora}, {link}.
 */
export const MODELO_ENVIO_PADRAO = {
  assunto: 'Seu pedido saiu para entrega · {pedido}',
  titulo: '{nome}, seu pedido está a caminho.',
  mensagem:
    'Ele saiu daqui e já está com {transportadora}. O primeiro registro costuma aparecer em até um dia útil depois da postagem — até lá é normal a consulta não mostrar movimentação.',
  textoBotao: 'Acompanhar entrega',
  html: null as string | null,
}

const escapa = (t: string) =>
  t
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')

/**
 * Monta o aviso de envio.
 *
 * Sem `link` o botão não é renderizado — botão que abre numa consulta vazia
 * faz o cliente concluir que o pedido se perdeu, que é o oposto do que este
 * e-mail existe para fazer. Sem `codigo`, o bloco do código também some, e o
 * texto passa a prometer o código para depois em vez de exibir um espaço em
 * branco onde ele deveria estar.
 */
export function emailEnvio(
  d: {
    nome: string | null
    pedido: string
    codigo: string | null
    transportadora: string | null
    link: string | null
  },
  modelo: typeof MODELO_ENVIO_PADRAO = MODELO_ENVIO_PADRAO,
): { assunto: string; html: string } {
  const nome = d.nome?.trim().split(/\s+/)[0] || 'Olá'
  const transportadora = d.transportadora ?? 'a transportadora'
  const preenche = (t: string) =>
    t
      .split('{nome}').join(escapa(nome))
      .split('{pedido}').join(escapa(d.pedido))
      .split('{codigo}').join(escapa(d.codigo ?? ''))
      .split('{transportadora}').join(escapa(transportadora))

  const assunto = preenche(modelo.assunto)

  if (modelo.html && modelo.html.trim()) {
    return { assunto, html: preenche(modelo.html).split('{link}').join(escapa(d.link ?? '#')) }
  }

  const paragrafos = modelo.mensagem
    .split(/\n\s*\n|\n/)
    .map((p) => preenche(p.trim()))
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.65;color:#4C463A;">${p}</p>`,
    )
    .join('')

  const blocoCodigo = d.codigo
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 6px;border:1px dashed #B08D3E;border-radius:10px;">
                  <tr>
                    <td style="padding:16px 20px;text-align:center;">
                      <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8A7440;">Código de rastreio · ${escapa(transportadora)}</p>
                      <p style="margin:0;font-family:'Courier New',Courier,monospace;font-weight:bold;font-size:20px;letter-spacing:.08em;color:#1A1A1A;">${escapa(d.codigo)}</p>
                    </td>
                  </tr>
                </table>`
    : `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.65;color:#4C463A;">Assim que o código de rastreio for emitido, enviamos para você.</p>`

  const botao = d.link
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:24px 0 4px;text-align:center;">
                      <a href="${escapa(d.link)}" style="display:inline-block;background:#141414;color:#EFD18C;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:13px;letter-spacing:.08em;text-transform:uppercase;padding:15px 34px;border-radius:8px;">${escapa(preenche(modelo.textoBotao))}</a>
                    </td>
                  </tr>
                </table>`
    : ''

  return {
    assunto,
    html: molduraFrenesi({
      titulo: preenche(modelo.titulo),
      pedido: d.pedido,
      miolo: `${paragrafos}${blocoCodigo}${botao}`,
    }),
  }
}

/**
 * A moldura da marca, comum a todo aviso de pedido.
 *
 * Uma só, e não uma por e-mail: dois visuais diferentes no mesmo fluxo fazem o
 * cliente duvidar do segundo. Tabela e estilo em linha porque cliente de
 * e-mail ignora folha externa e boa parte ignora `<style>` no cabeçalho.
 */
function molduraFrenesi(d: { titulo: string; pedido: string; miolo: string }): string {
  return `<!doctype html>
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
                <p style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:1.35;color:#1A1A1A;">${d.titulo}</p>
                <p style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#8A7440;">Pedido ${escapa(d.pedido)}</p>
                ${d.miolo}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 10px 0;text-align:center;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#9A927F;">
                  Alguma dúvida sobre a entrega? É só responder este e-mail.<br>
                  Você recebeu esta mensagem porque tem um pedido na FRENESI.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/**
 * Aviso de entrega concluída, na mesma moldura.
 *
 * Sem botão: o pedido chegou, não há o que acompanhar. O que o cliente pode
 * precisar é falar com a gente, e para isso basta responder.
 */
export function emailEntregue(d: { nome: string | null; pedido: string }): {
  assunto: string
  html: string
} {
  const nome = d.nome?.trim().split(/\s+/)[0] || 'Olá'
  const paragrafo = (t: string) =>
    `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.65;color:#4C463A;">${t}</p>`
  return {
    assunto: ASSUNTO.pedido_entregue.replace('{pedido}', d.pedido),
    html: molduraFrenesi({
      titulo: `${escapa(nome)}, seu pedido chegou.`,
      pedido: d.pedido,
      miolo:
        paragrafo('A entrega foi confirmada pela transportadora.') +
        paragrafo(
          'Se algo não estiver como você esperava, é só responder este e-mail — a gente resolve.',
        ),
    }),
  }
}
