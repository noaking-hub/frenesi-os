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
