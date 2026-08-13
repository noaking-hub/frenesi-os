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

/** Primeiro nome, para a saudação. Nome completo em e-mail soa a cobrança. */
function primeiroNome(cliente: string): string {
  const nome = cliente.trim().split(/\s+/)[0] ?? ''
  if (!nome) return 'Olá'
  return nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase()
}

export interface ConteudoAviso {
  assunto: string
  titulo: string
  saudacao: string
  corpo: string[]
  acao?: { texto: string; url: string }
}

/**
 * O que o cliente lê em cada aviso.
 *
 * Escrito para responder a pergunta que ele faria em seguida, e não para
 * anunciar um estado do sistema. "Seu pedido foi enviado" sem o código e sem
 * onde acompanhar é um e-mail que gera a mensagem no WhatsApp que ele deveria
 * ter evitado.
 *
 * Prazo não entra: a transportadora não nos dá data confiável, e prometer o
 * que não se controla é como se perde a confiança que este aviso existe para
 * construir.
 */
export function conteudoDoAviso(dados: {
  evento: EventoNotificacao
  pedidoId: string
  cliente: string
  rastreio: string | null
  transportadora: string | null
  urlRastreio: string | null
}): ConteudoAviso {
  const { evento, pedidoId, cliente, rastreio, transportadora, urlRastreio } = dados
  const assunto = ASSUNTO[evento].replace('{pedido}', pedidoId)
  const saudacao = `${primeiroNome(cliente)}, tudo bem?`
  const empresa = transportadora ?? 'a transportadora'

  if (evento === 'pedido_enviado') {
    const corpo = [
      `Seu pedido <strong>${pedidoId}</strong> saiu daqui e já está com ${empresa}.`,
    ]
    if (rastreio) {
      corpo.push(
        `Código de rastreio: <strong style="letter-spacing:.04em">${rastreio}</strong>`,
        'O primeiro registro costuma aparecer em até um dia útil depois da postagem — ' +
          'até lá é normal a consulta não mostrar movimentação.',
      )
    } else {
      // Sem código não há o que rastrear, e fingir que há é pior que admitir.
      corpo.push('Assim que o código de rastreio for emitido, enviamos para você.')
    }
    corpo.push('Qualquer dúvida, é só responder este e-mail.')
    return {
      assunto,
      titulo: 'Seu pedido está a caminho',
      saudacao,
      corpo,
      acao: urlRastreio ? { texto: 'Acompanhar entrega', url: urlRastreio } : undefined,
    }
  }

  if (evento === 'pedido_entregue') {
    return {
      assunto,
      titulo: 'Seu pedido chegou',
      saudacao,
      corpo: [
        `A entrega do pedido <strong>${pedidoId}</strong> foi confirmada.`,
        'Se algo não estiver como você esperava, responda este e-mail — a gente resolve.',
      ],
    }
  }

  if (evento === 'pedido_pago') {
    return {
      assunto,
      titulo: 'Pagamento confirmado',
      saudacao,
      corpo: [
        `Recebemos o pagamento do pedido <strong>${pedidoId}</strong>.`,
        'Agora ele entra na fila de preparo. Avisamos assim que sair para entrega.',
      ],
    }
  }

  return {
    assunto,
    titulo: ROTULO_EVENTO[evento],
    saudacao,
    corpo: [`Atualização do seu pedido <strong>${pedidoId}</strong>.`],
  }
}
