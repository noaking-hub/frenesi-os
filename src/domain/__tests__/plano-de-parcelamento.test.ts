import { describe, expect, it } from 'vitest'

import { cronogramaDeParcelas } from '../parcelamento'
import { efeitoDoParcelamento, planejarParcelamento } from '../plano-de-parcelamento'

/**
 * Estes testes são o contrato com o Postgres, do mesmo jeito que os de
 * `parcelamento.test.ts`.
 *
 * O que `planejarParcelamento` devolve tem de ser o que
 * `gravar_parcelas_do_lancamento` grava: mesma divisão, mesmas datas, mesmas
 * recusas. Se um dos dois lados "melhorar" sozinho, é aqui que a divergência
 * aparece — e não no extrato do dono, meses depois, com um centavo a menos.
 */

/** Soma em centavos: comparar `reduce` de floats reprovaria por 1e-13. */
const soma = (valores: number[]) => valores.reduce((a, v) => a + Math.round(v * 100), 0) / 100

/** O plano do caso real, para não repetir o objeto em cada teste. */
const plano = (extra: Partial<Parameters<typeof planejarParcelamento>[0]> = {}) =>
  planejarParcelamento({
    valor: 216,
    parcelas: 2,
    primeiroVencimento: '2026-08-12',
    intervaloDias: 30,
    ...extra,
  })

describe('planejarParcelamento — o caso que originou a função', () => {
  it('R$ 216,00 em 2 com a primeira já recebida em 12/08 dá 108,00 baixada e 108,00 em aberto', () => {
    // O relato do dono, inteiro: ele parcelou em 2x, recebeu a primeira parcela
    // e só depois lançou a venda. O ERP tinha marcado os R$ 216,00 como
    // recebidos em 12/08; o certo é metade recebida naquela data e metade em
    // aberto. Se este teste cair, o ERP voltou a dizer que entrou o dobro.
    const p = plano({ jaRecebidas: 1, recebidasEm: '2026-08-12' })
    expect(p).toEqual({
      ok: true,
      recebido: 108,
      emAberto: 108,
      parcelas: [
        { numero: 1, valor: 108, venceEm: '2026-08-12', recebidaEm: '2026-08-12' },
        { numero: 2, valor: 108, venceEm: '2026-09-11', recebidaEm: null },
      ],
    })
  })

  it('a parcela já recebida carrega a DATA DO RECEBIMENTO, não o vencimento calculado', () => {
    // Recebimento retroativo: o dinheiro entrou em 12/08, mas o cronograma
    // combinado começa em 01/09. Deixar a parcela liquidada com vencimento
    // 01/09 poria data futura numa linha que já está quitada — a coluna "vence"
    // contradiria o "baixado em" da mesma linha.
    const p = plano({
      primeiroVencimento: '2026-09-01',
      jaRecebidas: 1,
      recebidasEm: '2026-08-12',
    })
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.parcelas[0]).toEqual({
      numero: 1,
      valor: 108,
      venceEm: '2026-08-12',
      recebidaEm: '2026-08-12',
    })
    // A parcela em aberto continua no cronograma combinado: o que já entrou não
    // reprograma o que falta.
    expect(p.parcelas[1].venceEm).toBe('2026-10-01')
  })
})

describe('planejarParcelamento — a aritmética fecha', () => {
  it('R$ 100,00 em 3 soma exatamente 100,00, com o centavo na primeira', () => {
    // 100,00 / 3 = 33,3333… Arredondar cada parcela isoladamente devolveria
    // 99,99 ou 100,01, e o centavo perdido só apareceria no fechamento do mês.
    const p = planejarParcelamento({ valor: 100, parcelas: 3, primeiroVencimento: '2026-08-17' })
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.parcelas.map((x) => x.valor)).toEqual([33.34, 33.33, 33.33])
    expect(soma(p.parcelas.map((x) => x.valor))).toBe(100)
  })

  it('R$ 999.999,99 em 48 não perde nem inventa centavo', () => {
    // O extremo da faixa. 99.999.999 centavos / 48 = 2.083.333 com resto 15 —
    // os 15 centavos vão na primeira parcela, como o SQL faz.
    const p = planejarParcelamento({
      valor: 999999.99,
      parcelas: 48,
      primeiroVencimento: '2026-08-17',
    })
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.parcelas).toHaveLength(48)
    expect(p.parcelas[0].valor).toBe(20833.48)
    expect(p.parcelas[47].valor).toBe(20833.33)
    expect(soma(p.parcelas.map((x) => x.valor))).toBe(999999.99)
  })

  it('R$ 0,01 em 2 é RECUSADO, porque sobraria parcela de R$ 0,00', () => {
    // A tabela `lancamentos` tem CHECK (valor > 0). Sem esta recusa a prévia
    // mostraria "2× de R$ 0,00" e o INSERT morreria em violação de constraint,
    // com uma mensagem de Postgres que o operador não tem como ler.
    const p = planejarParcelamento({ valor: 0.01, parcelas: 2, primeiroVencimento: '2026-08-17' })
    expect(p.ok).toBe(false)
    if (p.ok) return
    expect(p.erro).toContain('R$ 0,00')
  })

  it('recebido + em aberto fecha com o valor, para qualquer K', () => {
    // A soma dos dois cartões da tela ("já entrou" e "falta entrar") é o valor
    // da venda. Um centavo de diferença aqui vira divergência de saldo.
    for (const valor of [216, 100, 0.05, 1234.57, 999999.99]) {
      for (const parcelas of [2, 3, 7, 12, 48]) {
        if (Math.round(valor * 100) < parcelas) continue
        for (let k = 0; k <= parcelas; k++) {
          const p = planejarParcelamento({
            valor,
            parcelas,
            jaRecebidas: k,
            recebidasEm: '2026-08-12',
            primeiroVencimento: '2026-08-12',
          })
          expect(p.ok).toBe(true)
          if (!p.ok) return
          expect(soma([p.recebido, p.emAberto])).toBe(valor)
          expect(p.parcelas.filter((x) => x.recebidaEm)).toHaveLength(k)
        }
      }
    }
  })
})

describe('planejarParcelamento — K nos extremos', () => {
  it('com K = 0 devolve exatamente o parcelamento que o ERP já fazia', () => {
    // O mecanismo é UM só: K = 0 é o parcelamento de sempre, não um caminho
    // paralelo. Se este teste cair, nasceu um segundo mecanismo — e dois
    // caminhos para o mesmo fato divergem no primeiro conserto que alguém fizer
    // em um deles.
    const p = plano({ jaRecebidas: 0 })
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.parcelas.map(({ numero, valor, venceEm }) => ({ numero, valor, venceEm }))).toEqual(
      cronogramaDeParcelas(216, 2, 30, '2026-08-12'),
    )
    expect(p.parcelas.every((x) => x.recebidaEm === null)).toBe(true)
    expect(p.recebido).toBe(0)
    expect(p.emAberto).toBe(216)
  })

  it('sem informar K nenhum, o padrão é zero recebidas', () => {
    const p = plano()
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.recebido).toBe(0)
  })

  it('com K = N todas nascem baixadas na data informada e nada fica em aberto', () => {
    // Venda parcelada quitada por inteiro antes de ser lançada. O total tem de
    // continuar entrando no caixa: se `emAberto` sobrasse, o painel cobraria do
    // cliente uma parcela que ele já pagou.
    const p = plano({ jaRecebidas: 2, recebidasEm: '2026-08-12' })
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.parcelas.every((x) => x.recebidaEm === '2026-08-12')).toBe(true)
    expect(p.recebido).toBe(216)
    expect(p.emAberto).toBe(0)
  })

  it('K maior que o número de parcelas é recusado com o motivo em uma linha', () => {
    // 3 recebidas num parcelamento de 2 marcaria como paga uma parcela que não
    // existe, e o "já entrou" passaria do valor da venda.
    const p = plano({ jaRecebidas: 3, recebidasEm: '2026-08-12' })
    expect(p.ok).toBe(false)
    if (p.ok) return
    expect(p.erro).toBe('Não dá para marcar 3 parcelas já recebidas em um parcelamento de 2.')
  })

  it('K negativo é recusado em vez de virar parcela a menos', () => {
    const p = plano({ jaRecebidas: -1 })
    expect(p.ok).toBe(false)
  })

  it('K sem data de recebimento é recusado: baixa sem dia não entra no fluxo', () => {
    // `fluxo_de_caixa` usa `coalesce(baixado_em, vence_em)` para saber em que
    // dia o dinheiro se moveu. Assumir "hoje" para um recebimento retroativo
    // jogaria a entrada de 12/08 no dia do cadastro.
    const p = plano({ jaRecebidas: 1 })
    expect(p.ok).toBe(false)
    if (p.ok) return
    expect(p.erro).toContain('data')
  })

  it('data de recebimento que não existe no calendário é recusada', () => {
    const p = plano({ jaRecebidas: 1, recebidasEm: '2026-02-31' })
    expect(p.ok).toBe(false)
  })
})

describe('planejarParcelamento — as recusas que o banco também faz', () => {
  it('menos de 2 parcelas não é parcelamento', () => {
    expect(plano({ parcelas: 1 }).ok).toBe(false)
    expect(plano({ parcelas: 0 }).ok).toBe(false)
  })

  it('mais de 48 parcelas é recusado, como no SQL', () => {
    expect(plano({ parcelas: 49 }).ok).toBe(false)
    expect(plano({ parcelas: 48 }).ok).toBe(true)
  })

  it('intervalo menor que um dia é recusado, senão tudo venceria no mesmo dia', () => {
    expect(plano({ intervaloDias: 0 }).ok).toBe(false)
    expect(plano({ intervaloDias: -30 }).ok).toBe(false)
    expect(plano({ intervaloDias: 1 }).ok).toBe(true)
  })

  it('valor zero ou negativo é recusado', () => {
    expect(plano({ valor: 0 }).ok).toBe(false)
    expect(plano({ valor: -216 }).ok).toBe(false)
  })

  it('campo em branco chega como NaN e não vira plano de NaN parcelas', () => {
    // A prévia é recalculada a cada tecla; enquanto o operador apaga o campo
    // para digitar outro número, `parseNum` devolve NaN. NaN <= 0 é `false`, e
    // sem a checagem de finito ele atravessaria todas as validações.
    expect(plano({ valor: Number.NaN }).ok).toBe(false)
    expect(plano({ parcelas: Number.NaN }).ok).toBe(false)
    expect(plano({ intervaloDias: Number.NaN }).ok).toBe(false)
    expect(plano({ jaRecebidas: Number.NaN }).ok).toBe(false)
  })

  it('primeiro vencimento fora do formato AAAA-MM-DD é recusado', () => {
    expect(plano({ primeiroVencimento: '12/08/2026' }).ok).toBe(false)
    expect(plano({ primeiroVencimento: '' }).ok).toBe(false)
  })
})

describe('efeitoDoParcelamento — o número que a tela mostra antes do clique', () => {
  /** O lançamento do relato: R$ 216,00 marcados como recebidos em 12/08. */
  const vendaDoIcaro = (extra: Partial<Parameters<typeof efeitoDoParcelamento>[0]> = {}) =>
    efeitoDoParcelamento({
      tipo: 'entrada',
      movimentadoAntes: 216,
      baixadoEmAntes: '2026-08-12',
      movimentadoDepois: 108,
      baixadoEmDepois: '2026-08-12',
      saldoInformadoPara: null,
      ...extra,
    })

  it('o conserto do dono derruba R$ 108,00 do saldo calculado', () => {
    // Metade do dinheiro nunca entrou. A queda não é efeito colateral: é o
    // conserto, e o dono precisa vê-la ANTES de confirmar.
    const e = vendaDoIcaro()
    expect(e.diferenca).toBe(-108)
    expect(e.variacaoNoCalculado).toBe(-108)
    expect(e.inventaDinheiro).toBe(false)
  })

  it('com saldo informado para depois da baixa, o número EXIBIDO não se mexe', () => {
    // Medido no banco: o Inter tem saldo informado para 17/08, e a baixa de
    // 12/08 já estava fora dessa conta. Prometer "o saldo do Inter cai R$ 108"
    // faria o dono conferir um número parado e desconfiar da prévia inteira.
    const e = vendaDoIcaro({ saldoInformadoPara: '2026-08-17' })
    expect(e.variacaoNoCalculado).toBe(-108)
    expect(e.variacaoNoDisponivel).toBe(0)
  })

  it('baixa posterior à âncora move os dois saldos', () => {
    const e = vendaDoIcaro({ saldoInformadoPara: '2026-08-10' })
    expect(e.variacaoNoCalculado).toBe(-108)
    expect(e.variacaoNoDisponivel).toBe(-108)
  })

  it('dinheiro recebido sem data de baixa é invisível para os saldos', () => {
    // A cicatriz de `registrar_recebimento`: R$ 669,00 recebidos com
    // `baixado_em` nulo não entram em view de saldo nenhuma. Desmarcá-los não
    // pode anunciar queda de saldo que não vai acontecer.
    const e = efeitoDoParcelamento({
      tipo: 'entrada',
      movimentadoAntes: 669,
      baixadoEmAntes: null,
      movimentadoDepois: 0,
      baixadoEmDepois: null,
      saldoInformadoPara: null,
    })
    expect(e.diferenca).toBe(-669)
    expect(e.variacaoNoCalculado).toBe(0)
    expect(e.variacaoNoDisponivel).toBe(0)
  })

  it('em despesa, desmarcar pagamento DEVOLVE saldo à conta', () => {
    // A view acumula saída com sinal negativo. Um parcelamento que desmarca
    // R$ 108,00 pagos faz o saldo subir, não cair.
    const e = efeitoDoParcelamento({
      tipo: 'saida',
      movimentadoAntes: 216,
      baixadoEmAntes: '2026-08-12',
      movimentadoDepois: 108,
      baixadoEmDepois: '2026-08-12',
      saldoInformadoPara: null,
    })
    expect(e.diferenca).toBe(-108)
    expect(e.variacaoNoCalculado).toBe(108)
  })

  it('marcar mais do que já estava movimentado é inventar dinheiro — e o banco recusa', () => {
    const e = vendaDoIcaro({ movimentadoAntes: 108, movimentadoDepois: 216 })
    expect(e.inventaDinheiro).toBe(true)
  })

  it('parcelamento que mantém o mesmo total recebido não inventa nada', () => {
    // K = N: o cliente pagou tudo adiantado, e as duas parcelas nascem
    // baixadas. Nenhum centavo entra nem sai — só a linha vira duas.
    const e = vendaDoIcaro({ movimentadoDepois: 216 })
    expect(e.diferenca).toBe(0)
    expect(e.variacaoNoCalculado).toBe(0)
    expect(e.inventaDinheiro).toBe(false)
  })

  it('a soma é em centavos: 0,1 + 0,2 não pode virar recusa por 1e-17', () => {
    const e = efeitoDoParcelamento({
      tipo: 'entrada',
      movimentadoAntes: 0.3,
      baixadoEmAntes: '2026-08-12',
      movimentadoDepois: 0.1 + 0.2,
      baixadoEmDepois: '2026-08-12',
      saldoInformadoPara: null,
    })
    expect(e.diferenca).toBe(0)
    expect(e.inventaDinheiro).toBe(false)
  })

  /*
   * O furo que a verificação adversarial encontrou, virado em teste.
   *
   * `recebido > 0` com `baixado_em` nulo é dinheiro que NENHUMA view de saldo
   * soma. O invariante antigo comparava só a coluna `recebido`, então marcar
   * uma parcela como recebida mantinha a soma idêntica, passava liso — e dava
   * uma DATA àquele dinheiro, que aparecia no caixa pela primeira vez.
   *
   * Provado em produção com clones descartáveis das três linhas reais nessa
   * situação (LC-00013, LC-00014, LC-00018 — R$ 1.019,00 de baixa parcial no
   * Sicoob): o clone de LC-00018 subia R$ 150,00 no saldo calculado com o
   * `recebido` intacto em R$ 150,00 antes e depois.
   */
  it('recusa marcar parcela como recebida quando o pai não tem data de baixa', () => {
    const efeito = efeitoDoParcelamento({
      tipo: 'entrada',
      movimentadoAntes: 150,
      baixadoEmAntes: null,
      movimentadoDepois: 150,
      baixadoEmDepois: '2026-08-16',
      saldoInformadoPara: null,
    })
    // O total recebido não muda — e é justamente por isso que o invariante
    // antigo deixava passar.
    expect(efeito.diferenca).toBe(0)
    expect(efeito.inventaDinheiro).toBe(true)
  })

  it('deixa passar quando o pai tem baixa: aí o dinheiro já estava no caixa', () => {
    const efeito = efeitoDoParcelamento({
      tipo: 'entrada',
      movimentadoAntes: 216,
      baixadoEmAntes: '2026-08-12',
      movimentadoDepois: 108,
      baixadoEmDepois: '2026-08-12',
      saldoInformadoPara: null,
    })
    expect(efeito.inventaDinheiro).toBe(false)
    expect(efeito.variacaoNoCalculado).toBe(-108)
  })

  it('pai sem baixa e nenhuma parcela recebida continua sendo caso legítimo', () => {
    // K = 0 não dá data a nada, então não há caixa a inventar.
    const efeito = efeitoDoParcelamento({
      tipo: 'entrada',
      movimentadoAntes: 669,
      baixadoEmAntes: null,
      movimentadoDepois: 0,
      baixadoEmDepois: null,
      saldoInformadoPara: null,
    })
    expect(efeito.inventaDinheiro).toBe(false)
    expect(efeito.variacaoNoCalculado).toBe(0)
  })
})
