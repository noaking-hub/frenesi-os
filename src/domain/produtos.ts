import { frascoDe } from './fracionamento'
import { calcularPreco, margemDe, pisoMargem } from './precificacao'
import { VARIANTES } from './types'
import type { ParametrosPrecificacao, PerfumeBase, ProdutoDerivado, VarianteMl } from './types'

/**
 * A avaliação 360º de um perfume-base — o miolo do módulo de Produtos.
 *
 * O escopo separa o que uma etiqueta única escondia: cadastro, estoque,
 * custo, precificação e integração são dimensões INDEPENDENTES, e um produto
 * pode estar saudável numa e doente noutra ao mesmo tempo. Aqui cada
 * dimensão ganha seu estado, os alertas são enumerados um a um, e a tela
 * apenas mostra — nenhum número nasce no componente.
 */

/** Um alerta enumerável do produto, na ordem de gravidade da tela. */
export interface AlertaProduto {
  texto: string
  grau: 'erro' | 'atencao'
}

/** Estado da dimensão estoque — só sobre o que o ERP controla. */
export type EstadoEstoque = 'disponivel' | 'baixo' | 'sem-estoque' | 'sem-giro' | 'sem-carga'

/** Estado da dimensão integração com a Shopify. */
export type EstadoIntegracao = 'sincronizado' | 'parcial' | 'sem-vinculo'

export interface VarianteAvaliada {
  variante: VarianteMl
  frasco: number
  sku: string | null
  shopifyVariantId: string | null
  preco: number
  /** Margem do preço praticado — null sem custo ou sem preço. */
  margem: number | null
  piso: number
  abaixoDoPiso: boolean
  /** Unidades que o saldo DISPONÍVEL sustenta — cenário, nunca soma. */
  capacidade: number
  envasadas: number
  reservadas: number
}

export interface ProdutoAvaliado {
  base: PerfumeBase
  variantes: VarianteAvaliada[]
  /** Volume no controle de estoque, antes das reservas. */
  fisicoMl: number
  /** Unidades reservadas convertidas em ml — variante × reservas. */
  reservadoMl: number
  /** Físico − reservado. É o saldo principal do Catálogo. */
  disponivelMl: number
  coberturaDias: number
  estadoEstoque: EstadoEstoque
  integracao: EstadoIntegracao
  faixaPreco: { min: number; max: number } | null
  faixaMargem: { min: number; max: number } | null
  alertas: AlertaProduto[]
}

/** Unidades de uma volumetria que cabem no saldo — cenários alternativos. */
export function capacidadeTeorica(disponivelMl: number, variante: VarianteMl): number {
  return disponivelMl > 0 ? Math.floor(disponivelMl / variante) : 0
}

/**
 * Avalia um perfume-base com suas variantes, preços e parâmetros vigentes.
 *
 * As variantes não têm estoque próprio — todas bebem do mesmo saldo em ml —
 * então o disponível é um só e as capacidades por volumetria são cenários
 * sobre ele. Margem é por variante (frasco e preço mudam), e a faixa
 * min–máx é o que o Catálogo mostra: a média esconderia a variante doente.
 */
export function avaliarProduto(
  base: PerfumeBase,
  derivados: ProdutoDerivado[],
  parametros: ParametrosPrecificacao,
): ProdutoAvaliado {
  const doProduto = derivados.filter((d) => d.baseId === base.id)

  const reservadoMl = doProduto.reduce((a, d) => a + d.reservadas * d.variante, 0)
  const fisicoMl = base.volumeMl
  const disponivelMl = Math.max(0, fisicoMl - reservadoMl)

  const variantes: VarianteAvaliada[] = VARIANTES.map((v) => {
    const d = doProduto.find((x) => x.variante === v)
    const preco = d?.precoPraticado ?? 0
    const calculo = base.custoPorMl > 0 ? calcularPreco(base.custoPorMl, v, parametros) : null
    const margem =
      calculo && preco > 0 ? margemDe(preco, calculo.custoProduto, parametros) : null
    return {
      variante: v,
      frasco: frascoDe(v),
      sku: d?.sku ?? null,
      shopifyVariantId: d?.shopifyVariantId ?? null,
      preco,
      margem,
      piso: calculo?.piso ?? 0,
      abaixoDoPiso: Boolean(calculo && preco > 0 && preco < calculo.piso),
      capacidade: capacidadeTeorica(disponivelMl, v),
      envasadas: d?.envasadas ?? 0,
      reservadas: d?.reservadas ?? 0,
    }
  })

  // Cobertura sobre o DISPONÍVEL: o reservado já tem dono, e prometer dias
  // de venda com volume comprometido é otimismo que vira ruptura.
  const coberturaDias =
    base.consumoDiarioMl > 0 ? Math.round(disponivelMl / base.consumoDiarioMl) : 0

  const estadoEstoque: EstadoEstoque =
    base.volumeMl === 0 && base.sobControle !== true
      ? 'sem-carga'
      : disponivelMl <= 0
        ? 'sem-estoque'
        : base.consumoDiarioMl > 0 && coberturaDias < 20
          ? 'baixo'
          : base.consumoDiarioMl === 0 || coberturaDias > 90
            ? 'sem-giro'
            : 'disponivel'

  // Integração: o produto precisa do vínculo E cada variante COM PREÇO
  // precisa do dela. Variante sem preço é decisão comercial, não pendência.
  const vendaveis = variantes.filter((v) => v.preco > 0)
  const semVinculoVariante = vendaveis.filter((v) => !v.shopifyVariantId)
  const integracao: EstadoIntegracao = !base.shopifyProductId
    ? 'sem-vinculo'
    : semVinculoVariante.length > 0
      ? 'parcial'
      : 'sincronizado'

  const precos = vendaveis.map((v) => v.preco)
  const margens = variantes.map((v) => v.margem).filter((m): m is number => m !== null)
  const faixaPreco = precos.length ? { min: Math.min(...precos), max: Math.max(...precos) } : null
  const faixaMargem = margens.length
    ? { min: Math.min(...margens), max: Math.max(...margens) }
    : null

  // Alertas na ordem de gravidade: primeiro o que impede conta ou venda,
  // depois o que corrói em silêncio. Cada um é uma frase completa — a tela
  // não deve precisar traduzir código de alerta.
  const alertas: AlertaProduto[] = []
  if (base.custoPorMl === 0) {
    alertas.push({ texto: 'Sem custo — margem e piso não podem ser calculados', grau: 'erro' })
  }
  if (estadoEstoque === 'sem-estoque') {
    alertas.push({ texto: 'Sem estoque disponível', grau: 'erro' })
  }
  if (estadoEstoque === 'baixo') {
    alertas.push({ texto: `Cobertura de ${coberturaDias} dias — repor em breve`, grau: 'atencao' })
  }
  const abaixoDoPiso = variantes.filter((v) => v.abaixoDoPiso)
  if (abaixoDoPiso.length) {
    alertas.push({
      texto: `Preço abaixo do piso em ${abaixoDoPiso.map((v) => `${v.variante} ml`).join(', ')}`,
      grau: 'erro',
    })
  }
  const minima = pisoMargem(parametros)
  if (faixaMargem && faixaMargem.min < minima && abaixoDoPiso.length === 0) {
    alertas.push({
      texto: `Margem mínima de ${faixaMargem.min.toFixed(0)}% — abaixo do piso de ${minima.toFixed(0)}%`,
      grau: 'atencao',
    })
  }
  if (!base.shopifyProductId) {
    alertas.push({ texto: 'Sem vínculo com a Shopify', grau: 'atencao' })
  } else if (semVinculoVariante.length) {
    alertas.push({
      texto: `Variante sem ID Shopify: ${semVinculoVariante.map((v) => `${v.variante} ml`).join(', ')}`,
      grau: 'atencao',
    })
  }
  const semSku = vendaveis.filter((v) => v.shopifyVariantId && !v.sku)
  if (semSku.length) {
    alertas.push({
      texto: `Variante sem SKU: ${semSku.map((v) => `${v.variante} ml`).join(', ')} — a venda não casa com o estoque`,
      grau: 'atencao',
    })
  }
  if (estadoEstoque === 'sem-giro' && disponivelMl > 0 && base.consumoDiarioMl === 0) {
    alertas.push({ texto: 'Sem giro — nenhuma venda no período medido', grau: 'atencao' })
  }

  return {
    base,
    variantes,
    fisicoMl,
    reservadoMl,
    disponivelMl,
    coberturaDias,
    estadoEstoque,
    integracao,
    faixaPreco,
    faixaMargem,
    alertas,
  }
}

export const ROTULO_ESTOQUE: Record<EstadoEstoque, string> = {
  disponivel: 'Disponível',
  baixo: 'Estoque baixo',
  'sem-estoque': 'Sem estoque',
  'sem-giro': 'Sem giro',
  'sem-carga': 'Fora do controle',
}

export const ROTULO_INTEGRACAO: Record<EstadoIntegracao, string> = {
  sincronizado: 'Sincronizado',
  parcial: 'Vínculo parcial',
  'sem-vinculo': 'Sem vínculo',
}
