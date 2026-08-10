import { describe, expect, it } from 'vitest'

import {
  casarPagamento,
  dataEmSaoPaulo,
  indexarPedidos,
  lerOfx,
  linhasDoPagamentoMp,
  normalizarPagamentoMp,
  resumirExtrato,
  sugerirCategoria,
} from '..'
import type { LinhaExtrato } from '..'

/** Recorte real de um pagamento aprovado de cartão parcelado. */
const PAGAMENTO_CRU = {
  id: 123456789,
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
    const [linha] = linhasDoPagamentoMp(p, 'YP-1')
    expect(linha.ocorrido_em).toBe('2026-08-31')
    expect(linha.tipo).toBe('entrada')
    expect(linha.valor).toBe(123.31)
    expect(linha.pedido_id).toBe('YP-1')
  })

  it('não gera linha para pagamento que não foi aprovado', () => {
    const p = normalizarPagamentoMp({ ...PAGAMENTO_CRU, status: 'rejected' })!
    expect(linhasDoPagamentoMp(p, null)).toEqual([])
  })

  it('separa a venda do estorno em duas linhas', () => {
    const p = normalizarPagamentoMp({
      ...PAGAMENTO_CRU,
      status: 'refunded',
      transaction_amount_refunded: 129.9,
      date_last_updated: '2026-09-02T09:00:00.000-03:00',
    })!
    const linhas = linhasDoPagamentoMp(p, null)
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

/** Extrato OFX 1.x em SGML, como o internet banking exporta. */
const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKACCTFROM><BANKID>756<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260801120000[-3:BRT]<TRNAMT>1.234,56<FITID>AAA1<MEMO>PIX RECEBIDO CLIENTE</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260802<TRNAMT>-89.90<FITID>AAA2<MEMO>CORREIOS POSTAGEM</STMTTRN>
<STMTTRN><TRNTYPE>FEE<DTPOSTED>20260803<TRNAMT>12.50<FITID>AAA3<MEMO>TARIFA CESTA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260804<TRNAMT>-50.00<MEMO>SEM IDENTIFICADOR</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1082.16<DTASOF>20260804</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`

describe('ler o OFX do internet banking', () => {
  const r = lerOfx(OFX_SGML)

  it('identifica banco, conta e saldo', () => {
    expect(r.banco).toBe('756')
    expect(r.conta).toBe('12345-6')
    expect(r.saldoFinal).toBe(1082.16)
  })

  it('entende milhar com ponto e decimal com vírgula', () => {
    // "1.234,56" lido como ponto decimal viraria R$ 1,23 — mil reais que
    // somem do extrato sem ninguém notar.
    const credito = r.linhas.find((l) => l.chave.endsWith('AAA1'))!
    expect(credito.valor).toBe(1234.56)
    expect(credito.tipo).toBe('entrada')
  })

  it('entende ponto decimal quando não há vírgula', () => {
    expect(r.linhas.find((l) => l.chave.endsWith('AAA2'))!.valor).toBe(89.9)
  })

  it('trata como saída a tarifa que veio com valor positivo', () => {
    // Nem todo banco manda o sinal. Confiar só nele transformaria tarifa em
    // receita, e o mês fecharia melhor do que foi.
    const tarifa = r.linhas.find((l) => l.chave.endsWith('AAA3'))!
    expect(tarifa.tipo).toBe('saida')
    expect(tarifa.valor).toBe(12.5)
  })

  it('prefixa a chave com a conta', () => {
    // O FITID é único dentro da conta, não entre contas. Sem prefixo, duas
    // contas do mesmo banco se sobreporiam.
    expect(r.linhas[0].chave.startsWith('12345-6:')).toBe(true)
  })

  it('avisa em vez de descartar em silêncio a linha sem FITID', () => {
    expect(r.linhas).toHaveLength(3)
    expect(r.avisos.join(' ')).toContain('FITID')
  })

  it('avisa quando o arquivo não é um extrato', () => {
    const vazio = lerOfx('<OFX><SIGNONMSGSRSV1></SIGNONMSGSRSV1></OFX>')
    expect(vazio.linhas).toEqual([])
    expect(vazio.avisos.join(' ')).toContain('STMTTRN')
  })

  it('lê também o OFX 2.x, que fecha as tags', () => {
    const xml = `<OFX><BANKACCTFROM><ACCTID>999</ACCTID></BANKACCTFROM>
      <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260801</DTPOSTED>
      <TRNAMT>-10.00</TRNAMT><FITID>X1</FITID><MEMO>TESTE</MEMO></STMTTRN></OFX>`
    const lido = lerOfx(xml)
    expect(lido.linhas).toHaveLength(1)
    expect(lido.linhas[0]).toMatchObject({ chave: '999:X1', valor: 10, tipo: 'saida' })
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
    origem: 'ofx',
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
