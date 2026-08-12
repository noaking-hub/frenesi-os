import { describe, expect, it } from 'vitest'

import { saldoDoExtrato } from '..'

/**
 * O saldo sai do EXTRATO porque o endpoint /balance da Yampi responde 404
 * nesta loja. Os movimentos abaixo são recortes reais da resposta que o
 * diagnóstico trouxe da conta — o teste existe para a regra não regredir.
 */
describe('saldo de cashback a partir do extrato', () => {
  const hoje = new Date('2026-08-12T00:00:00Z')
  const credito = {
    transaction_type: 'credit',
    amount: 21.15,
    used_amount: 0,
    accumulated_amount: 21.15,
    status: 'approved',
    cancelled_at: null,
    expires_at: '2026-10-11',
    expired: null,
  }

  it('soma o crédito aprovado e ainda dentro da validade', () => {
    expect(saldoDoExtrato([credito], hoje)).toBe(21.15)
  })

  it('desconta o que já foi usado do próprio crédito', () => {
    expect(saldoDoExtrato([{ ...credito, used_amount: 6.15 }], hoje)).toBe(15)
  })

  it('ignora crédito cancelado, expirado, vencido ou não aprovado', () => {
    expect(saldoDoExtrato([{ ...credito, cancelled_at: '2026-08-01' }], hoje)).toBe(0)
    expect(saldoDoExtrato([{ ...credito, expired: true }], hoje)).toBe(0)
    expect(saldoDoExtrato([{ ...credito, expires_at: '2026-08-11' }], hoje)).toBe(0)
    expect(saldoDoExtrato([{ ...credito, status: 'pending' }], hoje)).toBe(0)
  })

  it('não subtrai o débito duas vezes — o gasto já está em used_amount', () => {
    const movimentos = [
      { ...credito, used_amount: 21.15 },
      { transaction_type: 'debit', amount: 21.15, status: 'approved' },
    ]
    expect(saldoDoExtrato(movimentos, hoje)).toBe(0)
  })

  it('carteira sem movimento nenhum vale zero', () => {
    expect(saldoDoExtrato([], hoje)).toBe(0)
  })
})
