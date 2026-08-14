import { describe, expect, it } from 'vitest'

import {
  apurarDerivado,
  alertasDaBase,
  coberturaDe,
  disponivelDe,
  excedenteDe,
  sincronizarBase,
  sincronizarVariante,
  unidadesPossiveis,
} from '..'
import type { PerfumeBase, ProdutoDerivado } from '..'

/**
 * As invariantes de estoque do escopo, uma a uma.
 *
 * Elas existem porque cada uma já falhou em produção: o KPI de −105 unidades
 * prontas, a cobertura de "0 dias" em perfume que não vende, e a loja
 * publicando 20 unidades de cada variante sobre o mesmo frasco.
 */

const base = (p: Partial<PerfumeBase> = {}): PerfumeBase => ({
  id: 'bac',
  nome: 'Baccarat Rouge 540',
  marca: 'Maison Francis',
  custoPorMl: 3.1,
  volumeMl: 100,
  reservadoMl: 0,
  consumoDiarioMl: 5,
  sobControle: true,
  ...p,
})

describe('físico, reservado e disponível são três números diferentes', () => {
  it('reserva reduz o disponível sem tocar no físico', () => {
    const b = base({ volumeMl: 100, reservadoMl: 30 })
    expect(b.volumeMl).toBe(100)
    expect(disponivelDe(b)).toBe(70)
  })

  it('disponível NUNCA é negativo — o excedente vira número próprio', () => {
    // O caso real: 59 bases com pedido pago acima do volume que existia.
    const b = base({ volumeMl: 10, reservadoMl: 25 })
    expect(disponivelDe(b)).toBe(0)
    expect(excedenteDe(b)).toBe(15)
  })

  it('sem reserva declarada, disponível é o físico inteiro', () => {
    expect(disponivelDe(base({ volumeMl: 40, reservadoMl: undefined }))).toBe(40)
  })
})

describe('cobertura não inventa prazo', () => {
  it('sem consumo NÃO é zero dia: é ausência de histórico', () => {
    // O defeito do mockup: "COBERTURA 5 dias · ACABA EM 0 dias" em perfume
    // que ninguém compra. Zero dias dispara recompra urgente do que está
    // parado na prateleira.
    const c = coberturaDe(base({ volumeMl: 100, consumoDiarioMl: 0 }))
    expect(c.dias).toBeNull()
    expect(c.cobertura).toBe('Sem consumo')
    expect(c.criticidade).toBe('sem_giro')
    expect(c.acao).toContain('sem consumo')
  })

  it('cobertura divide o DISPONÍVEL, não o físico', () => {
    // 100 ml no frasco, 50 reservados, consumo de 5 ml/dia: sobram 10 dias
    // de venda, não 20. Dividir o físico prometeria o que já foi vendido.
    const c = coberturaDe(base({ volumeMl: 100, reservadoMl: 50, consumoDiarioMl: 5 }))
    expect(c.dias).toBe(10)
  })

  it('separa "acabou" de "o ERP nunca soube"', () => {
    const semCarga = coberturaDe(base({ volumeMl: 0, sobControle: false }))
    expect(semCarga.criticidade).toBe('sem_carga')
    expect(semCarga.cta).toBe('Registrar compra')

    const esgotado = coberturaDe(base({ volumeMl: 0, sobControle: true }))
    expect(esgotado.criticidade).toBe('zero')
    expect(esgotado.cta).toBe('Recomprar')
  })

  it('tudo reservado é ruptura de venda, com o motivo certo', () => {
    const c = coberturaDe(base({ volumeMl: 60, reservadoMl: 60 }))
    expect(c.disponivelMl).toBe(0)
    expect(c.criticidade).toBe('zero')
    expect(c.acao).toContain('reservado')
  })
})

describe('alertas derivados', () => {
  it('reserva sem lastro é erro, e diz quanto falta', () => {
    const c = coberturaDe(base({ volumeMl: 10, reservadoMl: 25 }))
    const a = alertasDaBase(c).find((x) => x.chave === 'excedente')
    expect(a?.grau).toBe('erro')
    expect(a?.texto).toContain('15 ml')
  })

  it('lote que não bate com o saldo vira alerta de inconsistência', () => {
    const c = coberturaDe(base({ volumeMl: 100 }))
    expect(alertasDaBase(c, 100)).not.toContainEqual(
      expect.objectContaining({ chave: 'lote-inconsistente' }),
    )
    expect(alertasDaBase(c, 80)).toContainEqual(
      expect.objectContaining({ chave: 'lote-inconsistente' }),
    )
  })

  it('base sem custo com volume avisa que a valoração fica sem base', () => {
    const c = coberturaDe(base({ custoPorMl: 0, volumeMl: 50 }))
    expect(alertasDaBase(c)).toContainEqual(expect.objectContaining({ chave: 'sem-custo' }))
  })
})

describe('capacidade por variante não é aditiva', () => {
  it('o mesmo volume não sustenta todas as variantes ao mesmo tempo', () => {
    // Cenário obrigatório do escopo: 100 ml disponíveis.
    expect(unidadesPossiveis(100, 5)).toBe(20)
    expect(unidadesPossiveis(100, 10)).toBe(10)
    // Somar as duas daria 30 unidades sobre 100 ml — 250 ml de promessa.
    const somaIngenua = unidadesPossiveis(100, 5) * 5 + unidadesPossiveis(100, 10) * 10
    expect(somaIngenua).toBeGreaterThan(100)
  })

  it('a sincronia calcula todas as irmãs a partir do MESMO disponível', () => {
    const b = base({ volumeMl: 100, reservadoMl: 40 })
    const s = sincronizarBase(b, [], {})
    expect(s.disponivelMl).toBe(60)
    // 60 ml: 12 unidades de 5 ml, 6 de 10 ml, 4 de 15 ml.
    expect(s.variantes.find((v) => v.variante === 5)!.possivel).toBe(12)
    expect(s.variantes.find((v) => v.variante === 10)!.possivel).toBe(6)
    expect(s.variantes.find((v) => v.variante === 15)!.possivel).toBe(4)
  })

  it('vender reduz o publicado das irmãs, não só da variante vendida', () => {
    // Regra 13: alteração de disponibilidade recalcula todas as irmãs.
    const semReserva = sincronizarBase(base({ volumeMl: 100 }), [], {})
    const comReserva = sincronizarBase(base({ volumeMl: 100, reservadoMl: 90 }), [], {})
    for (const v of [3, 5, 8, 10, 15]) {
      const antes = semReserva.variantes.find((x) => x.variante === v)!.possivel
      const depois = comReserva.variantes.find((x) => x.variante === v)!.possivel
      expect(depois).toBeLessThan(antes)
    }
  })

  it('sem carga a loja fica intocada, mesmo com volume zero', () => {
    const s = sincronizarBase(base({ volumeMl: 0, sobControle: false }), [], {})
    expect(s.variantes.every((v) => v.acao === 'sem_carga')).toBe(true)
    expect(s.variantes.every((v) => v.novoValor === v.publicado)).toBe(true)
  })

  it('esgota na loja quando não há volume disponível', () => {
    const v = sincronizarVariante(0, 5, 0, 20, true)
    expect(v.acao).toBe('esgotar')
    expect(v.novoValor).toBe(0)
    expect(v.excesso).toBe(20)
  })
})

describe('disponibilidade por variante nunca fica negativa', () => {
  const linha = (envasadas: number, reservadas: number, disponivelBaseMl = 0) =>
    apurarDerivado('bac', 'Baccarat', 'MFK', 5, envasadas, reservadas, 50, disponivelBaseMl)

  it('reserva acima do pronto vira demanda pendente, não estoque negativo', () => {
    // O "−105 prontas para venda" do mockup, na origem.
    const l = linha(0, 105)
    expect(l.disponiveis).toBe(0)
    expect(l.pendentes).toBe(105)
  })

  it('capacidade vem do volume da base e soma ao pronto para o vendável', () => {
    const l = linha(3, 1, 100)
    expect(l.disponiveis).toBe(2)
    expect(l.capacidade).toBe(20)
    expect(l.vendaveis).toBe(22)
  })

  it('sem volume e sem pronto, o estado é explícito', () => {
    expect(linha(0, 0, 0).estado).toBe('Sem volume')
    expect(linha(0, 0, 100).estado).toBe('Sob demanda')
  })

  it('valor só conta o que está pronto — capacidade não é estoque', () => {
    const l = linha(2, 0, 1000)
    expect(l.valorTotal).toBe(100)
  })
})
