import type { Lote, ParametrosPrecificacao, PerfumeBase } from './types'

export interface ApuracaoLote {
  id: string
  perfume: string
  aberto: boolean
  /** Volume comprado, em ml. */
  compradoMl: number
  /** Soma do extrato de saídas. Sempre derivado, nunca campo independente. */
  consumidoMl: number
  /** Decants gerados por este lote. Também derivado do extrato. */
  unidades: number
  /**
   * Lote aberto: saldo teórico (comprado − envasado).
   * Lote encerrado: perda real (fundo, respingo, evaporação).
   */
  diferencaMl: number
  /** Perda real sobre o comprado, em %. Só existe em lote encerrado. */
  perdaPct: number | null
  /** Perda real acima do parâmetro em uso. */
  acimaDoParametro: boolean
}

/**
 * Apura um lote a partir do extrato de saídas.
 *
 * Enquanto o lote está aberto, `diferencaMl` é o saldo teórico e a perda não é
 * mensurável. Quando o operador declara o frasco vazio, a diferença entre
 * comprado e envasado passa a ser a perda real.
 */
export function apurarLote(lote: Lote, p: ParametrosPrecificacao): ApuracaoLote {
  // O ml manda: uma saída de 7 ml vendidos antes do ERP não tem decant, e
  // contá-la como zero faria esses 7 ml reaparecerem como perda técnica.
  const consumidoMl = lote.saidas.reduce((a, s) => a + s.ml, 0)
  const unidades = lote.saidas.reduce((a, s) => a + (s.unidades ?? 0), 0)
  const aberto = !lote.encerradoEm
  const diferencaMl = lote.volumeMl - consumidoMl
  const perdaPct = aberto || lote.volumeMl === 0 ? null : (diferencaMl / lote.volumeMl) * 100

  return {
    id: lote.id,
    perfume: lote.perfume,
    aberto,
    compradoMl: lote.volumeMl,
    consumidoMl,
    unidades,
    diferencaMl,
    perdaPct,
    acimaDoParametro: perdaPct !== null && perdaPct > p.perdaPct,
  }
}

export interface PreviaEncerramento {
  compradoMl: number
  envasadoMl: number
  /** O que sobra no papel e vai virar perda real ao declarar o vazio. */
  perdaMl: number
  perdaPct: number
  /** Perda em reais, ao custo médio da base. */
  custo: number
  acimaDoParametro: boolean
  /** Volume da base depois da baixa. */
  saldoBaseMl: number
  /**
   * Motivo pelo qual encerrar não é possível agora. `null` quando pode.
   * Espelha as exceções de `encerrar_lote()` para o operador ver antes.
   */
  impedimento: string | null
}

/**
 * O que acontece se o operador declarar este frasco vazio agora.
 *
 * Existe para a confirmação não ser um "tem certeza?" vazio: encerrar é
 * irreversível, muda o estoque e muda o custo de todo preço calculado.
 */
export function previaEncerramento(
  lote: Lote,
  base: PerfumeBase | undefined,
  p: ParametrosPrecificacao,
): PreviaEncerramento {
  const ap = apurarLote(lote, p)
  const perdaMl = ap.diferencaMl
  const perdaPct = lote.volumeMl === 0 ? 0 : (perdaMl / lote.volumeMl) * 100
  const volumeBase = base?.volumeMl ?? 0

  const impedimento = !ap.aberto
    ? `Lote já encerrado em ${lote.encerradoEm}.`
    : perdaMl < 0
      ? `O extrato já soma ${ap.consumidoMl} ml envasados, mais que os ${lote.volumeMl} ml comprados. Corrija as saídas antes de encerrar.`
      : perdaMl > volumeBase
        ? `A perda apurada (${perdaMl} ml) é maior que o volume em estoque da base (${volumeBase} ml). Há movimentação lançada fora do fluxo de lotes — acerte pelo Inventário antes de encerrar.`
        : null

  return {
    compradoMl: ap.compradoMl,
    envasadoMl: ap.consumidoMl,
    perdaMl,
    perdaPct,
    custo: perdaMl * (base?.custoPorMl ?? 0),
    acimaDoParametro: perdaPct > p.perdaPct,
    saldoBaseMl: volumeBase - perdaMl,
    impedimento,
  }
}

export interface PerdaReal {
  /** Média ponderada pelo volume comprado dos lotes encerrados, em %. */
  mediaPct: number
  /** Quanto a perda real excede o parâmetro, em pontos percentuais. */
  delta: number
  /** Custo do perfume perdido nos lotes já encerrados, em reais. */
  custo: number
  lotesEncerrados: number
  lotesAbertos: number
  /**
   * Perda subestimada deixa TODO preço calculado com custo abaixo do real.
   * Acima de 0,2 pontos o sistema alerta em Lotes, Dashboard e no parâmetro.
   */
  subestimado: boolean
}

export function apurarPerdaReal(
  lotes: Lote[],
  bases: PerfumeBase[],
  p: ParametrosPrecificacao,
): PerdaReal {
  const apuracoes = lotes.map((l) => ({ lote: l, ap: apurarLote(l, p) }))
  const encerrados = apuracoes.filter(({ ap }) => !ap.aberto)
  const volumeEncerrado = encerrados.reduce((a, { ap }) => a + ap.compradoMl, 0)

  const mediaPct = volumeEncerrado
    ? (encerrados.reduce((a, { ap }) => a + ap.diferencaMl, 0) / volumeEncerrado) * 100
    : 0

  const custo = encerrados.reduce((a, { lote, ap }) => {
    const base = bases.find((b) => b.id === lote.baseId)
    return a + ap.diferencaMl * (base ? base.custoPorMl : 0)
  }, 0)

  const delta = mediaPct - p.perdaPct

  return {
    mediaPct,
    delta,
    custo,
    lotesEncerrados: encerrados.length,
    lotesAbertos: apuracoes.length - encerrados.length,
    subestimado: delta > 0.2,
  }
}

/**
 * Invariante do sistema: a soma dos saldos teóricos dos lotes abertos deve
 * igualar o volume total em estoque. Se divergir, alguma movimentação foi
 * lançada fora do fluxo de lotes.
 */
export function conciliarLotesAbertos(
  lotes: Lote[],
  bases: PerfumeBase[],
  p: ParametrosPrecificacao,
): { saldoLotesMl: number; estoqueMl: number; divergenciaMl: number; confere: boolean } {
  const saldoLotesMl = lotes
    .filter((l) => !l.encerradoEm)
    .reduce((a, l) => a + apurarLote(l, p).diferencaMl, 0)
  const estoqueMl = bases.reduce((a, b) => a + b.volumeMl, 0)
  const divergenciaMl = saldoLotesMl - estoqueMl

  return {
    saldoLotesMl,
    estoqueMl,
    divergenciaMl,
    confere: Math.abs(divergenciaMl) < 0.05,
  }
}

/**
 * Custo por ml depois de uma compra. A primeira compra define (custo ÷
 * volume); reposição faz a média ponderada entre o volume que já existia,
 * ao custo atual, e o que entrou. Base importada da Shopify com custo 0 é
 * tratada como primeira compra — o histórico desconhecido não contamina a
 * média. Espelha `registrar_compra()` da migration.
 */
export function custoMedioPonderado(
  volumeAtualMl: number,
  custoAtualPorMl: number,
  volumeCompradoMl: number,
  custoTotalCompra: number,
): number {
  if (volumeCompradoMl <= 0) return custoAtualPorMl
  if (volumeAtualMl <= 0 || custoAtualPorMl <= 0) {
    return custoTotalCompra / volumeCompradoMl
  }
  return (
    (volumeAtualMl * custoAtualPorMl + custoTotalCompra) / (volumeAtualMl + volumeCompradoMl)
  )
}
