import { describe, expect, it } from 'vitest'

import {
  celulaParaCsv,
  nomeDoArquivo,
  paraCsv,
  rotuloDaColuna,
  tabelaDoResultado,
} from '../relatorio-csv'

describe('tabelaDoResultado', () => {
  it('acha a tabela em items — o nome do contrato padronizado', () => {
    const t = tabelaDoResultado({
      summary: 'oi',
      items: [
        { id: 'a', valor: 10 },
        { id: 'b', valor: 20 },
      ],
    })
    expect(t?.colunas).toEqual(['id', 'valor'])
    expect(t?.linhas).toHaveLength(2)
  })

  it('aceita itens em português e array na raiz', () => {
    expect(tabelaDoResultado({ itens: [{ a: 1 }] })?.colunas).toEqual(['a'])
    expect(tabelaDoResultado([{ a: 1 }])?.colunas).toEqual(['a'])
  })

  it('devolve null quando a origem não é tabular — o botão não aparece', () => {
    expect(tabelaDoResultado({ saldo: 1200, contas: 3 })).toBeNull()
    expect(tabelaDoResultado('texto')).toBeNull()
    expect(tabelaDoResultado(null)).toBeNull()
    expect(tabelaDoResultado({ items: [] })).toBeNull()
    // Array de escalares não vira planilha: não há coluna para nomear.
    expect(tabelaDoResultado({ items: ['a', 'b'] })).toBeNull()
  })

  it('achata um nível e registra o que não coube', () => {
    const t = tabelaDoResultado({
      items: [{ nome: 'x', base: { nome: 'Sauvage', ml: 100 }, historico: [1, 2] }],
    })
    expect(t?.colunas).toEqual(['nome', 'base.nome', 'base.ml'])
    expect(t?.omitidas).toEqual(['historico'])
  })

  it('une as colunas de linhas heterogêneas, na ordem em que apareceram', () => {
    const t = tabelaDoResultado({
      items: [
        { a: 1, b: 2 },
        { b: 3, c: 4 },
      ],
    })
    expect(t?.colunas).toEqual(['a', 'b', 'c'])
    // A célula ausente vira vazio, não some da linha.
    expect(paraCsv(t!).split('\r\n')[1]).toBe('"1";"2";""')
  })
})

describe('celulaParaCsv', () => {
  it('converte data ISO para o formato que o Excel pt-BR ordena', () => {
    expect(celulaParaCsv('2026-08-16')).toBe('16/08/2026')
    expect(celulaParaCsv('2026-08-16T14:30:00.000Z')).toBe('16/08/2026 14:30')
  })

  it('usa vírgula decimal e preserva inteiro sem casas', () => {
    expect(celulaParaCsv(1234.5)).toBe('1234,50')
    expect(celulaParaCsv(12)).toBe('12')
    expect(celulaParaCsv(-40.25)).toBe('-40,25')
  })

  it('booleano vira palavra e nulo vira vazio', () => {
    expect(celulaParaCsv(true)).toBe('sim')
    expect(celulaParaCsv(false)).toBe('não')
    expect(celulaParaCsv(null)).toBe('')
    expect(celulaParaCsv(undefined)).toBe('')
  })
})

describe('paraCsv', () => {
  it('escapa aspas e mantém o separador de ponto e vírgula', () => {
    const csv = paraCsv({
      colunas: ['descricao'],
      linhas: [{ descricao: 'Perfume "raro"; 10ml' }],
      omitidas: [],
    })
    expect(csv).toContain('"Perfume ""raro""; 10ml"')
  })

  it('neutraliza fórmula vinda de texto de terceiro', () => {
    const csv = paraCsv({
      colunas: ['nome'],
      linhas: [{ nome: '=HYPERLINK("http://mal.co")' }],
      omitidas: [],
    })
    expect(csv).toContain(`"'=HYPERLINK`)
  })

  it('não trata número negativo como fórmula', () => {
    const csv = paraCsv({ colunas: ['v'], linhas: [{ v: -12.4 }], omitidas: [] })
    expect(csv.split('\r\n')[1]).toBe('"-12,40"')
  })

  it('começa com BOM, para o Excel abrir acentuação sem sujar', () => {
    expect(paraCsv({ colunas: ['a'], linhas: [{ a: 'ç' }], omitidas: [] })[0]).toBe('﻿')
  })
})

describe('rotuloDaColuna e nomeDoArquivo', () => {
  it('humaniza a chave técnica', () => {
    expect(rotuloDaColuna('valor_total')).toBe('Valor total')
    expect(rotuloDaColuna('base.nome')).toBe('Base · nome')
    expect(rotuloDaColuna('valorLiquido')).toBe('Valor liquido')
  })

  it('gera nome de arquivo previsível', () => {
    expect(nomeDoArquivo('resumo_do_periodo', '2026-08-16')).toBe(
      'frenesi-resumo-do-periodo-2026-08-16.csv',
    )
  })
})
