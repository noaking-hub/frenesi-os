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
  pedido_enviado: 'Seu pedido saiu para entrega · {pedido}',
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
