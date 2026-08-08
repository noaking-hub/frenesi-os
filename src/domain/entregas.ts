import type { GatewayFrete } from './types'

/**
 * Rastreamento e baixa na Shopify.
 *
 * O fluxo real: o cliente calcula frete no site (gateways integrados à Yampi) e
 * a etiqueta é gerada MANUALMENTE na Frenet ou no Melhor Envio. A Yampi recebe o
 * rastreio, mas **não reporta a entrega para a Shopify** — os pedidos ficam
 * abertos lá. A função da integração é justamente capturar a entrega confirmada
 * e marcar o pedido como entregue na Shopify.
 */

export type StatusRastreio =
  | 'pagamento-pendente'
  | 'aguardando-postagem'
  | 'em-transito'
  | 'entregue'
  | 'entrega-nao-efetuada'
  | 'sem-movimentacao'

export type EstadoShopify =
  | 'aguardando-pagamento'
  | 'aguardando-envio'
  | 'em-transito'
  | 'aguardando-baixa'
  | 'entregue'

export interface EventoRastreio {
  quando: string
  descricao: string
  local: string
  severidade: 'ok' | 'info' | 'atencao' | 'erro' | 'neutro'
}

export interface Envio {
  pedidoId: string
  cliente: string
  destino: string
  transportadora: string
  gateway: GatewayFrete
  /** Vazio enquanto a etiqueta não é gerada manualmente na plataforma. */
  rastreio: string
  status: StatusRastreio
  ultimoEvento: string
  eventoQuando: string
  shopify: EstadoShopify
  eventos: EventoRastreio[]
}

/** Status que indicam problema com a transportadora. */
export function ehExcecao(envio: Envio): boolean {
  return envio.status === 'sem-movimentacao' || envio.status === 'entrega-nao-efetuada'
}

/**
 * A fila que a integração existe para resolver: entregue na Yampi e ainda
 * aberto na Shopify.
 */
export function aguardaBaixaShopify(envio: Envio): boolean {
  return envio.status === 'entregue' && envio.shopify !== 'entregue'
}

export const ROTULO_RASTREIO: Record<StatusRastreio, string> = {
  'pagamento-pendente': 'Pagamento pendente',
  'aguardando-postagem': 'Aguardando postagem',
  'em-transito': 'Em trânsito',
  entregue: 'Entregue',
  'entrega-nao-efetuada': 'Entrega não efetuada',
  'sem-movimentacao': 'Sem movimentação',
}

export const ROTULO_SHOPIFY: Record<EstadoShopify, string> = {
  'aguardando-pagamento': 'Aguardando pagamento',
  'aguardando-envio': 'Aguardando envio',
  'em-transito': 'Em trânsito',
  'aguardando-baixa': 'Aguardando baixa',
  entregue: 'Entregue',
}

export interface ResumoEnvios {
  emTransito: number
  entregues: number
  baixados: number
  /** Pedidos na fila de baixa — o número que o botão de ação vai resolver. */
  aguardandoBaixa: number
  excecoes: number
}

export function resumirEnvios(envios: Envio[]): ResumoEnvios {
  return {
    emTransito: envios.filter((e) => e.status === 'em-transito').length,
    entregues: envios.filter((e) => e.status === 'entregue').length,
    baixados: envios.filter((e) => e.shopify === 'entregue').length,
    aguardandoBaixa: envios.filter(aguardaBaixaShopify).length,
    excecoes: envios.filter(ehExcecao).length,
  }
}

// ── Ocorrências de entrega ─────────────────────────────────────────────────

export type TipoOcorrencia =
  | 'extravio'
  | 'avaria'
  | 'atraso'
  | 'endereco-insuficiente'
  | 'sem-movimentacao'
  | 'entrega-nao-efetuada'

export type EstadoOcorrencia =
  | 'aberta'
  | 'aguardando-cliente'
  | 'em-indenizacao'
  | 'resolvida'

export interface Ocorrencia {
  id: string
  pedidoId: string
  cliente: string
  destino: string
  transportadora: string
  gateway: GatewayFrete
  rastreio: string
  tipo: TipoOcorrencia
  /** Dias desde a abertura da ocorrência. */
  dias: number
  /** Negativo = dias ALÉM do prazo combinado com a transportadora. */
  prazo: number
  abertura: string
  estado: EstadoOcorrencia
  acao: string
  /** Valor do pedido parado nesta ocorrência. */
  valor: number
}

export const ROTULO_OCORRENCIA: Record<TipoOcorrencia, string> = {
  extravio: 'Extravio',
  avaria: 'Avaria no transporte',
  atraso: 'Atraso',
  'endereco-insuficiente': 'Endereço insuficiente',
  'sem-movimentacao': 'Sem movimentação',
  'entrega-nao-efetuada': 'Entrega não efetuada',
}

export const ROTULO_ESTADO_OCORRENCIA: Record<EstadoOcorrencia, string> = {
  aberta: 'Aberta',
  'aguardando-cliente': 'Aguardando cliente',
  'em-indenizacao': 'Em indenização',
  resolvida: 'Resolvida',
}

export function ocorrenciaAberta(o: Ocorrencia): boolean {
  return o.estado !== 'resolvida'
}

/** Dias além do prazo. Zero quando ainda está dentro. */
export function diasAlemDoPrazo(o: Ocorrencia): number {
  return o.prazo < 0 ? Math.abs(o.prazo) : 0
}

export interface ResumoOcorrencias {
  abertas: number
  aguardandoCliente: number
  atrasadas: number
  /** Soma do valor dos pedidos parados nas ocorrências abertas. */
  valorParado: number
  /** Média de dias além do prazo, entre as que estouraram. */
  mediaAtraso: number
}

export function resumirOcorrencias(ocorrencias: Ocorrencia[]): ResumoOcorrencias {
  const abertas = ocorrencias.filter(ocorrenciaAberta)
  const atrasadas = ocorrencias.filter((o) => o.prazo < 0)

  return {
    abertas: abertas.length,
    aguardandoCliente: ocorrencias.filter((o) => o.estado === 'aguardando-cliente').length,
    atrasadas: atrasadas.length,
    valorParado: abertas.reduce((a, o) => a + o.valor, 0),
    mediaAtraso: atrasadas.length
      ? Math.round(atrasadas.reduce((a, o) => a + diasAlemDoPrazo(o), 0) / atrasadas.length)
      : 0,
  }
}
