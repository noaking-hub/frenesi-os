import { describe, expect, it } from 'vitest'

import { apenasOAtual, avisosDe, emailEntregue, emailEnvio, paginaDeRastreio } from '..'
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

describe('página de rastreio no aviso de envio', () => {
  it('Correios e Jadlog vão para a Frenet, com o código embutido', () => {
    expect(paginaDeRastreio('Correios', 'AD778124948BR')).toBe(
      'https://rastreio.frenet.com.br/COR/AD778124948BR',
    )
    expect(paginaDeRastreio('Jadlog', '614554609')).toBe(
      'https://rastreio.frenet.com.br/JAD/614554609',
    )
  })

  it('J&T, Total e Buslog vão para o Melhor Rastreio', () => {
    expect(paginaDeRastreio('J&T Express', '888030860328538')).toBe(
      'https://melhorrastreio.com.br/rastreio/888030860328538',
    )
    expect(paginaDeRastreio('Total Express', 'TX1')).toContain('melhorrastreio.com.br')
    expect(paginaDeRastreio('Buslog', 'BL1')).toContain('melhorrastreio.com.br')
  })

  it('sem transportadora ou sem código, nenhum link', () => {
    // Link que abre numa consulta vazia faz o cliente concluir que o pedido
    // se perdeu — é pior que não oferecer link nenhum.
    expect(paginaDeRastreio(null, 'ABC')).toBeNull()
    expect(paginaDeRastreio('Correios', null)).toBeNull()
    expect(paginaDeRastreio('Correios', '   ')).toBeNull()
  })
})

describe('e-mail de envio', () => {
  const base = {
    nome: 'Isabel Cristina',
    pedido: 'YP-1510190959842609',
    codigo: 'AD778124948BR',
    transportadora: 'Correios',
    link: 'https://rastreio.frenet.com.br/COR/AD778124948BR',
  }

  it('traz o código em destaque e o botão apontando para a página certa', () => {
    const { assunto, html } = emailEnvio(base)
    expect(assunto).toContain('YP-1510190959842609')
    expect(html).toContain('AD778124948BR')
    expect(html).toContain('href="https://rastreio.frenet.com.br/COR/AD778124948BR"')
    expect(html).toContain('Acompanhar entrega')
    // Só o primeiro nome: nome completo em e-mail soa a cobrança.
    expect(html).toContain('Isabel,')
    expect(html).not.toContain('Isabel Cristina')
  })

  it('sem link não renderiza botão', () => {
    const { html } = emailEnvio({ ...base, link: null })
    expect(html).not.toContain('Acompanhar entrega')
    expect(html).toContain('AD778124948BR')
  })

  it('sem código promete o código em vez de deixar o espaço vazio', () => {
    const { html } = emailEnvio({ ...base, codigo: null, link: null })
    expect(html).toContain('Assim que o código de rastreio for emitido')
    expect(html).not.toContain('Código de rastreio ·')
  })

  it('escapa o que veio de fora', () => {
    const { html } = emailEnvio({ ...base, nome: '<script>x</script>' })
    expect(html).not.toContain('<script>')
  })
})

describe('e-mail de entrega', () => {
  it('usa a mesma moldura e não oferece botão', () => {
    // O pedido chegou: não há o que acompanhar, e um botão ali só confunde.
    const { assunto, html } = emailEntregue({ nome: 'Rafael', pedido: 'YP-1' })
    expect(assunto).toContain('YP-1')
    expect(html).toContain('FRENESI')
    expect(html).toContain('Rafael, seu pedido chegou.')
    expect(html).not.toContain('<a href')
  })
})
