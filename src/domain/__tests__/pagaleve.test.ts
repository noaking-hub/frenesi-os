import { describe, expect, it } from 'vitest'

import {
  aReceberEm,
  cronogramaDaVenda,
  jaCreditado,
  modalidadeDe,
  parcelasDaVenda,
  vencidoSemCredito,
  type VendaParcelada,
} from '../pagaleve'

/** Duas vendas reais, com os números que a API da Pagaleve devolveu. */
const QUATRO_PARCELAS: VendaParcelada = {
  bruto: 206.0,
  liquidoDaParcela: 47.9,
  tarifaDaParcela: 3.6,
  compradaEm: '2026-08-08',
}
const TRES_PARCELAS: VendaParcelada = {
  bruto: 168.18,
  liquidoDaParcela: 53.81,
  tarifaDaParcela: 2.25,
  compradaEm: '2026-08-14',
}

describe('parcelasDaVenda', () => {
  it('deduz o número de parcelas das duas vendas reais', () => {
    // 206,00 ÷ (47,90 + 3,60) = 4 · 168,18 ÷ (53,81 + 2,25) = 3
    expect(parcelasDaVenda(QUATRO_PARCELAS)).toBe(4)
    expect(parcelasDaVenda(TRES_PARCELAS)).toBe(3)
  })

  it('aceita o arredondamento de centavo da Pagaleve', () => {
    // 62,07 ÷ (14,44 + 1,10) = 3,994 — é 4, com centavo de sobra na divisão.
    expect(
      parcelasDaVenda({
        bruto: 62.07,
        liquidoDaParcela: 14.44,
        tarifaDaParcela: 1.1,
        compradaEm: '2026-08-03',
      }),
    ).toBe(4)
  })

  it('recusa quando a divisão não cai perto de inteiro', () => {
    // Palpite aqui nasceria com cara de certo e erraria o cronograma inteiro.
    expect(
      parcelasDaVenda({ bruto: 100, liquidoDaParcela: 27, tarifaDaParcela: 1, compradaEm: '2026-08-01' }),
    ).toBeNull()
  })

  it('recusa valores impossíveis em vez de dividir por zero', () => {
    expect(parcelasDaVenda({ ...QUATRO_PARCELAS, bruto: 0 })).toBeNull()
    expect(parcelasDaVenda({ ...QUATRO_PARCELAS, liquidoDaParcela: 0, tarifaDaParcela: 0 })).toBeNull()
  })

  it('recusa mais parcelas do que a Pagaleve oferece', () => {
    expect(
      parcelasDaVenda({ bruto: 600, liquidoDaParcela: 10, tarifaDaParcela: 0, compradaEm: '2026-08-01' }),
    ).toBeNull()
  })
})

describe('cronogramaDaVenda', () => {
  it('quinzenal: primeira em dois dias, depois de quinze em quinze', () => {
    // O relatório da Pagaleve mostrou que a primeira parcela NÃO cai no ato:
    // ela liquida o Pix e só então repassa, de um a três dias depois.
    const c = cronogramaDaVenda(QUATRO_PARCELAS)
    expect(c.map((p) => p.previstaPara)).toEqual([
      '2026-08-10',
      '2026-08-25',
      '2026-09-09',
      '2026-09-24',
    ])
  })

  it('mensal usa trinta dias, não quinze', () => {
    // As duas modalidades existem no relatório: 88 parcelas quinzenais e 21
    // mensais. Tratar tudo como quinzenal antecipava caixa em um mês.
    const c = cronogramaDaVenda({ ...TRES_PARCELAS, modalidade: 'mensal' })
    expect(c.map((p) => p.previstaPara)).toEqual(['2026-08-16', '2026-09-15', '2026-10-15'])
  })

  it('sem modalidade conhecida, assume quinzenal, que é o caso comum', () => {
    const c = cronogramaDaVenda(TRES_PARCELAS)
    expect(c[1].previstaPara).toBe('2026-08-31')
  })

  it('toda data calculada se declara estimada', () => {
    // A data informada pela Pagaleve acertou 44 de 53 créditos. A minha é
    // aproximação, e a tela precisa poder dizer qual das duas está olhando.
    expect(cronogramaDaVenda(QUATRO_PARCELAS).every((p) => p.origemDaData === 'estimada')).toBe(true)
  })

  it('a última parcela fecha a soma com o bruto da venda', () => {
    // Sem isso sobraria ou faltaria centavo no fim, e o "a receber" nunca
    // bateria com o valor da venda.
    for (const venda of [QUATRO_PARCELAS, TRES_PARCELAS]) {
      const c = cronogramaDaVenda(venda)
      const soma = c.reduce((a, p) => a + p.bruto, 0)
      expect(Math.round(soma * 100) / 100).toBe(venda.bruto)
    }
  })

  it('numera as parcelas e diz de quantas são', () => {
    const c = cronogramaDaVenda(TRES_PARCELAS)
    expect(c.map((p) => `${p.numero}/${p.de}`)).toEqual(['1/3', '2/3', '3/3'])
  })

  it('o líquido de cada parcela desconta a tarifa dela', () => {
    const c = cronogramaDaVenda(QUATRO_PARCELAS)
    expect(c[0].liquido).toBe(47.9)
    expect(c[0].bruto).toBe(51.5)
    expect(c[0].tarifa).toBe(3.6)
  })

  it('venda que não se deduz não gera cronograma inventado', () => {
    expect(
      cronogramaDaVenda({ bruto: 100, liquidoDaParcela: 27, tarifaDaParcela: 1, compradaEm: '2026-08-01' }),
    ).toEqual([])
  })

  it('atravessa a virada de mês sem errar o dia', () => {
    const c = cronogramaDaVenda({ ...QUATRO_PARCELAS, compradaEm: '2026-08-25' })
    expect(c.map((p) => p.previstaPara)).toEqual([
      '2026-08-27',
      '2026-09-11',
      '2026-09-26',
      '2026-10-11',
    ])
  })
})

describe('a receber, vencido sem crédito e creditado', () => {
  it('separa o que ainda vem do que passou da data sem dinheiro', () => {
    const c = cronogramaDaVenda(QUATRO_PARCELAS)
    // Em 26/08 as duas primeiras venceram (10/08 e 25/08) e nenhuma foi paga.
    expect(vencidoSemCredito(c, '2026-08-26')).toBeCloseTo(95.8, 2)
    expect(aReceberEm(c, '2026-08-26')).toBeCloseTo(95.8, 2)
  })

  it('parcela vencida E creditada não é pendência, é história', () => {
    // A distinção decide o que aparece na fila: cobrar a Pagaleve por dinheiro
    // que ela já mandou é o tipo de alarme que ensina a ignorar a fila.
    const c = cronogramaDaVenda(QUATRO_PARCELAS)
    c[0].liquidadaEm = '2026-08-10'
    expect(vencidoSemCredito(c, '2026-08-26')).toBeCloseTo(47.9, 2)
    expect(jaCreditado(c)).toBeCloseTo(47.9, 2)
  })

  it('parcela creditada sai do a receber mesmo antes de vencer', () => {
    const c = cronogramaDaVenda(QUATRO_PARCELAS)
    const antes = aReceberEm(c, '2026-08-01')
    c[3].liquidadaEm = '2026-08-05'
    expect(aReceberEm(c, '2026-08-01')).toBeLessThan(antes)
  })

  it('antes da primeira data, nada venceu', () => {
    expect(vencidoSemCredito(cronogramaDaVenda(QUATRO_PARCELAS), '2026-08-01')).toBe(0)
  })
})

describe('modalidadeDe', () => {
  it('lê a modalidade como o relatório a escreve', () => {
    expect(modalidadeDe('Mensal')).toBe('mensal')
    expect(modalidadeDe('Quinzenal')).toBe('quinzenal')
  })

  it('desconhecido cai em quinzenal, que é o caso comum', () => {
    expect(modalidadeDe(null)).toBe('quinzenal')
    expect(modalidadeDe('sei la')).toBe('quinzenal')
  })
})
