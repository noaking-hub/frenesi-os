import { describe, expect, it } from 'vitest'

import {
  PARAMETROS_PADRAO,
  PRAZO_DEVOLUCAO_DIAS,
  TETO_SHOPIFY,
  apurarLote,
  apurarPerdaReal,
  arredondaPreco,
  calcularPreco,
  coberturaDe,
  conciliarLotesAbertos,
  fotosCompletas,
  frascoDe,
  margemDe,
  pisoMargem,
  sincronizarVariante,
  statusDevolucao,
  unidadesPossiveis,
  volumeConsumido,
} from '..'
import type { Lote, PerfumeBase } from '..'

describe('fracionamento', () => {
  it('envasa 3, 5 e 8 ml no frasco de 8 ml', () => {
    expect(frascoDe(3)).toBe(8)
    expect(frascoDe(5)).toBe(8)
    expect(frascoDe(8)).toBe(8)
  })

  it('envasa 10 e 15 ml no frasco de 15 ml', () => {
    expect(frascoDe(10)).toBe(15)
    expect(frascoDe(15)).toBe(15)
  })

  it('embute a perda técnica no consumo de volume', () => {
    // 12 decants de 5 ml com 3% de perda
    expect(volumeConsumido(12, 5, 3)).toBe(61.8)
  })
})

describe('precificação', () => {
  it('faz todo preço terminar em ,90', () => {
    expect(arredondaPreco(78.12)).toBe(78.9)
    expect(arredondaPreco(79.0)).toBe(78.9)
    expect(arredondaPreco(79.01)).toBe(79.9)
  })

  it('atinge a margem alvo no preço ideal', () => {
    const p = PARAMETROS_PADRAO
    const c = calcularPreco(3.1, 5, p)
    // No preço ideal exato (antes do arredondamento) a margem é a alvo.
    expect(margemDe(c.ideal, c.custoProduto, p)).toBeCloseTo(p.margemAlvo, 6)
  })

  it('mantém a margem do preço sugerido próxima da alvo', () => {
    const c = calcularPreco(3.1, 5, PARAMETROS_PADRAO)
    expect(c.sugerido).toBeGreaterThan(0)
    expect(c.margem).toBeGreaterThan(PARAMETROS_PADRAO.margemAlvo - 1)
  })

  it('coloca o piso 10 pontos abaixo da margem alvo', () => {
    const p = PARAMETROS_PADRAO
    expect(pisoMargem(p)).toBe(15)
    const c = calcularPreco(3.1, 5, p)
    expect(c.piso).toBeLessThan(c.sugerido)
    expect(margemDe(c.piso, c.custoProduto, p)).toBeGreaterThanOrEqual(pisoMargem(p) - 1)
  })

  it('encarece o produto quando a perda sobe', () => {
    const barato = calcularPreco(3.1, 10, PARAMETROS_PADRAO)
    const caro = calcularPreco(3.1, 10, { ...PARAMETROS_PADRAO, perdaPct: 6 })
    expect(caro.custoProduto).toBeGreaterThan(barato.custoProduto)
    expect(caro.sugerido).toBeGreaterThanOrEqual(barato.sugerido)
  })
})

describe('estoque em ml, venda em unidades', () => {
  it('soma envasados com o que o volume permite fracionar', () => {
    // Delina: 90 ml de base + 2 decants de 5 ml prontos
    expect(unidadesPossiveis(90, 5, 2)).toBe(20)
    expect(unidadesPossiveis(90, 15, 0)).toBe(6)
    expect(unidadesPossiveis(90, 10, 0)).toBe(9)
  })

  it('esgota a variante quando não há volume nem decant pronto', () => {
    const v = sincronizarVariante(0, 5, 0, TETO_SHOPIFY)
    expect(v.acao).toBe('esgotar')
    expect(v.novoValor).toBe(0)
    expect(v.detalhe).toBe('sem volume para fracionar')
  })

  it('reduz ao possível quando o publicado está acima', () => {
    // 90 ml permitem 6 unidades de 15 ml, mas há 20 publicadas
    const v = sincronizarVariante(90, 15, 0, 20)
    expect(v.acao).toBe('reduzir')
    expect(v.novoValor).toBe(6)
    expect(v.excesso).toBe(14)
  })

  it('repõe ao teto quando o decremento manual ficou desatualizado', () => {
    const v = sincronizarVariante(640, 15, 0, 8)
    expect(v.acao).toBe('repor')
    expect(v.novoValor).toBe(TETO_SHOPIFY)
    expect(v.detalhe).toContain('decremento manual antigo')
  })

  it('nunca sobe acima do teto de 20', () => {
    const v = sincronizarVariante(1180, 3, 0, 20)
    expect(v.possivel).toBeGreaterThan(TETO_SHOPIFY)
    expect(v.acao).toBe('ok')
    expect(v.novoValor).toBe(TETO_SHOPIFY)
  })

  it('conta cobertura em dias, não em jargão', () => {
    const base: PerfumeBase = {
      id: 'bac',
      nome: 'Baccarat Rouge 540',
      marca: 'Maison Francis',
      custoPorMl: 3.1,
      volumeMl: 640,
      consumoDiarioMl: 51,
    }
    const c = coberturaDe(base)
    expect(c.dias).toBe(13)
    expect(c.cobertura).toBe('13 dias')
    expect(c.criticidade).toBe('atencao')
  })

  it('marca base zerada como esgotada', () => {
    const c = coberturaDe({
      id: 'oud',
      nome: 'Oud Wood',
      marca: 'Tom Ford',
      custoPorMl: 4.4,
      volumeMl: 0,
      consumoDiarioMl: 6,
    })
    expect(c.criticidade).toBe('zero')
    expect(c.cobertura).toBe('Esgotado')
    expect(c.cta).toBe('Recomprar')
  })
})

describe('lotes e perda real', () => {
  const aberto: Lote = {
    id: 'LT-095',
    baseId: 'bac',
    perfume: 'Baccarat Rouge 540',
    fornecedor: 'Importadora Aurum',
    volumeMl: 1000,
    entrada: '26/07/2026',
    encerradoEm: null,
    saidas: [
      { data: '28/07', ref: 'OP-2205', unidades: 20, variante: 5 },
      { data: '30/07', ref: 'OP-2208', unidades: 12, variante: 10 },
    ],
  }

  const encerrado: Lote = {
    id: 'LT-088',
    baseId: 'bac',
    perfume: 'Baccarat Rouge 540',
    fornecedor: 'Importadora Aurum',
    volumeMl: 500,
    entrada: '02/05/2026',
    encerradoEm: '28/07/2026',
    saidas: [
      { data: '12/05', ref: 'OP-2088', unidades: 20, variante: 5 },
      { data: '24/05', ref: 'OP-2101', unidades: 12, variante: 10 },
      { data: '09/06', ref: 'OP-2140', unidades: 24, variante: 3 },
      { data: '27/06', ref: 'OP-2166', unidades: 10, variante: 8 },
      { data: '14/07', ref: 'OP-2190', unidades: 6, variante: 15 },
      { data: '26/07', ref: 'OP-2204', unidades: 4, variante: 5 },
    ],
  }

  it('deriva consumido e unidades do extrato de saídas', () => {
    const ap = apurarLote(aberto, PARAMETROS_PADRAO)
    expect(ap.consumidoMl).toBe(20 * 5 + 12 * 10) // 220
    expect(ap.unidades).toBe(32)
  })

  it('trata a diferença como saldo teórico enquanto o lote está aberto', () => {
    const ap = apurarLote(aberto, PARAMETROS_PADRAO)
    expect(ap.aberto).toBe(true)
    expect(ap.diferencaMl).toBe(780)
    expect(ap.perdaPct).toBeNull()
  })

  it('só mede a perda real quando o frasco é declarado vazio', () => {
    const ap = apurarLote(encerrado, PARAMETROS_PADRAO)
    expect(ap.aberto).toBe(false)
    expect(ap.consumidoMl).toBe(100 + 120 + 72 + 80 + 90 + 20) // 482
    expect(ap.diferencaMl).toBe(18)
    expect(ap.perdaPct).toBeCloseTo(3.6, 5)
    expect(ap.acimaDoParametro).toBe(true)
  })

  it('alerta quando a perda média excede o parâmetro', () => {
    const bases: PerfumeBase[] = [
      {
        id: 'bac',
        nome: 'Baccarat Rouge 540',
        marca: 'Maison Francis',
        custoPorMl: 3.1,
        volumeMl: 640,
        consumoDiarioMl: 51,
      },
    ]
    const perda = apurarPerdaReal([aberto, encerrado], bases, PARAMETROS_PADRAO)
    expect(perda.lotesEncerrados).toBe(1)
    expect(perda.lotesAbertos).toBe(1)
    expect(perda.mediaPct).toBeCloseTo(3.6, 5)
    expect(perda.subestimado).toBe(true)
    expect(perda.custo).toBeCloseTo(18 * 3.1, 5)
  })

  it('concilia o saldo dos lotes abertos com o volume em estoque', () => {
    const bases: PerfumeBase[] = [
      {
        id: 'bac',
        nome: 'Baccarat Rouge 540',
        marca: 'Maison Francis',
        custoPorMl: 3.1,
        volumeMl: 780,
        consumoDiarioMl: 51,
      },
    ]
    const c = conciliarLotesAbertos([aberto, encerrado], bases, PARAMETROS_PADRAO)
    expect(c.saldoLotesMl).toBe(780)
    expect(c.confere).toBe(true)
  })
})

describe('devoluções', () => {
  it('não inicia o prazo antes da entrega', () => {
    const s = statusDevolucao(null)
    expect(s.elegivel).toBe(false)
    expect(s.estado).toBe('aguardando-entrega')
    expect(s.selo).toBe('Aguardando entrega')
  })

  it('aceita dentro dos 7 dias corridos da entrega', () => {
    const s = statusDevolucao(5)
    expect(s.elegivel).toBe(true)
    expect(s.restam).toBe(PRAZO_DEVOLUCAO_DIAS - 5)
    expect(s.mensagem).toBe('2 dias restantes para devolver')
  })

  it('trata o sétimo dia como último dia', () => {
    expect(statusDevolucao(6).mensagem).toBe('último dia para devolver')
  })

  it('recusa depois de 7 dias', () => {
    const s = statusDevolucao(32)
    expect(s.elegivel).toBe(false)
    expect(s.estado).toBe('fora-do-prazo')
    expect(s.mensagem).toContain('entregue há 32 dias')
  })

  it('exige as duas fotos no caso geral', () => {
    expect(fotosCompletas('m1', { nivel: true, lacre: false })).toBe(false)
    expect(fotosCompletas('m1', { nivel: true, lacre: true })).toBe(true)
  })

  it('dispensa a foto do lacre quando o frasco chegou danificado', () => {
    expect(fotosCompletas('m3', { nivel: true, lacre: false })).toBe(true)
    // a foto do nível continua obrigatória em qualquer motivo
    expect(fotosCompletas('m3', { nivel: false, lacre: true })).toBe(false)
  })
})
