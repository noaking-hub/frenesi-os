import { describe, expect, it } from 'vitest'

import { simularCompraDeBase, simularImpactoNoCaixa } from '../simulacoes'

describe('simular compra de base', () => {
  const base = {
    nome: '1 Million Elixir',
    disponivelMl: 45,
    diasDeCobertura: 5.5,
    custoPorMl: 2,
    comprarMl: 200,
  }

  it('parte da cobertura OFICIAL, sem recalcular consumo por outro caminho', () => {
    const r = simularCompraDeBase(base)
    if ('erro' in r) throw new Error(r.erro)
    // 45 ml / 5,5 dias = 8,18 ml/dia — o mesmo ritmo que a tela de Estoque mostra.
    expect(r.consumoDiarioMl).toBeCloseTo(8.18, 2)
    expect(r.coberturaHojeDias).toBe(5.5)
  })

  it('projeta cobertura e custo depois da compra', () => {
    const r = simularCompraDeBase(base)
    if ('erro' in r) throw new Error(r.erro)
    expect(r.disponivelDepoisMl).toBe(245)
    expect(r.coberturaDepoisDias).toBeCloseTo(29.9, 1)
    expect(r.custoEstimado).toBe(400)
    expect(r.origemDoCusto).toBe('custo_medio_do_erp')
  })

  it('vem sempre marcado como cenário — a marca não depende da tela', () => {
    const r = simularCompraDeBase(base)
    if ('erro' in r) throw new Error(r.erro)
    expect(r.cenario).toBe(true)
  })

  it('o custo informado na compra vence o custo médio histórico', () => {
    const r = simularCompraDeBase({ ...base, custoPorMlDaCompra: 3 })
    if ('erro' in r) throw new Error(r.erro)
    expect(r.custoEstimado).toBe(600)
    expect(r.origemDoCusto).toBe('compra_informada')
  })

  it('recusa projetar cobertura quando não há consumo, em vez de inventar', () => {
    const r = simularCompraDeBase({ ...base, diasDeCobertura: null })
    expect('erro' in r).toBe(true)
  })

  it('recusa quantidade não positiva', () => {
    expect('erro' in simularCompraDeBase({ ...base, comprarMl: 0 })).toBe(true)
    expect('erro' in simularCompraDeBase({ ...base, comprarMl: -10 })).toBe(true)
  })

  it('avisa quando não há custo por ml, em vez de estimar zero', () => {
    const r = simularCompraDeBase({ ...base, custoPorMl: null })
    if ('erro' in r) throw new Error(r.erro)
    expect(r.custoEstimado).toBeNull()
    expect(r.origemDoCusto).toBe('desconhecido')
    expect(r.aviso).toMatch(/sem custo/i)
  })
})

describe('impacto no caixa', () => {
  it('decide pelo VALE do fluxo, não pelo saldo de hoje', () => {
    // Há R$ 10.000 hoje, mas o fluxo mergulha para R$ 300 antes de recuperar.
    const r = simularImpactoNoCaixa({
      caixaHoje: 10_000,
      menorSaldoProjetado: 300,
      menorSaldoEm: '2026-08-28',
      desembolso: 800,
    })
    expect(r.caixaDepois).toBe(9200)
    expect(r.cabeNoCaixa).toBe(false)
    expect(r.veredito).toContain('2026-08-28')
  })

  it('aprova quando o vale continua positivo', () => {
    const r = simularImpactoNoCaixa({
      caixaHoje: 10_000,
      menorSaldoProjetado: 5_000,
      menorSaldoEm: '2026-08-28',
      desembolso: 800,
    })
    expect(r.cabeNoCaixa).toBe(true)
    expect(r.menorSaldoDepois).toBe(4200)
  })

  it('é sempre cenário', () => {
    const r = simularImpactoNoCaixa({
      caixaHoje: 1,
      menorSaldoProjetado: 1,
      menorSaldoEm: null,
      desembolso: 1,
    })
    expect(r.cenario).toBe(true)
  })
})
