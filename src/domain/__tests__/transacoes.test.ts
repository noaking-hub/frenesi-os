import { describe, expect, it } from 'vitest'

import { identificadoresDaTransacao, transacoesDoPedido } from '..'

/**
 * Forma que a Yampi devolve em `/orders?include=transactions`.
 *
 * Os nomes de campo variam entre lojas e versões — é por isso que o leitor
 * colhe todos os candidatos em vez de escolher um. Este fixture mistura as
 * grafias de propósito.
 */
const TRANSACAO = {
  id: 4412881,
  transaction_id: '172981567954',
  gateway: 'mercadopago',
  gateway_transaction_id: '172981567954',
  status: 'paid',
  amount: 84.25,
  installments: 1,
  card_brand: 'master',
  customer_email: 'cliente@exemplo.com',
}

describe('identificadores da transação', () => {
  it('acha o id do gateway sem depender do nome exato do campo', () => {
    expect(identificadoresDaTransacao(TRANSACAO)).toContain('172981567954')
  })

  it('colhe as duas grafias como candidatos', () => {
    // `transaction_id` e `gateway_transaction_id` trazem o mesmo valor aqui,
    // mas em outra loja só uma das duas existe. Casar por qualquer uma é o
    // que faz a integração sobreviver à diferença.
    const so = identificadoresDaTransacao({ gateway_transaction_id: '999888777666' })
    expect(so).toEqual(['999888777666'])
  })

  it('não aceita valor curto como identificador', () => {
    // Número de parcelas e id de tabela casariam por acaso com alguma coisa um
    // dia. Um acerto por acaso na conciliação é pior que uma venda órfã:
    // ninguém volta a conferir o que o sistema deu por resolvido.
    expect(identificadoresDaTransacao({ transaction_id: 6 })).toEqual([])
    expect(identificadoresDaTransacao({ payment_id: '123' })).toEqual([])
  })

  it('ignora campo sem pista de identificador', () => {
    // O e-mail do cliente tem tamanho de sobra e nunca casaria com nada —
    // só engordaria a lista de candidatos.
    expect(identificadoresDaTransacao({ customer_email: 'alguem@exemplo.com.br' })).toEqual([])
  })

  it('desce um nível quando o gateway vem aninhado', () => {
    expect(
      identificadoresDaTransacao({ gateway_data: { payment_id: '173008524770' } }),
    ).toEqual(['173008524770'])
  })
})

describe('transações do pedido', () => {
  it('lê a relação embrulhada em data', () => {
    const t = transacoesDoPedido({ transactions: { data: [TRANSACAO] } })
    expect(t).toHaveLength(1)
    expect(t[0].gateway).toBe('mercadopago')
    expect(t[0].valor).toBe(84.25)
    expect(t[0].identificadores).toContain('172981567954')
  })

  it('lê a relação como lista direta', () => {
    // A mesma API devolve as duas formas dependendo do endpoint.
    expect(transacoesDoPedido({ transactions: [TRANSACAO] })).toHaveLength(1)
  })

  it('descarta transação sem identificador nenhum', () => {
    // Sem id não há ponte a construir; guardar a linha vazia só encheria a
    // tabela de nada e faria parecer que o pedido está conciliado.
    expect(transacoesDoPedido({ transactions: [{ id: 1, status: 'paid' }] })).toEqual([])
  })

  it('não quebra em pedido sem transação', () => {
    expect(transacoesDoPedido({})).toEqual([])
    expect(transacoesDoPedido({ transactions: null })).toEqual([])
  })
})
