import { describe, expect, it } from 'vitest'

import {
  INTERVALO_PADRAO_DIAS,
  MAX_PARCELAS,
  MIN_PARCELAS,
  cronogramaDeParcelas,
  dividirEmParcelas,
  parcelasValidas,
} from '../parcelamento'

/**
 * Estes testes são o contrato com o Postgres.
 *
 * O que a função devolve tem de ser byte a byte o que `parcelar_lancamento`
 * grava — `trunc(valor / n, 2)` com o resto na PRIMEIRA parcela. Se algum dia
 * alguém "melhorar" o arredondamento aqui sem mexer no SQL, é aqui que a
 * divergência aparece, e não no boleto do dono.
 */

/** Soma em centavos: comparar `reduce` de floats reprovaria por 1e-13. */
const soma = (parcelas: number[]) =>
  parcelas.reduce((a, p) => a + Math.round(p * 100), 0) / 100

describe('dividirEmParcelas', () => {
  it('divide redondo quando o valor cabe certo: 216,00 em 3 é 72,00 três vezes', () => {
    expect(dividirEmParcelas(216, 3)).toEqual([72, 72, 72])
  })

  it('joga o centavo que sobra na PRIMEIRA parcela, como o SQL faz', () => {
    // 100,00 / 3 = 33,3333…  → trunc = 33,33; sobra 1 centavo.
    expect(dividirEmParcelas(100, 3)).toEqual([33.34, 33.33, 33.33])
    expect(soma(dividirEmParcelas(100, 3))).toBe(100)
  })

  it('fecha exato mesmo quando sobram vários centavos', () => {
    // 100,00 / 7 = 14,2857… → trunc = 14,28; 100 − 99,96 = 4 centavos na 1ª.
    const p = dividirEmParcelas(100, 7)
    expect(p[0]).toBe(14.32)
    expect(p.slice(1)).toEqual([14.28, 14.28, 14.28, 14.28, 14.28, 14.28])
    expect(soma(p)).toBe(100)
  })

  it('em 2 parcelas, o valor ímpar em centavos vai um a mais na primeira', () => {
    expect(dividirEmParcelas(99.99, 2)).toEqual([50, 49.99])
    expect(soma(dividirEmParcelas(99.99, 2))).toBe(99.99)
  })

  it('em 48 parcelas continua fechando exato e nenhuma parcela some', () => {
    const p = dividirEmParcelas(1000, MAX_PARCELAS)
    expect(p).toHaveLength(48)
    // 1000 / 48 = 20,8333… → 20,83; 48 × 20,83 = 999,84; sobram 16 centavos.
    expect(p[0]).toBe(20.99)
    expect(p[47]).toBe(20.83)
    expect(soma(p)).toBe(1000)
  })

  it('um centavo em 3 devolve 0,01 e DUAS parcelas de zero — é o que o banco grava', () => {
    // Não é um resultado bonito, e por isso a prévia precisa mostrá-lo: quem
    // vê "3× de R$ 0,00" entende que parcelar um centavo não faz sentido.
    // Esconder isso arredondando para cima faria a soma passar do valor.
    expect(dividirEmParcelas(0.01, 3)).toEqual([0.01, 0, 0])
    expect(soma(dividirEmParcelas(0.01, 3))).toBe(0.01)
  })

  it('um centavo em 2 também fecha', () => {
    expect(dividirEmParcelas(0.01, 2)).toEqual([0.01, 0])
  })

  it('nunca devolve menos que uma parcela, mesmo com o campo em branco', () => {
    expect(dividirEmParcelas(50, 0)).toEqual([50])
    expect(dividirEmParcelas(50, 1)).toEqual([50])
    expect(dividirEmParcelas(50, -3)).toEqual([50])
  })

  it('trunca parcela fracionária em vez de arredondar para cima', () => {
    expect(dividirEmParcelas(90, 2.9)).toEqual([45, 45])
  })

  it('não volta a errar os casos em que a fórmula em float divergia do banco', () => {
    // A conta que vivia copiada no diálogo Parcelar era
    // `Math.trunc((valor / n) * 100) / 100`, e ela discorda do
    // `trunc(valor / n, 2)` que o Postgres faz em numeric sempre que a divisão
    // em float cai logo ABAIXO de um inteiro de centavos. Numa varredura de
    // R$ 0,01 a R$ 10.000,00 × 2..48 parcelas, 348.983 de 47 milhões de
    // combinações divergiam (~1 em 135). Estes são os casos flagrados a olho —
    // 100.02/3 é 33.339999999999996 em float, e a tela prometia 33,33 enquanto
    // o banco gravava 33,34 em TODAS as parcelas.
    const antigo = (v: number, n: number) => Math.trunc((v / n) * 100) / 100
    for (const [valor, n, esperado] of [
      [50.01, 3, 16.67],
      [100.02, 3, 33.34],
      [100.11, 3, 33.37],
      [50.15, 5, 10.03],
      [100.3, 10, 10.03],
      [50.16, 11, 4.56],
      [100.44, 12, 8.37],
    ] as const) {
      // A última parcela é a que não recebe o resto — é o "de X" que a tela
      // anuncia, e o número que o banco escreve nas demais linhas.
      const p = dividirEmParcelas(valor, n)
      expect(p[n - 1]).toBe(esperado)
      expect(soma(p)).toBe(valor)
      // E o registro de que a fórmula antiga realmente errava este caso: se
      // algum dia ela parar de errar, este teste vira ruído e pode sair.
      expect(antigo(valor, n)).not.toBe(esperado)
    }
  })

  it('fecha exato para uma bateria de valores e divisores', () => {
    for (let centavos = 1; centavos <= 400; centavos++) {
      for (const n of [2, 3, 4, 5, 6, 7, 11, 12, 13, 24, 48]) {
        const valor = centavos / 100
        const p = dividirEmParcelas(valor, n)
        expect(p).toHaveLength(n)
        expect(soma(p)).toBe(valor)
        // Nenhuma parcela pode passar da primeira: o resto é dela.
        expect(Math.max(...p)).toBe(p[0])
      }
    }
  })
})

describe('cronogramaDeParcelas', () => {
  it('a primeira parcela vence no dia informado e as outras somam dias corridos', () => {
    const c = cronogramaDeParcelas(216, 3, INTERVALO_PADRAO_DIAS, '2026-08-17')
    expect(c).toEqual([
      { numero: 1, valor: 72, venceEm: '2026-08-17' },
      { numero: 2, valor: 72, venceEm: '2026-09-16' },
      { numero: 3, valor: 72, venceEm: '2026-10-16' },
    ])
  })

  it('30 dias corridos NÃO é "todo dia 7" — a terceira parcela denuncia', () => {
    // O caso real do painel do dono: LC-00015 vence 07/09 e a 3ª parcela cai
    // em 06/11, não 07/11. A tela mostra a data, não a palavra "mensal".
    const c = cronogramaDeParcelas(660, 3, 30, '2026-09-07')
    expect(c.map((p) => p.venceEm)).toEqual(['2026-09-07', '2026-10-07', '2026-11-06'])
  })

  it('atravessa a virada de ano sem escorregar', () => {
    const c = cronogramaDeParcelas(300, 3, 30, '2026-12-15')
    expect(c.map((p) => p.venceEm)).toEqual(['2026-12-15', '2027-01-14', '2027-02-13'])
  })

  it('respeita um intervalo diferente do padrão', () => {
    const c = cronogramaDeParcelas(100, 2, 15, '2026-08-17')
    expect(c.map((p) => p.venceEm)).toEqual(['2026-08-17', '2026-09-01'])
  })

  it('intervalo zero ou negativo vira um dia, para as parcelas não vencerem todas juntas', () => {
    const c = cronogramaDeParcelas(100, 3, 0, '2026-08-17')
    expect(c.map((p) => p.venceEm)).toEqual(['2026-08-17', '2026-08-18', '2026-08-19'])
  })

  it('a soma do cronograma fecha com o valor da venda', () => {
    const c = cronogramaDeParcelas(1234.57, 12, 30, '2026-03-01')
    expect(soma(c.map((p) => p.valor))).toBe(1234.57)
  })
})

describe('parcelasValidas', () => {
  it('mantém a mesma faixa 2..48 do diálogo Parcelar, para as duas telas não discordarem', () => {
    expect(parcelasValidas(1)).toBe(MIN_PARCELAS)
    expect(parcelasValidas(0)).toBe(MIN_PARCELAS)
    expect(parcelasValidas(3)).toBe(3)
    expect(parcelasValidas(48)).toBe(48)
    expect(parcelasValidas(120)).toBe(MAX_PARCELAS)
  })

  it('campo em branco (NaN) cai no mínimo em vez de virar NaN parcelas', () => {
    expect(parcelasValidas(Number.NaN)).toBe(MIN_PARCELAS)
  })
})
