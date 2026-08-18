import { describe, expect, it } from 'vitest'

import { categoriaPelaContraparte, contraparteDe, ehACasa } from '../contraparte'

/**
 * O bug que originou este arquivo: o dono abriu os lançamentos e viu a razão
 * social da PRÓPRIA FRENESI ocupando o campo "contraparte" de 46 movimentos —
 * 43 deles vendas, onde o outro lado é o cliente.
 */
describe('contraparte do Mercado Pago', () => {
  it('numa venda, fica com o cliente e descarta a loja', () => {
    expect(contraparteDe('Gabrielly Rodrigues | FRENESI')).toBe('Gabrielly Rodrigues')
  })

  it('numa compra, fica com o fornecedor e descarta a razão social da casa', () => {
    expect(
      contraparteDe('M & R COMERCIO DE PRODUTOS DE HIGIENE PESSOAL LTDA | SienoD'),
    ).toBe('SienoD')
  })

  it('quando o extrato só nomeia a casa, devolve vazio em vez de mentir', () => {
    // Vazio é a resposta honesta, e deixa a rotina tentar de novo noutra rodada.
    // Um palpite gravado fecharia essa porta para sempre.
    expect(contraparteDe('M & R COMERCIO DE PRODUTOS DE HIGIENE PESSOAL LTDA')).toBe('')
  })

  it('reconhece a casa escrita de formas diferentes', () => {
    // O mesmo nome chega de três jeitos conforme o campo da API que respondeu.
    expect(ehACasa('M&R Comercio de Produtos de Higiene Pessoal')).toBe(true)
    expect(ehACasa('M & R COMÉRCIO DE PRODUTOS DE HIGIENE PESSOAL LTDA')).toBe(true)
    expect(ehACasa('FRENESI')).toBe(true)
    expect(ehACasa('Frenesi Perfumes')).toBe(true)
  })

  it('não confunde cliente cujo nome apenas começa parecido', () => {
    expect(ehACasa('Marcos Ribeiro')).toBe(false)
    expect(ehACasa('Frenesio Alves da Silva')).toBe(false)
  })

  it('sem nada informado, devolve vazio', () => {
    expect(contraparteDe(null)).toBe('')
    expect(contraparteDe('')).toBe('')
    expect(contraparteDe('  |  ')).toBe('')
  })

  it('preserva quem sobra quando há mais de um lado de fora', () => {
    expect(contraparteDe('Fornecedor A | Fornecedor B')).toBe('Fornecedor A | Fornecedor B')
  })
})

describe('categoria pela contraparte do saque', () => {
  it('nomes inequívocos decidem sozinhos', () => {
    expect(categoriaPelaContraparte('Google Brasil Internet Ltda')).toBe('trafego-pago')
    expect(categoriaPelaContraparte('FACEBOOK SERVIÇOS ONLINE DO BRASIL LTDA')).toBe('trafego-pago')
    expect(categoriaPelaContraparte('Compra de etiquetas de envio')).toBe('frete')
    expect(categoriaPelaContraparte('MELHOR ENVIO TECNOLOGIA LTDA')).toBe('frete')
  })

  it('nome que não decide devolve null — a fila continua sendo de quem opera', () => {
    expect(categoriaPelaContraparte('BCO INTER S.A.')).toBeNull()
    expect(categoriaPelaContraparte('Metalurgica Souza LTDA')).toBeNull()
    expect(categoriaPelaContraparte('')).toBeNull()
    expect(categoriaPelaContraparte(null)).toBeNull()
  })
})
