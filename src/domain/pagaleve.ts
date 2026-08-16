/**
 * Cronograma de recebimento do Pix parcelado da Pagaleve.
 *
 * Uma venda pela Pagaleve não é caixa do dia da venda: é caixa espalhado por
 * semanas, em parcelas. Sem isso escrito, a projeção de fluxo trata a venda
 * como dinheiro imediato — e é esse otimismo que faz um caixa parecer
 * confortável na véspera de não ser.
 *
 * O MODELO VEIO DO RELATÓRIO DA PAGALEVE, e corrigiu o que eu tinha suposto.
 * Eu havia fixado quinze dias entre parcelas; o relatório mostra DUAS
 * modalidades — "Quinzenal" e "Mensal" — e a primeira parcela caindo um a três
 * dias depois da compra, não no ato. Medido em 27 vendas:
 *
 *     Quinzenal   compra → 1ª em 1-3 dias, depois 14 a 18 dias
 *     Mensal      compra → 1ª em 1-3 dias, depois 28 a 32 dias
 *
 * E a lição que decide o desenho: em 44 dos 53 créditos já ocorridos, o
 * dinheiro caiu EXATAMENTE na data que a Pagaleve tinha previsto. A previsão
 * dela é melhor que qualquer conta minha. Por isso a data informada sempre
 * vence a calculada, e o cálculo só existe para venda nova que ainda não tem
 * cronograma publicado.
 */

export type Modalidade = 'quinzenal' | 'mensal'

/** Dias entre parcelas, por modalidade. Mediana do que a Pagaleve pratica. */
export const INTERVALO_POR_MODALIDADE: Record<Modalidade, number> = {
  quinzenal: 15,
  mensal: 30,
}

/**
 * Dias entre a compra e o crédito da PRIMEIRA parcela.
 *
 * Dois, que é a mediana do intervalo de um a três observado. A primeira
 * parcela não cai no ato: a Pagaleve liquida o Pix e só então repassa.
 */
export const DIAS_ATE_A_PRIMEIRA = 2

export const MAXIMO_DE_PARCELAS = 4

/** De onde saiu a data — e o quanto se pode confiar nela. */
export type OrigemDaData = 'informada' | 'estimada'

export interface ParcelaPrevista {
  numero: number
  de: number
  /** O que o cliente paga nesta parcela, antes da tarifa. */
  bruto: number
  /** O que entra na conta: o bruto menos a tarifa da parcela. */
  liquido: number
  tarifa: number
  /** AAAA-MM-DD. */
  previstaPara: string
  origemDaData: OrigemDaData
  /** Preenchido só quando o dinheiro entrou de verdade. */
  liquidadaEm: string | null
}

export interface VendaParcelada {
  /** Bruto da venda inteira, em reais. */
  bruto: number
  /** Líquido de UMA parcela, como a API devolve em `current_amount`. */
  liquidoDaParcela: number
  /** Tarifa de UMA parcela, como a API devolve em `total_fee_amount`. */
  tarifaDaParcela: number
  /** Data da compra, AAAA-MM-DD. */
  compradaEm: string
  /** Quando conhecida. Sem ela, assume quinzenal, que é o caso comum. */
  modalidade?: Modalidade
}

/**
 * Quantas parcelas a venda tem.
 *
 * `null` quando não dá para deduzir — parcela de valor zero, venda de valor
 * zero, ou uma divisão que não cai perto de inteiro. Devolver um palpite aqui
 * seria pior que devolver nada: o cronograma inteiro nasceria errado e com
 * cara de certo.
 */
export function parcelasDaVenda(v: VendaParcelada): number | null {
  const brutoDaParcela = v.liquidoDaParcela + v.tarifaDaParcela
  if (v.bruto <= 0 || brutoDaParcela <= 0) return null

  const cru = v.bruto / brutoDaParcela
  const inteiro = Math.round(cru)
  if (inteiro < 1 || inteiro > MAXIMO_DE_PARCELAS) return null
  // Tolerância de 2%: a Pagaleve arredonda centavos na divisão, então a conta
  // não bate exata. Mais folga que isso aceitaria uma divisão que não é essa.
  if (Math.abs(cru - inteiro) > 0.02 * inteiro) return null
  return inteiro
}

export function somarDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * O cronograma estimado de uma venda.
 *
 * Só para venda que ainda não tem cronograma publicado pela Pagaleve. Toda
 * data que sai daqui vem marcada como `estimada`, e é substituída assim que a
 * informada aparecer — a tela precisa poder dizer qual das duas está olhando.
 *
 * A última parcela absorve a diferença de arredondamento, para a soma fechar
 * com o bruto da venda em vez de sobrar ou faltar centavo no fim.
 */
export function cronogramaDaVenda(v: VendaParcelada): ParcelaPrevista[] {
  const total = parcelasDaVenda(v)
  if (total === null) return []

  const intervalo = INTERVALO_POR_MODALIDADE[v.modalidade ?? 'quinzenal']
  const parcelas: ParcelaPrevista[] = []
  let brutoAcumulado = 0
  const brutoDaParcela = Math.round((v.liquidoDaParcela + v.tarifaDaParcela) * 100) / 100

  for (let n = 1; n <= total; n++) {
    const ultima = n === total
    const bruto = ultima ? Math.round((v.bruto - brutoAcumulado) * 100) / 100 : brutoDaParcela
    brutoAcumulado = Math.round((brutoAcumulado + bruto) * 100) / 100
    const tarifa = Math.round(v.tarifaDaParcela * 100) / 100
    parcelas.push({
      numero: n,
      de: total,
      bruto,
      tarifa,
      liquido: Math.round((bruto - tarifa) * 100) / 100,
      previstaPara: somarDias(v.compradaEm, DIAS_ATE_A_PRIMEIRA + (n - 1) * intervalo),
      origemDaData: 'estimada',
      liquidadaEm: null,
    })
  }
  return parcelas
}

/** O que ainda não venceu — é isso que a Pagaleve deve. */
export function aReceberEm(parcelas: ParcelaPrevista[], hoje: string): number {
  const soma = parcelas
    .filter((p) => !p.liquidadaEm && p.previstaPara > hoje)
    .reduce((a, p) => a + p.liquido, 0)
  return Math.round(soma * 100) / 100
}

/**
 * O que já venceu e NÃO entrou.
 *
 * Diferente de "já vencido": parcela vencida que foi creditada não é
 * pendência, é história. Só o que passou da data sem dinheiro exige olhar.
 */
export function vencidoSemCredito(parcelas: ParcelaPrevista[], hoje: string): number {
  const soma = parcelas
    .filter((p) => !p.liquidadaEm && p.previstaPara <= hoje)
    .reduce((a, p) => a + p.liquido, 0)
  return Math.round(soma * 100) / 100
}

/** O que efetivamente entrou. */
export function jaCreditado(parcelas: ParcelaPrevista[]): number {
  const soma = parcelas.filter((p) => p.liquidadaEm).reduce((a, p) => a + p.liquido, 0)
  return Math.round(soma * 100) / 100
}

/** Lê a modalidade como o relatório da Pagaleve a escreve. */
export function modalidadeDe(texto: string | null | undefined): Modalidade {
  return (texto ?? '').toLowerCase().startsWith('mensal') ? 'mensal' : 'quinzenal'
}
