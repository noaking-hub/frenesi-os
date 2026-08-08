import { describe, expect, it } from 'vitest'

import {
  PARAMETROS_PADRAO,
  analisarMercado,
  avaliarKit,
  margemDe,
  calcularPreco,
  pisoMargem,
  resumirKits,
} from '..'
import type { Kit, PerfumeBase } from '..'

const base = (p: Partial<PerfumeBase>): PerfumeBase => ({
  id: 'bac',
  nome: 'Baccarat Rouge 540',
  marca: 'Maison Francis',
  custoPorMl: 3.1,
  volumeMl: 640,
  consumoDiarioMl: 51,
  ...p,
})

describe('análise de mercado', () => {
  it('recomenda baixar quando dá para competir mantendo o piso', () => {
    // Sauvage: custo 2,60/ml. Menor concorrente 56,90; nosso 54,90? Não —
    // nosso acima do alvo: 60. Alvo = 55,90 (56,90 − 0,10 → ceil−0,10).
    const a = analisarMercado(base({ id: 'sau', custoPorMl: 2.6 }), 5, [56.9, 59.9, 58.0], 60, PARAMETROS_PADRAO)
    expect(a.recomendacao).toBe('baixar')
    expect(a.precoRecomendado).toBeLessThan(56.9)
    // A margem no preço recomendado nunca fura o piso.
    const custoProduto = calcularPreco(2.6, 5, PARAMETROS_PADRAO).custoProduto
    expect(margemDe(a.precoRecomendado, custoProduto, PARAMETROS_PADRAO)).toBeGreaterThanOrEqual(
      pisoMargem(PARAMETROS_PADRAO),
    )
  })

  it('mantém o ideal quando acompanhar o menor fura o piso', () => {
    // Custo alto e mercado muito barato: competir destruiria a margem.
    const a = analisarMercado(base({ custoPorMl: 4.4 }), 5, [39.9, 42.0], 94.9, PARAMETROS_PADRAO)
    expect(a.podeCompetir).toBe(false)
    expect(a.recomendacao).toBe('manter-ideal')
    expect(a.precoRecomendado).toBe(a.ideal)
    expect(a.frase).toContain('não cobre a margem mínima')
  })

  it('recomenda subir quando vendemos abaixo do ideal', () => {
    // Delina a 62,90 com ideal bem acima e mercado acima de nós.
    const a = analisarMercado(base({ id: 'del', custoPorMl: 3.8 }), 5, [74.9, 79.9, 76.0], 62.9, PARAMETROS_PADRAO)
    expect(a.posicao).toBe('menor-preco')
    expect(a.abaixoIdeal).toBe(true)
    expect(a.recomendacao).toBe('subir')
    expect(a.precoRecomendado).toBe(a.ideal)
  })

  it('não mexe em preço saudável', () => {
    const params = PARAMETROS_PADRAO
    const b = base({ id: 'sau', custoPorMl: 2.6 })
    const ideal = calcularPreco(2.6, 5, params).sugerido
    // Nosso já abaixo do alvo competitivo e no ideal ou acima.
    const a = analisarMercado(b, 5, [70.0, 75.0], ideal, params)
    expect(a.recomendacao).toBe('saudavel')
    expect(a.precoRecomendado).toBe(ideal)
  })

  it('classifica a posição contra o mercado', () => {
    const b = base({ id: 'sau', custoPorMl: 2.6 })
    expect(analisarMercado(b, 5, [50, 55], 60, PARAMETROS_PADRAO).posicao).toBe('acima')
    expect(analisarMercado(b, 5, [50, 55], 45, PARAMETROS_PADRAO).posicao).toBe('menor-preco')
    expect(analisarMercado(b, 5, [50, 55], 52, PARAMETROS_PADRAO).posicao).toBe('na-media')
  })

  it('desce um real quando dez centavos não bastam para ficar abaixo do menor', () => {
    // Menor = 55,90: 55,80 → ceil−0,10 = 55,90, igual ao menor → desce para 54,90.
    const a = analisarMercado(base({ id: 'sau', custoPorMl: 2.6 }), 5, [55.9, 59.9], 60, PARAMETROS_PADRAO)
    expect(a.alvoCompetitivo).toBeLessThan(55.9)
    expect(a.alvoCompetitivo).toBeCloseTo(54.9, 5)
  })
})

describe('kits', () => {
  const bases: PerfumeBase[] = [
    base({ id: 'bac', volumeMl: 640 }),
    base({ id: 'ave', nome: 'Aventus', volumeMl: 410 }),
    base({ id: 'oud', nome: 'Oud Wood', volumeMl: 0 }),
  ]

  const kit = (p: Partial<Kit>): Kit => ({
    id: 'k1',
    nome: 'Kit teste',
    tag: 'Entrada',
    itens: [
      { baseId: 'bac', label: 'Baccarat 3 ml' },
      { baseId: 'ave', label: 'Aventus 3 ml' },
    ],
    preco: 118.9,
    custoProdutos: 41.2,
    vendas30: 42,
    ...p,
  })

  it('bloqueia kit com qualquer base esgotada e diz qual', () => {
    const k = avaliarKit(
      kit({ itens: [{ baseId: 'bac', label: 'Baccarat 3 ml' }, { baseId: 'oud', label: 'Oud Wood 3 ml' }] }),
      bases,
      PARAMETROS_PADRAO,
    )
    expect(k.disponivel).toBe(false)
    expect(k.basesEsgotadas).toEqual(['Oud Wood'])
  })

  it('item sem base (estojo) não bloqueia', () => {
    const k = avaliarKit(
      kit({ itens: [{ baseId: 'bac', label: 'Baccarat 10 ml' }, { baseId: null, label: 'Estojo rígido' }] }),
      bases,
      PARAMETROS_PADRAO,
    )
    expect(k.disponivel).toBe(true)
  })

  it('calcula a margem do kit pela mesma fórmula das variantes', () => {
    const k = avaliarKit(kit({}), bases, PARAMETROS_PADRAO)
    expect(k.margem).toBeCloseTo(margemDe(118.9, 41.2, PARAMETROS_PADRAO), 10)
  })

  it('pondera a margem média pela receita de cada kit', () => {
    const barato = avaliarKit(kit({ id: 'a', preco: 100, custoProdutos: 30, vendas30: 1 }), bases, PARAMETROS_PADRAO)
    const caro = avaliarKit(kit({ id: 'b', preco: 300, custoProdutos: 80, vendas30: 10 }), bases, PARAMETROS_PADRAO)
    const r = resumirKits([barato, caro])
    // O kit caro vende 30× mais receita: a média fica perto da margem dele.
    expect(Math.abs(r.margemMedia - caro.margem)).toBeLessThan(Math.abs(r.margemMedia - barato.margem))
    expect(r.vendas30).toBe(11)
    expect(r.receita30).toBe(100 + 3000)
    expect(r.ticketMedio).toBeCloseTo(3100 / 11, 5)
  })
})
