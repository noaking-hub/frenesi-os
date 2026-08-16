/**
 * Cenários — a Fase 2 do escopo do motor.
 *
 * Simulação é a única resposta que o Gerente pode dar sobre um futuro, e por
 * isso é a mais fácil de estragar. A regra do escopo é curta e vale o módulo
 * inteiro: **nunca persiste, e nunca se mistura ao realizado**. O tipo de
 * retorno carrega `cenario: true` justamente para que essa marca não dependa de
 * alguém lembrar de escrevê-la na tela.
 *
 * O cálculo vive aqui, e não no modelo, pelo mesmo motivo de sempre: o LLM não
 * calcula número oficial. Ele descreve o que ESTE arquivo devolveu.
 */

export interface EntradaDaCompra {
  nome: string
  /** Ml que sobra para vender hoje — já descontada a reserva de pedidos pagos. */
  disponivelMl: number
  /**
   * Dias de cobertura calculados pelo ERP. `null` quando não há consumo, e aí
   * a simulação recusa: sem ritmo de saída, "quantos dias isso dura" não tem
   * resposta honesta — dura para sempre, o que não é informação.
   */
  diasDeCobertura: number | null
  custoPorMl: number | null
  /** Quanto se pretende comprar. */
  comprarMl: number
  /** Custo por ml da compra pretendida, quando diferente do histórico. */
  custoPorMlDaCompra?: number | null
}

export interface CenarioDeCompra {
  cenario: true
  base: string
  consumoDiarioMl: number
  disponivelHojeMl: number
  comprarMl: number
  disponivelDepoisMl: number
  coberturaHojeDias: number | null
  coberturaDepoisDias: number
  custoEstimado: number | null
  custoPorMlUsado: number | null
  origemDoCusto: 'compra_informada' | 'custo_medio_do_erp' | 'desconhecido'
  aviso?: string
}

/**
 * O que muda no estoque e no bolso se a compra acontecer.
 *
 * O consumo diário é DERIVADO da cobertura oficial em vez de recalculado a
 * partir de vendas: se a tela de Estoque diz "acaba em 12 dias", a simulação
 * parte exatamente desses 12 dias. Refazer a conta por outro caminho produziria
 * dois números para a mesma pergunta — o erro que o escopo trata como o mais
 * caro de todos num ERP.
 */
export function simularCompraDeBase(e: EntradaDaCompra): CenarioDeCompra | { erro: string } {
  if (!(e.comprarMl > 0)) {
    return { erro: 'A quantidade a comprar precisa ser maior que zero.' }
  }
  if (e.diasDeCobertura === null || e.diasDeCobertura <= 0) {
    return {
      erro:
        `"${e.nome}" não tem consumo registrado no período, então não há ritmo de saída ` +
        'para projetar cobertura. A compra pode fazer sentido por outro motivo, mas não por cobertura.',
    }
  }

  const consumoDiarioMl = e.disponivelMl / e.diasDeCobertura
  const disponivelDepoisMl = arredondar(e.disponivelMl + e.comprarMl)
  const coberturaDepoisDias = arredondar(disponivelDepoisMl / consumoDiarioMl, 1)

  const custoPorMlUsado = e.custoPorMlDaCompra ?? e.custoPorMl ?? null
  const origemDoCusto: CenarioDeCompra['origemDoCusto'] =
    e.custoPorMlDaCompra != null
      ? 'compra_informada'
      : e.custoPorMl != null
        ? 'custo_medio_do_erp'
        : 'desconhecido'

  return {
    cenario: true,
    base: e.nome,
    consumoDiarioMl: arredondar(consumoDiarioMl, 2),
    disponivelHojeMl: arredondar(e.disponivelMl),
    comprarMl: arredondar(e.comprarMl),
    disponivelDepoisMl,
    coberturaHojeDias: arredondar(e.diasDeCobertura, 1),
    coberturaDepoisDias,
    custoEstimado: custoPorMlUsado == null ? null : arredondar(e.comprarMl * custoPorMlUsado),
    custoPorMlUsado,
    origemDoCusto,
    aviso:
      origemDoCusto === 'desconhecido'
        ? 'Sem custo por ml registrado para esta base: o custo da compra não foi estimado.'
        : origemDoCusto === 'custo_medio_do_erp'
          ? 'Custo estimado pelo custo médio já pago; o preço real da próxima compra pode diferir.'
          : undefined,
  }
}

export interface EntradaDoImpactoNoCaixa {
  caixaHoje: number
  /** Menor saldo projetado antes da compra, calculado pelo módulo Financeiro. */
  menorSaldoProjetado: number
  menorSaldoEm: string | null
  desembolso: number
}

export interface CenarioDeCaixa {
  cenario: true
  desembolso: number
  caixaHoje: number
  caixaDepois: number
  menorSaldoAntes: number
  menorSaldoDepois: number
  menorSaldoEm: string | null
  cabeNoCaixa: boolean
  veredito: string
}

/**
 * Se a compra cabe no caixa — medida pelo VALE do fluxo, não pelo saldo de hoje.
 *
 * Olhar só o saldo atual é o erro clássico: há dinheiro hoje e não há na
 * sexta, quando o boleto vence. O que decide é o menor saldo projetado do
 * período, e é sobre ele que o desembolso é aplicado.
 */
export function simularImpactoNoCaixa(e: EntradaDoImpactoNoCaixa): CenarioDeCaixa {
  const menorSaldoDepois = arredondar(e.menorSaldoProjetado - e.desembolso)
  const cabeNoCaixa = menorSaldoDepois >= 0
  return {
    cenario: true,
    desembolso: arredondar(e.desembolso),
    caixaHoje: arredondar(e.caixaHoje),
    caixaDepois: arredondar(e.caixaHoje - e.desembolso),
    menorSaldoAntes: arredondar(e.menorSaldoProjetado),
    menorSaldoDepois,
    menorSaldoEm: e.menorSaldoEm,
    cabeNoCaixa,
    veredito: cabeNoCaixa
      ? 'A compra cabe: o menor saldo projetado do período continua positivo depois dela.'
      : `A compra NÃO cabe sem outra entrada: o menor saldo projetado fica negativo${
          e.menorSaldoEm ? ` em ${e.menorSaldoEm}` : ''
        }.`,
  }
}

function arredondar(v: number, casas = 2): number {
  const f = 10 ** casas
  return Math.round(v * f) / f
}
