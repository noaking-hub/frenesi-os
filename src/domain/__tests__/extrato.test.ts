import { describe, expect, it } from 'vitest'

import {
  casarPagamento,
  dataEmSaoPaulo,
  indexarPedidos,
  linhasDoPagamentoMp,
  normalizarPagamentoMp,
  resumirExtrato,
  sugerirCategoria,
} from '..'
import type { LinhaExtrato } from '..'

/** Recorte real de um pagamento aprovado de cartão parcelado. */
const NOSSA_CONTA = '7809292310328423'

const PAGAMENTO_CRU = {
  id: 123456789,
  collector_id: 7809292310328423,
  status: 'approved',
  status_detail: 'accredited',
  date_created: '2026-08-01T10:00:00.000-03:00',
  date_approved: '2026-08-01T10:00:12.000-03:00',
  date_last_updated: '2026-08-01T10:00:12.000-03:00',
  money_release_date: '2026-08-31T10:00:12.000-03:00',
  transaction_amount: 129.9,
  transaction_amount_refunded: 0,
  transaction_details: { net_received_amount: 123.31, total_paid_amount: 129.9 },
  fee_details: [{ type: 'mercadopago_fee', amount: 6.59, fee_payer: 'collector' }],
  external_reference: '1510190684870993',
  payment_type_id: 'credit_card',
  payment_method_id: 'master',
  installments: 3,
  description: 'Pedido Frenesi',
  payer: { email: 'cliente@exemplo.com' },
}

describe('pagamento do Mercado Pago', () => {
  it('lê o líquido, a tarifa e o meio', () => {
    const p = normalizarPagamentoMp(PAGAMENTO_CRU)!
    expect(p.id).toBe('123456789')
    expect(p.bruto).toBe(129.9)
    expect(p.liquido).toBe(123.31)
    expect(p.tarifa).toBe(6.59)
    expect(p.meio).toBe('Cartão de crédito 3x')
  })

  it('calcula o líquido quando o MP não manda o campo', () => {
    // Sem isto o líquido viria zero e a conciliação acusaria divergência de
    // 100% em toda venda — um alarme que grita em tudo não avisa de nada.
    const p = normalizarPagamentoMp({ ...PAGAMENTO_CRU, transaction_details: {} })!
    expect(p.liquido).toBe(123.31)
  })

  it('não conta como nossa a tarifa que o cliente pagou', () => {
    const p = normalizarPagamentoMp({
      ...PAGAMENTO_CRU,
      transaction_details: {},
      fee_details: [
        { type: 'mercadopago_fee', amount: 6.59, fee_payer: 'collector' },
        { type: 'financing_fee', amount: 12.0, fee_payer: 'payer' },
      ],
    })!
    expect(p.tarifa).toBe(6.59)
  })

  it('credita na data da liberação, não na da aprovação', () => {
    // O cartão em 3x é aprovado hoje e vira saldo daqui a 30 dias. Datar o
    // crédito na aprovação faria o caixa do mês mostrar dinheiro que ainda
    // não existe.
    const p = normalizarPagamentoMp(PAGAMENTO_CRU)!
    const [linha] = linhasDoPagamentoMp(p, 'YP-1', NOSSA_CONTA)
    expect(linha.ocorrido_em).toBe('2026-08-31')
    expect(linha.tipo).toBe('entrada')
    expect(linha.valor).toBe(123.31)
    expect(linha.pedido_id).toBe('YP-1')
  })

  it('não gera linha para pagamento que não foi aprovado', () => {
    const p = normalizarPagamentoMp({ ...PAGAMENTO_CRU, status: 'rejected' })!
    expect(linhasDoPagamentoMp(p, null, NOSSA_CONTA)).toEqual([])
  })

  it('separa a venda do estorno em duas linhas', () => {
    const p = normalizarPagamentoMp({
      ...PAGAMENTO_CRU,
      status: 'refunded',
      transaction_amount_refunded: 129.9,
      date_last_updated: '2026-09-02T09:00:00.000-03:00',
    })!
    const linhas = linhasDoPagamentoMp(p, null, NOSSA_CONTA)
    expect(linhas.map((l) => [l.tipo, l.valor])).toEqual([
      ['entrada', 123.31],
      ['saida', 129.9],
    ])
    // Chaves distintas: são dois fatos, e um não pode sobrescrever o outro.
    expect(new Set(linhas.map((l) => l.chave)).size).toBe(2)
  })

  it('converte a madrugada para o dia certo em São Paulo', () => {
    expect(dataEmSaoPaulo('2026-08-01T23:50:00.000-03:00')).toBe('2026-08-01')
    // O mesmo instante escrito em UTC não pode virar dia 2.
    expect(dataEmSaoPaulo('2026-08-02T02:50:00.000Z')).toBe('2026-08-01')
  })
})

describe('casar o pagamento com o pedido', () => {
  const PEDIDOS = [
    { id: 'YP-1510190684870993', valor: 129.9, data: '2026-08-01' },
    { id: 'YP-1510190684870994', valor: 89.9, data: '2026-08-01' },
    { id: 'YP-1510190684870995', valor: 89.9, data: '2026-08-02' },
  ]
  const indice = indexarPedidos(PEDIDOS)

  it('usa a referência externa quando ela é o próprio id', () => {
    const p = normalizarPagamentoMp({ ...PAGAMENTO_CRU, external_reference: 'YP-1510190684870993' })!
    expect(casarPagamento(p, indice)).toEqual({
      pedidoId: 'YP-1510190684870993',
      criterio: 'referencia',
    })
  })

  it('reconhece o id da plataforma sem o nosso prefixo', () => {
    const p = normalizarPagamentoMp(PAGAMENTO_CRU)!
    expect(casarPagamento(p, indice)).toEqual({
      pedidoId: 'YP-1510190684870993',
      criterio: 'sufixo',
    })
  })

  it('casa por valor e data quando não há referência', () => {
    const p = normalizarPagamentoMp({ ...PAGAMENTO_CRU, external_reference: '' })!
    expect(casarPagamento(p, indice)).toEqual({
      pedidoId: 'YP-1510190684870993',
      criterio: 'valor-e-data',
    })
  })

  it('recusa em vez de chutar quando dois pedidos têm o mesmo valor', () => {
    // Dois decants de 89,90 na mesma semana é o caso comum, não a exceção.
    // Conciliar a venda errada é pior que deixar pendente: ninguém volta para
    // conferir o que o sistema já deu por resolvido.
    const p = normalizarPagamentoMp({
      ...PAGAMENTO_CRU,
      external_reference: '',
      transaction_amount: 89.9,
    })!
    expect(casarPagamento(p, indice)).toBeNull()
  })

  it('não casa venda de agosto com pedido de outro mês', () => {
    const p = normalizarPagamentoMp({
      ...PAGAMENTO_CRU,
      external_reference: '',
      date_approved: '2026-09-20T10:00:00.000-03:00',
    })!
    expect(casarPagamento(p, indice)).toBeNull()
  })
})

describe('sugerir a categoria pela descrição', () => {
  it('reconhece os gastos que se repetem todo mês', () => {
    expect(sugerirCategoria('CORREIOS POSTAGEM', 'saida')).toBe('Frete')
    expect(sugerirCategoria('TARIFA CESTA SERVICOS', 'saida')).toBe('Taxas de pagamento')
    expect(sugerirCategoria('META PLATFORMS IRELAND', 'saida')).toBe('Marketing e ADS')
  })

  it('ignora acento na descrição e na pista', () => {
    expect(sugerirCategoria('PAGAMENTO TRÁFEGO PAGO', 'saida')).toBe('Marketing e ADS')
    expect(sugerirCategoria('CONDOMINIO SALA', 'saida')).toBe('Ocupação')
  })

  it('não sugere categoria para entrada', () => {
    // A receita do DRE vem dos pedidos pagos. Classificar o crédito da venda
    // numa categoria de receita contaria a mesma venda duas vezes.
    expect(sugerirCategoria('PIX RECEBIDO VENDA', 'entrada')).toBeNull()
  })

  it('devolve nulo quando não reconhece, em vez de chutar Diversos', () => {
    expect(sugerirCategoria('TED PARA JOSE DA SILVA', 'saida')).toBeNull()
  })
})

describe('resumo do extrato', () => {
  const linha = (over: Partial<LinhaExtrato>): LinhaExtrato => ({
    origem: 'mercadopago',
    chave: 'k',
    contaId: 'c',
    contaNome: 'Conta',
    ocorridoEm: '2026-08-01',
    descricao: 'x',
    contraparte: '',
    documento: '',
    tipo: 'entrada',
    valor: 100,
    pedidoId: null,
    lancamentoId: null,
    ignorado: false,
    motivoIgnorado: '',
    ...over,
  })

  it('não soma o que foi dispensado', () => {
    // Transferência entre contas próprias aparece dos dois lados; contá-la
    // inflaria entradas e saídas ao mesmo tempo.
    const r = resumirExtrato([
      linha({ chave: '1', valor: 100 }),
      linha({ chave: '2', valor: 40, tipo: 'saida' }),
      linha({ chave: '3', valor: 999, ignorado: true, motivoIgnorado: 'transferência própria' }),
      linha({ chave: '4', valor: 10, lancamentoId: 'LC-1' }),
    ])
    expect(r.entradas).toBe(110)
    expect(r.saidas).toBe(40)
    expect(r.saldo).toBe(70)
    expect(r.aClassificar).toBe(2)
    expect(r.ignoradas).toBe(1)
    expect(r.classificadas).toBe(1)
  })
})


describe('quem recebeu o dinheiro', () => {
  it('conta como venda o que caiu na nossa conta', () => {
    const p = normalizarPagamentoMp(PAGAMENTO_CRU)!
    expect(linhasDoPagamentoMp(p, null, NOSSA_CONTA)[0].tipo).toBe('entrada')
  })

  it('conta como saída o que NÓS pagamos', () => {
    // A busca do Mercado Pago devolve também o que a conta pagou — compra de
    // etiqueta de frete, por exemplo. Sem olhar o recebedor, dinheiro saindo
    // entrava como venda e o caixa errava duas vezes: a mais na entrada e a
    // menos na despesa.
    const p = normalizarPagamentoMp({
      ...PAGAMENTO_CRU,
      collector_id: 999,
      description: 'Compra de etiquetas',
      payment_type_id: 'account_money',
      transaction_amount: 203.22,
      transaction_details: {},
      fee_details: [],
    })!
    const [linha] = linhasDoPagamentoMp(p, 'YP-1', NOSSA_CONTA)
    expect(linha.tipo).toBe('saida')
    // O valor que sai é o cheio: a tarifa é do lado de quem recebeu.
    expect(linha.valor).toBe(203.22)
    // E não pertence a pedido de venda nenhum, mesmo com um id em mãos.
    expect(linha.pedido_id).toBeNull()
  })

  it('inverte também o estorno de um pagamento nosso', () => {
    const p = normalizarPagamentoMp({
      ...PAGAMENTO_CRU,
      collector_id: 999,
      status: 'refunded',
      transaction_amount_refunded: 129.9,
    })!
    const tipos = linhasDoPagamentoMp(p, null, NOSSA_CONTA).map((l) => l.tipo)
    expect(tipos).toEqual(['saida', 'entrada'])
  })

  it('sem saber a nossa conta, trata tudo como recebimento', () => {
    // Deixar de gravar seria pior: some venda de verdade. O aviso de que a
    // conta não foi identificada aparece no diagnóstico.
    const p = normalizarPagamentoMp({ ...PAGAMENTO_CRU, collector_id: 999 })!
    expect(linhasDoPagamentoMp(p, null, '')[0].tipo).toBe('entrada')
  })

  it('etiqueta de frete é despesa de frete', () => {
    expect(sugerirCategoria('Saldo Mercado Pago · Compra de etiquetas', 'saida')).toBe('Frete')
  })
})
