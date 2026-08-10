import { describe, expect, it } from 'vitest'

import {
  conciliarRepasse,
  lancamentoPendente,
  montarDre,
  participacao,
  participacaoCategoria,
  pontoEquilibrio,
  resumirCategorias,
  resumirLancamentos,
  saldoConsolidado,
} from '..'
import type { CategoriaFinanceira, ContaBancaria, Lancamento, Repasse } from '..'

const lanc = (p: Partial<Lancamento>): Lancamento => ({
  id: 'LC-1',
  data: '05/08',
  descricao: 'Teste',
  categoria: 'Serviços',
  conta: 'Inter PJ',
  tipo: 'saida',
  valor: 100,
  status: 'Pago',
  recorrente: false,
  origem: 'Manual',
  ...p,
})

describe('lançamentos', () => {
  it('separa a pagar, vencido e a receber', () => {
    const r = resumirLancamentos([
      lanc({ id: 'A', status: 'A pagar', valor: 1240 }),
      lanc({ id: 'B', status: 'A pagar', valor: 2180 }),
      lanc({ id: 'C', status: 'Vencido', valor: 4310 }),
      lanc({ id: 'D', tipo: 'entrada', status: 'Previsto', valor: 8432.1 }),
      lanc({ id: 'E', tipo: 'entrada', status: 'Recebido', valor: 5218.4 }),
      lanc({ id: 'F', status: 'Pago', valor: 890, recorrente: true }),
    ])
    expect(r.aPagar).toBe(3420)
    expect(r.aPagarQtd).toBe(2)
    expect(r.vencido).toBe(4310)
    expect(r.aReceber).toBeCloseTo(8432.1, 5)
    expect(r.recorrentes).toBe(890)
  })

  it('marca como pendente só o que precisa de baixa', () => {
    expect(lancamentoPendente(lanc({ status: 'A pagar' }))).toBe(true)
    expect(lancamentoPendente(lanc({ status: 'Vencido' }))).toBe(true)
    expect(lancamentoPendente(lanc({ status: 'Pago' }))).toBe(false)
    expect(lancamentoPendente(lanc({ status: 'Previsto', tipo: 'entrada' }))).toBe(false)
  })
})

describe('contas', () => {
  const contas: ContaBancaria[] = [
    { id: 'a', nome: 'Inter', tipo: '', banco: '', saldo: 38420, entradasMes: 0, saidasMes: 0, uso: '', principal: true, saldoInformado: null, saldoInformadoEm: null },
    { id: 'b', nome: 'Nubank', tipo: '', banco: '', saldo: 18960, entradasMes: 0, saidasMes: 0, uso: '', principal: false, saldoInformado: null, saldoInformadoEm: null },
    { id: 'c', nome: 'Reserva', tipo: '', banco: '', saldo: 5100, entradasMes: 0, saidasMes: 0, uso: '', principal: false, saldoInformado: null, saldoInformadoEm: null },
  ]

  it('consolida o saldo e reparte a participação', () => {
    expect(saldoConsolidado(contas)).toBe(62480)
    expect(participacao(contas[0], contas)).toBeCloseTo(61.49, 1)
    const soma = contas.reduce((a, c) => a + participacao(c, contas), 0)
    expect(soma).toBeCloseTo(100, 5)
  })
})

describe('conciliação de repasses', () => {
  const repasse = (p: Partial<Repasse>): Repasse => ({
    pedidoId: '#1',
    origem: 'Shopify · Cartão 1x',
    esperado: 389,
    taxaPct: 4.33,
    recebido: 372.15,
    pagamentoConfirmado: true,
    ...p,
  })

  it('concilia quando o recebido bate com o esperado menos a taxa', () => {
    // 389 × (1 − 4,33%) = 372,16 — 1 centavo de arredondamento é tolerado.
    const r = conciliarRepasse(repasse({}))
    expect(r.liquidoEsperado).toBeCloseTo(372.16, 2)
    expect(r.status).toBe('conciliado')
    expect(r.diferenca).toBeNull()
  })

  it('confirma Pix integral sem taxa', () => {
    const r = conciliarRepasse(repasse({ origem: 'Yampi · Pix', esperado: 352, taxaPct: 0, recebido: 352 }))
    expect(r.status).toBe('confirmado')
  })

  it('acusa divergência com o valor exato da diferença', () => {
    const r = conciliarRepasse(repasse({ esperado: 612.5, recebido: 561.4 }))
    expect(r.status).toBe('divergente')
    // 612,50 × 0,9567 = 585,98 → recebeu 24,58 a menos.
    expect(r.diferenca).toBeCloseTo(-24.58, 2)
    expect(r.precisaAcao).toBe(true)
  })

  it('acusa divergência também quando cai a MAIS', () => {
    const r = conciliarRepasse(repasse({ esperado: 458, recebido: 486.2 }))
    expect(r.status).toBe('divergente')
    // 458 × 0,9567 = 438,17 → 486,20 − 438,17 = 48,03. O protótipo mostrava
    // 48,04 digitado à mão — a derivação corrige o centavo.
    expect(r.diferenca).toBeCloseTo(48.03, 2)
  })

  it('separa previsto (pagamento não confirmado) de pendente (repasse não caiu)', () => {
    const previsto = conciliarRepasse(repasse({ recebido: null, pagamentoConfirmado: false }))
    const pendente = conciliarRepasse(repasse({ recebido: null, pagamentoConfirmado: true }))
    expect(previsto.status).toBe('previsto')
    expect(previsto.precisaAcao).toBe(false)
    expect(pendente.status).toBe('pendente')
    expect(pendente.precisaAcao).toBe(true)
  })
})

describe('DRE', () => {
  const dre = montarDre(
    { linha: 'Receita bruta', valor: 198430, nota: '' },
    [
      { linha: 'Descontos e cupons', valor: 11806, nota: '' },
      { linha: 'Devoluções', valor: 3820, nota: '' },
    ],
    [
      { linha: 'Impostos', valor: 10968, nota: '' },
      { linha: 'Taxas', valor: 11557, nota: '' },
      { linha: 'CPV', valor: 58240, nota: '' },
      { linha: 'Embalagens', valor: 9640, nota: '' },
      { linha: 'Frete', valor: 8940, nota: '' },
    ],
    [
      { linha: 'Marketing', valor: 21936, nota: '' },
      { linha: 'Pessoal', valor: 12000, nota: '' },
      { linha: 'Ferramentas', valor: 3140, nota: '' },
      { linha: 'Outras', valor: 5193, nota: '' },
    ],
  )

  it('deriva os subtotais das linhas primitivas', () => {
    expect(dre.receitaLiquida).toBe(182804)
    expect(dre.margemContribuicao).toBe(83459)
    expect(dre.resultado).toBe(41190)
  })

  it('inclui os subtotais como linhas na ordem certa', () => {
    const nomes = dre.linhas.map((l) => l.linha)
    expect(nomes).toContain('Receita líquida')
    expect(nomes).toContain('Margem de contribuição')
    expect(nomes.at(-1)).toBe('Resultado líquido')
    expect(nomes.indexOf('Receita líquida')).toBeLessThan(nomes.indexOf('Margem de contribuição'))
  })

  it('assina custos e despesas como negativos', () => {
    const cpv = dre.linhas.find((l) => l.linha === 'CPV')!
    expect(cpv.valor).toBe(-58240)
    expect(cpv.pctBruta).toBeCloseTo(29.35, 1)
  })

  it('calcula o ponto de equilíbrio pela margem de contribuição', () => {
    // Estrutura fixa ÷ margem sobre a líquida: 42.269 ÷ 45,66% ≈ 92,6 mil.
    const eq = pontoEquilibrio(42269, dre)
    expect(eq).toBeGreaterThan(92000)
    expect(eq).toBeLessThan(93000)
  })
})

describe('categorias', () => {
  const categorias: CategoriaFinanceira[] = [
    { nome: 'Matéria-prima', natureza: 'Custo variável', valorMes: 58240, lancamentos: 6 },
    { nome: 'Marketing', natureza: 'Despesa', valorMes: 21936, lancamentos: 12 },
    { nome: 'Pessoal', natureza: 'Despesa fixa', valorMes: 12000, lancamentos: 2 },
  ]

  it('soma a estrutura fixa só do que não é custo variável', () => {
    const r = resumirCategorias(categorias)
    expect(r.total).toBe(92176)
    expect(r.estruturaFixa).toBe(33936)
    expect(r.variaveis).toBe(1)
    expect(r.fixas).toBe(1)
    expect(r.despesas).toBe(1)
  })

  it('deriva a participação do total', () => {
    expect(participacaoCategoria(categorias[0], categorias)).toBeCloseTo(63.18, 1)
  })
})
