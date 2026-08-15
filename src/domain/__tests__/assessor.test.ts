import { describe, expect, it } from 'vitest'

import { blocosDaResposta, rotuloDaFerramenta, trechos } from '../assessor'

describe('trechos', () => {
  it('separa negrito do texto comum', () => {
    expect(trechos('Faturou **R$ 1.102,69** no dia.')).toEqual([
      { texto: 'Faturou ', forte: false },
      { texto: 'R$ 1.102,69', forte: true },
      { texto: ' no dia.', forte: false },
    ])
  })

  it('trata asterisco sem fechamento como texto literal', () => {
    // Engolir o pedaço seria pior do que exibir o asterisco: some informação.
    expect(trechos('margem **de contribuição')).toEqual([
      { texto: 'margem **de contribuição', forte: false },
    ])
  })

  it('devolve a linha inteira quando não há marcação', () => {
    expect(trechos('sem marcação')).toEqual([{ texto: 'sem marcação', forte: false }])
  })

  it('lê mais de um negrito na mesma linha', () => {
    expect(trechos('**A** e **B**')).toEqual([
      { texto: 'A', forte: true },
      { texto: ' e ', forte: false },
      { texto: 'B', forte: true },
    ])
  })
})

describe('blocosDaResposta', () => {
  it('agrupa itens de lista vizinhos num bloco só', () => {
    const b = blocosDaResposta('- primeiro\n- segundo\n- terceiro')
    expect(b).toHaveLength(1)
    expect(b[0].tipo).toBe('lista')
    expect(b[0].tipo === 'lista' && b[0].itens).toHaveLength(3)
  })

  it('linha em branco encerra a lista', () => {
    const b = blocosDaResposta('- um\n\n- dois')
    expect(b.map((x) => x.tipo)).toEqual(['lista', 'lista'])
  })

  it('aceita as três marcas de item e a numerada', () => {
    const b = blocosDaResposta('* a\n• b\n1. c\n2) d')
    expect(b[0].tipo === 'lista' && b[0].itens.map((i) => i[0].texto)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('reconhece cabeçalho com # e linha inteiramente em negrito', () => {
    const b = blocosDaResposta('## Caixa\n**Estoque:**\ntexto')
    expect(b.map((x) => x.tipo)).toEqual(['titulo', 'titulo', 'paragrafo'])
    expect(b[0].tipo === 'titulo' && b[0].texto).toBe('Caixa')
    expect(b[1].tipo === 'titulo' && b[1].texto).toBe('Estoque')
  })

  it('mantém o negrito dentro do item de lista', () => {
    const b = blocosDaResposta('- Sauvage: **12 ml** restantes')
    expect(b[0].tipo === 'lista' && b[0].itens[0]).toEqual([
      { texto: 'Sauvage: ', forte: false },
      { texto: '12 ml', forte: true },
      { texto: ' restantes', forte: false },
    ])
  })

  it('separa os marcadores do escopo §6.2 do texto da frase', () => {
    const b = blocosDaResposta(
      'Inferência: a queda veio do frete.\nRecomendação: revisar a tabela.\nCenário: com 10% a mais, sobra caixa.',
    )
    expect(b.map((x) => (x.tipo === 'paragrafo' ? x.marcador : null))).toEqual([
      'inferencia',
      'recomendacao',
      'cenario',
    ])
    // O rótulo sai do texto: ele vira badge, não fica repetido na frase.
    expect(b[0].tipo === 'paragrafo' && b[0].partes[0].texto).toBe('a queda veio do frete.')
  })

  it('aceita o marcador sem acento e com caixa trocada', () => {
    const b = blocosDaResposta('RECOMENDACAO: fechar o mês.')
    expect(b[0].tipo === 'paragrafo' && b[0].marcador).toBe('recomendacao')
  })

  it('frase comum não ganha marcador', () => {
    const b = blocosDaResposta('O caixa fechou em R$ 10.000,00.')
    expect(b[0].tipo === 'paragrafo' && b[0].marcador).toBeUndefined()
  })

  it('palavra parecida no meio da frase não vira marcador', () => {
    // Só conta no COMEÇO da linha e seguido de dois-pontos: senão qualquer
    // menção a "recomendação" viraria badge.
    const b = blocosDaResposta('Segui a recomendação: e deu certo.')
    expect(b[0].tipo === 'paragrafo' && b[0].marcador).toBeUndefined()
  })

  it('não produz bloco para resposta vazia', () => {
    expect(blocosDaResposta('')).toEqual([])
    expect(blocosDaResposta('\n\n  \n')).toEqual([])
  })
})

describe('rotuloDaFerramenta', () => {
  it('traduz o nome técnico para o rótulo da tela', () => {
    expect(rotuloDaFerramenta('conciliacao_pendente')).toBe('Conciliação pendente')
  })

  it('degrada legível quando a ferramenta é desconhecida', () => {
    // O chip não pode sumir nem mostrar underscore: o operador precisa ver o
    // que foi consultado mesmo se o catálogo crescer sem passar por aqui.
    expect(rotuloDaFerramenta('coisa_nova')).toBe('coisa nova')
  })
})
