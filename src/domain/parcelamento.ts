import { somarDias } from './pagaleve'

/**
 * Como um valor vira N parcelas — a aritmética, e só ela.
 *
 * Existe porque a mesma divisão estava escrita em DOIS lugares que não podiam
 * discordar e não tinham como se conferir: `trunc(valor / n, 2)` dentro da
 * função `parcelar_lancamento` no Postgres (que é quem GRAVA) e
 * `Math.trunc((valor / n) * 100) / 100` dentro do diálogo Parcelar (que é quem
 * PROMETE, na prévia). Duas cópias da mesma regra divergem no primeiro
 * conserto que alguém fizer em uma só — e o jeito de descobrir seria o dono
 * conferindo boleto com a tela ao lado.
 *
 * Agora a prévia da venda manual é a terceira tela a precisar da mesma conta,
 * o que tornava a terceira cópia inevitável.
 *
 * Quem usa, hoje, e é bom conferir com `grep` antes de acreditar nesta lista:
 * `VendaManual.tsx` (prévia da venda que nasce parcelada), `Compromissos.tsx`
 * (o diálogo Parcelar, através de `planejarParcelamento`) e as duas actions que
 * validam a faixa antes de chamar o banco — `pedidos/actions.ts` e
 * `financeiro/acoes-gerenciais.ts`. O diálogo Parcelar ficou com cópia própria
 * por um tempo depois deste arquivo existir, e divergia do banco em ~1 de cada
 * 135 combinações de valor × parcelas: R$ 100,02 em 3× prometia 33,33 e o
 * Postgres gravava 33,34.
 *
 * O que ela NÃO é: a verdade do que foi gravado. Quem grava é o banco, na
 * mesma transação da venda. Esta função existe para que a tela possa dizer,
 * ANTES do clique, exatamente o que o banco vai escrever — e por isso ela
 * copia a regra do SQL em vez de inventar uma melhor.
 */

/** O parcelamento vive entre 2 e 48 — abaixo não é parcela, acima não é venda. */
export const MIN_PARCELAS = 2
export const MAX_PARCELAS = 48

/** Trinta dias corridos: o intervalo do carnê e do boleto mensal. */
export const INTERVALO_PADRAO_DIAS = 30

export interface ParcelaProgramada {
  /** 1-based, como aparece no "(1/3)" da descrição. */
  numero: number
  valor: number
  /** AAAA-MM-DD. */
  venceEm: string
}

/**
 * Reparte um valor em N pedaços cuja soma fecha EXATA com o original.
 *
 * A conta é feita em centavos inteiros de propósito: dividir reais em ponto
 * flutuante e arredondar cada parcela isoladamente produz somas como 99,99 ou
 * 100,01, e o erro só aparece quando o dono fecha o mês.
 *
 * O centavo que sobra vai na PRIMEIRA parcela, não na última — é a regra que
 * `parcelar_lancamento` já grava, e o comentário dela explica o porquê: quem
 * confere o boleto de hoje encontra a diferença agora, e não daqui a 11 meses.
 * Trocar o lado aqui faria a prévia mentir sobre a primeira parcela, que é
 * justamente a que o operador olha.
 *
 * Casos de borda que o teste fixa: R$ 100,00 em 3 dá 33,34 / 33,33 / 33,33; e
 * R$ 0,01 em 3 dá 0,01 / 0,00 / 0,00 — parcelas de zero real, porque é isso
 * que o banco escreve, e a prévia não pode esconder um resultado absurdo
 * fingindo um bonito.
 */
export function dividirEmParcelas(valor: number, parcelas: number): number[] {
  // Nunca menos de uma parcela: o chamador é uma tela, e uma tela pode chegar
  // aqui com o campo em branco enquanto o operador digita.
  const n = Math.max(1, Math.trunc(parcelas))
  const centavos = Math.round(valor * 100)
  const base = Math.trunc(centavos / n)
  const resto = centavos - base * n
  return Array.from({ length: n }, (_, i) => (base + (i === 0 ? resto : 0)) / 100)
}

/**
 * O cronograma completo: quanto e QUANDO.
 *
 * O intervalo é em dias CORRIDOS, não "todo dia 7 do mês" — é assim que
 * `parcelar_lancamento` calcula (`vence_em + (i-1) * intervalo`), e a
 * diferença aparece já na terceira parcela: 07/09 + 30 + 30 é 06/11, não
 * 07/11. Prometer "mensal" e entregar 06/11 é o tipo de divergência que o dono
 * descobre conferindo boleto, então a tela mostra a data calculada, não a
 * palavra "mensal".
 *
 * A primeira parcela vence no dia informado — no caso da venda manual, o
 * próprio dia da venda.
 */
export function cronogramaDeParcelas(
  valor: number,
  parcelas: number,
  intervaloDias: number,
  primeiroVencimento: string,
): ParcelaProgramada[] {
  const intervalo = Math.max(1, Math.trunc(intervaloDias))
  return dividirEmParcelas(valor, parcelas).map((v, i) => ({
    numero: i + 1,
    valor: v,
    venceEm: somarDias(primeiroVencimento, i * intervalo),
  }))
}

/**
 * O número de parcelas que a tela pode enviar, a partir do que foi digitado.
 *
 * Grampear aqui, e não no `onChange`, é o que deixa o operador apagar o campo
 * para digitar "12" sem o cursor pular para "1" no meio da digitação.
 */
export function parcelasValidas(digitado: number): number {
  return Math.max(MIN_PARCELAS, Math.min(MAX_PARCELAS, Math.round(digitado) || MIN_PARCELAS))
}
