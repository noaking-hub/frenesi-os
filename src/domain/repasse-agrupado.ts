/**
 * O depósito agrupado da Pagaleve: que parcelas ele está pagando?
 *
 * A Pagaleve deposita um valor que SOMA parcelas de vendas diferentes — e de
 * DIAS diferentes: o depósito de R$163,26 de 18/08 pagava as três parcelas
 * previstas para 18/08 e duas previstas para 19/08, adiantadas. O casamento
 * "mesmo dia + valor exato" nunca fecharia. Aqui o casamento é por CONJUNTO:
 * dentro de uma janela curta em volta do depósito, existe um subconjunto de
 * parcelas em aberto que soma exatamente o valor, no centavo? Se existe, é
 * ele; se não existe, o depósito fica na fila — chutar é pior que esperar.
 */

export interface ParcelaAberta {
  checkoutId: string
  numero: number
  /** yyyy-mm-dd */
  previstaPara: string
  liquido: number
}

/** O depósito pode atrasar até 7 dias e adiantar até 2 — medido no caso real. */
const DIAS_ANTES = 7
const DIAS_DEPOIS = 2
/** Acima disto o subconjunto deixa de ser confiável (e o DP, barato). */
const MAX_PARCELAS = 24

/**
 * O subconjunto de parcelas em aberto que fecha o depósito no centavo, ou
 * null. Determinístico: as parcelas entram em ordem cronológica e a primeira
 * combinação alcançada vence — o que favorece pagar primeiro o que venceu
 * primeiro.
 */
export function parcelasQueFechamODeposito(
  valor: number,
  dataDeposito: string,
  parcelas: ParcelaAberta[],
): ParcelaAberta[] | null {
  const alvo = Math.round(valor * 100)
  const dia = Date.parse(dataDeposito)
  if (alvo <= 0 || !Number.isFinite(dia)) return null

  const de = dia - DIAS_ANTES * 86_400_000
  const ate = dia + DIAS_DEPOIS * 86_400_000
  const candidatas = parcelas
    .filter((p) => {
      const t = Date.parse(p.previstaPara)
      return Number.isFinite(t) && t >= de && t <= ate && p.liquido > 0
    })
    .sort(
      (a, b) =>
        a.previstaPara.localeCompare(b.previstaPara) ||
        a.checkoutId.localeCompare(b.checkoutId) ||
        a.numero - b.numero,
    )
  if (candidatas.length === 0 || candidatas.length > MAX_PARCELAS) return null

  // Subset-sum em centavos. Para cada soma alcançável, quem a alcançou e de
  // onde veio — o suficiente para reconstruir o conjunto.
  const alcancadaPor = new Map<number, number>([[0, -1]])
  const somaAnterior = new Map<number, number>()
  for (let i = 0; i < candidatas.length; i++) {
    const centavos = Math.round(candidatas[i].liquido * 100)
    if (centavos <= 0 || centavos > alvo) continue
    for (const s of [...alcancadaPor.keys()]) {
      const nova = s + centavos
      if (nova > alvo || alcancadaPor.has(nova)) continue
      alcancadaPor.set(nova, i)
      somaAnterior.set(nova, s)
    }
  }
  if (!alcancadaPor.has(alvo)) return null

  const escolhidas: ParcelaAberta[] = []
  let s = alvo
  while (s !== 0) {
    const i = alcancadaPor.get(s)
    if (i === undefined || i < 0) return null
    escolhidas.push(candidatas[i])
    s = somaAnterior.get(s) ?? 0
  }
  return escolhidas.reverse()
}
