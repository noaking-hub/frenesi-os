import { describe, expect, it } from 'vitest'

import { curadoriaPorDna, generoDoPerfume, paresDePerfil, recomendacoesPorAfinidade } from '../curadoria'

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

describe('gênero pelo nome do perfume', () => {
  it('lê a marcação da loja', () => {
    expect(generoDoPerfume('Light Blue Feminino Eau de Parfum')).toBe('feminino')
    expect(generoDoPerfume('Allure Homme Sport Masculino')).toBe('masculino')
    expect(generoDoPerfume('CK One Unissex Eau de Toilette')).toBe('unissex')
    expect(generoDoPerfume('Erba Pura Eau de Parfum')).toBeNull()
  })
})

describe('recomendação por afinidade', () => {
  const perfilMasculino: [string, string][] = [
    ['genero', 'masculino'],
    ['acorde', 'citrico'],
    ['acorde', 'amadeirado'],
    ['estilo', 'sofisticado'],
    ['clima', 'quente'],
  ]

  const clique = (perfume: string, pares: [string, string][]) => ({ perfume, pares })

  it('GÊNERO É ELIMINATÓRIO: lead masculino nunca recebe perfume feminino', () => {
    // O caso real que motivou a regra: perfil masculino recebendo Light Blue
    // Feminino a 43% porque "clima quente" casava.
    const r = recomendacoesPorAfinidade(perfilMasculino, [
      clique('Light Blue Feminino Eau de Parfum', perfilMasculino),
      clique('Delilah Blanc Feminino Eau de Parfum', perfilMasculino),
      clique('Allure Homme Sport Masculino', perfilMasculino),
    ])
    expect(r.map((x) => x.nome)).toEqual(['Allure Homme Sport Masculino'])
  })

  it('unissex e nome sem marcação passam pelo filtro de gênero', () => {
    const r = recomendacoesPorAfinidade(perfilMasculino, [
      clique('CK One Unissex', perfilMasculino),
      clique('Erba Pura Eau de Parfum', perfilMasculino),
    ])
    expect(r.map((x) => x.nome).sort()).toEqual(['CK One Unissex', 'Erba Pura Eau de Parfum'])
  })

  it('acorde e estilo pesam o dobro de clima', () => {
    // Perfil relevante: citrico(2) + amadeirado(2) + sofisticado(2) + quente(1) = 7.
    const soClima = recomendacoesPorAfinidade(perfilMasculino, [
      clique('A Masculino', [['clima', 'quente']]),
    ])
    // 1/7 fica abaixo do piso — não sai.
    expect(soClima).toEqual([])

    const soAcordes = recomendacoesPorAfinidade(perfilMasculino, [
      clique('B Masculino', [['acorde', 'citrico'], ['acorde', 'amadeirado']]),
    ])
    // 4/7 ≈ 0.57 passa.
    expect(soAcordes[0].afinidade).toBeCloseTo(0.57, 2)
  })

  it('abaixo do piso de afinidade a lista sai vazia — calar é a resposta honesta', () => {
    const r = recomendacoesPorAfinidade(perfilMasculino, [
      clique('C Masculino', [['clima', 'quente'], ['estilo', 'outro']]),
    ])
    expect(r).toEqual([])
  })

  it('perfil raso (só gênero, ou 1 atributo) não gera recomendação', () => {
    expect(
      recomendacoesPorAfinidade(
        [['genero', 'masculino'], ['clima', 'quente']],
        [clique('D Masculino', [['clima', 'quente']])],
      ),
    ).toEqual([])
  })

  it('o melhor clique define a afinidade e a exclusão tira o que ele já viu', () => {
    const identico = perfilMasculino
    const r = recomendacoesPorAfinidade(
      identico,
      [
        clique('E Masculino', [['acorde', 'citrico']]),
        clique('E Masculino', identico),
        clique('F Masculino', identico),
      ],
      5,
      new Set(['F Masculino']),
    )
    expect(r).toEqual([{ nome: 'E Masculino', afinidade: 1, cliques: 2 }])
  })
})

describe('curadoria por DNA olfativo', () => {
  const perfil: [string, string][] = [
    ['genero', 'masculino'],
    ['acorde', 'citrico'],
    ['acorde', 'amadeirado'],
    ['estilo', 'sofisticado'],
    ['clima', 'quente'],
  ]
  const perfume = (
    nome: string,
    genero: string | null,
    tags: [string, string][],
  ) => ({ nome, marca: null, genero, tags, descricao: null })

  it('gênero do catálogo é eliminatório; unissex passa', () => {
    const r = curadoriaPorDna(perfil, [
      perfume('Delina', 'feminino', [['acorde', 'citrico'], ['acorde', 'amadeirado'], ['estilo', 'sofisticado']]),
      perfume('CK One', 'unissex', [['acorde', 'citrico'], ['acorde', 'amadeirado'], ['estilo', 'sofisticado']]),
      perfume('Sauvage', 'masculino', [['acorde', 'citrico'], ['acorde', 'amadeirado'], ['estilo', 'sofisticado']]),
    ])
    expect(r.map((x) => x.nome).sort()).toEqual(['CK One', 'Sauvage'])
  })

  it('a escolha explica POR QUE casou e a afinidade é ponderada', () => {
    // Perfil relevante pesa 7 (2+2+2+1). Cítrico+amadeirado+quente = 5/7.
    const r = curadoriaPorDna(perfil, [
      perfume('Club de Nuit', 'masculino', [['acorde', 'citrico'], ['acorde', 'amadeirado'], ['clima', 'quente']]),
    ])
    expect(r[0].afinidade).toBeCloseTo(0.71, 2)
    expect(r[0].casaEm.sort()).toEqual(['amadeirado', 'citrico', 'quente'])
  })

  it('o valor casa mesmo com rótulo de coluna diferente (acorde × familia)', () => {
    const r = curadoriaPorDna(perfil, [
      perfume('Aventus', 'masculino', [['familia', 'citrico'], ['familia', 'amadeirado'], ['estilo', 'sofisticado']]),
    ])
    expect(r[0].afinidade).toBeCloseTo(6 / 7, 2)
  })

  it('abaixo do piso não sai — DNA distante cala', () => {
    const r = curadoriaPorDna(perfil, [
      perfume('Doce Distante', 'masculino', [['acorde', 'doce'], ['clima', 'frio']]),
    ])
    expect(r).toEqual([])
  })
})
