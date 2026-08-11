import type { GatewayFrete, StatusEnvio } from './types'

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

/**
 * Entrega feita em mãos, na cidade da operação.
 *
 * Muriaé não passa por transportadora: o operador entrega e dá a baixa
 * manualmente na Shopify. Sem esta separação, todo pedido local viraria
 * "sem movimentação" — uma exceção eterna que ninguém tem como resolver.
 */
export function entregaLocal(envio: Envio): boolean {
  return /muria[eé]/i.test(envio.destino)
}

/** Status que indicam problema com a transportadora. */
export function ehExcecao(envio: Envio): boolean {
  if (entregaLocal(envio)) return false
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

// ── Envio derivado do pedido ───────────────────────────────────────────────

/** O que o banco sabe sobre a entrega de um pedido. */
export interface PedidoParaEnvio {
  id: string
  cliente: string
  destino: string
  transportadora: string
  gateway: GatewayFrete
  rastreio: string
  envio: StatusEnvio
  pago: boolean
  /** ISO da compra. */
  compradoEm: string
  entregueEm: string | null
  /** Quando o ERP espelhou o envio na Shopify. */
  enviadoShopifyEm: string | null
  entregaShopifyEm: string | null
}

/** Dias de compra sem entrega a partir dos quais o pedido vira exceção. */
const DIAS_PARA_EXCECAO = 15

function diasEntre(de: string, ate: Date): number {
  const t = Date.parse(de)
  if (Number.isNaN(t)) return 0
  return Math.floor((ate.getTime() - t) / 86_400_000)
}

function dataHora(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Monta o envio a partir do que o pedido realmente registra.
 *
 * Os eventos são MARCOS, não leituras da transportadora: a Yampi devolve o
 * código de rastreio e a confirmação de entrega, nunca o histórico de
 * escaneamentos. Inventar "Objeto em trânsito · CTE Curitiba" a partir de uma
 * data seria escrever ficção com aparência de rastreio — e alguém decidiria
 * abrir reclamação com base nela.
 *
 * `entrega-nao-efetuada` não é produzido aqui de propósito: nenhuma fonte
 * atual nos diz que a entrega falhou. O que dá para afirmar é que o pedido
 * passou de `DIAS_PARA_EXCECAO` dias sem entrega, e isso é `sem-movimentacao`.
 */
export function montarEnvio(p: PedidoParaEnvio, agora = new Date()): Envio {
  const dias = diasEntre(p.compradoEm, agora)

  const status: StatusRastreio = !p.pago
    ? 'pagamento-pendente'
    : p.envio === 'Entregue'
      ? 'entregue'
      : // Retido é a transportadora dizendo que a entrega não saiu — é o único
        // caso em que temos afirmação de falha, e não dedução por tempo.
        p.envio === 'Retido'
        ? 'entrega-nao-efetuada'
        : p.envio === 'Atrasado' || dias > DIAS_PARA_EXCECAO
          ? 'sem-movimentacao'
          : p.envio === 'Enviado'
            ? 'em-transito'
            : 'aguardando-postagem'

  const shopify: EstadoShopify = !p.pago
    ? 'aguardando-pagamento'
    : p.envio === 'Entregue'
      ? p.entregaShopifyEm
        ? 'entregue'
        : 'aguardando-baixa'
      : p.enviadoShopifyEm
        ? 'em-transito'
        : 'aguardando-envio'

  const eventos: EventoRastreio[] = []
  eventos.push({
    quando: dataHora(p.compradoEm),
    descricao: p.pago ? 'Pagamento confirmado na Yampi' : 'Pedido criado, pagamento pendente',
    local: 'Yampi',
    severidade: p.pago ? 'ok' : 'neutro',
  })
  if (p.rastreio) {
    eventos.push({
      // A Yampi não diz QUANDO a etiqueta foi emitida — só que existe código.
      quando: '—',
      descricao: `Código de rastreio emitido: ${p.rastreio}`,
      local: p.transportadora || 'Transportadora',
      severidade: 'info',
    })
  }
  if (p.enviadoShopifyEm) {
    eventos.push({
      quando: dataHora(p.enviadoShopifyEm),
      descricao: 'Envio espelhado na Shopify · cliente avisado com o código',
      local: 'Shopify',
      severidade: 'info',
    })
  }
  if (p.entregueEm) {
    eventos.push({
      quando: dataHora(p.entregueEm),
      descricao: 'Entrega confirmada na Yampi',
      local: 'Yampi',
      severidade: 'ok',
    })
  }
  if (p.entregaShopifyEm) {
    eventos.push({
      quando: dataHora(p.entregaShopifyEm),
      descricao: 'Entrega espelhada e pedido fechado na Shopify',
      local: 'Shopify',
      severidade: 'ok',
    })
  }
  if (status === 'sem-movimentacao') {
    eventos.push({
      quando: '—',
      descricao: `${dias} dias desde a compra sem entrega confirmada`,
      local: '',
      severidade: 'erro',
    })
  }

  const ultimo = eventos[eventos.length - 1]

  return {
    pedidoId: p.id,
    cliente: p.cliente,
    destino: p.destino,
    transportadora: p.transportadora || 'Não informada',
    gateway: p.gateway,
    rastreio: p.rastreio,
    status,
    ultimoEvento: ultimo.descricao,
    eventoQuando: ultimo.quando,
    shopify,
    eventos,
  }
}
