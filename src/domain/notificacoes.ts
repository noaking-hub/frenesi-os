import {
  HTML_VALIDADO_DEVOLUCAO_ABERTA,
  HTML_VALIDADO_DEVOLUCAO_NOVAS_FOTOS,
  HTML_VALIDADO_DEVOLUCAO_APROVADA,
  HTML_VALIDADO_DEVOLUCAO_CONCLUIDA,
  HTML_VALIDADO_ENTREGUE,
  HTML_VALIDADO_ENVIO,
} from './emails-validados'
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
  mensagem:
    'Ele está com {transportadora}. O primeiro registro costuma aparecer em até um dia útil depois da postagem — até lá é normal a consulta não mostrar movimentação.',
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
export function emailEnvio(
  d: {
    nome: string | null
    pedido: string
    codigo: string | null
    transportadora: string | null
    link: string | null
  },
  modelo: ModeloEmailRecuperacao = MODELO_ENVIO_PADRAO,
): { assunto: string; html: string } {
  const nome = d.nome?.trim().split(/\s+/)[0] || 'Olá'
  const transportadora = d.transportadora ?? 'a transportadora'
  const preenche = (t: string) =>
    t
      .split('{nome}').join(escapa(nome))
      .split('{pedido}').join(escapa(d.pedido))
      .split('{codigo}').join(escapa(d.codigo ?? 'a caminho'))
      .split('{transportadora}').join(escapa(transportadora))

  const assunto = preenche(modelo.assunto)
  const html = preenche(modelo.html || HTML_VALIDADO_ENVIO).split('{link}').join(
    escapa(d.link ?? LOJA),
  )
  return { assunto, html }
}

const LOJA = 'https://frenesiperfumes.com.br'

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
  const forma = d.reembolsoForma === 'pix' ? 'Pix' : 'estorno no cartão'
  const reembolso = d.reembolsoValor !== null

  const destaque = reembolso
    ? `R$ ${d.reembolsoValor!.toFixed(2).replace('.', ',')}`
    : d.trocaPedidoId
      ? `Pedido ${d.trocaPedidoId}`
      : d.protocolo
  const corpo = reembolso
    ? `O reembolso foi efetuado por ${forma}.${d.temComprovante ? ' O comprovante segue anexo a este e-mail.' : ''}`
    : d.trocaPedidoId
      ? 'Um novo pedido foi gerado para a sua troca — ele segue o fluxo normal de produção e envio da loja.'
      : 'Nossa equipe entra em contato com os detalhes da resolução.'
  const nota = reembolso
    ? `Efetuado${d.reembolsoData ? ` em ${d.reembolsoData}` : ''} · ${forma}`
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
export function emailEntregue(d: {
  nome: string | null
  pedido: string
  transportadora: string | null
}): { assunto: string; html: string } {
  const nome = d.nome?.trim().split(/\s+/)[0] || 'Olá'
  const html = HTML_VALIDADO_ENTREGUE.split('{nome}')
    .join(escapa(nome))
    .split('{pedido}')
    .join(escapa(d.pedido))
    .split('{transportadora}')
    .join(escapa(d.transportadora ?? 'A transportadora'))
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
