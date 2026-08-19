import { describe, expect, it } from 'vitest'

import { paresDePerfil, recomendacoesPorAfinidade } from '../curadoria'

describe('pares de perfil', () => {
  it('achata valores simples e listas, ignorando nulos e objetos', () => {
    expect(
      paresDePerfil({ genero: 'feminino', familias: ['doce', 'floral'], intensidade: 3, x: null, y: { z: 1 } }),
    ).toEqual([
      ['genero', 'feminino'],
      ['familias', 'doce'],
      ['familias', 'floral'],
      ['intensidade', '3'],
    ])
  })

  it('entrada ilegível devolve vazio', () => {
    expect(paresDePerfil(null)).toEqual([])
    expect(paresDePerfil('texto')).toEqual([])
  })
})

describe('recomendação por afinidade', () => {
  const perfil: [string, string][] = [
    ['genero', 'feminino'],
    ['clima', 'quente'],
    ['estilo', 'doce'],
  ]

  it('perfil idêntico vale afinidade cheia e vence o parcial', () => {
    const r = recomendacoesPorAfinidade(perfil, [
      { perfume: 'A', pares: [['genero', 'feminino'], ['clima', 'quente'], ['estilo', 'doce']] },
      { perfume: 'B', pares: [['genero', 'feminino'], ['clima', 'frio'], ['estilo', 'doce']] },
    ])
    expect(r[0]).toEqual({ nome: 'A', afinidade: 1, cliques: 1 })
    expect(r[1].nome).toBe('B')
    expect(r[1].afinidade).toBeCloseTo(0.67, 2)
  })

  it('a afinidade do perfume é a do MELHOR clique, e popularidade desempata', () => {
    const r = recomendacoesPorAfinidade(perfil, [
      { perfume: 'A', pares: [['genero', 'feminino']] },
      { perfume: 'A', pares: [['genero', 'feminino'], ['clima', 'quente'], ['estilo', 'doce']] },
      { perfume: 'B', pares: [['genero', 'feminino'], ['clima', 'quente'], ['estilo', 'doce']] },
    ])
    expect(r[0]).toEqual({ nome: 'A', afinidade: 1, cliques: 2 })
    expect(r[1]).toEqual({ nome: 'B', afinidade: 1, cliques: 1 })
  })

  it('perfume sem nada em comum fica de fora, e o teto limita a lista', () => {
    const cliques = Array.from({ length: 8 }, (_, i) => ({
      perfume: `P${i}`,
      pares: [['genero', 'feminino']] as [string, string][],
    }))
    cliques.push({ perfume: 'Longe', pares: [['genero', 'masculino']] })
    const r = recomendacoesPorAfinidade(perfil, cliques, 5)
    expect(r).toHaveLength(5)
    expect(r.every((x) => x.nome !== 'Longe')).toBe(true)
  })

  it('lead sem perfil não recebe recomendação inventada', () => {
    expect(recomendacoesPorAfinidade([], [{ perfume: 'A', pares: [['g', 'f']] }])).toEqual([])
  })
})
