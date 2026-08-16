import { describe, expect, it } from 'vitest'

import {
  alertasFinanceiros,
  aplicarBaixa,
  avaliarVenda,
  coberturaDeCaixa,
  competenciaAnterior,
  competenciaPorExtenso,
  concentracao,
  divergenciaDeSaldo,
  ehSaida,
  impactaResultado,
  mesmoDiaNoProximoMes,
  montarDreGerencial,
  movimentacaoInterna,
  podeExcluirCategoria,
  projetarCaixa,
  saldoAberto,
  situacaoDe,
} from '../financeiro-gerencial'
import type { ContaFinanceira, LancamentoGerencial } from '../financeiro-gerencial'

/**
 * O que estes testes protegem é a separação entre CAIXA e COMPETÊNCIA, e as
 * regras que impedem o módulo de contar a mesma venda duas vezes. Cada caso
 * abaixo é um erro que a versão anterior do Financeiro cometia.
 */

function lancamento(over: Partial<LancamentoGerencial> = {}): LancamentoGerencial {
  return {
    id: 'LC-1',
    descricao: 'Aluguel',
    favorecido: null,
    tipo: 'saida',
    categoriaId: 'aluguel',
    categoria: 'Aluguel',
    natureza: 'despesa_fixa',
    centroCusto: null,
    contaId: 'sicoob',
    conta: 'Sicoob',
    competencia: '2026-08-01',
    venceEm: '2026-08-10',
    baixadoEm: null,
    valor: 1000,
    recebido: 0,
    multa: 0,
    juros: 0,
    desconto: 0,
    parcela: null,
    parcelas: null,
    recorrente: false,
    recorrencia: null,
    origem: 'Manual',
    documento: null,
    observacao: null,
    transferenciaId: null,
    canceladoEm: null,
    impactaDre: true,
    impactaCaixa: true,
    ...over,
  }
}

function conta(over: Partial<ContaFinanceira> = {}): ContaFinanceira {
  return {
    id: 'sicoob',
    nome: 'Sicoob',
    tipo: 'Conta corrente',
    banco: 'Sicoob',
    finalidade: null,
    principal: true,
    ativa: true,
    origemSaldo: 'calculado',
    saldoDisponivel: 1000,
    saldoALiquidar: 0,
    saldoBloqueado: 0,
    saldoCalculado: 1000,
    saldoInformado: 0,
    entradas30d: 0,
    saidas30d: 0,
    sincronizadoEm: null,
    sincronizacaoStatus: null,
    cor: null,
    ...over,
  }
}

describe('naturezas gerenciais', () => {
  it('mantém transferência, aporte e investimento fora do resultado', () => {
    expect(impactaResultado('transferencia')).toBe(false)
    expect(impactaResultado('aporte_retirada')).toBe(false)
    expect(impactaResultado('investimento')).toBe(false)
    expect(impactaResultado('cmv')).toBe(true)
    expect(impactaResultado('receita_operacional')).toBe(true)
  })

  it('conta dedução da receita como saída, porque ela reduz o que entra', () => {
    expect(ehSaida('deducao_receita')).toBe(true)
    expect(ehSaida('receita_operacional')).toBe(false)
    expect(ehSaida('investimento')).toBe(false)
  })

  it('impede excluir categoria já usada', () => {
    const base = {
      id: 'x',
      nome: 'X',
      natureza: 'despesa_fixa' as const,
      impactaDre: true,
      impactaCaixa: true,
      exigeDocumento: false,
      usarEmAutomacao: true,
      contaContabil: '',
      centroCusto: null,
      ativa: true,
    }
    expect(podeExcluirCategoria({ ...base, emUso: 0 })).toBe(true)
    expect(podeExcluirCategoria({ ...base, emUso: 1 })).toBe(false)
  })
})

describe('saldo em aberto e situação', () => {
  it('soma encargos e subtrai desconto no que ainda falta', () => {
    expect(saldoAberto(lancamento({ multa: 20, juros: 5, desconto: 10, recebido: 0 }))).toBe(1015)
  })

  it('nunca devolve negativo quando pagaram a mais', () => {
    expect(saldoAberto(lancamento({ recebido: 1200 }))).toBe(0)
  })

  it('deriva a situação da data de hoje, não de um campo gravado', () => {
    const l = lancamento({ venceEm: '2026-08-10' })
    expect(situacaoDe(l, '2026-08-09')).toBe('agendado')
    expect(situacaoDe(l, '2026-08-11')).toBe('vencido')
  })

  it('pagamento parcial não é nem pago nem a pagar', () => {
    expect(situacaoDe(lancamento({ recebido: 400 }), '2026-08-09')).toBe('parcial')
    expect(saldoAberto(lancamento({ recebido: 400 }))).toBe(600)
  })

  it('cancelado vence qualquer outra leitura', () => {
    expect(situacaoDe(lancamento({ canceladoEm: '2026-08-05', recebido: 0 }), '2026-09-01')).toBe(
      'cancelado',
    )
  })

  it('sem vencimento é previsão, não atraso', () => {
    expect(situacaoDe(lancamento({ venceEm: null }), '2030-01-01')).toBe('previsto')
  })
})

describe('aplicarBaixa', () => {
  it('baixa parcial mantém o resto e não carimba a data de quitação', () => {
    const r = aplicarBaixa(lancamento(), 400, '2026-08-10')
    expect(r.recebido).toBe(400)
    expect(r.baixadoEm).toBeNull()
    expect(saldoAberto(r)).toBe(600)
  })

  it('a baixa que completa o total quita', () => {
    const r = aplicarBaixa(lancamento({ recebido: 600 }), 400, '2026-08-10')
    expect(r.baixadoEm).toBe('2026-08-10')
    expect(saldoAberto(r)).toBe(0)
  })

  it('não deixa o recebido passar do devido com encargos', () => {
    const r = aplicarBaixa(lancamento({ multa: 100 }), 5000, '2026-08-10')
    expect(r.recebido).toBe(1100)
  })
})

describe('contas', () => {
  it('conta sem saldo externo não tem divergência — tem ausência de informação', () => {
    expect(divergenciaDeSaldo(conta({ origemSaldo: 'calculado' }))).toBeNull()
  })

  it('divergência é informado menos calculado', () => {
    expect(
      divergenciaDeSaldo(conta({ origemSaldo: 'informado', saldoInformado: 950, saldoCalculado: 1000 })),
    ).toBe(-50)
  })

  it('concentração é sobre o caixa consolidado', () => {
    const a = conta({ id: 'a', saldoDisponivel: 750 })
    const b = conta({ id: 'b', saldoDisponivel: 250 })
    expect(concentracao(a, [a, b])).toBe(75)
  })
})

describe('projeção de caixa', () => {
  const dias = [
    { dia: '2026-08-15', entradas: 0, saidas: 600, realizado: false },
    { dia: '2026-08-16', entradas: 0, saidas: 600, realizado: false },
    { dia: '2026-08-17', entradas: 2000, saidas: 0, realizado: false },
  ]

  it('encontra o VALE, não só o saldo final', () => {
    const p = projetarCaixa(1000, dias)
    expect(p.saldoFinal).toBe(1800)
    expect(p.menorSaldo).toBe(-200)
    expect(p.menorSaldoEm).toBe('2026-08-16')
  })

  it('avisa em quantos dias o caixa negativa', () => {
    expect(projetarCaixa(1000, dias).diasAteNegativar).toBe(1)
  })

  it('sem vale, não há dia de negativar', () => {
    const p = projetarCaixa(5000, dias)
    expect(p.diasAteNegativar).toBeNull()
    expect(p.risco).toBe('baixo')
  })

  it('só o que ainda não aconteceu conta como previsto', () => {
    const p = projetarCaixa(0, [
      { dia: '2026-08-14', entradas: 100, saidas: 0, realizado: true },
      { dia: '2026-08-15', entradas: 300, saidas: 0, realizado: false },
    ])
    expect(p.entradasPrevistas).toBe(300)
  })

  it('cobertura é nula quando não há saída para medir o ritmo', () => {
    expect(coberturaDeCaixa(1000, 0, 30)).toBeNull()
    expect(coberturaDeCaixa(1000, 300, 30)).toBe(100)
  })
})

describe('DRE gerencial', () => {
  const atual = [
    { linha: 'Receita bruta', valor: 10000, destaque: false },
    { linha: '(−) Deduções', valor: -2000, destaque: false },
    { linha: '= Receita líquida', valor: 8000, destaque: true },
    { linha: '(−) CMV', valor: -3000, destaque: false },
    { linha: '= Margem de contribuição', valor: 5000, destaque: true },
    { linha: '= Resultado gerencial', valor: 2000, destaque: true },
  ]

  it('calcula percentuais sobre a receita LÍQUIDA, não a bruta', () => {
    const d = montarDreGerencial('2026-08', atual, [])
    const cmv = d.linhas.find((l) => l.linha === '(−) CMV')!
    // 3000 sobre 8000 = 37,5%. Sobre a bruta daria 30% e inflaria a margem.
    expect(cmv.pctReceita).toBeCloseTo(-37.5)
    expect(d.margemContribuicaoPct).toBeCloseTo(62.5)
    expect(d.margemLiquidaPct).toBeCloseTo(25)
  })

  it('casa cada linha com o mesmo nome do mês anterior', () => {
    const d = montarDreGerencial('2026-08', atual, [{ linha: '= Resultado gerencial', valor: 1000 }])
    const r = d.linhas.find((l) => l.linha === '= Resultado gerencial')!
    expect(r.variacao).toBe(1000)
    expect(r.variacaoPct).toBe(100)
  })

  it('ponto de equilíbrio é estrutura fixa dividida pela margem', () => {
    const d = montarDreGerencial('2026-08', atual, [], 2500)
    expect(d.pontoEquilibrio).toBe(4000)
  })

  it('sem margem positiva não existe ponto de equilíbrio', () => {
    const negativo = atual.map((l) =>
      l.linha === '= Margem de contribuição' ? { ...l, valor: -500 } : l,
    )
    expect(montarDreGerencial('2026-08', negativo, [], 2500).pontoEquilibrio).toBe(0)
  })
})

describe('conciliação de vendas', () => {
  it('taxa cobrada corretamente é custo, não divergência', () => {
    const r = avaliarVenda({
      bruto: 100,
      taxaEsperada: 4.99,
      taxaReal: 4.99,
      liquidoRecebido: 95.01,
      pagamentoConfirmado: true,
    })
    expect(r.status).toBe('conciliada')
    expect(r.diferenca).toBe(0)
  })

  it('taxa maior que a contratada é problema de TAXA', () => {
    const r = avaliarVenda({
      bruto: 100,
      taxaEsperada: 4.99,
      taxaReal: 7.5,
      liquidoRecebido: 92.5,
      pagamentoConfirmado: true,
    })
    expect(r.status).toBe('taxa_divergente')
  })

  it('valor errado com taxa certa é problema de VALOR', () => {
    const r = avaliarVenda({
      bruto: 100,
      taxaEsperada: 5,
      taxaReal: 5,
      liquidoRecebido: 80,
      pagamentoConfirmado: true,
    })
    expect(r.status).toBe('valor_divergente')
    expect(r.diferenca).toBe(-15)
  })

  it('centavo de arredondamento não vira alarme', () => {
    const r = avaliarVenda({
      bruto: 100,
      taxaEsperada: 5,
      taxaReal: 5,
      liquidoRecebido: 94.97,
      pagamentoConfirmado: true,
    })
    expect(r.status).toBe('conciliada')
  })

  it('sem crédito dentro do prazo é espera; fora do prazo é falta', () => {
    const base = { bruto: 100, taxaEsperada: 5, taxaReal: null, liquidoRecebido: null, pagamentoConfirmado: true }
    expect(avaliarVenda({ ...base, prazoVencido: false }).status).toBe('aguardando')
    expect(avaliarVenda({ ...base, prazoVencido: true }).status).toBe('sem_credito')
  })

  it('chargeback e estorno devolvem o bruto como perda', () => {
    const base = { bruto: 100, taxaEsperada: 5, taxaReal: 5, liquidoRecebido: 95, pagamentoConfirmado: true }
    expect(avaliarVenda({ ...base, chargeback: true }).diferenca).toBe(-100)
    expect(avaliarVenda({ ...base, estornada: true }).status).toBe('estornada')
  })
})

describe('alertas', () => {
  const semNada = {
    projecao: projetarCaixa(1000, []),
    vencidos: { quantidade: 0, valor: 0 },
    semCategoria: 0,
    conciliacaoPendente: 0,
    contasDesatualizadas: [],
    chargebacksSemJustificativa: 0,
    competenciaAberta: null,
  }

  it('não inventa alerta quando está tudo em ordem', () => {
    expect(alertasFinanceiros(semNada)).toEqual([])
  })

  it('põe o crítico antes do informativo', () => {
    const a = alertasFinanceiros({
      ...semNada,
      semCategoria: 3,
      vencidos: { quantidade: 2, valor: 500 },
      contasDesatualizadas: [{ nome: 'Mercado Pago', horas: 30 }],
    })
    expect(a[0].severidade).toBe('critico')
    expect(a.map((x) => x.id)).toContain('vencidos')
  })

  it('todo alerta aponta para a tela que resolve', () => {
    const a = alertasFinanceiros({ ...semNada, conciliacaoPendente: 1, semCategoria: 1 })
    expect(a.every((x) => x.href.startsWith('/financeiro'))).toBe(true)
  })

  it('caixa negativo vira alerta com o dia do vale', () => {
    const a = alertasFinanceiros({
      ...semNada,
      projecao: projetarCaixa(100, [{ dia: '2026-08-20', entradas: 0, saidas: 500, realizado: false }]),
    })
    expect(a[0].id).toBe('caixa-negativo')
    expect(a[0].detalhe).toContain('20/08')
  })

  it('repasse sem destino vira alerta que abre a fila', () => {
    const a = alertasFinanceiros({
      ...semNada,
      repassesSemDestino: { quantidade: 64, valor: 29909.49 },
    })
    expect(a[0].id).toBe('repasse-sem-destino')
    expect(a[0].href).toBe('/financeiro/repasses')
  })

  it('fila de destino vazia não gera alerta', () => {
    const a = alertasFinanceiros({ ...semNada, repassesSemDestino: { quantidade: 0, valor: 0 } })
    expect(a).toEqual([])
  })
})

/**
 * Os dois cortes que separam dinheiro de contabilidade. Cada caso aqui é um
 * número errado que o Financeiro já mostrou em produção.
 */
describe('movimentação interna', () => {
  it('transferência com par não é despesa nem receita', () => {
    expect(movimentacaoInterna(lancamento({ transferenciaId: 'transf-1' }))).toBe(true)
  })

  it('categoria que não impacta caixa também é interna, mesmo sem par', () => {
    expect(movimentacaoInterna(lancamento({ transferenciaId: null, impactaCaixa: false }))).toBe(
      true,
    )
  })

  it('lançamento sem categoria continua contando — falta classificar, não ignorar', () => {
    const l = lancamento({ categoriaId: null, categoria: null, transferenciaId: null })
    expect(movimentacaoInterna(l)).toBe(false)
  })

  it('despesa comum não é interna', () => {
    expect(movimentacaoInterna(lancamento())).toBe(false)
  })
})

describe('janela de contas a pagar', () => {
  it('não perde a parcela do mesmo dia do mês seguinte', () => {
    // O caso real: parcelas todo dia 16. Com `hoje + 30` a janela morria em
    // 15/09 e o card dizia "R$ 0,00 a pagar" na véspera da parcela.
    expect(mesmoDiaNoProximoMes('2026-08-16')).toBe('2026-09-16')
  })

  it('ancora no último dia quando o mês seguinte é mais curto', () => {
    expect(mesmoDiaNoProximoMes('2026-01-31')).toBe('2026-02-28')
    expect(mesmoDiaNoProximoMes('2026-03-31')).toBe('2026-04-30')
  })

  it('vira o ano em dezembro', () => {
    expect(mesmoDiaNoProximoMes('2026-12-16')).toBe('2027-01-16')
  })
})

describe('competências', () => {
  it('recua o mês virando o ano', () => {
    expect(competenciaAnterior('2026-01')).toBe('2025-12')
    expect(competenciaAnterior('2026-08')).toBe('2026-07')
  })

  it('escreve o mês por extenso em português', () => {
    expect(competenciaPorExtenso('2026-08')).toBe('agosto de 2026')
  })
})
