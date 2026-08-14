import { describe, expect, it } from 'vitest'

import { PARAMETROS_PADRAO } from '../precificacao'
import { avaliarProduto, capacidadeTeorica } from '../produtos'
import type { PerfumeBase, ProdutoDerivado } from '../types'

/**
 * O escopo do módulo é explícito: as variantes bebem do mesmo saldo, as
 * capacidades por volumetria são cenários alternativos e NUNCA se somam, e
 * cada dimensão (estoque, custo, precificação, integração) tem estado
 * próprio. Estes testes prendem exatamente essas regras.
 */

const base = (extra: Partial<PerfumeBase> = {}): PerfumeBase => ({
  id: 'b1',
  nome: 'Teste EDP',
  marca: 'Marca',
  custoPorMl: 4,
  volumeMl: 100,
  consumoDiarioMl: 5,
  sobControle: true,
  shopifyProductId: 'gid://shopify/Product/1',
  ...extra,
})

const derivado = (extra: Partial<ProdutoDerivado> = {}): ProdutoDerivado => ({
  baseId: 'b1',
  variante: 5,
  envasadas: 0,
  reservadas: 0,
  precoPraticado: 43.9,
  sku: 'T-05',
  shopifyVariantId: 'gid://shopify/ProductVariant/5',
  ...extra,
})

describe('capacidadeTeorica', () => {
  it('são cenários sobre o mesmo saldo, nunca uma soma', () => {
    expect(capacidadeTeorica(100, 3)).toBe(33)
    expect(capacidadeTeorica(100, 5)).toBe(20)
    expect(capacidadeTeorica(100, 8)).toBe(12)
    expect(capacidadeTeorica(100, 10)).toBe(10)
    expect(capacidadeTeorica(100, 15)).toBe(6)
  })
  it('saldo zerado não fraciona nada', () => {
    expect(capacidadeTeorica(0, 5)).toBe(0)
  })
})

describe('avaliarProduto — estoque', () => {
  it('disponível = físico − reservado, e a reserva é variante × unidades', () => {
    const a = avaliarProduto(
      base(),
      [derivado({ reservadas: 4 }), derivado({ variante: 10, reservadas: 1, sku: 'T-10' })],
      PARAMETROS_PADRAO,
    )
    // 4 × 5 ml + 1 × 10 ml = 30 ml reservados sobre 100 ml físicos.
    expect(a.reservadoMl).toBe(30)
    expect(a.disponivelMl).toBe(70)
    // A capacidade usa o DISPONÍVEL: 70 / 5 = 14, não 20.
    expect(a.variantes.find((v) => v.variante === 5)?.capacidade).toBe(14)
  })

  it('cobertura conta sobre o disponível e classifica estoque baixo', () => {
    const a = avaliarProduto(base({ volumeMl: 100, consumoDiarioMl: 10 }), [], PARAMETROS_PADRAO)
    expect(a.coberturaDias).toBe(10)
    expect(a.estadoEstoque).toBe('baixo')
  })

  it('fora do controle não é o mesmo que esgotado', () => {
    expect(
      avaliarProduto(base({ volumeMl: 0, sobControle: false }), [], PARAMETROS_PADRAO)
        .estadoEstoque,
    ).toBe('sem-carga')
    expect(
      avaliarProduto(base({ volumeMl: 0, sobControle: true }), [], PARAMETROS_PADRAO)
        .estadoEstoque,
    ).toBe('sem-estoque')
  })
})

describe('avaliarProduto — custo, margem e integração', () => {
  it('sem custo não inventa margem e avisa em erro', () => {
    const a = avaliarProduto(base({ custoPorMl: 0 }), [derivado()], PARAMETROS_PADRAO)
    expect(a.faixaMargem).toBeNull()
    expect(a.alertas.some((x) => x.grau === 'erro' && /sem custo/i.test(x.texto))).toBe(true)
  })

  it('faixa de preço vem só das variantes com preço', () => {
    const a = avaliarProduto(
      base(),
      [derivado({ precoPraticado: 30.9, variante: 3 }), derivado({ variante: 15, precoPraticado: 108.9, sku: 'T-15' })],
      PARAMETROS_PADRAO,
    )
    expect(a.faixaPreco).toEqual({ min: 30.9, max: 108.9 })
  })

  it('produto sem vínculo Shopify é sem-vinculo; variante vendável sem ID é parcial', () => {
    expect(
      avaliarProduto(base({ shopifyProductId: null }), [derivado()], PARAMETROS_PADRAO).integracao,
    ).toBe('sem-vinculo')
    expect(
      avaliarProduto(base(), [derivado({ shopifyVariantId: null })], PARAMETROS_PADRAO).integracao,
    ).toBe('parcial')
    expect(avaliarProduto(base(), [derivado()], PARAMETROS_PADRAO).integracao).toBe('sincronizado')
  })

  it('variante sem preço não vira pendência de integração', () => {
    // Sem preço = decisão comercial de não vender a volumetria.
    const a = avaliarProduto(
      base(),
      [derivado(), derivado({ variante: 3, precoPraticado: 0, shopifyVariantId: null, sku: null })],
      PARAMETROS_PADRAO,
    )
    expect(a.integracao).toBe('sincronizado')
  })

  it('preço abaixo do piso grita em erro', () => {
    const a = avaliarProduto(base(), [derivado({ precoPraticado: 5 })], PARAMETROS_PADRAO)
    expect(a.variantes.find((v) => v.variante === 5)?.abaixoDoPiso).toBe(true)
    expect(a.alertas.some((x) => x.grau === 'erro' && /piso/i.test(x.texto))).toBe(true)
  })
})
