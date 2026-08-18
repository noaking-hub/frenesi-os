import { describe, expect, it } from 'vitest'

import {
  apenasOAtual,
  avisosDe,
  emailDevolucaoConcluida,
  emailEntregue,
  emailEnvio,
  paginaDeRastreio,
} from '..'
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

  it('usa a moldura validada da marca, com logomarca e redes', () => {
    // A primeira versão tinha moldura própria e sem logo — e na caixa de
    // entrada parecia outro remetente. O fundo é o creme da marca, o mesmo
    // do portal de devoluções: e-mail escuro no meio de uma lista clara vira
    // mancha preta, e o ouro some em tela de celular com pouca luz.
    const { html } = emailEnvio(base)
    // A logomarca é servida pelo PRÓPRIO ERP. Vinha de um CDN de terceiro e
    // quebrou no dia em que a variante clara do arquivo deixou de existir lá
    // — o e-mail chegava com o retângulo de imagem quebrada no cabeçalho.
    expect(html).toContain('/assets/frenesi-logo-email.png')
    expect(html).toContain('background-color:#EDE6DA')
    expect(html).not.toContain('#070605')
    expect(html).toContain('marca/icon-instagram.png')
  })

  it('a frase do corpo serve a qualquer transportadora, e não inventa nome', () => {
    // "Ele está com Correios" nasceu quando havia uma transportadora só.
    for (const t of ['Correios', 'Jadlog', 'J&T Express', 'Total Express', 'Buslog']) {
      const { html } = emailEnvio({ ...base, transportadora: t })
      expect(html).toContain(`segue com ${t.replace('&', '&amp;')}`)
    }
    // Serviço que não identifica a empresa: o texto contorna em vez de chutar.
    const { html } = emailEnvio({ ...base, transportadora: null })
    expect(html).toContain('segue com a transportadora responsável')
    expect(html).not.toContain('Correios')
  })

  it('traz o código em destaque e o botão apontando para a página certa', () => {
    const { assunto, html } = emailEnvio(base)
    expect(assunto).toContain('YP-1510190959842609')
    expect(html).toContain('AD778124948BR')
    expect(html).toContain('href="https://rastreio.frenet.com.br/COR/AD778124948BR"')
    // Só o primeiro nome: nome completo em e-mail soa a cobrança.
    expect(html).toContain('Isabel, seu pedido')
    expect(html).not.toContain('Isabel Cristina')
  })

  it('sem link o botão cai na loja, não numa consulta vazia', () => {
    const { html } = emailEnvio({ ...base, link: null })
    expect(html).toContain('href="https://frenesiperfumes.com.br"')
    expect(html).not.toContain('{link}')
  })

  it('nenhum placeholder sobra no HTML entregue', () => {
    // Chave não substituída aparece crua na caixa do cliente.
    const { html } = emailEnvio(base)
    for (const chave of ['{nome}', '{pedido}', '{codigo}', '{transportadora}', '{link}']) {
      expect(html).not.toContain(chave)
    }
  })

  it('escapa o que veio de fora', () => {
    const { html } = emailEnvio({ ...base, nome: '<script>x</script>' })
    expect(html).not.toContain('<script>')
  })

  it('entrega local fala em motoboy, sem transportadora nem código inventado', () => {
    // O cliente de Muriaé lia "segue com a transportadora responsável" e um
    // código chamado "a caminho" — modelo mentindo por falta de caso.
    const { html } = emailEnvio({
      ...base,
      codigo: null,
      transportadora: null,
      link: null,
      entregaLocal: true,
    })
    expect(html).toContain('motoboy')
    expect(html).toContain('Motoboy')
    expect(html).toContain('ENTREGA LOCAL')
    expect(html).toContain('entrega em mãos')
    expect(html).not.toContain('transportadora respons')
    expect(html).not.toContain('a caminho</span>')
    // O botão leva à conta do cliente, não a uma consulta de rastreio vazia.
    expect(html).toContain('href="https://conta.frenesiperfumes.com.br"')
    expect(html).toContain('ACOMPANHAR MEU PEDIDO')
  })
})

describe('e-mail de entrega', () => {
  it('usa a mesma moldura, sem código e apontando para a loja', () => {
    const { assunto, html } = emailEntregue({
      nome: 'Rafael',
      pedido: 'YP-1',
      transportadora: 'Correios',
    })
    expect(assunto).toContain('YP-1')
    // A logomarca é servida pelo PRÓPRIO ERP. Vinha de um CDN de terceiro e
    // quebrou no dia em que a variante clara do arquivo deixou de existir lá
    // — o e-mail chegava com o retângulo de imagem quebrada no cabeçalho.
    expect(html).toContain('/assets/frenesi-logo-email.png')
    expect(html).toContain('Rafael, seu pedido chegou')
    expect(html).toContain('ENTREGA CONFIRMADA')
    expect(html).toContain('href="https://frenesiperfumes.com.br"')
    // Não há o que rastrear num pedido entregue.
    expect(html).not.toContain('C&Oacute;DIGO DE RASTREIO')
    for (const chave of ['{nome}', '{pedido}', '{transportadora}', '{link}', '{codigo}']) {
      expect(html).not.toContain(chave)
    }
  })
})

describe('e-mail de devolução concluída', () => {
  const base = {
    nome: 'Ana Paula',
    protocolo: 'K7QM-4XT9',
    resolucao: 'Reembolso integral',
    reembolsoValor: 189.8,
    reembolsoData: '14/08/2026',
    temComprovante: true,
    trocaPedidoId: null,
  }

  it('diz o meio pelo qual o dinheiro voltou, e que é o mesmo do pagamento', () => {
    // A regra da casa: o reembolso sai SEMPRE pelo meio em que a compra foi
    // paga. Cartão volta por estorno no cartão; Pix volta por Pix.
    const pix = emailDevolucaoConcluida({ ...base, reembolsoForma: 'pix' }).html
    expect(pix).toContain('efetuado por Pix, o mesmo meio usado no pagamento')

    const cartao = emailDevolucaoConcluida({ ...base, reembolsoForma: 'estorno-cartao' }).html
    expect(cartao).toContain('efetuado por estorno no cartão, o mesmo meio usado no pagamento')
    // "Pix" solto no documento não serve como asserção: o cabeçalho do Outlook
    // traz <o:PixelsPerInch>. O que não pode aparecer é a FRASE.
    expect(cartao).not.toContain('por Pix')
  })

  it('sem forma registrada, não inventa uma', () => {
    // Antes o campo vazio virava "estorno no cartão" — e afirmar o meio errado
    // manda o cliente procurar o dinheiro onde ele não está.
    const { html } = emailDevolucaoConcluida({ ...base, reembolsoForma: null })
    expect(html).toContain('efetuado pelo mesmo meio usado no pagamento')
    expect(html).not.toContain('estorno no cartão')
    expect(html).not.toContain('por Pix')
  })
})
