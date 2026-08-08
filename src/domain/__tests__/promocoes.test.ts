import { describe, expect, it } from 'vitest'

import {
  PARAMETROS_PADRAO,
  RODIZIO_PADRAO,
  cupomDessincronizado,
  descontoMaximo,
  montarRodada,
  pisoMargem,
  resumirCupons,
} from '..'
import type { CupomPromo, ItemVitrine, PerfumeBase } from '..'

const base = (p: Partial<PerfumeBase>): PerfumeBase => ({
  id: 'sau',
  nome: 'Sauvage Elixir',
  marca: 'Dior',
  custoPorMl: 2.6,
  volumeMl: 1180,
  consumoDiarioMl: 30,
  ...p,
})

const cupom = (p: Partial<CupomPromo>): CupomPromo => ({
  codigo: 'TESTE10',
  tipo: '10% de desconto',
  regra: 'Qualquer pedido',
  usos: 10,
  limite: 100,
  receita: 1000,
  desconto: 100,
  margem: 20,
  status: 'Ativo',
  validade: 'até 31/08',
  shopify: 'Ativo',
  yampi: 'Ativo',
  ...p,
})

describe('cupons', () => {
  it('dessincronizado quando plataformas divergem, exceto encerrado', () => {
    expect(cupomDessincronizado(cupom({ shopify: 'Ativo', yampi: 'Pendente' }))).toBe(true)
    expect(cupomDessincronizado(cupom({ shopify: 'Ativo', yampi: 'Ativo' }))).toBe(false)
    expect(
      cupomDessincronizado(
        cupom({ status: 'Encerrado', shopify: 'Encerrado', yampi: 'Divergente' }),
      ),
    ).toBe(false)
  })

  it('resume só vigentes; margem média ponderada por receita', () => {
    const r = resumirCupons(
      [
        cupom({ codigo: 'A', receita: 1000, margem: 30, desconto: 100 }),
        cupom({ codigo: 'B', receita: 3000, margem: 10, desconto: 400 }),
        cupom({ codigo: 'C', status: 'Encerrado', receita: 99999, margem: 1, desconto: 9 }),
      ],
      PARAMETROS_PADRAO,
    )
    expect(r.vigentes).toHaveLength(2)
    expect(r.receita).toBe(4000)
    expect(r.desconto).toBe(500)
    // (30×1000 + 10×3000) / 4000 = 15
    expect(r.margemMedia).toBeCloseTo(15, 10)
    // Piso = 15: B com 10% está abaixo.
    expect(r.abaixoPiso).toBe(1)
  })
})

describe('rodízio de ofertas', () => {
  const bases = [
    base({}),
    base({ id: 'gg', nome: 'Good Girl', custoPorMl: 2.45, volumeMl: 340 }),
    base({ id: 'oud', nome: 'Oud Wood', custoPorMl: 4.4, volumeMl: 0 }),
    base({ id: 'del', nome: 'Delina', custoPorMl: 3.8, volumeMl: 90 }),
  ]

  const item = (p: Partial<ItemVitrine>): ItemVitrine => ({
    baseId: 'sau',
    variante: 5,
    preco: 54.9,
    vendas30: 71,
    diasParado: 0,
    ...p,
  })

  it('a mesma semente produz sempre a mesma rodada', () => {
    const vitrine = [
      item({ diasParado: 40, vendas30: 1, preco: 86.9 }),
      item({ diasParado: 20, vendas30: 3, preco: 74.9 }),
      item({ diasParado: 5, vendas30: 30, preco: 64.9 }),
      item({ baseId: 'gg', diasParado: 58, vendas30: 0, preco: 104.9, variante: 10 }),
    ]
    const a = montarRodada(vitrine, bases, PARAMETROS_PADRAO, RODIZIO_PADRAO, 7)
    const b = montarRodada(vitrine, bases, PARAMETROS_PADRAO, RODIZIO_PADRAO, 7)
    expect(a.selecao.map((s) => s.item.preco)).toEqual(b.selecao.map((s) => s.item.preco))
  })

  it('base esgotada fica de fora automaticamente', () => {
    const vitrine = [
      item({ baseId: 'oud', preco: 94.9, diasParado: 1 }),
      item({ diasParado: 10 }),
    ]
    const r = montarRodada(vitrine, bases, PARAMETROS_PADRAO, RODIZIO_PADRAO, 1)
    expect(r.selecao.every((s) => s.item.baseId !== 'oud')).toBe(true)
    // Esgotado não é "fora do piso" — nem chega a ser candidato.
    expect(r.foraDoPiso.every((f) => f.item.baseId !== 'oud')).toBe(true)
  })

  it('nenhum desconto da rodada fura o piso de margem', () => {
    const vitrine = [
      item({ diasParado: 60, preco: 54.9 }),
      item({ diasParado: 30, preco: 64.9 }),
      item({ baseId: 'gg', variante: 10, diasParado: 58, preco: 104.9 }),
    ]
    const r = montarRodada(vitrine, bases, PARAMETROS_PADRAO, RODIZIO_PADRAO, 3)
    for (const s of r.selecao) {
      expect(s.margem).toBeGreaterThanOrEqual(pisoMargem(PARAMETROS_PADRAO) - 1e-9)
    }
  })

  it('exclui do rodízio quem furaria o piso até no desconto mínimo', () => {
    // Preço quase no custo: qualquer desconto (até o mínimo de 8%) fura o piso.
    const apertado = item({ baseId: 'del', preco: 40, diasParado: 6 })
    const teto = descontoMaximo(apertado, bases[3], PARAMETROS_PADRAO, 22)
    expect(teto).toBeLessThan(RODIZIO_PADRAO.descontoMin)

    const r = montarRodada([apertado, item({ diasParado: 9 })], bases, PARAMETROS_PADRAO, RODIZIO_PADRAO, 1)
    expect(r.foraDoPiso.map((f) => f.item.baseId)).toContain('del')
    expect(r.selecao.every((s) => s.item.baseId !== 'del')).toBe(true)
  })

  it('campeão leva o desconto mínimo; encalhado escala até o máximo', () => {
    const vitrine = [
      item({ diasParado: 100, vendas30: 0, preco: 54.9 }),
      item({ diasParado: 0, vendas30: 71, preco: 64.9 }),
    ]
    const cfg = { ...RODIZIO_PADRAO, quantidade: 2, campeoes: 1 }
    const r = montarRodada(vitrine, bases, PARAMETROS_PADRAO, cfg, 5)
    const campeao = r.selecao.find((s) => s.tipo === 'campeao')
    const encalhado = r.selecao.find((s) => s.tipo === 'encalhado')
    expect(campeao?.pct).toBe(cfg.descontoMin)
    // O mais parado do pool recebe o desconto máximo (se o piso deixar).
    expect(encalhado?.pct).toBeGreaterThan(cfg.descontoMin)
  })

  it('vagas sem candidato quando a vitrine elegível é menor que a rodada', () => {
    const r = montarRodada([item({ diasParado: 12 })], bases, PARAMETROS_PADRAO, RODIZIO_PADRAO, 1)
    expect(r.selecao).toHaveLength(1)
    expect(r.vagasSemCandidato).toBe(RODIZIO_PADRAO.quantidade - 1)
  })
})
