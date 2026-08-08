import { PRAZO_DEVOLUCAO_DIAS } from './types'
import type { MotivoDevolucao, Pedido } from './types'

export type Elegibilidade = 'elegivel' | 'aguardando-entrega' | 'fora-do-prazo'

export interface StatusDevolucao {
  elegivel: boolean
  estado: Elegibilidade
  /** Dias que ainda restam do prazo. Só faz sentido se entregue. */
  restam: number
  /** Etiqueta curta do cartão de pedido no portal. */
  selo: string
  /** Frase completa mostrada ao cliente, derivada do estado. */
  mensagem: string
}

/**
 * Elegibilidade de devolução: 7 dias corridos contados da marcação de entrega.
 *
 * Antes da entrega o relógio não começa — não é "fora do prazo", é
 * "aguardando entrega". Depois de 7 dias o pedido fica inelegível.
 */
export function statusDevolucao(diasDesdeEntrega: number | null): StatusDevolucao {
  if (diasDesdeEntrega === null) {
    return {
      elegivel: false,
      estado: 'aguardando-entrega',
      restam: PRAZO_DEVOLUCAO_DIAS,
      selo: 'Aguardando entrega',
      mensagem: 'Ainda em trânsito · o prazo começa a contar na entrega',
    }
  }

  const restam = PRAZO_DEVOLUCAO_DIAS - diasDesdeEntrega

  if (restam <= 0) {
    return {
      elegivel: false,
      estado: 'fora-do-prazo',
      restam: 0,
      selo: 'Fora do prazo',
      mensagem: `Prazo encerrado · entregue há ${diasDesdeEntrega} dias`,
    }
  }

  return {
    elegivel: true,
    estado: 'elegivel',
    restam,
    selo: 'Pode devolver',
    mensagem:
      restam === 1
        ? 'último dia para devolver'
        : `${restam} dias restantes para devolver`,
  }
}

export function statusDoPedido(pedido: Pedido): StatusDevolucao {
  return statusDevolucao(pedido.diasDesdeEntrega)
}

/**
 * "Frasco chegou danificado ou vazando" — único motivo que dispensa o lacre
 * intacto, e por isso torna a segunda foto opcional.
 */
export function ehDanificado(motivo: MotivoDevolucao | ''): boolean {
  return motivo === 'm3'
}

/**
 * Quais fotos bastam.
 *
 * A cópia mostrada ao cliente é derivada desta mesma regra — nunca afirmar
 * "as duas fotos são obrigatórias" quando o sistema aceita uma.
 */
export function fotosCompletas(
  motivo: MotivoDevolucao | '',
  fotos: { nivel: boolean; lacre: boolean },
): boolean {
  return fotos.nivel && (ehDanificado(motivo) || fotos.lacre)
}

export const MOTIVOS: { id: MotivoDevolucao; label: string; desc: string }[] = [
  {
    id: 'm1',
    label: 'Não gostei da fragrância',
    desc: 'Dentro de 7 dias, sem uso, você pode desistir da compra',
  },
  {
    id: 'm2',
    label: 'Recebi produto diferente do pedido',
    desc: 'Perfume ou volume trocado na expedição',
  },
  {
    id: 'm3',
    label: 'Frasco chegou danificado ou vazando',
    desc: 'Nesse caso não precisamos do lacre intacto',
  },
  {
    id: 'm4',
    label: 'Volume abaixo do que comprei',
    desc: 'A foto do nível resolve rápido',
  },
  { id: 'm5', label: 'Outro motivo', desc: 'Descreva no campo abaixo' },
]

/**
 * A plataforma do reverso é sempre a mesma que emitiu a etiqueta de ida.
 */
export function plataformaReverso(pedido: Pedido): Pedido['gateway'] {
  return pedido.gateway
}
