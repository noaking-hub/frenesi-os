import {
  HTML_VALIDADO_DEVOLUCAO_ABERTA,
  HTML_VALIDADO_DEVOLUCAO_NOVAS_FOTOS,
  HTML_VALIDADO_DEVOLUCAO_APROVADA,
  HTML_VALIDADO_DEVOLUCAO_CONCLUIDA,
  HTML_VALIDADO_ENTREGUE,
  HTML_VALIDADO_PAGAMENTO,
  HTML_VALIDADO_ENVIO,
} from './emails-validados'
import { brl } from './format'
import type { ModeloEmailRecuperacao } from './recuperacao'

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
  | 'devolucao_aberta'
  | 'devolucao_aprovada'
  | 'devolucao_novas_fotos'
  | 'devolucao_concluida'
  | 'devolucao_recebida'
  | 'carrinho_recuperacao'
  | 'aniversario_giftback'
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
  devolucao_aberta: 'Recebemos sua solicitação de devolução · {protocolo}',
  devolucao_aprovada: 'Devolução aprovada · código de postagem · {protocolo}',
  devolucao_novas_fotos: 'Precisamos de novas fotos · {protocolo}',
  devolucao_concluida: 'Devolução concluída · {protocolo}',
  devolucao_recebida: 'Recebemos sua devolução · {pedido}',
  carrinho_recuperacao: 'Você esqueceu algo no carrinho',
  aniversario_giftback: 'Feliz aniversário — um presente da FRENESI',
  cashback_creditado: 'Você ganhou cashback na Frenesi',
  cashback_expirando: 'Seu cashback está perto de expirar',
}

/** Rótulo humano do evento, para a tela de log. */
export const ROTULO_EVENTO: Record<EventoNotificacao, string> = {
  pedido_pago: 'Pagamento confirmado',
  pedido_faturado: 'Nota fiscal emitida',
  pedido_enviado: 'Pedido enviado',
  pedido_entregue: 'Pedido entregue',
  devolucao_aberta: 'Devolução aberta no portal',
  devolucao_aprovada: 'Devolução aprovada · reverso enviado',
  devolucao_novas_fotos: 'Novas fotos pedidas ao cliente',
  devolucao_concluida: 'Devolução concluída · resolução informada',
  devolucao_recebida: 'Devolução recebida',
  carrinho_recuperacao: 'Recuperação de carrinho',
  aniversario_giftback: 'Aniversário (Giftback)',
  cashback_creditado: 'Cashback creditado',
  cashback_expirando: 'Cashback expirando',
}

// ── Modelo do aviso de envio ────────────────────────────────────────────────

/**
 * O e-mail que o cliente recebe quando o pedido sai daqui.
 *
 * Usa o HTML VALIDADO da marca, o mesmo dos outros três: fundo escuro, moldura
 * dourada dupla, logomarca do CDN e o rodapé com as redes. A primeira versão
 * deste aviso tinha moldura própria, clara e sem logo — e ficou evidente na
 * caixa de entrada que era outro remetente.
 *
 * O bloco em destaque aqui não é cupom nem saldo: é o CÓDIGO DE RASTREIO, que
 * é o que o cliente veio buscar.
 *
 * Placeholders: {nome}, {pedido}, {codigo}, {transportadora}, {link}.
 */
export const MODELO_ENVIO_PADRAO: ModeloEmailRecuperacao = {
  assunto: 'Seu pedido está a caminho · {pedido}',
  titulo: '{nome}, seu pedido está a caminho',
  // A frase precisa fechar com QUALQUER transportadora: Correios, Jadlog,
  // J&T, Total Express, Buslog — e com nenhuma, quando o serviço contratado
  // não identifica a empresa. "Foi postado e segue com X" funciona nos seis
  // casos; "Ele está com Correios" só funcionava quando ainda era uma só.
  mensagem:
    'Ele já foi postado e segue com {transportadora}. O primeiro registro costuma aparecer em até um dia útil depois da postagem — até lá é normal a consulta não mostrar movimentação.',
  textoBotao: 'Acompanhar entrega',
  html: HTML_VALIDADO_ENVIO,
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
 * Sem código de rastreio o e-mail não é montado por quem chama — o aviso só
 * existe quando há o que rastrear. Sem link, o botão aponta para a loja: o
 * cliente ao menos volta para um lugar nosso, em vez de cair numa consulta
 * vazia que o faria concluir que o pedido se perdeu.
 */
/**
 * O texto da entrega LOCAL — pedido que sai em mãos, com o motoboy.
 *
 * Fixo de propósito, fora da Central de E-mails: o modelo editável fala de
 * postagem, transportadora e primeiro registro, e nada disso existe numa
 * entrega em mãos. Antes desta variante o cliente de entrega local lia
 * "segue com a transportadora responsável" e um código chamado "a caminho" —
 * modelo mentindo por falta de caso, não por falta de dado.
 */
const MENSAGEM_ENVIO_LOCAL =
  'Seu pedido saiu para entrega com o nosso motoboy e será entregue em mãos, direto no seu endereço. ' +
  'Entrega local não tem código de rastreio.'

export function emailEnvio(
  d: {
    nome: string | null
    pedido: string
    codigo: string | null
    transportadora: string | null
    link: string | null
    /** Pedido entregue em mãos pelo motoboy — muda o texto e o bloco central. */
    entregaLocal?: boolean
  },
  modelo: ModeloEmailRecuperacao = MODELO_ENVIO_PADRAO,
): { assunto: string; html: string } {
  const nome = d.nome?.trim().split(/\s+/)[0] || 'Olá'
  const local = Boolean(d.entregaLocal)
  // Sem transportadora identificada a frase não inventa uma: `identificarFrete`
  // devolve "Não informada" quando o rótulo do serviço não diz a empresa, e
  // quem chama converte isso em null. Nomear errado é pior do que não nomear —
  // o cliente vai procurar o pacote na transportadora errada.
  const transportadora = local ? 'Motoboy' : (d.transportadora ?? 'a transportadora responsável')
  const preenche = (t: string) =>
    t
      .split('{nome}').join(escapa(nome))
      .split('{pedido}').join(escapa(d.pedido))
      .split('{codigo}').join(escapa(local ? 'entrega em mãos' : (d.codigo ?? 'a caminho')))
      .split('{transportadora}').join(escapa(transportadora))

  const assunto = preenche(modelo.assunto)
  // Título e mensagem entram ANTES dos demais placeholders: eles próprios
  // contêm {nome} e {transportadora}, e é a passada seguinte que os resolve.
  //
  // Sem isso a moldura validada trazia o texto cravado no HTML, e os campos
  // "Título" e "Mensagem" da Central de E-mails não mudavam nada — a operação
  // editava, salvava, e o cliente recebia a frase antiga.
  let comTexto = (modelo.html || HTML_VALIDADO_ENVIO)
    .split('{titulo}')
    .join(escapa(modelo.titulo))
    .split('{mensagem}')
    .join(escapa(local ? MENSAGEM_ENVIO_LOCAL : modelo.mensagem))
  if (local) {
    // O bloco central deixa de prometer rastreio: o rótulo vira ENTREGA
    // LOCAL e o botão leva à conta do cliente, não a uma consulta vazia.
    comTexto = comTexto
      .split('C&Oacute;DIGO DE RASTREIO').join('ENTREGA LOCAL')
      .split('ACOMPANHAR ENTREGA').join('ACOMPANHAR MEU PEDIDO')
  }
  const html = preenche(comTexto)
    .split('{link}')
    .join(escapa(d.link ?? (local ? CONTA_DO_CLIENTE : LOJA)))
  return { assunto, html }
}

const LOJA = 'https://frenesiperfumes.com.br'

/**
 * A área do cliente — onde ele vê os pedidos dele.
 *
 * Destino do botão da confirmação de pagamento. A vitrine seria o convite
 * errado no momento errado: quem acabou de pagar quer ACOMPANHAR a compra que
 * fez, não olhar outra. Mandar para a home é responder "veja nossos produtos" a
 * quem perguntou "e o meu pedido?".
 */
const CONTA_DO_CLIENTE = 'https://conta.frenesiperfumes.com.br'

// ── Modelos da devolução ────────────────────────────────────────────────────

/**
 * Confirmação de que a solicitação existe do outro lado.
 *
 * O bloco em destaque é o PROTOCOLO — o número que o cliente vai ditar para o
 * atendimento. Placeholders: {nome}, {pedido}, {protocolo}.
 */
export const MODELO_DEVOLUCAO_ABERTA_PADRAO: ModeloEmailRecuperacao = {
  assunto: 'Recebemos sua solicitação de devolução · {protocolo}',
  titulo: '{nome}, sua solicitação foi registrada',
  mensagem:
    'Mantenha o produto na embalagem original, com o lacre como está. Você não precisa fazer nada agora — nossa equipe conduz a análise e retorna com o resultado.',
  textoBotao: 'Falar com o atendimento',
  html: HTML_VALIDADO_DEVOLUCAO_ABERTA,
}

/**
 * Aprovação com o código de postagem reversa em destaque — é o e-mail que o
 * cliente leva à agência. A agência é fixa: a postagem reversa sai SEMPRE
 * pelos Correios (regra da operação); a plataforma da etiqueta (Frenet) nunca
 * aparece — não significa nada para quem recebe.
 * Placeholders: {nome}, {protocolo}, {reverso}.
 */
export const MODELO_DEVOLUCAO_APROVADA_PADRAO: ModeloEmailRecuperacao = {
  assunto: 'Devolução aprovada · código de postagem · {protocolo}',
  titulo: '{nome}, sua devolução foi aprovada',
  mensagem:
    'Leve o produto na embalagem original, com o lacre como está, a uma agência dos Correios e apresente o código abaixo no balcão. Não é preciso imprimir etiqueta.',
  textoBotao: 'Tirar dúvidas no WhatsApp',
  html: HTML_VALIDADO_DEVOLUCAO_APROVADA,
}

/**
 * Conclusão da devolução, com a resolução em destaque. O reembolso é
 * executado MANUALMENTE pela operação (decisão do dono) — este e-mail
 * comprova: valor no quadro, forma e data na nota, comprovante em anexo.
 * Placeholders: {nome}, {protocolo}, {resolucao}, {destaque}, {corpo}, {nota}.
 */
export const MODELO_DEVOLUCAO_CONCLUIDA_PADRAO: ModeloEmailRecuperacao = {
  assunto: 'Devolução concluída · {protocolo}',
  titulo: '{nome}, sua devolução foi concluída',
  mensagem: '{corpo}',
  textoBotao: 'Falar com o atendimento',
  html: HTML_VALIDADO_DEVOLUCAO_CONCLUIDA,
}

export interface ConclusaoDevolucao {
  nome: string | null
  protocolo: string
  resolucao: string
  reembolsoValor: number | null
  reembolsoForma: 'pix' | 'estorno-cartao' | null
  /** dd/MM/aaaa já formatada, quando houve reembolso. */
  reembolsoData: string | null
  temComprovante: boolean
  trocaPedidoId: string | null
}

/** Monta a conclusão. O quadro tracejado muda com a resolução. */
export function emailDevolucaoConcluida(
  d: ConclusaoDevolucao,
  modelo: ModeloEmailRecuperacao = MODELO_DEVOLUCAO_CONCLUIDA_PADRAO,
): { assunto: string; html: string } {
  const nome = d.nome?.trim().split(/\s+/)[0] || 'Olá'
  /**
   * Por onde o dinheiro voltou.
   *
   * O reembolso sai SEMPRE pelo mesmo meio do pagamento: quem pagou no cartão
   * recebe estorno no cartão, quem pagou por Pix recebe Pix. O ERP não escolhe
   * isso, ele registra o que foi feito.
   *
   * Sem forma registrada o e-mail não chuta. Antes chutava: `=== 'pix' ? ... :
   * 'estorno no cartão'` fazia o campo vazio virar a afirmação de que houve
   * estorno no cartão — e afirmar o meio errado num e-mail de reembolso é
   * mandar o cliente procurar o dinheiro no lugar em que ele não está.
   */
  const forma =
    d.reembolsoForma === 'pix'
      ? 'Pix'
      : d.reembolsoForma === 'estorno-cartao'
        ? 'estorno no cartão'
        : null
  const reembolso = d.reembolsoValor !== null

  const destaque = reembolso
    ? `R$ ${d.reembolsoValor!.toFixed(2).replace('.', ',')}`
    : d.trocaPedidoId
      ? `Pedido ${d.trocaPedidoId}`
      : d.protocolo
  const corpo = reembolso
    ? `${
        forma
          ? `O reembolso foi efetuado por ${forma}, o mesmo meio usado no pagamento.`
          : 'O reembolso foi efetuado pelo mesmo meio usado no pagamento.'
      }${d.temComprovante ? ' O comprovante segue anexo a este e-mail.' : ''}`
    : d.trocaPedidoId
      ? 'Um novo pedido foi gerado para a sua troca — ele segue o fluxo normal de produção e envio da loja.'
      : 'Nossa equipe entra em contato com os detalhes da resolução.'
  const nota = reembolso
    ? `Efetuado${d.reembolsoData ? ` em ${d.reembolsoData}` : ''}${forma ? ` · ${forma}` : ''}`
    : d.trocaPedidoId
      ? 'Número do novo pedido do reenvio'
      : 'Guarde o protocolo para o atendimento'

  const preenche = (t: string) =>
    t
      .split('{nome}').join(escapa(nome))
      .split('{protocolo}').join(escapa(d.protocolo))
      .split('{resolucao}').join(escapa(d.resolucao))
      .split('{destaque}').join(escapa(destaque))
      .split('{corpo}').join(escapa(corpo))
      .split('{nota}').join(escapa(nota))
  return {
    assunto: preenche(modelo.assunto),
    html: preenche(modelo.html || HTML_VALIDADO_DEVOLUCAO_CONCLUIDA),
  }
}

/** Monta a confirmação de devolução aberta. */
export function emailDevolucaoAberta(
  d: { nome: string | null; pedido: string; protocolo: string },
  modelo: ModeloEmailRecuperacao = MODELO_DEVOLUCAO_ABERTA_PADRAO,
): { assunto: string; html: string } {
  const nome = d.nome?.trim().split(/\s+/)[0] || 'Olá'
  const preenche = (t: string) =>
    t
      .split('{nome}').join(escapa(nome))
      .split('{pedido}').join(escapa(d.pedido))
      .split('{protocolo}').join(escapa(d.protocolo))
  return {
    assunto: preenche(modelo.assunto),
    html: preenche(modelo.html || HTML_VALIDADO_DEVOLUCAO_ABERTA),
  }
}

/**
 * Monta a aprovação com o reverso. Sem código não há e-mail — quem chama
 * garante; um "código: em breve" na caixa de destaque seria pior que esperar.
 */
export function emailDevolucaoAprovada(
  d: { nome: string | null; protocolo: string; reverso: string },
  modelo: ModeloEmailRecuperacao = MODELO_DEVOLUCAO_APROVADA_PADRAO,
): { assunto: string; html: string } {
  const nome = d.nome?.trim().split(/\s+/)[0] || 'Olá'
  const preenche = (t: string) =>
    t
      .split('{nome}').join(escapa(nome))
      .split('{protocolo}').join(escapa(d.protocolo))
      .split('{reverso}').join(escapa(d.reverso))
  return {
    assunto: preenche(modelo.assunto),
    html: preenche(modelo.html || HTML_VALIDADO_DEVOLUCAO_APROVADA),
  }
}

/**
 * Aviso de entrega concluída, na mesma moldura validada.
 *
 * Sem código e sem rastreio: o objeto chegou, não há o que acompanhar. O botão
 * convida a voltar à loja, que é o único próximo passo que faz sentido aqui.
 */
/**
 * Pagamento confirmado.
 *
 * O primeiro e-mail da relação, e o que mais precisa acertar a expectativa: o
 * cliente acabou de pagar e a próxima notícia — o rastreio — só vem dias
 * depois. Sem esta mensagem dizendo "até 3 dias úteis", o silêncio vira
 * dúvida e a dúvida vira mensagem no WhatsApp.
 *
 * `total` chega já formatado em reais por quem chama, porque a formatação de
 * moeda mora no domínio financeiro e duplicá-la aqui faria os dois divergirem
 * no primeiro ajuste.
 *
 * Já teve um `pagamento` aqui, para escrever "Pago em Pix". O dono cortou a
 * frase, e o parâmetro saiu junto — junto com a consulta a `pedido_transacoes`
 * que o alimentava. Dado calculado para texto que não existe mais é peso que
 * ninguém revisa: a próxima pessoa a ler acharia que serve para alguma coisa.
 */
export interface ItemComprado {
  descricao: string
  quantidade: number
  preco: number
  /** Miniatura do catálogo. 98% dos itens têm; o resto sai só com o nome. */
  imagem: string | null
}

export interface CashbackGanho {
  valor: number
  /** dd/MM/aaaa — a data importa mais que o valor: é ela que traz de volta. */
  validade: string
}

/**
 * Uma linha do resumo: miniatura, nome, quantidade × unitário e o subtotal.
 */
function linhaDoItem(i: ItemComprado): string {
  const miniatura = i.imagem
    ? `<img src="${escapa(i.imagem)}" width="64" height="64" alt="" style="display:block; width:64px; height:64px; border:1px solid #E4DAC5; border-radius:8px; background-color:#FFFDF9;" />`
    : ''
  return `<tr>
  <td valign="top" width="64" style="width:64px; padding:0 14px 16px 0;">${miniatura}</td>
  <td valign="top" align="left" style="padding:0 10px 16px 0;">
    <div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:20px; mso-line-height-rule:exactly; color:#241F18;">${escapa(i.descricao)}</div>
    <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; mso-line-height-rule:exactly; color:#8A6A2F; padding-top:4px;">${i.quantidade} &times; ${escapa(brl(i.preco))}</div>
  </td>
  <td valign="top" align="right" style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:20px; mso-line-height-rule:exactly; color:#241F18; white-space:nowrap; padding:0 0 16px 0;">${escapa(brl(i.preco * i.quantidade))}</td>
</tr>`
}

function linhaDaConta(rotulo: string, valor: string, cor = '#6B6355'): string {
  return `<tr>
  <td colspan="2" align="left" style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:22px; mso-line-height-rule:exactly; color:${cor}; padding:3px 0;">${rotulo}</td>
  <td align="right" style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:22px; mso-line-height-rule:exactly; color:${cor}; white-space:nowrap; padding:3px 0;">${valor}</td>
</tr>`
}

/**
 * O resumo da compra, quando há itens para mostrar.
 *
 * O DESCONTO é derivado, e é ele que faz a conta fechar: `subtotal + frete −
 * total`. O ERP não guarda o desconto do checkout (cupom, cashback usado), e
 * por isso a soma dos itens não bate com o total em 520 dos 640 pedidos pagos
 * — sempre para MENOS, nunca para mais, o que é justamente a assinatura de um
 * abatimento. Deduzi-lo é o que permite mostrar preço por item sem entregar ao
 * cliente um comprovante que erra a própria conta.
 *
 * Centavo negativo por arredondamento não vira linha: abaixo de um centavo, a
 * diferença é ruído, não desconto.
 */
function resumoDaCompra(itens: ItemComprado[], frete: number, total: number): string {
  const subtotal = itens.reduce((a, i) => a + i.preco * i.quantidade, 0)
  const desconto = Math.round((subtotal + frete - total) * 100) / 100

  const contas = [
    linhaDaConta('Subtotal', escapa(brl(subtotal))),
    desconto > 0.009 ? linhaDaConta('Desconto', `&minus; ${escapa(brl(desconto))}`, '#8A6A2F') : '',
    // Frete grátis aparece em vez de sumir: é argumento de venda, e esconder
    // seria jogar fora um ponto que a loja já ganhou.
    frete > 0 ? linhaDaConta('Frete', escapa(brl(frete))) : linhaDaConta('Frete', 'gr&aacute;tis', '#8A6A2F'),
  ]
    .filter(Boolean)
    .join('\n')

  return `<div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F; padding-bottom:22px;">RESUMO DA COMPRA</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
${itens.map(linhaDoItem).join('\n')}
<tr><td colspan="3" style="border-top:1px solid #E4DAC5; font-size:0; line-height:0; padding-top:6px;">&nbsp;</td></tr>
${contas}
</table>`
}

/** O quadro que existia antes dos itens: rótulo, número do pedido e valor. */
function quadroSimples(pedido: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">PAGAMENTO APROVADO</div>
<div style="font-family:Georgia,'Times New Roman',serif; font-size:26px; line-height:34px; mso-line-height-rule:exactly; color:#241F18; padding-top:14px;">Pedido ${escapa(pedido)}</div>`
}

/**
 * O bloco do cashback ganho na compra.
 *
 * Só existe quando o crédito foi LIDO na carteira do cliente. Calcular 10% do
 * pedido acertaria em 452 dos 452 créditos de hoje e mentiria no dia da
 * primeira promoção com outra taxa — e um valor errado aqui é o cliente
 * conferindo a conta dele e achando a marca em falta.
 */
function blocoDeCashback(c: CashbackGanho): string {
  return `<tr>
  <td align="center" class="pad" style="padding:14px 32px 0 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="598" class="win" style="width:598px; border:1px solid #D8C49B; border-radius:12px; background-color:#FAF6EE;">
      <tr>
        <td align="center" style="padding:24px 30px 26px 30px;">
          <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:4px; color:#8A6A2F;">VOC&Ecirc; GANHOU DE VOLTA</div>
          <div style="font-family:Georgia,'Times New Roman',serif; font-size:34px; line-height:42px; mso-line-height-rule:exactly; color:#8A6A2F; padding-top:12px;">${escapa(brl(c.valor))}</div>
          <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:21px; mso-line-height-rule:exactly; color:#6B6355; padding-top:12px;">de cashback, para usar at&eacute; <strong style="color:#5E4A1E;">${escapa(c.validade)}</strong><br />selecione seu saldo na finaliza&ccedil;&atilde;o da compra</div>
        </td>
      </tr>
    </table>
  </td>
</tr>
`
}

export function emailPagamento(d: {
  nome: string | null
  pedido: string
  /** Em reais. Quem formata é quem desenha. */
  total: number
  itens?: ItemComprado[]
  frete?: number | null
  /** Lido da carteira na hora do envio; ausente, o bloco não aparece. */
  cashback?: CashbackGanho | null
}): { assunto: string; html: string } {
  const nome = d.nome?.trim().split(/\s+/)[0] || 'Olá'
  const itens = d.itens ?? []

  const html = HTML_VALIDADO_PAGAMENTO.split('{resumo}')
    .join(
      itens.length > 0
        ? resumoDaCompra(itens, Number(d.frete ?? 0), d.total)
        : quadroSimples(d.pedido),
    )
    .split('{cashback}')
    .join(d.cashback ? blocoDeCashback(d.cashback) : '')
    .split('{nome}')
    .join(escapa(nome))
    .split('{pedido}')
    .join(escapa(d.pedido))
    .split('{total}')
    .join(escapa(brl(d.total)))
    .split('{link}')
    .join(CONTA_DO_CLIENTE)

  return { assunto: ASSUNTO.pedido_pago.replace('{pedido}', d.pedido), html }
}

export function emailEntregue(d: {
  nome: string | null
  pedido: string
  transportadora: string | null
  entregaLocal?: boolean
}): { assunto: string; html: string } {
  const nome = d.nome?.trim().split(/\s+/)[0] || 'Olá'
  // Na entrega local quem confirma é o nosso motoboy, não "a transportadora".
  const quemEntregou = d.entregaLocal ? 'Nosso motoboy' : (d.transportadora ?? 'A transportadora')
  const html = HTML_VALIDADO_ENTREGUE.split('{nome}')
    .join(escapa(nome))
    .split('{pedido}')
    .join(escapa(d.pedido))
    .split('{transportadora}')
    .join(escapa(quemEntregou))
    .split('{link}')
    .join(LOJA)

  return { assunto: ASSUNTO.pedido_entregue.replace('{pedido}', d.pedido), html }
}

/**
 * Pedido de novas provas — o e-mail que faltava.
 *
 * Sem ele, "pedir mais fotos" dependia de o cliente entrar no portal por
 * acaso: o caso ficava parado em "Aguardando fotos" e ninguém do outro lado
 * sabia que a bola estava com ele. A moldura é a mesma da conclusão, com os
 * textos próprios: reusar o template inteiro mandou ao cliente um pedido de
 * fotos dizendo "caso encerrado" — o que muda aqui
 * é o texto, não o desenho. O que a operação pediu vai no lugar de destaque
 * da moldura — é a informação que o cliente precisa ler primeiro.
 */
export function emailDevolucaoNovasFotos(
  d: { nome: string | null; protocolo: string; oQueFalta: string },
  modelo: ModeloEmailRecuperacao = MODELO_DEVOLUCAO_NOVAS_FOTOS_PADRAO,
): { assunto: string; html: string } {
  const nome = d.nome?.trim().split(/\s+/)[0] || 'Olá'
  const preenche = (t: string) =>
    t
      .split('{nome}').join(escapa(nome))
      .split('{protocolo}').join(escapa(d.protocolo))
      .split('{resolucao}').join(escapa(d.oQueFalta))
      .split('{destaque}').join(escapa(d.protocolo))
      .split('{corpo}').join(escapa('Reenvie pelo portal com este protocolo e o e-mail da compra.'))
      .split('{nota}').join(escapa('Protocolo da sua devolução'))
  return {
    assunto: preenche(modelo.assunto),
    html: preenche(modelo.html || HTML_VALIDADO_DEVOLUCAO_NOVAS_FOTOS),
  }
}

/** Placeholders: {nome}, {protocolo}. O que falta entra no corpo. */
export const MODELO_DEVOLUCAO_NOVAS_FOTOS_PADRAO: ModeloEmailRecuperacao = {
  assunto: 'Precisamos de novas fotos · {protocolo}',
  titulo: '{nome}, precisamos de novas fotos',
  mensagem:
    'Entre no portal de devoluções com o seu protocolo e o e-mail da compra para reenviar. A análise continua assim que as fotos chegarem.',
  textoBotao: 'Reenviar no portal',
  html: HTML_VALIDADO_DEVOLUCAO_NOVAS_FOTOS,
}
