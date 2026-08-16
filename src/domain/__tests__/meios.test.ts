import { describe, expect, it } from 'vitest'

import { gatewayDe, liquidaParcelado, normalizarMeio } from '../meios'

describe('normalizarMeio', () => {
  it('junta as grafias de Pix que o ERP tratava como meios diferentes', () => {
    // O caso real: 228 vendas em "pix" e 132 em "Pix", com percentuais
    // diferentes, dividindo a média ponderada que entra no preço.
    for (const grafia of ['pix', 'Pix', 'PIX', ' pix ', 'Pix ']) {
      expect(normalizarMeio(grafia)).toBe('Pix')
    }
  })

  it('junta `credit_card` da Pagar.me com "Cartão de crédito" da Yampi', () => {
    expect(normalizarMeio('credit_card')).toBe('Cartão de crédito 1x')
    expect(normalizarMeio('Cartão de crédito')).toBe('Cartão de crédito 1x')
    expect(normalizarMeio('cartao de credito')).toBe('Cartão de crédito 1x')
  })

  it('NÃO junta parcelamentos: 6x custa cinco vezes o que 1x custa', () => {
    expect(normalizarMeio('Cartão de crédito 6x')).toBe('Cartão de crédito 6x')
    expect(normalizarMeio('cartao de credito 12x')).toBe('Cartão de crédito 12x')
    expect(normalizarMeio('Cartão de crédito 6x')).not.toBe(normalizarMeio('credit_card'))
  })

  it('Pagaleve vence o teste genérico de Pix', () => {
    // "Pix parcelado (Pagaleve)" contém "pix"; sem a ordem certa das regras
    // ele viraria Pix comum e sumiria como meio de custo próprio.
    expect(normalizarMeio('Pix parcelado (Pagaleve)')).toBe('Pix parcelado (Pagaleve)')
    expect(normalizarMeio('pagaleve')).toBe('Pix parcelado (Pagaleve)')
  })

  it('separa débito de crédito', () => {
    expect(normalizarMeio('debit_card')).toBe('Cartão de débito')
    expect(normalizarMeio('Cartão de débito')).toBe('Cartão de débito')
  })

  it('reconhece boleto pelos dois nomes', () => {
    expect(normalizarMeio('boleto')).toBe('Boleto')
    expect(normalizarMeio('bank_slip')).toBe('Boleto')
  })

  it('vazio e nulo viram "Não identificado"', () => {
    expect(normalizarMeio(null)).toBe('Não identificado')
    expect(normalizarMeio(undefined)).toBe('Não identificado')
    expect(normalizarMeio('   ')).toBe('Não identificado')
  })

  it('meio desconhecido sobrevive em vez de virar "Não identificado"', () => {
    // Apagar o desconhecido perderia informação: melhor ele aparecer na tela
    // estranho e alguém decidir o que é.
    expect(normalizarMeio('vale_presente')).toBe('Vale_presente')
  })

  it('parcela absurda é ignorada em vez de aceita', () => {
    expect(normalizarMeio('Cartão de crédito 99x')).toBe('Cartão de crédito 1x')
  })
})

describe('gatewayDe', () => {
  it('reconhece o intermediador pelo nome quando ele está na origem', () => {
    expect(gatewayDe('pagaleve')).toBe('Pagaleve')
    expect(gatewayDe('pagarme')).toBe('Pagar.me')
    expect(gatewayDe('mercadopago')).toBe('Mercado Pago')
  })

  it('origem da Yampi decide pelo gateway VIGENTE na data da venda', () => {
    // "Yampi · Pago" diz de onde veio o pedido, não quem processou o dinheiro.
    // Antes de 22/07 quem processava era a Pagar.me; depois, o Mercado Pago.
    expect(gatewayDe('Yampi · Pago', '2026-07-10')).toBe('Pagar.me')
    expect(gatewayDe('Yampi · Pago', '2026-07-22')).toBe('Mercado Pago')
    expect(gatewayDe('Yampi · Pago', '2026-08-14')).toBe('Mercado Pago')
  })

  it('sem data, assume o gateway atual', () => {
    expect(gatewayDe('Yampi · Pago')).toBe('Mercado Pago')
  })

  it('origem desconhecida não vira palpite', () => {
    expect(gatewayDe('sei la')).toBe('Outro')
    expect(gatewayDe(null)).toBe('Outro')
  })
})

describe('liquidaParcelado', () => {
  it('reconhece o que demora a virar caixa', () => {
    expect(liquidaParcelado('Pix parcelado (Pagaleve)')).toBe(true)
    expect(liquidaParcelado('Cartão de crédito 6x')).toBe(true)
  })

  it('à vista e Pix comum entram na hora', () => {
    expect(liquidaParcelado('Pix')).toBe(false)
    expect(liquidaParcelado('Cartão de crédito 1x')).toBe(false)
  })
})
