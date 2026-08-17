import { describe, expect, it } from 'vitest'

import {
  janelaDoAtalho,
  janelaEmPalavras,
  ordenarLinhas,
  relatorioParaCsv,
} from '../relatorios'
import type { ColunaRelatorio, ResultadoRelatorio } from '../relatorios'

const COLUNAS: ColunaRelatorio[] = [
  { chave: 'cidade', rotulo: 'Cidade', tipo: 'texto' },
  { chave: 'receita', rotulo: 'Receita', tipo: 'dinheiro' },
]

describe('ordenarLinhas', () => {
  const linhas = [
    { cidade: 'Ácida', receita: 100 },
    { cidade: 'Muriaé', receita: 900 },
    { cidade: 'Zinco', receita: null },
  ]

  it('ordena texto em pt-BR — acento não joga a linha para o fim', () => {
    const ordenado = ordenarLinhas(linhas, COLUNAS, 'cidade', false)
    expect(ordenado.map((l) => l.cidade)).toEqual(['Ácida', 'Muriaé', 'Zinco'])
  })

  it('ordena número como número, não como texto', () => {
    const ordenado = ordenarLinhas(
      [{ cidade: 'a', receita: 9 }, { cidade: 'b', receita: 100 }],
      COLUNAS,
      'receita',
      true,
    )
    expect(ordenado.map((l) => l.receita)).toEqual([100, 9])
  })

  it('nulo vai para o fim nas DUAS direções', () => {
    // Inverter a seta não pode trazer as linhas sem valor para o topo: quem
    // ordena por receita quer ver receita, não buracos.
    expect(ordenarLinhas(linhas, COLUNAS, 'receita', true).at(-1)!.receita).toBeNull()
    expect(ordenarLinhas(linhas, COLUNAS, 'receita', false).at(-1)!.receita).toBeNull()
  })

  it('coluna inexistente não embaralha nada', () => {
    expect(ordenarLinhas(linhas, COLUNAS, 'inventada', true)).toEqual(linhas)
    expect(ordenarLinhas(linhas, COLUNAS, null, true)).toEqual(linhas)
  })
})

describe('janelaDoAtalho', () => {
  it('7 dias inclui hoje e os seis anteriores', () => {
    expect(janelaDoAtalho('7', '2026-08-17')).toEqual({ de: '2026-08-11', ate: '2026-08-17' })
  })

  it('atravessa a virada do mês sem errar a conta', () => {
    expect(janelaDoAtalho('30', '2026-03-05')).toEqual({ de: '2026-02-04', ate: '2026-03-05' })
  })

  it('"tudo" não tem janela', () => {
    expect(janelaDoAtalho('tudo', '2026-08-17')).toEqual({ de: null, ate: null })
    expect(janelaDoAtalho('inventado', '2026-08-17')).toEqual({ de: null, ate: null })
  })
})

describe('janelaEmPalavras', () => {
  it('descreve as quatro formas de janela', () => {
    expect(janelaEmPalavras('2026-08-01', '2026-08-17')).toBe('01/08/2026 a 17/08/2026')
    expect(janelaEmPalavras('2026-08-01', null)).toBe('de 01/08/2026 em diante')
    expect(janelaEmPalavras(null, '2026-08-17')).toBe('até 17/08/2026')
    expect(janelaEmPalavras(null, null)).toBe('todo o período')
  })
})

describe('relatorioParaCsv', () => {
  const base: ResultadoRelatorio = {
    colunas: [
      { chave: 'cidade', rotulo: 'Cidade', tipo: 'texto' },
      { chave: 'receita', rotulo: 'Receita', tipo: 'dinheiro' },
      { chave: 'pedidos', rotulo: 'Pedidos', tipo: 'numero' },
    ],
    linhas: [
      { cidade: 'Muriaé', receita: 1234.5, pedidos: 7 },
      { cidade: 'Rio; de Janeiro', receita: null, pedidos: 0 },
    ],
    kpis: [],
  }

  it('usa ponto e vírgula e vírgula decimal — o Excel pt-BR precisa dos dois', () => {
    const csv = relatorioParaCsv(base)
    expect(csv.split('\n')[0]).toBe('Cidade;Receita;Pedidos')
    expect(csv.split('\n')[1]).toBe('Muriaé;1234,50;7')
  })

  it('protege o separador dentro do texto', () => {
    expect(relatorioParaCsv(base).split('\n')[2]).toBe('"Rio; de Janeiro";;0')
  })
})
