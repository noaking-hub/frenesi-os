import { describe, expect, it } from 'vitest'

import {
  PARAMETROS_PADRAO,
  PRAZO_DEVOLUCAO_DIAS,
  TETO_SHOPIFY,
  custoMedioPonderado,
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
  previaEncerramento,
  sincronizarBase,
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

  it('não confunde base sem carga inicial com base esgotada', () => {
    // Mesmo volume zero, mesma variante — o que muda é o ERP saber ou não o
    // que existe no frasco. Gravar zero por não saber tiraria o produto do ar.
    const semCarga = sincronizarVariante(0, 5, 0, TETO_SHOPIFY, false)
    expect(semCarga.acao).toBe('sem_carga')
    expect(semCarga.novoValor).toBe(TETO_SHOPIFY)
    expect(semCarga.excesso).toBe(0)

    const esgotada = sincronizarVariante(0, 5, 0, TETO_SHOPIFY, true)
    expect(esgotada.acao).toBe('esgotar')
    expect(esgotada.novoValor).toBe(0)
  })

  it('reconhece carga por volume, por custo ou por decant envasado', () => {
    const semNada: PerfumeBase = {
      id: 'nova',
      nome: 'Recém-importada da Shopify',
      marca: '—',
      custoPorMl: 0,
      volumeMl: 0,
      consumoDiarioMl: 0,
    }
    expect(sincronizarBase(semNada, [], {}).variantes.every((v) => v.acao === 'sem_carga')).toBe(
      true,
    )

    // Vendeu tudo, mas o custo da compra continua lá: é esgotada de verdade.
    const vendida = { ...semNada, id: 'vendida', custoPorMl: 3.1 }
    expect(sincronizarBase(vendida, [], {}).variantes.every((v) => v.acao === 'esgotar')).toBe(true)

    // Sem volume nem custo, mas com decant pronto na bancada.
    const comProntos = sincronizarBase(
      { ...semNada, id: 'prontos' },
      [{ baseId: 'prontos', variante: 5, envasadas: 4, reservadas: 0, precoPraticado: 0 }],
      {},
    )
    expect(comProntos.variantes.find((v) => v.variante === 5)?.acao).not.toBe('sem_carga')
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
      { data: '28/07', ref: 'OP-2205', ml: 100, unidades: 20, variante: 5, motivo: null },
      { data: '30/07', ref: 'OP-2208', ml: 120, unidades: 12, variante: 10, motivo: null },
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
      { data: '12/05', ref: 'OP-2088', ml: 100, unidades: 20, variante: 5, motivo: null },
      { data: '24/05', ref: 'OP-2101', ml: 120, unidades: 12, variante: 10, motivo: null },
      { data: '09/06', ref: 'OP-2140', ml: 72, unidades: 24, variante: 3, motivo: null },
      { data: '27/06', ref: 'OP-2166', ml: 80, unidades: 10, variante: 8, motivo: null },
      { data: '14/07', ref: 'OP-2190', ml: 90, unidades: 6, variante: 15, motivo: null },
      { data: '26/07', ref: 'OP-2204', ml: 20, unidades: 4, variante: 5, motivo: null },
    ],
  }

  it('não conta como perda o que saiu do lote sem virar decant', () => {
    // Frasco de 100 ml do qual 7 ml já tinham sido vendidos antes do ERP.
    // Sem a saída lançada, esses 7 ml virariam perda técnica ao declarar o
    // vazio — e a perda técnica entra no custo de todo preço calculado.
    const comVendaAntiga: Lote = {
      id: 'LT-105',
      baseId: 'coral',
      perfume: 'Born in Roma Coral Fantasy',
      fornecedor: 'Inter Shop',
      volumeMl: 100,
      entrada: '09/08/2026',
      encerradoEm: '10/08/2026',
      saidas: [
        { data: '09/08', ref: null, ml: 7, unidades: null, variante: null, motivo: 'Venda anterior ao ERP' },
        { data: '10/08', ref: 'OP-2301', ml: 90, unidades: 18, variante: 5, motivo: null },
      ],
    }
    const ap = apurarLote(comVendaAntiga, PARAMETROS_PADRAO)
    expect(ap.consumidoMl).toBe(97)
    // Só os 3 ml de fundo de frasco são perda; os 7 ml vendidos, não.
    expect(ap.diferencaMl).toBe(3)
    expect(ap.perdaPct).toBeCloseTo(3, 6)
    // A saída sem decant não infla a contagem de unidades.
    expect(ap.unidades).toBe(18)
  })

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

describe('encerramento de lote', () => {
  const base: PerfumeBase = {
    id: 'bac',
    nome: 'Baccarat Rouge 540',
    marca: 'Maison Francis',
    custoPorMl: 3.1,
    volumeMl: 90,
    consumoDiarioMl: 51,
  }

  const lote: Lote = {
    id: 'LT-100',
    baseId: 'bac',
    perfume: 'Baccarat Rouge 540',
    fornecedor: 'Importadora Aurum',
    volumeMl: 500,
    entrada: '02/05/2026',
    encerradoEm: null,
    saidas: [
      { data: '12/05', ref: 'OP-2088', ml: 100, unidades: 20, variante: 5, motivo: null },
      { data: '24/05', ref: 'OP-2101', ml: 310, unidades: 31, variante: 10, motivo: null },
    ],
  }

  it('transforma o saldo teórico em perda, com custo ao preço da base', () => {
    const pv = previaEncerramento(lote, base, PARAMETROS_PADRAO)
    expect(pv.envasadoMl).toBe(410)
    expect(pv.perdaMl).toBe(90)
    expect(pv.perdaPct).toBeCloseTo(18, 5)
    expect(pv.custo).toBeCloseTo(90 * 3.1, 5)
    expect(pv.acimaDoParametro).toBe(true)
    expect(pv.saldoBaseMl).toBe(0)
    expect(pv.impedimento).toBeNull()
  })

  it('impede encerrar quando a perda não cabe no volume em estoque', () => {
    const pv = previaEncerramento(lote, { ...base, volumeMl: 40 }, PARAMETROS_PADRAO)
    expect(pv.impedimento).toContain('Inventário')
  })

  it('impede encerrar quando o extrato envasou mais que o comprado', () => {
    const furado: Lote = {
      ...lote,
      saidas: [{ data: '12/05', ref: 'OP-2088', ml: 600, unidades: 40, variante: 15, motivo: null }],
    }
    const pv = previaEncerramento(furado, { ...base, volumeMl: 900 }, PARAMETROS_PADRAO)
    expect(pv.perdaMl).toBe(-100)
    expect(pv.impedimento).toContain('Corrija as saídas')
  })

  it('não deixa encerrar duas vezes', () => {
    const pv = previaEncerramento({ ...lote, encerradoEm: '28/07/2026' }, base, PARAMETROS_PADRAO)
    expect(pv.impedimento).toContain('já encerrado')
  })

  it('base sem custo cadastrado apura perda em ml, mas não inventa reais', () => {
    const pv = previaEncerramento(lote, { ...base, custoPorMl: 0 }, PARAMETROS_PADRAO)
    expect(pv.perdaMl).toBe(90)
    expect(pv.custo).toBe(0)
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

describe('custo médio ponderado na compra', () => {
  it('primeira compra define o custo por ml', () => {
    expect(custoMedioPonderado(0, 0, 500, 1550)).toBeCloseTo(3.1, 10)
  })

  it('base importada com custo 0 é tratada como primeira compra', () => {
    // Volume existe (publicado veio da loja) mas o custo é desconhecido:
    // a média NÃO pode diluir com um custo 0 que nunca foi real.
    expect(custoMedioPonderado(200, 0, 500, 1550)).toBeCloseTo(3.1, 10)
  })

  it('reposição pondera pelo volume existente ao custo atual', () => {
    // 300 ml a 3,00 + 500 ml comprados por 1.750 (3,50/ml)
    // → (300×3 + 1750) / 800 = 3,3125
    expect(custoMedioPonderado(300, 3, 500, 1750)).toBeCloseTo(3.3125, 10)
  })

  it('compra de volume zero não altera nada', () => {
    expect(custoMedioPonderado(300, 3, 0, 999)).toBe(3)
  })
})
