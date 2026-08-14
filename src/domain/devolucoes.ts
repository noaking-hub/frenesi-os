import { frascoDe } from './fracionamento'
import { PRAZO_DEVOLUCAO_DIAS, TOLERANCIA_VOLUME } from './types'
import type { FrascoMl, MotivoDevolucao, Pedido, VarianteMl } from './types'
import type { SituacaoPedido } from './entregas'

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

/**
 * O pedido como o PORTAL PÚBLICO o vê — e nada além disso.
 *
 * O portal roda sem login: quem souber um e-mail consegue listar as compras
 * dele. O recorte existe para que esse alguém veja o MÍNIMO — nunca CPF,
 * telefone ou endereço. Todo campo novo aqui precisa responder "o cliente
 * precisa disso para abrir a devolução?".
 */
export interface ItemPortal {
  perfume: string
  marca: string
  variante: VarianteMl
  preco: number
  imagem: string | null
}

export interface PedidoPortal {
  id: string
  /** dd/MM/aaaa da compra, já formatada. */
  data: string
  valor: number
  situacao: SituacaoPedido
  entregueEm: string | null
  /** Dias desde a entrega (real ou, na falta dela, a prometida). */
  diasDesdeEntrega: number | null
  /** Plataforma da etiqueta de ida — de onde sai o reverso. */
  gateway: 'Frenet' | 'Melhor Envio'
  itens: ItemPortal[]
}

// ── Triagem (lado ERP) ─────────────────────────────────────────────────────

/** Por que o cliente abriu a devolução, do ponto de vista da operação. */
export type TipoSolicitacao = 'Arrependimento' | 'Defeito' | 'Erro de envio'

export type EstadoLacre = 'intacto' | 'rompido-no-transporte' | 'violado'

export interface ItemAferido {
  perfume: string
  variante: VarianteMl
  frasco: FrascoMl
  /** Volume medido na conferência, em ml. */
  medidoMl: number
  /**
   * Mínimo aceito: 10% abaixo do volume fracionado.
   * Critério INTERNO — aparece no ERP, nunca no portal do cliente.
   */
  minimoMl: number
  faltaMl: number
  /** Quanto do volume fracionado ainda está no frasco, em %. */
  pct: number
  dentroDaTolerancia: boolean
  observacao: string
}

export function aferirItem(
  perfume: string,
  variante: VarianteMl,
  medidoMl: number,
  observacao = '',
): ItemAferido {
  const minimoMl = variante * (1 - TOLERANCIA_VOLUME)
  return {
    perfume,
    variante,
    frasco: frascoDe(variante),
    medidoMl,
    minimoMl,
    faltaMl: Math.max(0, variante - medidoMl),
    pct: Math.round((medidoMl / variante) * 100),
    // A margem de 0,001 absorve ruído de ponto flutuante em 4,5 = 5 × 0,9.
    dentroDaTolerancia: medidoMl >= minimoMl - 0.001,
    observacao,
  }
}

export interface Triagem {
  itens: ItemAferido[]
  /** Algum item veio abaixo do mínimo. */
  usado: boolean
  /**
   * Recusa recomendada: produto usado num pedido de arrependimento.
   * Em defeito ou erro de envio a perda de volume é esperada.
   */
  bloqueado: boolean
  /** O item que mais se afastou do fracionado — o que sustenta a decisão. */
  pior: ItemAferido | null
  severidade: 'ok' | 'atencao' | 'erro'
  titulo: string
  /** Explicação com os números que a sustentam, para o operador decidir. */
  mensagem: string
}

/**
 * Triagem de uma devolução: decide se o volume aferido sustenta a solicitação.
 *
 * Aceita-se até 10% abaixo do volume fracionado. Abaixo disso o decant foi
 * usado — mas isso só bloqueia quando o motivo é arrependimento; em frasco
 * danificado ou erro de envio a perda é esperada.
 */
export function triarDevolucao(
  itens: ItemAferido[],
  tipo: TipoSolicitacao,
  lacre: EstadoLacre,
): Triagem {
  const reprovados = itens.filter((i) => !i.dentroDaTolerancia)
  const usado = reprovados.length > 0
  const bloqueado = usado && tipo === 'Arrependimento'
  const ordenados = (reprovados.length ? reprovados : itens).slice().sort((a, b) => a.pct - b.pct)
  const pior = ordenados[0] ?? null

  const rotuloLacre: Record<EstadoLacre, string> = {
    intacto: 'intacto',
    'rompido-no-transporte': 'rompido no transporte',
    violado: 'violado',
  }

  if (!pior) {
    return {
      itens,
      usado: false,
      bloqueado: false,
      pior: null,
      severidade: 'ok',
      titulo: 'Nenhum item aferido ainda',
      mensagem: 'Registre a medição do volume para concluir a triagem.',
    }
  }

  const nums = `${pior.perfume} foi fracionado com ${pior.variante} ml e chegou com ${fmt(pior.medidoMl)} ml (${pior.pct}%)`

  if (bloqueado) {
    return {
      itens,
      usado,
      bloqueado,
      pior,
      severidade: 'erro',
      titulo: 'Produto nitidamente utilizado · devolução não aceita',
      mensagem: `${nums}, abaixo do mínimo de ${fmt(pior.minimoMl)} ml. Arrependimento com produto usado não é aceito — recuse informando a política.`,
    }
  }

  if (usado) {
    return {
      itens,
      usado,
      bloqueado,
      pior,
      severidade: 'atencao',
      titulo: `Volume abaixo do mínimo · perda esperada para ${tipo.toLowerCase()}`,
      mensagem: `${nums}. Como o motivo é ${tipo.toLowerCase()}, a perda é esperada — confirme pelas fotos antes de aprovar.`,
    }
  }

  return {
    itens,
    usado,
    bloqueado,
    pior,
    severidade: 'ok',
    titulo: 'Volume aferido dentro da tolerância de 10%',
    mensagem: `Todos os itens estão a até 10% abaixo do volume fracionado e o lacre está ${rotuloLacre[lacre]}. Solicitação apta a seguir.`,
  }
}

function fmt(n: number): string {
  return (Math.round(n * 10) / 10).toString().replace('.', ',')
}

// ── Ciclo de vida da devolução ─────────────────────────────────────────────

export type StatusSolicitacao =
  | 'Nova'
  | 'Em análise'
  | 'Aguardando fotos'
  | 'Aprovada'
  | 'Recusada'
  | 'Aguardando postagem'
  | 'Em trânsito reverso'
  | 'Recebida'
  | 'Concluída'

export const PASSOS_DEVOLUCAO = [
  'Solicitação',
  'Análise',
  'Reverso',
  'Recebimento',
  'Resolução',
] as const

/** Em que passo do fluxo cada status está. */
const ETAPA: Record<StatusSolicitacao, number> = {
  Nova: 0,
  'Em análise': 1,
  'Aguardando fotos': 1,
  Recusada: 1,
  Aprovada: 2,
  'Aguardando postagem': 2,
  'Em trânsito reverso': 2,
  Recebida: 3,
  Concluída: 4,
}

export function etapaDe(status: StatusSolicitacao): number {
  return ETAPA[status]
}

/** Quais ações a operação pode tomar agora. Derivado do status, não fixo. */
export function acoesDisponiveis(status: StatusSolicitacao, temReverso: boolean) {
  return {
    emAnalise: status === 'Nova' || status === 'Em análise' || status === 'Aguardando fotos',
    podeGerarReverso: status === 'Aprovada' && !temReverso,
    podeReceber: status === 'Aguardando postagem' || status === 'Em trânsito reverso',
    podeConcluir: status === 'Recebida',
    encerrada: status === 'Concluída' || status === 'Recusada',
  }
}

/** Status que ainda representam dinheiro não resolvido. */
export function emAberto(status: StatusSolicitacao): boolean {
  return status !== 'Concluída' && status !== 'Recusada'
}
