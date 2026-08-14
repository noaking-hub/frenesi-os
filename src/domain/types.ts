/**
 * Modelo de domínio da FRENESI.
 *
 * A regra central: o estoque autoritativo é volume de perfume base em ml,
 * mas a venda acontece em unidades por variante na Shopify. Tudo aqui existe
 * para traduzir um no outro sem inventar número.
 */

/** Volumes de venda, em ml. Não existem outros. */
export const VARIANTES = [3, 5, 8, 10, 15] as const
export type VarianteMl = (typeof VARIANTES)[number]

/** Frascos disponíveis para envase, em ml. */
export type FrascoMl = 8 | 15

/**
 * Teto de unidades que o cliente mantém publicado na Shopify por variante.
 * Política do cliente: a sincronia nunca sobe acima disso.
 */
export const TETO_SHOPIFY = 20

/** Prazo de devolução, em dias corridos contados da marcação de entrega. */
export const PRAZO_DEVOLUCAO_DIAS = 7

/**
 * Critério interno de aceitação de devolução: tolera-se até 10% abaixo do
 * volume fracionado. NUNCA é exibido ao cliente.
 */
export const TOLERANCIA_VOLUME = 0.1

export interface PerfumeBase {
  id: string
  nome: string
  marca: string
  genero?: 'Masculino' | 'Feminino' | 'Unissex'
  /** Custo de aquisição do perfume base, por ml. */
  custoPorMl: number
  /** Volume disponível em estoque, em ml. Fonte autoritativa. */
  volumeMl: number
  /** Consumo médio diário em ml, derivado do histórico de produção. */
  consumoDiarioMl: number
  /** Foto do produto na Shopify, importada com o catálogo. */
  imagemUrl?: string
  /** Perfume desativado sai das telas de operação, mas não é apagado. */
  ativo?: boolean
  /** Gênero definido à mão no ERP — a importação não sobrescreve. */
  generoManual?: boolean
  /**
   * A base já entrou no livro de movimentações — por compra, carga, produção
   * ou inventário. É ISTO que separa "esgotada" de "o ERP não sabe", e não o
   * custo: custo é atributo de catálogo, e preencher preço não pode fazer a
   * sincronia zerar o produto na loja.
   */
  sobControle?: boolean
}

/** Decants já envasados de uma base numa variante. */
export interface ProdutoDerivado {
  baseId: string
  variante: VarianteMl
  /** Unidades envasadas em estoque. */
  envasadas: number
  /** Unidades já reservadas em pedidos não separados. */
  reservadas: number
  precoPraticado: number
}

/** Uma saída de produção que consumiu volume de um lote. */
export interface SaidaLote {
  /** Identidade da linha — é por ela que a correção e o estorno acham a saída. */
  id: string | null
  data: string
  /** Ordem de produção que originou a saída; `null` na saída lançada à mão. */
  ref: string | null
  /**
   * Volume que saiu do lote. É a medida autoritativa: nem toda saída é decant
   * — venda anterior ao ERP, amostra e acidente saem em ml e ponto.
   */
  ml: number
  /** Como saiu, quando saiu em decants. */
  unidades: number | null
  variante: VarianteMl | null
  /** Por que saiu, quando não foi produção. */
  motivo: string | null
}

/**
 * Lote de compra de perfume base.
 *
 * `consumido` e `unidades` são SEMPRE derivados de `saidas` — nunca campos
 * independentes. Ver `apurarLote`.
 */
export interface Lote {
  id: string
  baseId: string
  perfume: string
  fornecedor: string
  /** Volume comprado, em ml. */
  volumeMl: number
  /** O que a compra custou — é o que o estorno tira da média de custo. */
  custoTotal?: number
  entrada: string
  /** Data em que o operador declarou o frasco vazio. Vazio = lote aberto. */
  encerradoEm: string | null
  saidas: SaidaLote[]
}

/** Parâmetros de precificação (Configurações → Parâmetros de precificação). */
export interface ParametrosPrecificacao {
  intermediadorPct: number
  intermediadorFixo: number
  checkoutPct: number
  impostoPct: number
  adsPct: number
  /** Embalagem por pedido, item a item — `insumosDe` soma os cinco. */
  frasco: number
  valvula: number
  tampa: number
  etiqueta: number
  caixa: number
  plasticoBolha: number
  sacolaAntifraude: number
  freteSubsidio: number
  antifraude: number
  /** Estimativa de perda no envase. A perda real só é medida ao encerrar o lote. */
  perdaPct: number
  margemAlvo: number
  /**
   * Gasto mensal com tráfego pago que originou `adsPct`. Guardado ao lado do
   * percentual para o ERP poder avisar quando os dois deixarem de bater — a
   * receita muda todo mês, o percentual não. `null` quando o percentual foi
   * digitado direto.
   */
  adsMensal?: number | null
  /** Desconto oferecido no checkout para pagamento no Pix, em %. */
  descontoPixPct: number
  /** Fatia do faturamento que vem no Pix, em %. Medida no extrato. */
  fatiaPixPct: number
}

/** Pedidos pagos e receita de produto dos últimos 30 dias. */
export interface ReceitaMensal {
  pedidos: number
  /** Sem frete: ele é repassado à transportadora, não é receita de perfume. */
  receitaProdutos: number
}

/**
 * `sem_carga` não é uma ação: é a recusa de agir. Base que nunca recebeu
 * carga inicial tem volume zero porque o ERP não sabe o que existe, não
 * porque acabou — e escrever zero na Shopify por causa disso tiraria o
 * produto do ar.
 */
export type AcaoSync = 'esgotar' | 'reduzir' | 'repor' | 'ok' | 'sem_carga'

/**
 * `divergente` é valor recebido diferente do pedido — conciliação a
 * investigar. `cancelado` é venda que não aconteceu. Juntar os dois criaria
 * fila de trabalho onde não há, e somaria à receita dinheiro que não entrou.
 */
export type StatusPagamento = 'pago' | 'pendente' | 'divergente' | 'cancelado'
export type StatusEnvio =
  | 'Não iniciado'
  | 'Aguardando envio'
  | 'Enviado'
  | 'Entregue'
  | 'Retido'
  | 'Atrasado'

import type { SituacaoPedido } from './entregas'

export type Canal = 'Shopify' | 'Yampi' | 'WhatsApp' | 'Instagram'
export type GatewayFrete = 'Frenet' | 'Melhor Envio'

export interface ItemPedido {
  perfume: string
  marca: string
  variante: VarianteMl
  preco: number
  /** Foto do perfume no catálogo (Shopify). Nem todo item antigo casa. */
  imagem?: string | null
}

export interface Pedido {
  id: string
  cliente: string
  email: string
  /** Somente dígitos. É por ele que o portal busca quando o cliente escolhe CPF. */
  cpf: string
  telefone: string
  data: string
  canal: Canal
  valor: number
  frete: number
  cashback: number
  pagamento: StatusPagamento
  envio: StatusEnvio
  /** Dias desde a marcação de entrega. null = ainda não entregue. */
  diasDesdeEntrega: number | null
  entregueEm: string | null
  destino: string
  cep: string
  rua: string
  peso: string
  dimensoes: string
  gateway: GatewayFrete
  rastreio: string | null
  itens: ItemPedido[]
  /**
   * Onde o pedido está no ciclo: pago → faturado → enviado → entregue.
   * Independente de `pagamento` e de `envio` — o escopo do módulo pede que os
   * três coexistam em vez de um sobrescrever o outro.
   */
  situacao: SituacaoPedido
  /** Nome da transportadora, resolvido. `null` quando não dá para saber. */
  transportadora: string | null
  /** Serviço contratado, como a Yampi informou. */
  servicoFrete: string | null
  /** Página do objeto na transportadora, com o código embutido. */
  rastreioUrl: string | null
  /** Última vez que a transportadora foi consultada para este código. */
  rastreioLidoEm: string | null
  /** Entrega em mãos: não é faturada, e a baixa acontece na entrega. */
  entregaLocal: boolean
  compradoEm: string
  /**
   * Fatos de integração, para a coluna "Informações adicionais" da ficha.
   * Opcionais porque as fixtures de demonstração não os simulam — a ficha
   * mostra só o que existe.
   */
  producaoEm?: string | null
  enviadoShopifyEm?: string | null
  /** Número do pedido espelho na Shopify — sem ele não há baixa a fazer. */
  shopifyNumero?: string | null
  /** Quando o ERP marcou a entrega na Shopify. Preenchido = baixado. */
  entregaShopifyEm?: string | null
  /** Prazo de entrega cotado pela transportadora, em dias da postagem. */
  prazoEntregaDias?: number | null
  /** Data de entrega PROMETIDA no checkout (Yampi). Nunca a realizada. */
  entregaPrevistaEm?: string | null
  estoqueBaixadoEm?: string | null
  estoqueBaixadoMl?: number | null
}

export type MotivoDevolucao = 'm1' | 'm2' | 'm3' | 'm4' | 'm5'

export interface SolicitacaoDevolucao {
  protocolo: string
  pedidoId: string
  itens: string[]
  motivo: MotivoDevolucao
  comentario: string
  fotos: { nivel: boolean; lacre: boolean }
  abertaEm: string
}
