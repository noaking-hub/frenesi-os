import { describe, expect, it } from 'vitest'

import { lerLiberacoes, linhasDeLiberacao, recortarJanela, relatorioServe } from '..'

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

describe('escolher o relatório sozinho', () => {
  const rel = (de: string, ate: string, jaImportado = false) => ({ de, ate, jaImportado })

  it('aceita o que começa antes e alcança o fim', () => {
    // O relatório que o Mercado Pago entrega raramente tem as datas exatas do
    // pedido. Sobrar no começo é inofensivo: o recorte descarta.
    expect(relatorioServe(rel('2026-07-10', '2026-08-11'), '2026-07-22', '2026-08-10')).toBe(true)
  })

  it('recusa o que para antes do fim da janela', () => {
    // Este é o erro que pareceria sucesso: importa, diz "pronto", e as vendas
    // dos últimos dias simplesmente não estão lá.
    expect(relatorioServe(rel('2026-07-01', '2026-08-05'), '2026-07-22', '2026-08-10')).toBe(false)
  })

  it('recusa o que começa depois, mesmo cobrindo o fim', () => {
    // Deixaria um buraco no começo do extrato — dinheiro que entrou e o ERP
    // nunca soube.
    expect(relatorioServe(rel('2026-08-01', '2026-08-11'), '2026-07-22', '2026-08-10')).toBe(false)
  })

  it('tolera um dia de folga no fim, por causa do fuso', () => {
    // O relatório é montado no fuso do Mercado Pago; o "hoje" daqui pode
    // estar algumas horas à frente do "hoje" de lá.
    expect(relatorioServe(rel('2026-07-01', '2026-08-09'), '2026-07-22', '2026-08-10')).toBe(true)
  })

  it('não reimporta o que já entrou', () => {
    expect(relatorioServe(rel('2026-07-10', '2026-08-11', true), '2026-07-22', '2026-08-10')).toBe(
      false,
    )
  })

  it('recusa o relatório sem período declarado', () => {
    // Sem saber o que o arquivo cobre, importar é apostar. Pedir outro custa
    // um minuto; descobrir depois que o caixa tem movimento de outra operação
    // custa a confiança no número inteiro.
    expect(relatorioServe(rel('', ''), '2026-07-22', '2026-08-10')).toBe(false)
  })
})

describe('recorte da janela', () => {
  it('descarta o movimento anterior ao começo da operação', () => {
    // Esta conta é de fevereiro e só passou a receber as vendas desta loja em
    // 22/07. Sem o recorte, um relatório mais largo traria cinco meses de
    // outra operação para dentro do caixa da Frenesi.
    const dentro = recortarJanela(lerLiberacoes(CSV_PT).linhas, '2026-08-08', '2026-08-10')
    expect(dentro.map((l) => l.data)).toEqual(['2026-08-10', '2026-08-09', '2026-08-08'])
  })
})
