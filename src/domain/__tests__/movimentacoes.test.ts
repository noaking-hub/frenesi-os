import { describe, expect, it } from 'vitest'

import {
  apurarDerivado,
  apurarInventario,
  origemDoAjuste,
  perdaTecnica,
  resumirMovimentacoes,
} from '..'
import type { ContagemInventario, Movimentacao } from '..'

const saida = (
  id: string,
  volumeMl: number,
  liquidoMl: number | null,
  ref = 'OP-0001',
): Movimentacao => ({
  id,
  baseId: 'bac',
  perfume: 'Baccarat Rouge 540',
  tipo: 'saida',
  data: '03/08 09:12',
  volumeMl,
  liquidoMl,
  ref,
  motivo: 'Ordem de produção',
  responsavel: 'Pedro A.',
  saldoMl: 640,
})

describe('movimentações', () => {
  it('deriva a perda técnica da diferença entre consumido e envasado', () => {
    // 24 decants de 5 ml: 120 ml no frasco, 123,6 ml fora do estoque.
    expect(perdaTecnica(saida('MV-1', -123.6, 120))).toBeCloseTo(3.6, 5)
  })

  it('não atribui perda técnica a entrada, ajuste ou devolução', () => {
    const entrada: Movimentacao = { ...saida('MV-2', 500, null), tipo: 'entrada' }
    expect(perdaTecnica(entrada)).toBe(0)
  })

  it('classifica o ajuste pela referência, não por um campo à parte', () => {
    const ajuste = (ref: string): Movimentacao => ({
      ...saida('MV-3', -10, null, ref),
      tipo: 'ajuste',
    })
    expect(origemDoAjuste(ajuste('LT-079'))).toBe('encerramento-lote')
    expect(origemDoAjuste(ajuste('INV-0726'))).toBe('divergencia-contagem')
    expect(origemDoAjuste(ajuste('XX-1'))).toBe('outro')
    // Uma saída nunca é ajuste, mesmo que a ref pareça de lote.
    expect(origemDoAjuste(saida('MV-4', -10, 10, 'LT-079'))).toBe('outro')
  })

  it('resume o período separando envasado, perda e ajustes por origem', () => {
    const movs: Movimentacao[] = [
      saida('MV-1', -123.6, 120),
      saida('MV-2', -278.1, 270),
      { ...saida('MV-3', 500, null, 'NF-1'), tipo: 'entrada' },
      { ...saida('MV-4', 5, null, 'DEV-1'), tipo: 'devolucao' },
      { ...saida('MV-5', -10, null, 'LT-079'), tipo: 'ajuste' },
      { ...saida('MV-6', -12, null, 'INV-0726'), tipo: 'ajuste' },
    ]
    const r = resumirMovimentacoes(movs)

    expect(r.total).toBe(6)
    expect(r.entradasMl).toBe(505)
    expect(r.saidasMl).toBeCloseTo(401.7, 5)
    expect(r.envasadoMl).toBe(390)
    // consumido − envasado = perda
    expect(r.perdaMl).toBeCloseTo(11.7, 5)
    expect(r.perdaPct).toBeCloseTo(3, 5)
    expect(r.ajustesMl).toBe(22)
    expect(r.encerramentosDeLote).toBe(1)
    expect(r.divergenciasDeContagem).toBe(1)
  })
})

describe('inventário', () => {
  const contagens: ContagemInventario[] = [
    { baseId: 'bac', perfume: 'Baccarat', sistemaMl: 640, movimentosMl: 0, contadoMl: 640, responsavel: 'Pedro A.', quando: 'hoje' },
    { baseId: 'sau', perfume: 'Sauvage', sistemaMl: 1180, movimentosMl: 0, contadoMl: 1174, responsavel: 'Pedro A.', quando: 'hoje' },
    { baseId: 'blu', perfume: 'Bleu', sistemaMl: 760, movimentosMl: 0, contadoMl: 768, responsavel: 'Marina F.', quando: 'hoje' },
    // Ninguém contou: diferente de contar zero.
    { baseId: 'gg', perfume: 'Good Girl', sistemaMl: 340, movimentosMl: 0, contadoMl: null, responsavel: null, quando: null },
  ]

  it('não confunde base não contada com contagem zerada', () => {
    const inv = apurarInventario(contagens)
    const naoContada = inv.linhas.find((l) => l.baseId === 'gg')!
    expect(naoContada.contado).toBe(false)
    expect(naoContada.divergente).toBe(false)
    expect(naoContada.diferencaMl).toBe(0)
    expect(inv.pendentes).toBe(1)
  })

  it('conta divergências só entre as bases efetivamente contadas', () => {
    const inv = apurarInventario(contagens)
    expect(inv.contadas).toBe(3)
    expect(inv.semDivergencia).toBe(1)
    expect(inv.divergentes).toBe(2)
  })

  it('soma a diferença líquida com sinal', () => {
    // −6 (Sauvage) + 8 (Bleu) = +2
    expect(apurarInventario(contagens).diferencaLiquidaMl).toBe(2)
  })

  it('ignora base não contada na diferença líquida', () => {
    const so = apurarInventario([contagens[3]])
    expect(so.diferencaLiquidaMl).toBe(0)
    expect(so.contadas).toBe(0)
  })
})

describe('produtos derivados', () => {
  it('calcula disponível, volume imobilizado e valor a preço de venda', () => {
    const d = apurarDerivado('bac', 'Baccarat', 'Maison Francis', 5, 8, 3, 79.9)
    expect(d.disponiveis).toBe(5)
    expect(d.volumeMl).toBe(40)
    // Valor conta o que está PRONTO E LIVRE: capacidade não é estoque, e
    // unidade reservada já tem dono.
    expect(d.valorTotal).toBeCloseTo(399.5, 5)
    expect(d.estado).toBe('Disponível')
  })

  it('marca tudo reservado quando não sobra unidade', () => {
    expect(apurarDerivado('del', 'Delina', 'Marly', 5, 2, 2, 62.9).estado).toBe('Tudo reservado')
    // Sem unidade pronta e sem volume na base, o estado é outro: não há o
    // que separar, há o que comprar.
    expect(apurarDerivado('del', 'Delina', 'Marly', 5, 0, 0, 62.9).estado).toBe('Sem volume')
  })

  it('avisa nas últimas unidades', () => {
    expect(apurarDerivado('erb', 'Erba', 'Xerjoff', 10, 3, 1, 154.9).estado).toBe(
      'Últimas unidades',
    )
  })
})
