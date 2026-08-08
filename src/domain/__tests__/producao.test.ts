import { describe, expect, it } from 'vitest'

import { PARAMETROS_PADRAO, resumirOrdens, simularOrdem } from '..'
import type { OrdemProducao, PerfumeBase } from '..'

const base = (volumeMl: number): PerfumeBase => ({
  id: 'bac',
  nome: 'Baccarat Rouge 540',
  marca: 'Maison Francis',
  custoPorMl: 3.1,
  volumeMl,
  consumoDiarioMl: 51,
})

describe('simulação de ordem de produção', () => {
  it('embute a perda técnica no consumo', () => {
    const s = simularOrdem(base(640), 5, 24, PARAMETROS_PADRAO)
    expect(s.liquidoMl).toBe(120)
    // 24 × 5 × 1,03
    expect(s.consumoMl).toBeCloseTo(123.6, 5)
    expect(s.restanteMl).toBeCloseTo(516.4, 5)
    expect(s.insuficiente).toBe(false)
  })

  it('bloqueia quando o volume não sustenta a quantidade', () => {
    // Delina tem 90 ml: 15 un de 8 ml pedem 123,6 ml.
    const s = simularOrdem({ ...base(90), nome: 'Delina' }, 8, 15, PARAMETROS_PADRAO)
    expect(s.insuficiente).toBe(true)
    expect(s.restanteMl).toBeLessThan(0)
    // O máximo considera a perda: floor(90 / (8 × 1,03)) = 10.
    expect(s.maximoUnidades).toBe(10)
    expect(s.mensagem).toContain('no máximo 10 unidades')
  })

  it('o máximo informado cabe de fato no estoque', () => {
    const b = base(90)
    const s = simularOrdem(b, 8, 15, PARAMETROS_PADRAO)
    const cabe = simularOrdem(b, 8, s.maximoUnidades, PARAMETROS_PADRAO)
    const naoCabe = simularOrdem(b, 8, s.maximoUnidades + 1, PARAMETROS_PADRAO)
    expect(cabe.insuficiente).toBe(false)
    expect(naoCabe.insuficiente).toBe(true)
  })

  it('base zerada não permite nenhuma unidade', () => {
    const s = simularOrdem({ ...base(0), nome: 'Oud Wood' }, 5, 1, PARAMETROS_PADRAO)
    expect(s.insuficiente).toBe(true)
    expect(s.maximoUnidades).toBe(0)
  })

  it('pede a quantidade quando ela é zero, sem acusar insuficiência', () => {
    const s = simularOrdem(base(640), 5, 0, PARAMETROS_PADRAO)
    expect(s.insuficiente).toBe(false)
    expect(s.mensagem).toBe('Informe a quantidade a produzir.')
  })
})

describe('resumo de ordens', () => {
  const ordem = (p: Partial<OrdemProducao>): OrdemProducao => ({
    id: 'OP-1',
    baseId: 'bac',
    perfume: 'Baccarat Rouge 540',
    marca: 'Maison Francis',
    variante: 5,
    quantidade: 10,
    volumeMl: 51.5,
    status: 'Em envase',
    responsavel: 'Pedro A.',
    prazo: 'hoje',
    motivo: 'Pedidos da semana',
    ...p,
  })

  it('não soma volume de ordem bloqueada no envase', () => {
    const r = resumirOrdens([
      ordem({ id: 'A', status: 'Em envase', volumeMl: 100 }),
      ordem({ id: 'B', status: 'Bloqueada', volumeMl: 200 }),
      ordem({ id: 'C', status: 'Aguardando conferência', volumeMl: 50 }),
      ordem({ id: 'D', status: 'Concluída', volumeMl: 300 }),
    ])
    expect(r.abertas).toBe(3)
    expect(r.bloqueadas).toBe(1)
    // Bloqueada ainda não consome; concluída já consumiu.
    expect(r.volumeEmEnvaseMl).toBe(150)
  })

  it('conta unidades a produzir só nas abertas', () => {
    const r = resumirOrdens([
      ordem({ id: 'A', status: 'Em envase', quantidade: 24 }),
      ordem({ id: 'B', status: 'Bloqueada', quantidade: 12 }),
      ordem({ id: 'C', status: 'Concluída', quantidade: 40 }),
    ])
    expect(r.unidadesAProduzir).toBe(36)
  })
})
