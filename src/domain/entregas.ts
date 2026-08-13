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
 * Em qual plataforma o envio foi emitido — e por qual transportadora.
 *
 * A operação usa dois gateways: Correios e Jadlog saem pela Frenet; J&T,
 * Total Express e Buslog pelo Melhor Envio. A Yampi devolve o serviço
 * (`shipment_service`), e quando ele falta — ou vem como um rótulo opaco do
 * Melhor Envio, tipo `ME_STANDARD_33` — o formato do código desempata:
 * `AA123456789BR` é padrão dos Correios, quinze dígitos é J&T, nove é Jadlog.
 *
 * O que NÃO se faz é devolver o rótulo cru como se fosse nome de
 * transportadora: "Rastrear na ME_STANDARD_33" não diz nada a ninguém, e a
 * tela ainda oferecia esse texto como se fosse uma empresa.
 */
export function identificarFrete(
  servico: string | null | undefined,
  rastreio: string | null | undefined,
): { transportadora: string; gateway: GatewayFrete } {
  const s = (servico ?? '').toLowerCase()
  if (/correio|sedex|pac\b|mini envios/.test(s)) return { transportadora: 'Correios', gateway: 'Frenet' }
  if (/jadlog|\.package|\.com\b/.test(s)) return { transportadora: 'Jadlog', gateway: 'Frenet' }
  if (/j&t|jet|j&amp;t/.test(s)) return { transportadora: 'J&T Express', gateway: 'Melhor Envio' }
  if (/total/.test(s)) return { transportadora: 'Total Express', gateway: 'Melhor Envio' }
  if (/buslog/.test(s)) return { transportadora: 'Buslog', gateway: 'Melhor Envio' }

  // Rótulo do Melhor Envio: o gateway é conhecido, a transportadora não vem
  // nele. O código é quem entrega essa informação.
  const doMelhorEnvio = /^me[_ ]/i.test((servico ?? '').trim())
  const codigo = (rastreio ?? '').trim()
  if (/^[A-Z]{2}\d{9}BR$/i.test(codigo)) {
    return { transportadora: 'Correios', gateway: doMelhorEnvio ? 'Melhor Envio' : 'Frenet' }
  }
  if (/^\d{15}$/.test(codigo)) return { transportadora: 'J&T Express', gateway: 'Melhor Envio' }
  if (/^\d{8,11}$/.test(codigo)) {
    return { transportadora: 'Jadlog', gateway: doMelhorEnvio ? 'Melhor Envio' : 'Frenet' }
  }

  return {
    // Rótulo do Melhor Envio não é nome de transportadora — dizer "não
    // informada" é mais honesto que exibir o código do serviço como empresa.
    transportadora: doMelhorEnvio ? 'Não informada' : servico?.trim() || 'Não informada',
    gateway: 'Melhor Envio',
  }
}

/**
 * A página onde o cliente acompanha o objeto, com o código já embutido.
 *
 * Duas casas, e a divisão segue quem emitiu a etiqueta: Correios e Jadlog saem
 * pela Frenet, que publica o rastreio em `rastreio.frenet.com.br/{sigla}/{código}`;
 * J&T, Total e Buslog saem pelo Melhor Envio, cuja página é o Melhor Rastreio.
 *
 * Mandar o cliente para o site da transportadora seria pior: ele teria que
 * digitar o código de novo, e é exatamente isso que este link existe para
 * evitar. Transportadora desconhecida devolve `null` — link que abre numa
 * consulta vazia faz o cliente concluir que o pedido se perdeu.
 */
export function paginaDeRastreio(
  transportadora: string | null | undefined,
  codigo: string | null | undefined,
): string | null {
  const c = (codigo ?? '').trim()
  if (!c) return null
  const alvo = encodeURIComponent(c)
  switch (transportadora) {
    case 'Correios':
      return `https://rastreio.frenet.com.br/COR/${alvo}`
    case 'Jadlog':
      return `https://rastreio.frenet.com.br/JAD/${alvo}`
    case 'J&T Express':
    case 'Total Express':
    case 'Buslog':
      return `https://melhorrastreio.com.br/rastreio/${alvo}`
    default:
      return null
  }
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

/**
 * O pedido é entrega local, olhando o que a Yampi gravou.
 *
 * A operação passou a marcar `MOTOBOY` no serviço em 01/08; antes disso os
 * mesmos pedidos vinham sem serviço nenhum. O rótulo manda, e o destino é a
 * rede para o período anterior à convenção.
 *
 * Isso importa muito além do rótulo na tela: entrega local NÃO é faturada —
 * não sai nota — e por isso nunca alcança o momento que dispara a baixa de
 * estoque. Sem identificá-la, o perfume sai do frasco e o saldo não cai.
 */
export function ehEntregaLocal(dados: {
  servicoFrete: string | null | undefined
  destino: string | null | undefined
  rastreio: string | null | undefined
}): boolean {
  if (/motoboy|entrega local|local delivery/i.test(dados.servicoFrete ?? '')) return true
  // Código de rastreio significa transportadora: não é entrega em mãos.
  if (dados.rastreio) return false
  return /muria[eé]/i.test(dados.destino ?? '')
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

/**
 * Os quatro momentos reais do pedido na FRENESI, mais os dois terminais.
 *
 * O escopo do módulo propunha uma escada operacional de seis degraus
 * (aguardando separação, em separação, separado, aguardando expedição…). A
 * operação não trabalha assim, e inventar degraus que ninguém marca produz
 * campo sempre vazio — pior que campo nenhum, porque parece informação.
 *
 * Três destes momentos vêm da Yampi. `em_producao` é NOSSO: nasce quando a
 * ordem de produção é aberta no ERP, e é o único ponto do ciclo que a Yampi
 * não conhece.
 */
export type SituacaoPedido =
  | 'pago'
  | 'em_producao'
  | 'faturado'
  | 'enviado'
  | 'entregue'
  | 'cancelado'

export const ROTULO_SITUACAO: Record<SituacaoPedido, string> = {
  pago: 'Pago',
  em_producao: 'Em produção',
  faturado: 'Faturado',
  enviado: 'Enviado',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
}

/** Ordem do ciclo. `cancelado` fica fora: ele interrompe, não avança. */
export const CICLO: SituacaoPedido[] = ['pago', 'em_producao', 'faturado', 'enviado', 'entregue']

/**
 * A situação a partir do que a Yampi informou, preservando o que é nosso.
 *
 * `em_producao` só sobrevive enquanto a Yampi ainda não faturou: ela não
 * conhece esse momento, e derivá-lo do status dela o apagaria na importação
 * seguinte. Depois do faturamento ele deixa de importar — o pedido já avançou.
 *
 * O caminho é de mão única. Yampi que volta atrás num status — acontece em
 * correção manual no painel — não pode fazer um pedido enviado regredir para
 * pago na nossa tela.
 */
export function situacaoDoPedido(dados: {
  statusYampi: string | null | undefined
  pagamento: 'pago' | 'pendente' | 'divergente' | 'cancelado'
  entregue: boolean
  rastreio: string | null
  /** A situação já gravada, para não perder o que a Yampi não sabe. */
  atual?: SituacaoPedido | null
  producaoEm?: string | null
}): SituacaoPedido {
  if (dados.pagamento === 'cancelado') return 'cancelado'

  const t = (dados.statusYampi ?? '').toLowerCase()
  const daYampi: SituacaoPedido = dados.entregue || /entregue|delivered/.test(t)
    ? 'entregue'
    : /enviad|shipped|transito|transporte|on_?carriage/.test(t) || Boolean(dados.rastreio)
      ? 'enviado'
      : /faturad|invoiced|nota|separa|picking/.test(t)
        ? 'faturado'
        : 'pago'

  // Produção é anterior ao faturamento: se a Yampi ainda não passou de "pago",
  // o que o ERP sabe é mais recente que o que ela sabe.
  if (daYampi === 'pago' && (dados.atual === 'em_producao' || dados.producaoEm)) {
    return 'em_producao'
  }

  // Mão única: o maior avanço entre o que já estava e o que chegou.
  const anterior = dados.atual && dados.atual !== 'cancelado' ? CICLO.indexOf(dados.atual) : -1
  return CICLO.indexOf(daYampi) >= anterior ? daYampi : (dados.atual as SituacaoPedido)
}
