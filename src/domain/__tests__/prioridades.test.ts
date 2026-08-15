import { describe, expect, it } from 'vitest'

import {
  briefingDe,
  prioridadesDe,
  resumoDaFila,
  TETO_DA_FILA,
  type EstadoDaOperacao,
} from '../prioridades'

const CALMO: EstadoDaOperacao = {
  caixaHoje: 10000,
  diasAteNegativar: null,
  menorSaldo: 8000,
  menorSaldoEm: null,
  vencidos: { valor: 0, qtd: 0 },
  aPagar: { valor: 0, qtd: 0 },
  conciliacaoAguardando: { valor: 0, qtd: 0 },
  conciliacaoVencida: { valor: 0, qtd: 0 },
  lancamentosSemCategoria: 0,
  estoque: [],
  faturamentoAtual: 5000,
  faturamentoAnterior: 4800,
  pedidosAtual: 40,
  pedidosAnterior: 38,
  rotuloDoPeriodo: 'Últimos 30 dias',
}

describe('prioridadesDe — os sete campos do escopo §7.1', () => {
  it('operação saudável não gera fila', () => {
    expect(prioridadesDe(CALMO)).toEqual([])
    expect(resumoDaFila([])).toBe('Nada exige decisão agora.')
  })

  it('todo item traz os sete campos preenchidos', () => {
    const f = prioridadesDe({
      ...CALMO,
      diasAteNegativar: 2,
      menorSaldo: -500,
      vencidos: { valor: 100, qtd: 1 },
      conciliacaoVencida: { valor: 200, qtd: 1 },
      lancamentosSemCategoria: 4,
      estoque: [
        { nome: 'X', marca: null, dias: 2, criticidade: 'urgente', disponivelMl: 10, reservadoMl: 0 },
      ],
    })
    expect(f.length).toBeGreaterThan(0)
    for (const p of f) {
      expect(p.titulo.length).toBeGreaterThan(0)
      expect(['critico', 'alto', 'medio', 'informativo']).toContain(p.severidade)
      expect(p.impactoOperacional).toMatch(/\S/)
      expect(p.urgencia).toMatch(/\S/)
      expect(['alta', 'media', 'baixa']).toContain(p.confianca.nivel)
      expect(p.confianca.motivo).toMatch(/\S/)
      expect(['Dono', 'Financeiro', 'Operação', 'Atendimento']).toContain(p.responsavel)
      expect(p.proximaAcao.href).toMatch(/^\//)
      expect(p.proximaAcao.texto).toMatch(/\S/)
    }
  })

  it('respeita o teto de cinco itens do escopo', () => {
    const f = prioridadesDe({
      ...CALMO,
      diasAteNegativar: 1,
      menorSaldo: -9000,
      vencidos: { valor: 900, qtd: 4 },
      conciliacaoVencida: { valor: 3000, qtd: 20 },
      lancamentosSemCategoria: 39,
      faturamentoAtual: 1000,
      faturamentoAnterior: 5000,
      estoque: [
        { nome: 'A', marca: null, dias: null, criticidade: 'zero', disponivelMl: 0, reservadoMl: 30 },
        { nome: 'B', marca: null, dias: 2, criticidade: 'urgente', disponivelMl: 8, reservadoMl: 0 },
      ],
    })
    expect(f).toHaveLength(TETO_DA_FILA)
    // O que sobrevive ao corte é o mais severo, nunca o mais recente.
    expect(f[0].severidade).toBe('critico')
  })

  it('caixa que negativa em menos de uma semana é crítico', () => {
    const f = prioridadesDe({
      ...CALMO,
      diasAteNegativar: 4,
      menorSaldo: -2300,
      menorSaldoEm: '2026-08-22',
    })
    expect(f[0].id).toBe('caixa-negativa')
    expect(f[0].severidade).toBe('critico')
    expect(f[0].urgencia).toContain('4 dias')
    expect(f[0].impactoFinanceiro).toBe(-2300)
  })

  it('negativo hoje não vira "em 0 dias"', () => {
    const f = prioridadesDe({ ...CALMO, diasAteNegativar: 0, menorSaldo: -500 })
    expect(f[0].urgencia).toBe('O saldo projetado já está negativo hoje.')
  })

  it('conta vencida é crítica, com impacto negativo e confiança alta', () => {
    const f = prioridadesDe({ ...CALMO, vencidos: { valor: 1834.5, qtd: 2 } })
    const item = f.find((p) => p.id === 'contas-vencidas')!
    expect(item.severidade).toBe('critico')
    expect(item.impactoFinanceiro).toBe(-1834.5)
    expect(item.confianca.nivel).toBe('alta')
    expect(item.responsavel).toBe('Financeiro')
  })

  it('venda dentro do prazo do gateway não entra na fila', () => {
    // Venda de ontem sem crédito é normal. Se entrasse, a fila teria item novo
    // todo dia e ninguém a leria.
    const f = prioridadesDe({
      ...CALMO,
      conciliacaoAguardando: { valor: 341.43, qtd: 3 },
      conciliacaoVencida: { valor: 0, qtd: 0 },
    })
    expect(f.find((p) => p.id === 'conciliacao-vencida')).toBeUndefined()
  })

  it('base sem compra registrada NUNCA entra na fila', () => {
    // Regra da casa: não contabilizar estoque de produto do qual não se comprou
    // frasco. Sem isso a fila anunciava "393 bases zeradas" — o catálogo
    // inteiro. Alerta que acusa tudo não acusa nada.
    const catalogo = Array.from({ length: 393 }, (_, i) => ({
      nome: `Base ${i}`,
      marca: null,
      dias: null,
      criticidade: 'sem_carga',
      disponivelMl: 0,
      reservadoMl: 0,
    }))
    expect(prioridadesDe({ ...CALMO, estoque: catalogo })).toEqual([])
  })

  it('base zerada COM pedido pago esperando é crítica; sem pedido, é alta', () => {
    const comReserva = prioridadesDe({
      ...CALMO,
      estoque: [
        { nome: 'Sauvage', marca: 'Dior', dias: null, criticidade: 'zero', disponivelMl: 0, reservadoMl: 45 },
      ],
    })
    expect(comReserva[0].severidade).toBe('critico')
    expect(comReserva[0].impactoOperacional).toContain('45 ml já vendidos e sem lastro')

    const semReserva = prioridadesDe({
      ...CALMO,
      estoque: [
        { nome: 'Sauvage', marca: 'Dior', dias: null, criticidade: 'zero', disponivelMl: 0, reservadoMl: 0 },
      ],
    })
    expect(semReserva[0].severidade).toBe('alto')
  })

  it('a urgência do estoque acabando cita a base que acaba primeiro', () => {
    const f = prioridadesDe({
      ...CALMO,
      estoque: [
        { nome: 'Bleu', marca: null, dias: 5, criticidade: 'urgente', disponivelMl: 14, reservadoMl: 0 },
        { nome: 'Aventus', marca: null, dias: 2, criticidade: 'urgente', disponivelMl: 9, reservadoMl: 0 },
      ],
    })
    expect(f[0].urgencia).toContain('2 dias')
  })

  it('queda pequena não vira item, crescimento nunca vira', () => {
    expect(prioridadesDe({ ...CALMO, faturamentoAtual: 4400, faturamentoAnterior: 4800 })).toEqual([])
    expect(prioridadesDe({ ...CALMO, faturamentoAtual: 9000, faturamentoAnterior: 4800 })).toEqual([])
  })

  it('base pequena demais não gera alarme de queda', () => {
    // -100% sobre R$ 80 do mês anterior é ruído estatístico, não sinal.
    expect(prioridadesDe({ ...CALMO, faturamentoAtual: 0, faturamentoAnterior: 80 })).toEqual([])
  })

  it('sem categoria é informativo e fica por último', () => {
    const f = prioridadesDe({
      ...CALMO,
      vencidos: { valor: 100, qtd: 1 },
      lancamentosSemCategoria: 39,
    })
    expect(f[f.length - 1].id).toBe('sem-categoria')
    expect(f[f.length - 1].severidade).toBe('informativo')
  })
})

describe('briefingDe — as três seções do escopo §7.2', () => {
  it('operação estável não repete indicador só para ter o que dizer', () => {
    // §7.2: "não deve repetir indicadores estáveis sem motivo".
    const b = briefingDe(CALMO, [])
    expect(b).toEqual({ mudou: [], exigeAcao: [], acompanhar: [] })
  })

  it('variação relevante vira notícia em "o que mudou"', () => {
    const e = { ...CALMO, faturamentoAtual: 7200, faturamentoAnterior: 4800, pedidosAtual: 55 }
    expect(briefingDe(e, [])).toMatchObject({
      mudou: ['Últimos 30 dias: R$ 7.200,00 em 55 pedidos, alta de 50% contra o período anterior.'],
    })
  })

  it('item acionável vai para "exige ação"; informativo vai para "acompanhar"', () => {
    const e = { ...CALMO, vencidos: { valor: 500, qtd: 1 }, lancamentosSemCategoria: 39 }
    const b = briefingDe(e, prioridadesDe(e))
    expect(b.exigeAcao).toHaveLength(1)
    expect(b.exigeAcao[0]).toContain('Contas vencidas')
    expect(b.acompanhar[0]).toContain('DRE não classifica')
  })

  it('o teto de cinco vale para o briefing inteiro, e ação vence', () => {
    const e: EstadoDaOperacao = {
      ...CALMO,
      diasAteNegativar: 1,
      menorSaldo: -9000,
      vencidos: { valor: 900, qtd: 4 },
      conciliacaoVencida: { valor: 3000, qtd: 20 },
      conciliacaoAguardando: { valor: 300, qtd: 2 },
      aPagar: { valor: 1200, qtd: 3 },
      lancamentosSemCategoria: 39,
      faturamentoAtual: 1000,
      faturamentoAnterior: 5000,
    }
    const b = briefingDe(e, prioridadesDe(e))
    const total = b.mudou.length + b.exigeAcao.length + b.acompanhar.length
    expect(total).toBe(5)
    // Com espaço apertado, o que pede trabalho é o que sobrevive.
    expect(b.exigeAcao.length).toBeGreaterThan(0)
  })
})

describe('resumoDaFila', () => {
  it('conta críticos separadamente', () => {
    const e = { ...CALMO, vencidos: { valor: 100, qtd: 1 }, lancamentosSemCategoria: 2 }
    expect(resumoDaFila(prioridadesDe(e))).toBe('1 item crítico e 1 outro na fila.')
  })

  it('sem críticos, diz que não há crítico', () => {
    expect(resumoDaFila(prioridadesDe({ ...CALMO, lancamentosSemCategoria: 2 }))).toBe(
      '1 item para decidir, nenhum crítico.',
    )
  })
})
