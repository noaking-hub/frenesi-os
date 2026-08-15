/**
 * Recálculo do razão de um insumo.
 *
 * Corrigir um lançamento não é trocar texto. A linha errada participou do
 * saldo e do custo médio, e toda linha depois dela herdou o erro — trocar só
 * a descrição deixaria o histórico bonito e o estoque mentindo.
 *
 * Por isso a correção não aplica um delta em cima do saldo atual: ela
 * reescreve o razão do primeiro movimento até o último, exatamente como o
 * banco teria gravado se o lançamento certo tivesse sido feito na hora.
 */

/** Linha do razão, do jeito que ela vive em `insumo_movimentacoes`. */
export interface LinhaRazao {
  id: string
  tipo: string
  unidades: number
  saldoAnterior: number | null
  saldo: number | null
  custoUnitario: number | null
}

export interface LinhaRecalculada extends LinhaRazao {
  saldoAnterior: number
  saldo: number
}

export interface Recalculo {
  linhas: LinhaRecalculada[]
  saldo: number
  custoUnitario: number
  /** Primeira linha que deixaria o estoque negativo. Com ela, nada é gravado. */
  negativa: LinhaRecalculada | null
}

/**
 * Linha de trilha: registra QUEM mexeu no quê e não move estoque.
 *
 * Usa o tipo `estorno` porque é o único slot livre no CHECK da tabela — o
 * ideal seria um tipo `auditoria` próprio, e a migração está descrita na
 * entrega. O replay pula estas linhas; elas só carregam o saldo do momento
 * para o histórico ficar legível.
 */
export const TIPO_TRILHA = 'estorno'

/** Quatro casas, como as RPCs de compra arredondam o custo médio no banco. */
export function arredondar4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

/**
 * Reprocessa o razão inteiro e devolve saldo, custo médio e cada linha com o
 * saldo que ela passa a ter.
 *
 * `custoDeReferencia` é o custo do cadastro: vale quando nenhuma entrada do
 * razão tem valor, que é justamente o caso de um saldo inicial lançado sem
 * nota. Sem ele, corrigir qualquer coisa zeraria o custo informado à mão.
 */
export function recalcularRazao(linhas: LinhaRazao[], custoDeReferencia = 0): Recalculo {
  let saldo = 0
  let custo = 0
  let negativa: LinhaRecalculada | null = null
  const recalculadas: LinhaRecalculada[] = []

  for (const linha of linhas) {
    const anterior = saldo

    if (linha.tipo === TIPO_TRILHA) {
      recalculadas.push({ ...linha, unidades: 0, saldoAnterior: anterior, saldo: anterior })
      continue
    }

    // A contagem física gravou um SALDO, não um passo: se um lançamento
    // anterior mudou, quem cede é a diferença do ajuste — nunca o número que
    // a pessoa contou com a mão na prateleira.
    const delta =
      linha.tipo === 'ajuste'
        ? (linha.saldo ?? anterior + linha.unidades) - anterior
        : linha.unidades

    saldo = anterior + delta

    // Só entrada valorizada mexe no custo médio, com a mesma conta da RPC
    // `registrar_compra_insumo` — assim a correção chega ao mesmo número que
    // o lançamento certo teria dado no dia. Um saldo inicial com custo
    // informado conta como entrada valorizada, que é o caso das tampas.
    if (delta > 0 && linha.custoUnitario !== null && linha.custoUnitario > 0) {
      custo =
        anterior <= 0 || custo <= 0
          ? linha.custoUnitario
          : (anterior * custo + delta * linha.custoUnitario) / (anterior + delta)
    }

    const recalculada: LinhaRecalculada = {
      ...linha,
      unidades: delta,
      saldoAnterior: anterior,
      saldo,
    }
    // Guarda a PRIMEIRA que fura: é ela que explica o problema para quem edita.
    if (saldo < 0 && !negativa) negativa = recalculada
    recalculadas.push(recalculada)
  }

  return {
    linhas: recalculadas,
    saldo,
    custoUnitario: custo > 0 ? arredondar4(custo) : custoDeReferencia,
    negativa,
  }
}
