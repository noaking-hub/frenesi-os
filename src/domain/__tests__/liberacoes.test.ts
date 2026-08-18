import { describe, expect, it } from 'vitest'

import {
  descreverMovimento,
  destinosDoRodape,
  lerLiberacoes,
  linhasDeLiberacao,
  movimentoInterno,
  recortarJanela,
  relatorioServe,
} from '..'

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

describe('o que cada movimento quer dizer', () => {
  it('traduz o jargão da API', () => {
    expect(descreverMovimento('reserve_for_payout')).toBe('Reserva para transferência')
    expect(descreverMovimento('payout')).toBe('Transferência para o banco')
    expect(descreverMovimento('payment')).toBe('Venda recebida')
  })

  it('preserva o que não conhece, em vez de esconder', () => {
    // Um tipo novo do Mercado Pago aparecendo cru na tela é como se descobre
    // que ele existe. Virar "Outro" seria nunca descobrir.
    expect(descreverMovimento('novo_tipo_qualquer')).toBe('novo_tipo_qualquer')
  })

  it('separa o que a conta faz consigo mesma do que é despesa', () => {
    // Saque e reserva mudam o saldo e não têm categoria a escolher. Estorno
    // tem: é receita voltando, e o DRE precisa saber.
    expect(movimentoInterno('payout')).toBe(true)
    expect(movimentoInterno('reserve_for_refund')).toBe(true)
    expect(movimentoInterno('refund')).toBe(false)
    expect(movimentoInterno('payment')).toBe(false)
  })

  it('marca a linha interna na conversão', () => {
    const csv = `DATE;SOURCE_ID;DESCRIPTION;NET_CREDIT_AMOUNT;NET_DEBIT_AMOUNT
2026-08-10;7;payout;0;25,00
2026-08-10;8;payment;94,48;0`
    const linhas = linhasDeLiberacao(lerLiberacoes(csv))
    expect(linhas.map((l) => l.interno)).toEqual([true, false])
  })
})

describe('a chave da linha sobrevive a reimportar', () => {
  it('não muda quando o relatório novo traz linhas a mais no mesmo dia', () => {
    // Este é o defeito que dobraria o saldo a cada atualização, e que só
    // apareceria olhando o banco: com chave posicional, a linha de ontem cai
    // numa posição diferente no relatório de hoje e entra de novo.
    const ontem = `DATE;SOURCE_ID;DESCRIPTION;NET_CREDIT_AMOUNT;NET_DEBIT_AMOUNT
2026-08-10;;payout;0;25,00`
    const hoje = `DATE;SOURCE_ID;DESCRIPTION;NET_CREDIT_AMOUNT;NET_DEBIT_AMOUNT
2026-08-10;;reserve_for_payout;25,00;0
2026-08-10;;payout;0;25,00`

    const a = linhasDeLiberacao(lerLiberacoes(ontem))
    const b = linhasDeLiberacao(lerLiberacoes(hoje))
    expect(b.find((l) => l.descricao === 'Transferência para o banco')!.chave).toBe(a[0].chave)
  })

  it('mantém duas linhas idênticas como dois fatos', () => {
    // Dois estornos iguais no mesmo dia são dois estornos. Colapsar em um
    // esconderia dinheiro que saiu de verdade.
    const csv = `DATE;SOURCE_ID;DESCRIPTION;NET_CREDIT_AMOUNT;NET_DEBIT_AMOUNT
2026-08-10;9;refund;0;18,94
2026-08-10;9;refund;0;18,94`
    const linhas = linhasDeLiberacao(lerLiberacoes(csv))
    expect(new Set(linhas.map((l) => l.chave)).size).toBe(2)
  })
})

describe('a mesma palavra, dois sentidos', () => {
  it('separa a venda recebida da compra paga', () => {
    // O Mercado Pago chama de `payment` tanto o dinheiro que entrou pela
    // venda quanto o que saiu pagando etiqueta de frete. "Venda recebida ·
    // − R$ 203,22" manda procurar um pedido que nunca existiu.
    expect(descreverMovimento('payment', true)).toBe('Venda recebida')
    expect(descreverMovimento('payment', false)).toBe('Compra paga pela conta')
  })

  it('separa o estorno que sai do que volta', () => {
    expect(descreverMovimento('refund', false)).toBe('Estorno ao cliente')
    expect(descreverMovimento('refund', true)).toBe('Estorno recebido')
  })

  it('a reserva de pagamento é movimento da conta', () => {
    // Entra e sai pelo mesmo valor, como as outras reservas. Pedir categoria
    // para ela é fabricar trabalho.
    expect(movimentoInterno('reserve_for_payment')).toBe(true)
  })

  it('nomeia pela direção na conversão', () => {
    const csv = `DATE;SOURCE_ID;DESCRIPTION;NET_CREDIT_AMOUNT;NET_DEBIT_AMOUNT
2026-08-03;1;payment;0;203,22
2026-08-03;2;payment;84,25;0`
    const linhas = linhasDeLiberacao(lerLiberacoes(csv))
    expect(linhas.map((l) => [l.tipo, l.descricao])).toEqual([
      ['saida', 'Compra paga pela conta'],
      ['entrada', 'Venda recebida'],
    ])
  })
})

describe('rodapé de detalhe das retiradas (include_withdrawal_at_end)', () => {
  it('corta o rodapé antes de ler: nada dali vira movimento', () => {
    const csv = `DATA;DATA_DE_APROVACAO_DA_TRANSACAO;ID_DA_OPERACAO;DESCRICAO;VALOR_LIQUIDO_CREDITO;VALOR_LIQUIDO_DEBITO;VALOR_BRUTO;TARIFA_MP;IMPOSTOS
10/08/2026;10/08/2026;172981567954;Venda;71,66;0;84,25;12,59;0
DETALHE_DA_RETIRADA;ID_DA_RETIRADA;STATUS;BANCO;FAVORECIDO
17/08/2026;174328123882;pago;BCO XYZ;GOOGLE BRASIL INTERNET LTDA`
    const r = lerLiberacoes(csv)
    // A linha do rodapé TEM data e um número na posição de débito — sem o
    // corte, ela entraria no caixa como lançamento fantasma.
    expect(r.linhas).toHaveLength(1)
    expect(r.rodape).toHaveLength(2)
    expect(r.rodape[1]).toContain('GOOGLE BRASIL INTERNET LTDA')
  })

  it('arquivo sem rodapé segue como sempre, com rodapé vazio', () => {
    expect(lerLiberacoes(CSV_PT).rodape).toEqual([])
  })
})

describe('destinos do rodapé', () => {
  it('lê id e favorecido quando o cabeçalho se explica', () => {
    const rodape = [
      'DATA;ID_DA_RETIRADA;STATUS;BANCO;FAVORECIDO',
      '17/08/2026;174328123882;pago;BCO XYZ;GOOGLE BRASIL INTERNET LTDA',
      '18/08/2026;173477054135;pago;BCO ABC;JOSE DA SILVA MOTO EXPRESS',
    ]
    expect(destinosDoRodape(rodape)).toEqual([
      { fonte: '174328123882', nome: 'GOOGLE BRASIL INTERNET LTDA' },
      { fonte: '173477054135', nome: 'JOSE DA SILVA MOTO EXPRESS' },
    ])
  })

  it('cabeçalho sem coluna de nome devolve vazio — palpite não vira classificação', () => {
    expect(destinosDoRodape(['DATA;VALOR;STATUS', '17/08/2026;500,00;pago'])).toEqual([])
    expect(destinosDoRodape([])).toEqual([])
  })
})
