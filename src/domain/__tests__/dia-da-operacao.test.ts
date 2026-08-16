import { describe, expect, it } from 'vitest'

import { diaDaOperacao } from '../format'

/**
 * Esta função não tinha teste, e a falta custou um defeito em produção: uma
 * ferramenta do Gerente montou a própria versão dela, passou o campo de
 * EXIBIÇÃO do pedido em vez do ISO, e respondeu "Invalid time value" a uma
 * pergunta sobre as vendas do dia.
 */
describe('diaDaOperacao', () => {
  it('devolve o dia de um instante ISO', () => {
    expect(diaDaOperacao('2026-08-16T14:32:00.000Z')).toBe('2026-08-16')
  })

  it('usa o fuso de São Paulo, não o do servidor', () => {
    // 01:00 UTC do dia 17 ainda é 22h do dia 16 em São Paulo. Cortar os dez
    // primeiros caracteres do ISO jogaria a venda para o dia seguinte — foi
    // exatamente a divergência de faturamento contra a loja em 13/08.
    expect(diaDaOperacao('2026-08-17T01:00:00.000Z')).toBe('2026-08-16')
    expect(diaDaOperacao('2026-08-17T03:30:00.000Z')).toBe('2026-08-17')
  })

  it('data pura volta intacta — ela já é um dia, não um instante', () => {
    expect(diaDaOperacao('2026-08-16')).toBe('2026-08-16')
  })

  it('não estoura com entrada que não é data', () => {
    expect(() => diaDaOperacao('16/08 14:32')).not.toThrow()
  })
})
