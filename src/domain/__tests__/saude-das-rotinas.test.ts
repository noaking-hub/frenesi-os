import { describe, expect, it } from 'vitest'

import { extrairErros, rotinasDoentes } from '../saude-das-rotinas'

describe('extração de erros do relatório', () => {
  it('colhe o campo erro em qualquer nível, com o caminho', () => {
    const erros = extrairErros({
      rastreio: { consultados: 6, falhas: 4 },
      rastreioMelhorEnvio: { erro: 'O Melhor Envio respondeu 422' },
      anulados: { anulados: 114 },
      espelhoEnvios: { detalhe: { erro: 'escopo negado' } },
    })
    expect(erros).toEqual([
      { onde: 'rastreioMelhorEnvio', erro: 'O Melhor Envio respondeu 422' },
      { onde: 'espelhoEnvios.detalhe', erro: 'escopo negado' },
    ])
  })

  it('relatório limpo devolve lista vazia', () => {
    expect(extrairErros({ pedidos: { pedidos: 30 }, duracaoMs: 12000 })).toEqual([])
    expect(extrairErros(null)).toEqual([])
    expect(extrairErros('texto')).toEqual([])
  })

  it('trunca mensagens longas e ignora erro vazio', () => {
    const [e] = extrairErros({ x: { erro: 'a'.repeat(500) } })
    expect(e.erro).toHaveLength(300)
    expect(extrairErros({ x: { erro: '  ' } })).toEqual([])
  })
})

describe('rotinas doentes', () => {
  const rodada = (rotina: string, minutosAtras: number, ondes: string[]) => ({
    rotina,
    rodadaEm: new Date(Date.UTC(2026, 7, 18, 12, 0) - minutosAtras * 60_000).toISOString(),
    erros: ondes.map((onde) => ({ onde, erro: `falhou em ${onde}` })),
  })

  it('o mesmo ponto em 3 rodadas seguidas vira doente', () => {
    const doentes = rotinasDoentes([
      rodada('logistica', 0, ['melhorenvio']),
      rodada('logistica', 60, ['melhorenvio']),
      rodada('logistica', 120, ['melhorenvio']),
    ])
    expect(doentes).toEqual([
      { rotina: 'logistica', onde: 'melhorenvio', rodadasSeguidas: 3, ultimoErro: 'falhou em melhorenvio' },
    ])
  })

  it('erro que já sumiu da última rodada não alerta', () => {
    const doentes = rotinasDoentes([
      rodada('logistica', 0, []),
      rodada('logistica', 60, ['melhorenvio']),
      rodada('logistica', 120, ['melhorenvio']),
      rodada('logistica', 180, ['melhorenvio']),
    ])
    expect(doentes).toEqual([])
  })

  it('a consecutividade quebra num sucesso no meio', () => {
    const doentes = rotinasDoentes([
      rodada('logistica', 0, ['melhorenvio']),
      rodada('logistica', 60, []),
      rodada('logistica', 120, ['melhorenvio']),
      rodada('logistica', 180, ['melhorenvio']),
    ])
    expect(doentes).toEqual([])
  })

  it('rotinas diferentes não se misturam', () => {
    const doentes = rotinasDoentes([
      rodada('logistica', 0, ['melhorenvio']),
      rodada('campanhas', 30, ['melhorenvio']),
      rodada('logistica', 60, ['melhorenvio']),
      rodada('campanhas', 90, ['melhorenvio']),
      rodada('logistica', 120, ['melhorenvio']),
    ])
    expect(doentes).toHaveLength(1)
    expect(doentes[0].rotina).toBe('logistica')
  })
})
