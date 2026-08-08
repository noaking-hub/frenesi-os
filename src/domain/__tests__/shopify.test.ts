import { describe, expect, it } from 'vitest'

import { detectarGenero, mapearCatalogo, parseVarianteMl } from '..'
import type { ProdutoShopify } from '..'

const produto = (p: Partial<ProdutoShopify>): ProdutoShopify => ({
  id: 'gid://shopify/Product/1',
  titulo: 'Baccarat Rouge 540',
  fornecedor: 'Maison Francis',
  handle: 'baccarat-rouge-540',
  status: 'ACTIVE',
  imagemUrl: 'https://cdn.shopify.com/s/files/bac.jpg',
  tipo: 'Decant',
  tags: [],
  variantes: [
    { id: 'gid://shopify/ProductVariant/11', titulo: '5 ml', preco: 79.9, estoque: 12 },
  ],
  ...p,
})

describe('parseVarianteMl', () => {
  it('aceita as grafias comuns da loja', () => {
    expect(parseVarianteMl('5 ml')).toBe(5)
    expect(parseVarianteMl('5ml')).toBe(5)
    expect(parseVarianteMl('Decant 10ML')).toBe(10)
    expect(parseVarianteMl('15')).toBe(15)
  })

  it('só aceita os tamanhos que o ERP fraciona', () => {
    expect(parseVarianteMl('50 ml')).toBeNull()
    expect(parseVarianteMl('7 ml')).toBeNull()
    expect(parseVarianteMl('Estojo rígido')).toBeNull()
    // "50 ml" não pode virar "5 ml" por leitura parcial.
    expect(parseVarianteMl('Frasco 50ml âmbar')).toBeNull()
  })
})

describe('mapearCatalogo', () => {
  it('mapeia produto ativo com variantes válidas', () => {
    const r = mapearCatalogo([
      produto({
        variantes: [
          { id: 'v1', titulo: '5 ml', preco: 79.9, estoque: 12 },
          { id: 'v2', titulo: '10 ml', preco: 139.9, estoque: 8 },
        ],
      }),
    ])
    expect(r.bases).toHaveLength(1)
    expect(r.bases[0]).toMatchObject({ id: 'baccarat-rouge-540', marca: 'Maison Francis' })
    expect(r.variantes).toHaveLength(2)
    expect(r.ignorados).toHaveLength(0)
  })

  it('ignora produto fora do ar, com o motivo dito', () => {
    const r = mapearCatalogo([produto({ status: 'DRAFT' })])
    expect(r.bases).toHaveLength(0)
    expect(r.ignorados[0].motivo).toContain('não está ativo')
  })

  it('ignora variante sem ml e o produto inteiro quando nada sobra', () => {
    const r = mapearCatalogo([
      produto({
        titulo: 'Kit descoberta',
        handle: 'kit-descoberta',
        variantes: [{ id: 'v1', titulo: 'Padrão', preco: 118.9, estoque: 4 }],
      }),
    ])
    expect(r.bases).toHaveLength(0)
    // Uma entrada para a variante, outra para o produto sem sobras.
    expect(r.ignorados).toHaveLength(2)
    expect(r.ignorados[1].motivo).toContain('kit ou acessório')
  })

  it('tamanho repetido no produto: vale a primeira variante', () => {
    const r = mapearCatalogo([
      produto({
        variantes: [
          { id: 'v1', titulo: '5 ml', preco: 79.9, estoque: 12 },
          { id: 'v2', titulo: '5ml (promo)', preco: 69.9, estoque: 3 },
        ],
      }),
    ])
    expect(r.variantes).toHaveLength(1)
    expect(r.variantes[0].preco).toBe(79.9)
    expect(r.ignorados[0].motivo).toContain('repetido')
  })

  it('estoque negativo (sobrevenda) e nulo viram publicado 0', () => {
    const r = mapearCatalogo([
      produto({
        variantes: [
          { id: 'v1', titulo: '5 ml', preco: 79.9, estoque: -3 },
          { id: 'v2', titulo: '10 ml', preco: 139.9, estoque: null },
        ],
      }),
    ])
    expect(r.variantes.map((v) => v.publicado)).toEqual([0, 0])
  })

  it('fornecedor vazio vira travessão, não string vazia', () => {
    const r = mapearCatalogo([produto({ fornecedor: '  ' })])
    expect(r.bases[0].marca).toBe('—')
  })
})

describe('detectarGenero', () => {
  it('lê o gênero escrito no título, como a loja faz', () => {
    expect(detectarGenero('1 Million Masculino Eau de Toilette (Decant)')).toBe('Masculino')
    expect(detectarGenero('212 NYC Feminino Eau de Toilette (Decant)')).toBe('Feminino')
    expect(detectarGenero('CK One Unissex Eau de Toilette')).toBe('Unissex')
  })

  it('aceita tipo de produto e tags como fonte', () => {
    expect(detectarGenero('Aventus (Decant)', 'Perfume Masculino')).toBe('Masculino')
    expect(detectarGenero('Delina (Decant)', 'Decant', 'feminino', 'floral')).toBe('Feminino')
  })

  it('ignora acento e caixa', () => {
    expect(detectarGenero('LA VIE EST BELLE FEMININO')).toBe('Feminino')
    expect(detectarGenero('Perfume Masculíno')).toBe('Masculino')
  })

  it('reconhece as formas francesas e inglesas comuns em perfumaria', () => {
    expect(detectarGenero('Dior Sauvage pour homme')).toBe('Masculino')
    expect(detectarGenero('Miss Dior pour femme')).toBe('Feminino')
  })

  it('produto que serve aos dois vira Unissex', () => {
    expect(detectarGenero('Kit Masculino e Feminino')).toBe('Unissex')
  })

  it('sem indicação nenhuma devolve null — travessão, não palpite', () => {
    expect(detectarGenero('Baccarat Rouge 540 (Decant)')).toBeNull()
    expect(detectarGenero('')).toBeNull()
  })

  it('não confunde palavra que contém o termo', () => {
    // "fem" só vale como palavra inteira.
    expect(detectarGenero('Femme Fatale Intense')).toBeNull()
  })
})
