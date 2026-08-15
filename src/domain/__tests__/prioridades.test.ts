import { describe, expect, it } from 'vitest'

import { prioridadesDe, resumoDaFila, type EstadoDaOperacao } from '../prioridades'

const CALMO: EstadoDaOperacao = {
  caixaHoje: 10000,
  diasAteNegativar: null,
  menorSaldo: 8000,
  menorSaldoEm: null,
  vencidos: { valor: 0, qtd: 0 },
  aPagar: { valor: 1200, qtd: 3 },
  conciliacaoSemCredito: { valor: 0, qtd: 0 },
  conciliacaoVencida: { valor: 0, qtd: 0 },
  lancamentosSemCategoria: 0,
  estoque: [],
  faturamentoAtual: 5000,
  faturamentoAnterior: 4800,
  rotuloDoPeriodo: 'Últimos 30 dias',
}

describe('prioridadesDe', () => {
  it('operação saudável não gera fila', () => {
    expect(prioridadesDe(CALMO)).toEqual([])
    expect(resumoDaFila([])).toBe('Nada exige decisão agora.')
  })

  it('caixa que negativa em menos de uma semana é crítico', () => {
    const f = prioridadesDe({ ...CALMO, diasAteNegativar: 4, menorSaldo: -2300, menorSaldoEm: '2026-08-22' })
    expect(f[0].id).toBe('caixa-negativa')
    expect(f[0].severidade).toBe('critico')
    expect(f[0].detalhe).toContain('4 dias')
    expect(f[0].detalhe).toContain('R$ -2.300,00')
  })

  it('caixa que negativa mais longe ainda entra, mas como alto', () => {
    const f = prioridadesDe({ ...CALMO, diasAteNegativar: 20, menorSaldo: -100, menorSaldoEm: '2026-09-04' })
    expect(f[0].severidade).toBe('alto')
  })

  it('negativo hoje não vira "faltam 0 dias"', () => {
    // Frase errada aqui é pior que número errado: "faltam 0 dias" faz parecer
    // que ainda dá tempo.
    const f = prioridadesDe({ ...CALMO, diasAteNegativar: 0, menorSaldo: -500 })
    expect(f[0].detalhe).toContain('já está negativo hoje')
    expect(f[0].detalhe).not.toContain('Faltam')
  })

  it('conta vencida é crítica e diz quanto', () => {
    const f = prioridadesDe({ ...CALMO, vencidos: { valor: 1834.5, qtd: 2 } })
    const item = f.find((p) => p.id === 'contas-vencidas')!
    expect(item.severidade).toBe('critico')
    expect(item.detalhe).toBe('2 contas venceram e não foram pagas: R$ 1.834,50.')
  })

  it('singular e plural saem certos', () => {
    const um = prioridadesDe({ ...CALMO, vencidos: { valor: 50, qtd: 1 } })
    expect(um[0].detalhe).toBe('1 conta venceu e não foi paga: R$ 50,00.')
  })

  it('só entra na fila a venda cujo prazo de repasse já venceu', () => {
    // Venda de ontem sem crédito é normal — o gateway ainda tem prazo. Se ela
    // entrasse na fila, a fila teria item novo todo dia e ninguém a leria.
    const f = prioridadesDe({
      ...CALMO,
      conciliacaoSemCredito: { valor: 3703.37, qtd: 26 },
      conciliacaoVencida: { valor: 0, qtd: 0 },
    })
    expect(f.find((p) => p.id === 'conciliacao-vencida')).toBeUndefined()
  })

  it('conciliação vencida entra com o valor em risco', () => {
    const f = prioridadesDe({ ...CALMO, conciliacaoVencida: { valor: 3361.94, qtd: 24 } })
    const item = f.find((p) => p.id === 'conciliacao-vencida')!
    expect(item.detalhe).toContain('24 vendas passaram')
    expect(item.valor).toBe(3361.94)
  })

  it('base zerada e base acabando são itens distintos', () => {
    const f = prioridadesDe({
      ...CALMO,
      estoque: [
        { nome: 'Sauvage', marca: 'Dior', dias: null, criticidade: 'zero', disponivelMl: 0 },
        { nome: 'Bleu', marca: 'Chanel', dias: 3, criticidade: 'urgente', disponivelMl: 14 },
      ],
    })
    expect(f.map((p) => p.id)).toContain('estoque-zerado')
    expect(f.map((p) => p.id)).toContain('estoque-urgente')
    expect(f.find((p) => p.id === 'estoque-urgente')!.detalhe).toContain('Bleu (3 dias)')
  })

  it('base com criticidade urgente mas sem saldo conta como zerada, não como urgente', () => {
    const f = prioridadesDe({
      ...CALMO,
      estoque: [{ nome: 'Aventus', marca: 'Creed', dias: 0, criticidade: 'urgente', disponivelMl: 0 }],
    })
    expect(f.find((p) => p.id === 'estoque-zerado')).toBeDefined()
    expect(f.find((p) => p.id === 'estoque-urgente')).toBeUndefined()
  })

  it('lista longa de bases vira "e mais N"', () => {
    const estoque = ['A', 'B', 'C', 'D', 'E'].map((nome) => ({
      nome, marca: null, dias: null, criticidade: 'zero', disponivelMl: 0,
    }))
    expect(prioridadesDe({ ...CALMO, estoque })[0].detalhe).toContain('e mais 2')
  })

  it('queda pequena não vira item', () => {
    const f = prioridadesDe({ ...CALMO, faturamentoAtual: 4400, faturamentoAnterior: 4800 })
    expect(f).toEqual([])
  })

  it('queda de 20% ou mais vira item', () => {
    const f = prioridadesDe({ ...CALMO, faturamentoAtual: 3840, faturamentoAnterior: 4800 })
    expect(f[0].id).toBe('queda-de-faturamento')
    expect(f[0].detalhe).toContain('queda de 20%')
  })

  it('base pequena demais não gera alarme de queda', () => {
    // -100% sobre R$ 80 do mês anterior é ruído estatístico, não sinal.
    const f = prioridadesDe({ ...CALMO, faturamentoAtual: 0, faturamentoAnterior: 80 })
    expect(f).toEqual([])
  })

  it('crescimento nunca entra na fila', () => {
    const f = prioridadesDe({ ...CALMO, faturamentoAtual: 9000, faturamentoAnterior: 4800 })
    expect(f).toEqual([])
  })

  it('sem categoria é o último da fila', () => {
    const f = prioridadesDe({
      ...CALMO,
      vencidos: { valor: 100, qtd: 1 },
      lancamentosSemCategoria: 37,
    })
    expect(f[f.length - 1].id).toBe('sem-categoria')
    expect(f[f.length - 1].severidade).toBe('medio')
  })

  it('ordena por severidade e, no empate, pelo dinheiro em jogo', () => {
    const f = prioridadesDe({
      ...CALMO,
      vencidos: { valor: 300, qtd: 1 },
      estoque: [{ nome: 'X', marca: null, dias: null, criticidade: 'zero', disponivelMl: 0 }],
      diasAteNegativar: 3,
      menorSaldo: -9000,
    })
    // Os três primeiros são críticos; entre eles o de maior valor vem antes.
    expect(f.slice(0, 3).every((p) => p.severidade === 'critico')).toBe(true)
    expect(f[0].id).toBe('caixa-negativa')
  })

  it('todo item traz número, link e ação', () => {
    const f = prioridadesDe({
      ...CALMO,
      diasAteNegativar: 2,
      menorSaldo: -500,
      vencidos: { valor: 100, qtd: 1 },
      conciliacaoVencida: { valor: 200, qtd: 1 },
      lancamentosSemCategoria: 4,
      estoque: [{ nome: 'X', marca: null, dias: 2, criticidade: 'urgente', disponivelMl: 10 }],
    })
    expect(f.length).toBeGreaterThan(0)
    for (const p of f) {
      expect(p.href).toMatch(/^\//)
      expect(p.acao.length).toBeGreaterThan(0)
      expect(p.detalhe).toMatch(/\d/)
    }
  })
})

describe('resumoDaFila', () => {
  it('conta críticos separadamente', () => {
    const f = prioridadesDe({
      ...CALMO,
      vencidos: { valor: 100, qtd: 1 },
      lancamentosSemCategoria: 2,
    })
    expect(resumoDaFila(f)).toBe('1 item crítico e 1 outro na fila.')
  })

  it('sem críticos, diz que não há crítico', () => {
    const f = prioridadesDe({ ...CALMO, lancamentosSemCategoria: 2 })
    expect(resumoDaFila(f)).toBe('1 item para decidir, nenhum crítico.')
  })
})
