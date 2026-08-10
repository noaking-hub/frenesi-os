import { describe, expect, it } from 'vitest'

import { aguardaBaixaShopify, ehExcecao, montarEnvio } from '..'
import type { PedidoParaEnvio } from '..'

const AGORA = new Date('2026-08-20T12:00:00Z')

const BASE: PedidoParaEnvio = {
  id: 'YP-1',
  cliente: 'Cliente',
  destino: 'São Paulo · SP',
  transportadora: 'PAC',
  gateway: 'Melhor Envio',
  rastreio: 'AA123456789BR',
  envio: 'Enviado',
  pago: true,
  compradoEm: '2026-08-18T10:00:00Z',
  entregueEm: null,
  enviadoShopifyEm: null,
  entregaShopifyEm: null,
}

describe('envio derivado do pedido', () => {
  it('pedido não pago não está aguardando postagem', () => {
    const e = montarEnvio({ ...BASE, pago: false, envio: 'Não iniciado' }, AGORA)
    expect(e.status).toBe('pagamento-pendente')
    expect(e.shopify).toBe('aguardando-pagamento')
  })

  it('enviado com rastreio está em trânsito', () => {
    const e = montarEnvio(BASE, AGORA)
    expect(e.status).toBe('em-transito')
    expect(e.eventos.some((v) => v.descricao.includes('AA123456789BR'))).toBe(true)
  })

  it('vira exceção depois de quinze dias sem entrega', () => {
    // Não é afirmação de falha: é o que dá para afirmar sem a transportadora
    // integrada — passou tempo demais e ninguém confirmou a entrega.
    const e = montarEnvio({ ...BASE, compradoEm: '2026-07-20T10:00:00Z' }, AGORA)
    expect(e.status).toBe('sem-movimentacao')
    expect(ehExcecao(e)).toBe(true)
    expect(e.ultimoEvento).toContain('sem entrega confirmada')
  })

  it('entregue na Yampi e aberto na Shopify entra na fila de baixa', () => {
    const e = montarEnvio(
      { ...BASE, envio: 'Entregue', entregueEm: '2026-08-19T14:00:00Z' },
      AGORA,
    )
    expect(e.status).toBe('entregue')
    expect(e.shopify).toBe('aguardando-baixa')
    expect(aguardaBaixaShopify(e)).toBe(true)
  })

  it('sai da fila quando a entrega foi espelhada', () => {
    const e = montarEnvio(
      {
        ...BASE,
        envio: 'Entregue',
        entregueEm: '2026-08-19T14:00:00Z',
        entregaShopifyEm: '2026-08-19T15:00:00Z',
      },
      AGORA,
    )
    expect(e.shopify).toBe('entregue')
    expect(aguardaBaixaShopify(e)).toBe(false)
  })

  it('só produz marcos reais, nunca leitura inventada de transportadora', () => {
    // A Yampi devolve o código e a confirmação de entrega — não o histórico de
    // escaneamentos. Um evento "Objeto em trânsito · CTE Curitiba" fabricado a
    // partir de uma data levaria alguém a abrir reclamação com base em ficção.
    const e = montarEnvio(
      {
        ...BASE,
        envio: 'Entregue',
        entregueEm: '2026-08-19T14:00:00Z',
        enviadoShopifyEm: '2026-08-18T20:00:00Z',
        entregaShopifyEm: '2026-08-19T15:00:00Z',
      },
      AGORA,
    )
    expect(e.eventos.map((v) => v.local)).toEqual(['Yampi', 'PAC', 'Shopify', 'Yampi', 'Shopify'])
    // O código não tem data porque a Yampi não informa quando a etiqueta saiu.
    expect(e.eventos[1].quando).toBe('—')
  })

  it('respeita a transportadora quando ela afirma que a entrega falhou', () => {
    const e = montarEnvio({ ...BASE, envio: 'Retido' }, AGORA)
    expect(e.status).toBe('entrega-nao-efetuada')
    expect(ehExcecao(e)).toBe(true)
  })

  it('não inventa transportadora quando o pedido não traz uma', () => {
    const e = montarEnvio({ ...BASE, transportadora: '' }, AGORA)
    expect(e.transportadora).toBe('Não informada')
  })
})
