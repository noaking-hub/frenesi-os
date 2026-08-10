import { describe, expect, it } from 'vitest'

import { competenciasRecentes, montarFechamento, nomeDaCompetencia } from '..'
import type { LancamentoContabil, VendaContabil } from '..'

const VENDAS: VendaContabil[] = [
  { id: 'YP-1', data: '2026-08-03', valor: 129.9, frete: 19.9 },
  { id: 'YP-2', data: '2026-08-14', valor: 89.9, frete: 0 },
  { id: 'YP-3', data: '2026-07-31', valor: 500, frete: 0 },
]

const LANCAMENTOS: LancamentoContabil[] = [
  {
    id: 'LC-1',
    data: '2026-08-05',
    descricao: 'CORREIOS POSTAGEM',
    categoria: 'Frete',
    tipo: 'saida',
    valor: 42.5,
    conta: 'Sicoob',
    pedidoId: null,
  },
  {
    id: 'LC-2',
    data: '2026-08-06',
    descricao: 'AGENCIA DE TRAFEGO',
    categoria: 'Assessoria',
    tipo: 'saida',
    valor: 1500,
    conta: 'Sicoob',
    pedidoId: null,
  },
  {
    id: 'LC-3',
    data: '2026-08-07',
    descricao: 'TED SEM CLASSIFICAR',
    categoria: '',
    tipo: 'saida',
    valor: 80,
    conta: 'Sicoob',
    pedidoId: null,
  },
  {
    id: 'LC-4',
    data: '2026-08-31',
    descricao: 'Crédito Mercado Pago do pedido',
    categoria: '',
    tipo: 'entrada',
    valor: 123.31,
    conta: 'Mercado Pago',
    pedidoId: 'YP-1',
  },
  {
    id: 'LC-5',
    data: '2026-08-20',
    descricao: 'Aporte do sócio',
    categoria: '',
    tipo: 'entrada',
    valor: 3000,
    conta: 'Sicoob',
    pedidoId: null,
  },
]

const CONTAS = { Frete: '3.1.02.004 · fretes e carretos' }

describe('fechamento da competência', () => {
  const r = montarFechamento('2026-08', VENDAS, LANCAMENTOS, CONTAS)

  it('só considera o mês pedido', () => {
    // A venda de 31/07 é de julho, mesmo tendo caído no caixa em agosto.
    expect(r.receita).toBe(219.8)
    expect(r.csv).not.toContain('YP-3')
  })

  it('não conta a venda duas vezes', () => {
    // O crédito do Mercado Pago é a MESMA venda vista pelo outro lado. Somar
    // os dois inflaria o faturamento — e imposto se paga sobre faturamento.
    expect(r.csv).not.toContain('LC-4')
    expect(r.outrasEntradas).toBe(3000)
    expect(r.csv).toContain('Aporte do sócio')
  })

  it('separa o frete cobrado do cliente dentro do histórico', () => {
    expect(r.csv).toContain('mercadoria 110,00 + frete 19,90')
  })

  it('acusa categoria sem conta contábil em vez de mandar em branco', () => {
    expect(r.semConta).toEqual(['Assessoria'])
    expect(r.avisos.join(' ')).toContain('Assessoria')
  })

  it('acusa saída sem categoria', () => {
    expect(r.semCategoria).toBe(1)
    expect(r.csv).toContain('SEM CATEGORIA')
  })

  it('soma o que entra no arquivo, não o que existe no banco', () => {
    expect(r.despesa).toBe(1622.5)
    // Arredondado: a soma direta em ponto flutuante dá 1597,3000000000002.
    expect(r.resultado).toBe(1597.3)
    // Cabeçalho + 2 vendas + 3 saídas + 1 outra entrada.
    expect(r.registros).toBe(6)
  })

  it('escreve no formato que o Excel brasileiro abre', () => {
    expect(r.csv.startsWith('\ufeff')).toBe(true)
    expect(r.csv.replace('\ufeff', '').split('\r\n')[0]).toBe('Data;Documento;Historico;Origem;Categoria;Conta contabil;Natureza;Valor')
    expect(r.csv).toContain(';129,90')
  })

  it('protege o separador quando a descrição tem ponto e vírgula', () => {
    const comPonto = montarFechamento(
      '2026-08',
      [],
      [{ ...LANCAMENTOS[0], descricao: 'PAGTO; PARCELA 1 "A"' }],
      CONTAS,
    )
    expect(comPonto.csv).toContain('"PAGTO; PARCELA 1 ""A"""')
    // Uma linha de cabeçalho e uma de dado — o ponto e vírgula não quebrou a linha.
    expect(comPonto.registros).toBe(1)
  })

  it('avisa quando o mês não tem venda nenhuma', () => {
    const vazio = montarFechamento('2026-09', VENDAS, LANCAMENTOS, CONTAS)
    expect(vazio.registros).toBe(0)
    expect(vazio.avisos.join(' ')).toContain('Nenhum pedido pago')
  })

  it('nomeia o arquivo pela competência', () => {
    expect(r.arquivo).toBe('frenesi-202608-razao.csv')
  })
})

describe('competências', () => {
  it('escreve o mês por extenso', () => {
    expect(nomeDaCompetencia('2026-08')).toContain('agosto')
  })

  it('lista da mais recente para trás, sem estourar o ano', () => {
    const lista = competenciasRecentes(3, new Date(2026, 0, 15))
    expect(lista).toEqual(['2026-01', '2025-12', '2025-11'])
  })
})
