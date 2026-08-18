import { describe, expect, it } from 'vitest'

import {
  estadoDaChegada,
  custoPorMlPrevisto,
  estadoDaCompra,
  faltamDoItem,
  investidoAguardando,
  mlAguardando,
  mlDaCompra,
  pendenciaDoItem,
  problemasDaCompra,
  resumoDaCompra,
  type CompraACaminho,
  type ItemDaCompra,
} from '../compras-a-caminho'

const item = (p: Partial<ItemDaCompra> = {}): ItemDaCompra => ({
  id: 'i1',
  baseId: 'sauvage',
  descricao: 'Sauvage',
  volumeMl: 100,
  quantidade: 10,
  custoUnitario: 400,
  quantidadeRecebida: 0,
  recebidoEm: null,
  ocorrencia: null,
  loteId: null,
  ...p,
})

const compra = (p: Partial<CompraACaminho> = {}): CompraACaminho => ({
  id: 'c1',
  fornecedor: 'Distribuidora X',
  referencia: null,
  compradaEm: '2026-08-01',
  previstaPara: '2026-08-20',
  rastreio: null,
  transportadora: null,
  valorTotal: null,
  frete: 0,
  observacao: null,
  canceladaEm: null,
  itens: [item()],
  ...p,
})

describe('chegada do item', () => {
  it('distingue não chegou, chegou em parte e chegou inteiro', () => {
    // O recebimento PARCIAL é o caso que a lista de papel não sabia
    // representar: chegam 8 de 10 e os 2 continuam pendentes.
    expect(estadoDaChegada(item({ quantidadeRecebida: 0 }))).toBe('aguardando')
    expect(estadoDaChegada(item({ quantidadeRecebida: 8 }))).toBe('parcial')
    expect(estadoDaChegada(item({ quantidadeRecebida: 10 }))).toBe('recebido')
  })

  it('receber a mais não cria falta negativa', () => {
    // Fornecedor manda 11 em vez de 10. Faltando = 0, não −1.
    expect(faltamDoItem(item({ quantidadeRecebida: 11 }))).toBe(0)
    expect(estadoDaChegada(item({ quantidadeRecebida: 11 }))).toBe('recebido')
  })
})

describe('o que falta para virar lote', () => {
  it('segue a ordem em que a pessoa resolve na vida real', () => {
    expect(pendenciaDoItem(item())).toBe('ainda não chegou')
    // Chegou, mas o perfume ainda não existe no catálogo — o caso que fez o
    // módulo NÃO dar entrada automática no estoque.
    expect(pendenciaDoItem(item({ quantidadeRecebida: 10, baseId: null }))).toBe(
      'o perfume ainda não existe no catálogo',
    )
    expect(pendenciaDoItem(item({ quantidadeRecebida: 10 }))).toBe(
      'falta registrar a compra do frasco para criar o lote',
    )
    expect(pendenciaDoItem(item({ quantidadeRecebida: 10, loteId: 'LT-1' }))).toBeNull()
  })

  it('chegar e existir no catálogo são perguntas independentes', () => {
    // Sem catálogo e sem chegar: o que falta primeiro é a chegada.
    expect(pendenciaDoItem(item({ baseId: null }))).toBe('ainda não chegou')
  })
})

describe('resumo da compra', () => {
  it('conta frascos, não itens', () => {
    const r = resumoDaCompra(
      compra({ itens: [item({ quantidade: 10, quantidadeRecebida: 8 }), item({ id: 'i2', quantidade: 5 })] }),
    )
    expect(r.itens).toBe(2)
    expect(r.frascosEsperados).toBe(15)
    expect(r.frascosRecebidos).toBe(8)
    expect(r.frascosFaltando).toBe(7)
    expect(r.completa).toBe(false)
  })

  it('separa o que está pronto para lote do que falta cadastrar', () => {
    const r = resumoDaCompra(
      compra({
        itens: [
          item({ id: 'a', quantidadeRecebida: 10 }),
          item({ id: 'b', quantidadeRecebida: 10, baseId: null }),
          item({ id: 'c', quantidadeRecebida: 10, loteId: 'LT-9' }),
        ],
      }),
    )
    expect(r.prontosParaLote).toBe(1)
    expect(r.semCadastro).toBe(1)
  })

  it('só soma o custo quando TODOS os itens têm preço', () => {
    // Somar com um item sem preço daria um total que parece completo e não é.
    const comTudo = resumoDaCompra(compra({ frete: 50 }))
    expect(comTudo.custoEstimado).toBe(4050)

    const semUm = resumoDaCompra(
      compra({ frete: 50, valorTotal: 999, itens: [item(), item({ id: 'i2', custoUnitario: null })] }),
    )
    expect(semUm.custoEstimado).toBe(999)
  })
})

describe('estado da compra', () => {
  it('atrasada só quando há previsão e ela passou', () => {
    expect(estadoDaCompra(compra(), '2026-08-10')).toBe('aguardando')
    expect(estadoDaCompra(compra(), '2026-08-25')).toBe('atrasada')
    // Sem previsão não há atraso a apontar: chutar uma transformaria
    // "não sei quando chega" em cobrança.
    expect(estadoDaCompra(compra({ previstaPara: null }), '2026-08-25')).toBe('aguardando')
  })

  it('recebida por inteiro nunca aparece como atrasada', () => {
    const c = compra({ itens: [item({ quantidadeRecebida: 10 })] })
    expect(estadoDaCompra(c, '2026-08-25')).toBe('recebida')
  })

  it('cancelada vence tudo', () => {
    expect(estadoDaCompra(compra({ canceladaEm: '2026-08-05' }), '2026-08-25')).toBe('cancelada')
  })
})

describe('validação do cadastro', () => {
  const base = {
    fornecedor: 'Distribuidora X',
    compradaEm: '2026-08-01',
    previstaPara: '2026-08-20',
    itens: [{ descricao: 'Sauvage', quantidade: 10 }],
  }

  it('aceita o caminho feliz', () => {
    expect(problemasDaCompra(base)).toEqual([])
  })

  it('devolve TODOS os problemas de uma vez', () => {
    // Um erro por vez transforma o cadastro em adivinhação em série.
    const p = problemasDaCompra({ fornecedor: '  ', compradaEm: '', previstaPara: null, itens: [] })
    expect(p.length).toBe(3)
  })

  it('previsão anterior à compra é erro', () => {
    expect(problemasDaCompra({ ...base, previstaPara: '2026-07-30' })).toContain(
      'A previsão de chegada não pode ser anterior à compra.',
    )
  })

  it('item sem nome ou com quantidade zero não passa', () => {
    expect(problemasDaCompra({ ...base, itens: [{ descricao: ' ', quantidade: 1 }] })).toContain(
      'Todo item precisa de um nome.',
    )
    expect(problemasDaCompra({ ...base, itens: [{ descricao: 'X', quantidade: 0 }] })).toContain(
      'A quantidade de cada item precisa ser pelo menos 1.',
    )
  })
})

describe('dinheiro e volume na estrada', () => {
  it('investido aguardando conta só o que NÃO chegou', () => {
    // A pergunta é "quanto tenho parado esperando", não "quanto custou a
    // compra": o que já está na prateleira saiu da espera.
    const c = compra({
      itens: [
        item({ id: 'a', quantidade: 10, quantidadeRecebida: 4, custoUnitario: 400 }),
        item({ id: 'b', quantidade: 2, quantidadeRecebida: 0, custoUnitario: 150 }),
      ],
    })
    expect(investidoAguardando(c)).toBe(2700) // 6×400 + 2×150
  })

  it('item sem preço não vira zero disfarçado no total', () => {
    // Ele simplesmente não soma — e o cartão da tela diz que há item sem preço.
    const c = compra({ itens: [item({ custoUnitario: null, quantidade: 3 })] })
    expect(investidoAguardando(c)).toBe(0)
  })

  it('compra cancelada não conta como dinheiro na estrada', () => {
    expect(investidoAguardando(compra({ canceladaEm: '2026-08-05' }))).toBe(0)
    expect(mlAguardando(compra({ canceladaEm: '2026-08-05' }))).toBe(0)
  })

  it('ml a caminho é o estoque real, não a contagem de frascos', () => {
    // Dois de 100 ml e dez de 5 ml são doze frascos e mundos diferentes.
    const c = compra({
      itens: [
        item({ id: 'a', quantidade: 2, volumeMl: 100, quantidadeRecebida: 0 }),
        item({ id: 'b', quantidade: 10, volumeMl: 5, quantidadeRecebida: 0 }),
      ],
    })
    expect(mlAguardando(c)).toBe(250)
    expect(mlDaCompra(c)).toBe(250)
  })

  it('custo por ml some quando falta preço ou volume', () => {
    // Número chutado aqui contamina a precificação inteira.
    expect(custoPorMlPrevisto(item({ custoUnitario: 400, volumeMl: 100 }))).toBe(4)
    expect(custoPorMlPrevisto(item({ custoUnitario: null }))).toBeNull()
    expect(custoPorMlPrevisto(item({ volumeMl: null }))).toBeNull()
    expect(custoPorMlPrevisto(item({ volumeMl: 0 }))).toBeNull()
  })
})
