/**
 * Nome canônico do meio de pagamento.
 *
 * Cada integração escreve o meio do seu jeito: a Pagar.me manda `credit_card`,
 * o Mercado Pago manda `pix` minúsculo, a Yampi manda "Cartão de crédito 6x"
 * por extenso. Sem normalizar, o ERP tratava "pix" e "Pix" como DOIS meios
 * distintos — e o efeito não era cosmético: a média ponderada do custo de
 * receber, que entra no preço, dividia o mesmo meio em duas linhas com
 * percentuais diferentes, e a leitura de "meio mais caro" apontava para
 * fatias que não existiam sozinhas.
 *
 * O que NÃO se unifica é o número de parcelas. Cartão em 6x custa 14,94% e à
 * vista custa 2,77%: juntá-los daria uma média que não descreve nenhuma venda
 * real e esconderia justamente a decisão que o parcelamento exige.
 */

/** Sem acento, sem caixa, sem espaço duplicado — só para comparar. */
function achatar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Quantas parcelas o nome declara, quando declara. */
function parcelasDe(achatado: string): number | null {
  const m = /(\d{1,2})\s*x\b/.exec(achatado)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= 24 ? n : null
}

export function normalizarMeio(bruto: string | null | undefined): string {
  const achatado = achatar(bruto ?? '')
  if (!achatado) return 'Não identificado'

  // Pagaleve antes de "pix" solto: o nome dela contém "pix parcelado", e o
  // teste genérico de Pix engoliria um meio que custa e liquida diferente.
  if (achatado.includes('pagaleve')) return 'Pix parcelado (Pagaleve)'

  if (achatado.includes('boleto') || achatado.includes('bank_slip')) return 'Boleto'

  if (achatado.includes('pix')) return 'Pix'

  const ehCartao =
    achatado.includes('credit') ||
    achatado.includes('cartao') ||
    achatado.includes('card')
  if (ehCartao) {
    const debito = achatado.includes('debit') || achatado.includes('debito')
    if (debito) return 'Cartão de débito'
    const parcelas = parcelasDe(achatado)
    // Sem parcela declarada é à vista: é assim que a Pagar.me manda
    // `credit_card` e a Yampi manda "Cartão de crédito" sem sufixo.
    return `Cartão de crédito ${parcelas ?? 1}x`
  }

  // Meio desconhecido não vira "Não identificado": some do relatório o que
  // era informação. Devolve o original com a primeira letra maiúscula, para
  // aparecer na tela e alguém decidir o que fazer com ele.
  return (bruto ?? '').trim().replace(/^./, (c) => c.toUpperCase())
}

/**
 * Qual intermediador processou a venda.
 *
 * Esta dimensão é tão importante quanto o meio, e por um motivo que só ficou
 * claro olhando o dado real: "pix" a 0,70% e "Pix" a 0,99% pareciam duas
 * grafias do mesmo custo, mas eram DOIS GATEWAYS — 0,70% era a Pagar.me, que
 * saiu em 22/07, e 0,99% é o Mercado Pago de hoje. Unificar pelo nome do meio
 * teria feito a precificação usar a tarifa de um gateway que não existe mais.
 *
 * Por isso o custo de receber se lê por meio E por gateway, e o preço se faz
 * com o gateway VIGENTE. Média que mistura contrato antigo com contrato novo
 * não descreve nenhuma venda que ainda vá acontecer.
 */
export type Gateway = 'Mercado Pago' | 'Pagar.me' | 'Pagaleve' | 'Outro'

/** A troca de intermediador: até esta data, Pagar.me; a partir dela, Mercado Pago. */
export const TROCA_DE_GATEWAY = '2026-07-22'

export function gatewayDe(origem: string | null | undefined, quando?: string): Gateway {
  const o = achatar(origem ?? '')
  if (o.includes('pagaleve')) return 'Pagaleve'
  if (o.includes('pagarme') || o.includes('pagar.me')) return 'Pagar.me'
  if (o.includes('mercado')) return 'Mercado Pago'

  // A origem "Yampi · Pago" diz de onde veio o PEDIDO, não quem processou o
  // dinheiro. Quem processou se decide pela data da venda contra a troca.
  if (o.includes('yampi') || o.includes('shopify')) {
    if (!quando) return 'Mercado Pago'
    return quando.slice(0, 10) < TROCA_DE_GATEWAY ? 'Pagar.me' : 'Mercado Pago'
  }
  return 'Outro'
}

/** Meios que liquidam em parcelas, e por isso demoram a virar caixa. */
export function liquidaParcelado(meioCanonico: string): boolean {
  if (meioCanonico === 'Pix parcelado (Pagaleve)') return true
  const m = /^Cartão de crédito (\d{1,2})x$/.exec(meioCanonico)
  return m ? Number(m[1]) > 1 : false
}
