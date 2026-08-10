import { describe, expect, it } from 'vitest'

import { lerLiberacoes, linhasDeLiberacao } from '..'

/** Formato que a conta declarou em /v1/account/release_report/config. */
const CSV_PT = `DATA;DATA_DE_APROVACAO_DA_TRANSACAO;ID_DA_OPERACAO;DESCRICAO;VALOR_LIQUIDO_CREDITO;VALOR_LIQUIDO_DEBITO;VALOR_BRUTO;TARIFA_MP;IMPOSTOS
10/08/2026;10/08/2026;172981567954;Venda;71,66;0;84,25;12,59;0
09/08/2026;09/08/2026;172045860513;Venda;108,67;0;125,83;17,16;0
08/08/2026;;;Transferência para conta bancária;0;5.000,00;5.000,00;0;0
07/08/2026;;;Tarifa de manutenção;0;12,50;12,50;0;0`

describe('relatório de liberações', () => {
  const r = lerLiberacoes(CSV_PT)

  it('lê crédito e débito como sinais opostos', () => {
    expect(r.linhas.map((l) => l.liquido)).toEqual([71.66, 108.67, -5000, -12.5])
  })

  it('enxerga o saque, que a busca de pagamentos não vê', () => {
    // É esta linha que faltava: R$ 5.000 saindo para o banco. Sem ela, o
    // saldo calculado ficava R$ 72 mil acima do real.
    const saque = r.linhas.find((l) => l.descricao.includes('Transferência'))!
    expect(saque.liquido).toBe(-5000)
  })

  it('entende milhar com ponto e decimal com vírgula', () => {
    expect(r.linhas[2].liquido).toBe(-5000)
    expect(r.linhas[0].tarifa).toBe(12.59)
  })

  it('vira linha de extrato com tipo correto', () => {
    const linhas = linhasDeLiberacao(r)
    expect(linhas.map((l) => l.tipo)).toEqual(['entrada', 'entrada', 'saida', 'saida'])
    expect(linhas[2].valor).toBe(5000)
  })

  it('dá chave própria para duas linhas da mesma operação no mesmo dia', () => {
    // Liberação e tarifa do mesmo pagamento são linhas distintas. Com a
    // chave só no id da operação, uma sobrescreveria a outra e metade do
    // movimento sumiria na importação.
    const duplas = lerLiberacoes(
      `DATA;ID_DA_OPERACAO;DESCRICAO;VALOR_LIQUIDO_CREDITO;VALOR_LIQUIDO_DEBITO
01/08/2026;999;Liberação;100,00;0
01/08/2026;999;Tarifa;0;4,99`,
    )
    const chaves = linhasDeLiberacao(duplas).map((l) => l.chave)
    expect(new Set(chaves).size).toBe(2)
  })

  it('lê pela ordem da configuração quando o cabeçalho muda de nome', () => {
    const estranho = lerLiberacoes(
      `A;B;C;D;E;F;G;H;I
10/08/2026;10/08/2026;1;Venda;50,00;0;60,00;10,00;0`,
    )
    expect(estranho.linhas[0].liquido).toBe(50)
    expect(estranho.avisos.join(' ')).toContain('não foram reconhecidos')
  })

  it('recusa e mostra os cabeçalhos quando não dá para ler', () => {
    const ruim = lerLiberacoes('COISA;OUTRA\n1;2')
    expect(ruim.linhas).toEqual([])
    expect(ruim.avisos.join(' ')).toContain('COISA')
  })

  it('aceita CSV com vírgula como separador e aspas na descrição', () => {
    const comAspas = lerLiberacoes(
      `DATE,SOURCE_ID,DESCRIPTION,NET_CREDIT_AMOUNT,NET_DEBIT_AMOUNT
2026-08-10,7,"Venda, parcelada em 6x",71.66,0`,
    )
    expect(comAspas.linhas[0].descricao).toBe('Venda, parcelada em 6x')
    expect(comAspas.linhas[0].liquido).toBe(71.66)
  })
})
