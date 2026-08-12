import { describe, expect, it } from 'vitest'

import {
  diasAteVencer,
  janelaDoPeriodo,
  metricasCashback,
  naFaixa,
  saldoDoExtrato,
  type CarteiraCashback,
  type MovimentoGravado,
} from '..'

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

describe('vencimento do cashback', () => {
  const hoje = new Date('2026-08-12T15:00:00Z')
  const carteira = (expiraEm: string | null): CarteiraCashback => ({
    customerId: '1',
    nome: 'Renato Morais',
    email: 'renato@exemplo.com',
    telefone: null,
    saldo: 116.99,
    expiraEm,
    ultimaCompra: null,
    avisoEm: null,
  })

  it('conta os dias que faltam, sem se perder no fuso', () => {
    expect(diasAteVencer('2026-08-12', hoje)).toBe(0)
    expect(diasAteVencer('2026-08-26', hoje)).toBe(14)
    expect(diasAteVencer('2026-08-01', hoje)).toBe(-11)
    expect(diasAteVencer(null, hoje)).toBeNull()
  })

  it('separa as faixas que a operação persegue', () => {
    expect(naFaixa(carteira('2026-08-15'), '7', hoje)).toBe(true)
    expect(naFaixa(carteira('2026-08-30'), '7', hoje)).toBe(false)
    expect(naFaixa(carteira('2026-08-30'), '30', hoje)).toBe(true)
    expect(naFaixa(carteira('2026-08-01'), 'expirados', hoje)).toBe(true)
    // Já vencido não pode aparecer em "vence em 7 dias".
    expect(naFaixa(carteira('2026-08-01'), '7', hoje)).toBe(false)
    expect(naFaixa(carteira(null), 'todos', hoje)).toBe(true)
  })

  it('o mês atual começa no dia 1º e termina no fim de hoje', () => {
    const { de, ate } = janelaDoPeriodo('mes', hoje)
    expect(de).toBe('2026-08-01T00:00:00.000Z')
    expect(ate).toBe('2026-08-13T00:00:00.000Z')
  })

  it('ontem é um dia fechado, sem invadir hoje', () => {
    const { de, ate } = janelaDoPeriodo('ontem', hoje)
    expect(de).toBe('2026-08-11T00:00:00.000Z')
    expect(ate).toBe('2026-08-12T00:00:00.000Z')
  })
})

describe('métricas do período', () => {
  const hoje = new Date('2026-08-12T15:00:00Z')
  const movimento = (over: Partial<MovimentoGravado>): MovimentoGravado => ({
    id: '1',
    customerId: '10',
    tipo: 'credit',
    valor: 20,
    usado: 0,
    pedido: '1510190001',
    criadoEm: '2026-08-02T12:00:00.000Z',
    expiraEm: '2026-10-01',
    vale: true,
    ...over,
  })

  it('soma o gerado, o usado e conta os pedidos sem duplicar', () => {
    const m = metricasCashback(
      [
        movimento({ id: '1', valor: 20, usado: 5, pedido: '1510190001' }),
        movimento({ id: '2', valor: 30, usado: 0, pedido: '1510190002' }),
        // Segundo crédito do MESMO pedido: soma no valor, não no número de pedidos.
        movimento({ id: '3', valor: 10, usado: 0, pedido: '1510190002' }),
      ],
      [
        { id: '1510190001', valor: 200 },
        { id: '1510190002', valor: 300 },
        { id: '1510190003', valor: 100 },
      ],
      hoje,
    )
    expect(m.gerado).toBe(60)
    expect(m.utilizado).toBe(5)
    expect(m.pedidosComCashback).toBe(2)
    expect(m.percentualPedidos).toBe(67)
    expect(m.receita).toBe(500)
  })

  it('período sem pedido nenhum não divide por zero', () => {
    const m = metricasCashback([], [], hoje)
    expect(m.percentualPedidos).toBe(0)
    expect(m.tempoMedioDeUso).toBeNull()
  })

  it('tempo médio de uso só conta crédito que foi usado', () => {
    const m = metricasCashback(
      [
        movimento({ id: '1', usado: 0, criadoEm: '2026-07-13T12:00:00.000Z' }),
        movimento({ id: '2', usado: 8, criadoEm: '2026-08-02T15:00:00.000Z' }),
      ],
      [],
      hoje,
    )
    expect(m.tempoMedioDeUso).toBe(10)
  })
})
