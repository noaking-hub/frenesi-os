import { describe, expect, it } from 'vitest'

import { apenasOAtual, avisosDe } from '..'
import type { PedidoNotificavel } from '..'

const pedido = (p: Partial<PedidoNotificavel> = {}): PedidoNotificavel => ({
  id: 'YP-1001',
  email: 'cliente@email.com',
  cliente: 'Camila Rocha',
  pagamento: 'pago',
  envio: 'nao_iniciado',
  rastreio: null,
  notaFiscal: null,
  ...p,
})

describe('avisos de pedido', () => {
  it('a chave deriva do fato, não do instante — reprocessar dá a mesma', () => {
    const a = avisosDe(pedido())
    const b = avisosDe(pedido())
    expect(a[0].chave).toBe('YP-1001|pedido_pago')
    expect(a.map((x) => x.chave)).toEqual(b.map((x) => x.chave))
  })

  it('pedido pendente não avisa nada', () => {
    expect(avisosDe(pedido({ pagamento: 'pendente' }))).toEqual([])
  })

  it('sem e-mail não há como avisar', () => {
    expect(avisosDe(pedido({ email: '' }))).toEqual([])
  })

  it('acumula a trilha na ordem que faz sentido para quem compra', () => {
    const avisos = avisosDe(
      pedido({ envio: 'entregue', notaFiscal: '3526...', rastreio: 'AA123' }),
    )
    expect(avisos.map((a) => a.evento)).toEqual([
      'pedido_pago',
      'pedido_faturado',
      'pedido_enviado',
      'pedido_entregue',
    ])
  })

  it('enviado sem nota fiscal pula o aviso de faturamento', () => {
    const avisos = avisosDe(pedido({ envio: 'enviado' }))
    expect(avisos.map((a) => a.evento)).toEqual(['pedido_pago', 'pedido_enviado'])
  })

  it('só o estado atual sai; o resto entra no log sem virar e-mail', () => {
    const avisos = avisosDe(pedido({ envio: 'entregue', notaFiscal: '3526...' }))
    const { enviar, dispensar } = apenasOAtual(avisos)
    // Mandar "pagamento confirmado" para quem já recebeu o perfume denuncia
    // que o sistema acabou de ser ligado.
    expect(enviar.map((a) => a.evento)).toEqual(['pedido_entregue'])
    expect(dispensar).toHaveLength(3)
  })

  it('sem aviso nenhum não há o que dispensar', () => {
    expect(apenasOAtual([])).toEqual({ enviar: [], dispensar: [] })
  })
})
