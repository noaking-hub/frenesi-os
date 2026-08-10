import { describe, expect, it } from 'vitest'

import { casarTitulo, tokensDe } from '..'

/** Recorte real do catálogo, incluindo os pares que se confundem. */
const BASES = [
  { id: 'sauvage-edp', nome: 'Sauvage Masculino Eau de Parfum (Decant)', marca: 'Dior' },
  { id: 'sauvage-edt', nome: 'Sauvage Masculino Eau de Toilette (Decant)', marca: 'Dior' },
  { id: 'sauvage-elixir', nome: 'Sauvage Elixir Eau de Parfum (Decant)', marca: 'Dior' },
  { id: 'bleu-edp', nome: 'Bleu de Chanel Masculino Eau de Parfum (Decant)', marca: 'Chanel' },
  { id: 'bleu-edt', nome: 'Bleu de Chanel Masculino Eau de Toilette (Decant)', marca: 'Chanel' },
  { id: 'homme-intense', nome: 'Dior Homme Intense Masculino Eau de Parfum (Decant)', marca: 'Dior' },
  { id: 'coco-mad', nome: 'Coco Mademoiselle Feminino Eau de Parfum (Decant)', marca: 'Chanel' },
]

describe('casar título de concorrente com o catálogo', () => {
  it('ignora volume, acento e caixa ao tokenizar', () => {
    const t = tokensDe('Decant 5ml — Coco Mademoiselle Eau de Parfum')
    expect(t.has('coco')).toBe(true)
    expect(t.has('mademoiselle')).toBe(true)
    // Volume e palavra genérica não distinguem produto nenhum.
    expect(t.has('5')).toBe(false)
    expect(t.has('ml')).toBe(false)
    expect(t.has('decant')).toBe(false)
  })

  it('casa quando o título traz o nome inteiro', () => {
    const c = casarTitulo('Decant Coco Mademoiselle Chanel Feminino Eau de Parfum 5ml', BASES)
    expect(c?.baseId).toBe('coco-mad')
  })

  it('não casa Eau de Parfum com Eau de Toilette', () => {
    const edp = casarTitulo('Bleu de Chanel Masculino Eau de Parfum - Decant 10ml', BASES)
    expect(edp?.baseId).toBe('bleu-edp')
    const edt = casarTitulo('Bleu de Chanel Masculino Eau de Toilette - Decant 10ml', BASES)
    expect(edt?.baseId).toBe('bleu-edt')
  })

  it('recusa em vez de chutar quando o título é ambíguo', () => {
    // Sem dizer a concentração, "Sauvage Dior" serve a três bases nossas.
    // Casar com uma delas empurraria o preço de venda de um produto pelo
    // preço de outro — pior que não saber.
    expect(casarTitulo('Sauvage Dior Decant', BASES)).toBeNull()
  })

  it('recusa título curto demais ou de outro produto', () => {
    expect(casarTitulo('Estojo vazio 5ml', BASES)).toBeNull()
    expect(casarTitulo('', BASES)).toBeNull()
    expect(casarTitulo('Frete', BASES)).toBeNull()
  })

  it('não confunde Sauvage Elixir com Sauvage Eau de Parfum', () => {
    const c = casarTitulo('Sauvage Elixir Dior Eau de Parfum decant 5ml', BASES)
    expect(c?.baseId).toBe('sauvage-elixir')
  })
})
