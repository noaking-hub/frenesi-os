import { describe, expect, it } from 'vitest'

import { custoDeReceber, desproporcao } from '..'
import type { CustoPorMeio } from '..'

describe('custo real de receber', () => {
  // Recorte real de 30 dias: o Pix domina o faturamento, o 6x domina a tarifa.
  const MEIOS: CustoPorMeio[] = [
    { meio: 'Pix', vendas: 124, bruto: 27274.81, tarifa: 131.17, pct: 0.48, fatia: 69.2 },
    { meio: 'Cartão de crédito 6x', vendas: 25, bruto: 5877.48, tarifa: 878.12, pct: 14.94, fatia: 14.9 },
    { meio: 'Saldo Mercado Pago', vendas: 18, bruto: 1638.44, tarifa: 28.84, pct: 1.76, fatia: 4.2 },
    { meio: 'Cartão de crédito 3x', vendas: 5, bruto: 876.63, tarifa: 84.14, pct: 9.6, fatia: 2.2 },
  ]

  it('pondera pelo valor, não pela quantidade de vendas', () => {
    // Pela contagem o Pix seria 72% das vendas e o custo pareceria ~1%.
    // Pelo valor, o 6x pesa o que pesa.
    const r = custoDeReceber(MEIOS)
    expect(r.pct).toBeCloseTo(3.14, 1)
    expect(r.bruto).toBeCloseTo(35667.36, 2)
  })

  it('aponta o meio mais caro e o mais barato com peso relevante', () => {
    const r = custoDeReceber(MEIOS)
    expect(r.maisCaro?.meio).toBe('Cartão de crédito 6x')
    expect(r.maisBarato?.meio).toBe('Pix')
  })

  it('ignora meio de fatia irrelevante ao eleger o mais caro', () => {
    // Dois pagamentos num meio caríssimo não podem virar "o meio mais caro"
    // da operação: eles não movem o resultado do mês.
    const r = custoDeReceber([
      ...MEIOS,
      { meio: 'Boleto exótico', vendas: 2, bruto: 90, tarifa: 40, pct: 44.4, fatia: 0.2 },
    ])
    expect(r.maisCaro?.meio).toBe('Cartão de crédito 6x')
  })

  it('mede quanto da tarifa cada meio consome', () => {
    const r = custoDeReceber(MEIOS)
    const seisVezes = MEIOS[1]
    // 15% do faturamento consumindo 79% da tarifa: é isso que sustenta a
    // decisão sobre manter o parcelamento sem juros.
    expect(desproporcao(seisVezes, r)).toBeCloseTo(78.5, 0)
    expect(desproporcao(MEIOS[0], r)).toBeCloseTo(11.7, 0)
  })

  it('não divide por zero quando não houve venda', () => {
    const r = custoDeReceber([])
    expect(r.pct).toBe(0)
    expect(r.maisCaro).toBeNull()
  })
})
