import { describe, expect, it } from 'vitest'

import {
  PARAMETROS_PADRAO,
  calcularPreco,
  custoDeReceber,
  descontoPixPct,
  desproporcao,
  margemDe,
  taxasPct,
} from '..'
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

describe('desconto de Pix no preço', () => {
  const BASE = { ...PARAMETROS_PADRAO, descontoPixPct: 0, fatiaPixPct: 0 }

  it('pesa o desconto pela fatia que de fato usa o Pix', () => {
    // 10% de desconto num canal que é 3/4 das vendas custa 7,5 pontos do
    // preço de tabela. Descontar 10% cheio cobraria de quem paga no cartão.
    expect(descontoPixPct({ ...BASE, descontoPixPct: 10, fatiaPixPct: 74.9 })).toBe(7.49)
    expect(descontoPixPct({ ...BASE, descontoPixPct: 10, fatiaPixPct: 100 })).toBe(10)
    expect(descontoPixPct(BASE)).toBe(0)
  })

  it('entra nas taxas que formam o preço', () => {
    const com = { ...BASE, descontoPixPct: 10, fatiaPixPct: 74.9 }
    expect(taxasPct(com) - taxasPct(BASE)).toBeCloseTo(7.49, 2)
  })

  it('sobe o preço sugerido o bastante para o desconto caber', () => {
    // O ponto todo: o preço de tabela precisa aguentar o desconto e ainda
    // fechar a margem alvo. Sem isso, três em cada quatro vendas fecham
    // abaixo do que o ERP diz.
    const sem = calcularPreco(4.7, 5, BASE)
    const com = calcularPreco(4.7, 5, { ...BASE, descontoPixPct: 10, fatiaPixPct: 74.9 })
    expect(com.sugerido).toBeGreaterThan(sem.sugerido)
    // E a margem no preço novo continua batendo a alvo.
    expect(com.margem).toBeGreaterThanOrEqual(BASE.margemAlvo - 1)
  })

  it('a margem de um preço praticado cai quando o desconto é contado', () => {
    const com = { ...BASE, descontoPixPct: 10, fatiaPixPct: 74.9 }
    expect(margemDe(73.9, 24.44, com)).toBeLessThan(margemDe(73.9, 24.44, BASE))
  })
})
