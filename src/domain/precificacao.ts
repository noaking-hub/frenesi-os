import type { ParametrosPrecificacao, VarianteMl } from './types'

/** Valores atuais dos parâmetros de precificação (Configurações). */
export const PARAMETROS_PADRAO: ParametrosPrecificacao = {
  intermediadorPct: 4.33,
  intermediadorFixo: 0.6,
  checkoutPct: 1.99,
  impostoPct: 6.0,
  adsPct: 12.0,
  insumos: 4.8,
  freteSubsidio: 8.0,
  antifraude: 0.49,
  perdaPct: 3.0,
  margemAlvo: 25,
}

/** Quanto o piso de margem fica abaixo da margem alvo, em pontos percentuais. */
export const FOLGA_PISO = 10

/** Soma das taxas percentuais que incidem sobre o preço. */
export function taxasPct(p: ParametrosPrecificacao): number {
  return p.intermediadorPct + p.checkoutPct + p.impostoPct + p.adsPct
}

/** Soma dos custos fixos por pedido. */
export function custosFixos(p: ParametrosPrecificacao): number {
  return p.insumos + p.freteSubsidio + p.antifraude + p.intermediadorFixo
}

/** O que sobra do preço para pagar o produto, depois de taxas e margem alvo. */
export function sobraParaProduto(p: ParametrosPrecificacao): number {
  return 100 - taxasPct(p) - p.margemAlvo
}

/** Piso de margem: nenhum desconto automático pode furá-lo. */
export function pisoMargem(p: ParametrosPrecificacao): number {
  return Math.max(0, p.margemAlvo - FOLGA_PISO)
}

/** Arredonda para cima e tira 10 centavos — todo preço termina em ,90. */
export function arredondaPreco(preco: number): number {
  return Math.max(0, Math.ceil(preco) - 0.1)
}

export interface CalculoPreco {
  /** Custo do perfume na variante, já com a perda técnica. */
  custoProduto: number
  fixos: number
  taxasPct: number
  /** Preço exato que atinge a margem alvo. */
  ideal: number
  /** Preço ideal arredondado para terminar em ,90. */
  sugerido: number
  /** Margem líquida efetiva do preço sugerido. */
  margem: number
  /** Lucro líquido em reais no preço sugerido. */
  lucro: number
  /** Menor preço que ainda respeita o piso de margem. */
  piso: number
}

/**
 * Preço ideal a partir do custo, para atingir a margem líquida alvo.
 *
 *   custoProduto = custoPorMl × volumeVariante × (1 + perdaPct/100)
 *   fixos        = insumos + freteSubsidio + antifraude + intermediadorFixo
 *   denom        = 1 − (taxasPct + margemAlvo)/100
 *   preçoIdeal   = ceil((custoProduto + fixos) / denom) − 0,10
 */
export function calcularPreco(
  custoPorMl: number,
  variante: VarianteMl,
  p: ParametrosPrecificacao,
): CalculoPreco {
  const taxas = taxasPct(p)
  const fixos = custosFixos(p)
  const custoProduto = custoPorMl * variante * (1 + p.perdaPct / 100)

  const denom = 1 - (taxas + p.margemAlvo) / 100
  const ideal = denom > 0 ? (custoProduto + fixos) / denom : 0
  const sugerido = arredondaPreco(ideal)

  const denomPiso = 1 - (taxas + pisoMargem(p)) / 100
  const piso = denomPiso > 0 ? arredondaPreco((custoProduto + fixos) / denomPiso) : 0

  return {
    custoProduto,
    fixos,
    taxasPct: taxas,
    ideal,
    sugerido,
    margem: margemDe(sugerido, custoProduto, p),
    lucro: lucroDe(sugerido, custoProduto, p),
    piso,
  }
}

/** Margem líquida de um preço praticado, em %. */
export function margemDe(
  preco: number,
  custoUnitario: number,
  p: ParametrosPrecificacao,
): number {
  if (preco <= 0) return 0
  return ((preco - custoUnitario - custosFixos(p) - preco * (taxasPct(p) / 100)) / preco) * 100
}

/** Lucro líquido de um preço praticado, em reais. */
export function lucroDe(
  preco: number,
  custoUnitario: number,
  p: ParametrosPrecificacao,
): number {
  return preco - custoUnitario - custosFixos(p) - preco * (taxasPct(p) / 100)
}

export interface LinhaComposicao {
  label: string
  valor: number
  /** Fatia do preço, em %. Usada para a largura da barra. */
  pct: number
  tipo: 'preco' | 'custo' | 'taxa' | 'lucro'
}

/** Cascata de composição do preço: custo → insumos → taxas → margem. */
export function composicaoPreco(
  preco: number,
  custoProduto: number,
  p: ParametrosPrecificacao,
): LinhaComposicao[] {
  const intermediacao = preco * (p.intermediadorPct / 100) + p.intermediadorFixo + p.antifraude
  const checkoutImposto = preco * ((p.checkoutPct + p.impostoPct) / 100)
  const ads = preco * (p.adsPct / 100)
  const embalagem = p.insumos + p.freteSubsidio
  const lucro = lucroDe(preco, custoProduto, p)

  const fatia = (v: number) => (preco > 0 ? (v / preco) * 100 : 0)

  return [
    { label: 'Preço de venda sugerido', valor: preco, pct: 100, tipo: 'preco' },
    {
      label: `Custo do perfume · ${p.perdaPct}% de perda`,
      valor: -custoProduto,
      pct: fatia(custoProduto),
      tipo: 'custo',
    },
    {
      label: 'Embalagem, insumos e frete',
      valor: -embalagem,
      pct: fatia(embalagem),
      tipo: 'custo',
    },
    {
      label: 'Intermediador e antifraude',
      valor: -intermediacao,
      pct: fatia(intermediacao),
      tipo: 'custo',
    },
    {
      label: 'Checkout externo e imposto',
      valor: -checkoutImposto,
      pct: p.checkoutPct + p.impostoPct,
      tipo: 'taxa',
    },
    { label: 'Marketing e ADS', valor: -ads, pct: p.adsPct, tipo: 'taxa' },
    { label: 'Lucro líquido', valor: lucro, pct: fatia(lucro), tipo: 'lucro' },
  ]
}

export interface RateioAds {
  /** O que se gasta por mês com tráfego pago. */
  gastoMensal: number
  /** Receita de produto dos pedidos pagos nos últimos 30 dias. */
  receitaProdutos: number
  pedidos: number
  /** Percentual do preço que o marketing consome. É o que vira `adsPct`. */
  pct: number
  /** O mesmo gasto lido por pedido — só como referência de leitura. */
  porPedido: number
  /**
   * `null` quando dá para confiar. Texto quando a base de rateio é fraca
   * demais para sustentar o número.
   */
  ressalva: string | null
}

/** Amostra abaixo disso não sustenta um percentual que entra em todo preço. */
const PEDIDOS_MINIMOS = 20

/**
 * Traduz o gasto mensal com tráfego no percentual que entra no preço.
 *
 * Quem compra tráfego sabe o valor do mês, não o percentual — mas a
 * precificação trabalha em percentual, porque é assim que o custo se
 * distribui entre um decant de 3 ml e um de 15 ml. A ponte é a receita.
 *
 * O rateio é sobre a receita de PRODUTO, sem frete: frete é repassado à
 * transportadora e incluí-lo diluiria o marketing num dinheiro que só passa
 * pela conta.
 */
export function ratearAds(gastoMensal: number, receitaProdutos: number, pedidos: number): RateioAds {
  const valido = gastoMensal > 0 && receitaProdutos > 0
  const pct = valido ? (gastoMensal / receitaProdutos) * 100 : 0

  const ressalva =
    gastoMensal <= 0
      ? 'Informe quanto você gasta por mês com tráfego pago.'
      : receitaProdutos <= 0
        ? 'Sem pedido pago nos últimos 30 dias não há receita para ratear o marketing.'
        : pedidos < PEDIDOS_MINIMOS
          ? `Só ${pedidos} ${pedidos === 1 ? 'pedido pago' : 'pedidos pagos'} nos últimos 30 dias — o percentual sai instável com essa amostra.`
          : pct >= 100
            ? 'O gasto com tráfego passou a receita do período: não há preço que feche assim.'
            : null

  return {
    gastoMensal,
    receitaProdutos,
    pedidos,
    pct,
    porPedido: pedidos > 0 ? gastoMensal / pedidos : 0,
    ressalva,
  }
}

/** Quantos pontos percentuais o ADS pode desviar antes de virar alerta. */
export const DESVIO_ADS = 1.5

export interface DesvioAds {
  /** Percentual que o gasto mensal guardado daria com a receita de hoje. */
  medido: number
  /** O que está gravado como parâmetro. */
  parametro: number
  delta: number
  /** O parâmetro está abaixo do medido — todo preço com custo subestimado. */
  subestimado: boolean
}

/**
 * Compara o ADS gravado com o que o mesmo gasto mensal daria hoje.
 *
 * Mesma ideia da perda real contra o parâmetro de perda: o número foi correto
 * um dia. A receita muda todo mês; o percentual, não. Sem esta comparação ele
 * envelheceria calado, e todo preço ficaria com o marketing subestimado sem
 * ninguém perceber.
 */
export function desvioAds(
  gastoMensal: number | null,
  receitaProdutos: number,
  p: ParametrosPrecificacao,
): DesvioAds | null {
  if (!gastoMensal || gastoMensal <= 0 || receitaProdutos <= 0) return null
  const medido = (gastoMensal / receitaProdutos) * 100
  const delta = medido - p.adsPct
  return {
    medido,
    parametro: p.adsPct,
    delta: Math.abs(delta),
    subestimado: delta > DESVIO_ADS,
  }
}

// ── Custo real de receber ──────────────────────────────────────────────────

export interface CustoPorMeio {
  meio: string
  vendas: number
  bruto: number
  tarifa: number
  /** Custo daquele meio, em %. */
  pct: number
  /** Fatia do faturamento que passou por ele, em %. */
  fatia: number
}

export interface CustoDeReceber {
  meios: CustoPorMeio[]
  bruto: number
  tarifa: number
  /** A média PONDERADA — é este o número que entra no preço. */
  pct: number
  /** O meio mais caro que tem peso relevante. */
  maisCaro: CustoPorMeio | null
  /** O meio mais barato com peso relevante. */
  maisBarato: CustoPorMeio | null
  vendas: number
}

/**
 * Média ponderada do que custa receber.
 *
 * Ponderada pelo VALOR, não pela quantidade de vendas: uma venda de R$ 500 em
 * 6x pesa mais no custo do mês que dez vendas de R$ 30 no Pix, e é o custo do
 * mês que precisa caber no preço.
 */
export function custoDeReceber(meios: CustoPorMeio[]): CustoDeReceber {
  const bruto = meios.reduce((a, m) => a + m.bruto, 0)
  const tarifa = meios.reduce((a, m) => a + m.tarifa, 0)
  // Um meio com fatia mínima distorce a leitura: dois pagamentos num meio
  // caro fariam "o mais caro" apontar para algo que não move o resultado.
  const relevantes = meios.filter((m) => m.fatia >= 1)
  const porPreco = [...relevantes].sort((a, b) => b.pct - a.pct)

  return {
    meios,
    bruto,
    tarifa,
    pct: bruto > 0 ? Math.round((tarifa / bruto) * 10000) / 100 : 0,
    maisCaro: porPreco[0] ?? null,
    maisBarato: porPreco[porPreco.length - 1] ?? null,
    vendas: meios.reduce((a, m) => a + m.vendas, 0),
  }
}

/**
 * Quanto de tarifa um meio consome além do peso que ele tem no faturamento.
 *
 * É a pergunta que decide se vale manter o parcelamento sem juros: quando um
 * meio responde por 15% do faturamento e 60% da tarifa, o que se está
 * comprando com essa diferença é volume — e dá para medir se veio.
 */
export function desproporcao(m: CustoPorMeio, total: CustoDeReceber): number {
  if (total.tarifa <= 0) return 0
  return Math.round((m.tarifa / total.tarifa) * 1000) / 10
}
