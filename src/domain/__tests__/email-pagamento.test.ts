import { describe, expect, it } from 'vitest'

import { emailPagamento } from '../notificacoes'

/**
 * O primeiro e-mail que o cliente recebe da marca.
 *
 * Os testes daqui não conferem beleza — conferem que nenhum buraco do template
 * chega à caixa de entrada. Placeholder não substituído é o defeito clássico
 * deste arquivo: sai literalmente "{total}" no lugar do valor, e quem recebe
 * conclui que o e-mail é falso.
 */
describe('e-mail de pagamento confirmado', () => {
  const base = { nome: 'Icaro Moreno', pedido: 'YP-1234', total: 216 }

  it('não deixa nenhum placeholder por preencher, exceto o do site', () => {
    // `{site}` sobrevive de propósito: quem o resolve é `entregar()`, uma vez
    // só, para os cinco remetentes. Centralizar foi o conserto de um bug em
    // que três dos cinco resolviam e dois não — e o sintoma só apareceu no dia
    // em que a logomarca passou a usar esse endereço, sumindo em alguns
    // e-mails e não em outros.
    const { html } = emailPagamento(base)
    const soltos = [...new Set(html.match(/\{[a-z_]+\}/g) ?? [])].filter((p) => p !== '{site}')
    expect(soltos).toEqual([])
  })

  it('trata o cliente pelo primeiro nome, não pelo nome inteiro', () => {
    // "Icaro Moreno, recebemos seu pagamento" soa como cobrança de banco.
    const { html } = emailPagamento(base)
    expect(html).toContain('Icaro, recebemos seu pagamento')
    expect(html).not.toContain('Icaro Moreno,')
  })

  it('põe o valor pago em destaque, no mesmo tratamento dos cupons', () => {
    const { html } = emailPagamento(base)
    expect(html).toContain('R$ 216,00')
    // O bloco de destaque: fundo escuro com borda dourada, 31px.
    expect(html).toMatch(/font-size:31px[^>]*R\$ 216,00|R\$ 216,00/)
  })



  it('escapa o que veio do cliente', () => {
    // Nome com < ou & viraria HTML quebrado — ou pior, injeção no corpo.
    // Só o PRIMEIRO nome vai para o e-mail, então o caractere perigoso
    // precisa estar nele para o teste valer alguma coisa.
    const { html } = emailPagamento({ ...base, nome: '<b>Ana</b> & Cia' })
    expect(html).toContain('&lt;b&gt;Ana&lt;/b&gt;')
    expect(html).not.toContain('<b>Ana</b>')
  })

  it('sem nome, cumprimenta sem inventar um', () => {
    const { html } = emailPagamento({ ...base, nome: null })
    expect(html).toContain('Olá, recebemos seu pagamento')
  })

  it('leva o número do pedido no assunto e no corpo', () => {
    const { assunto, html } = emailPagamento(base)
    expect(assunto).toBe('Pagamento confirmado · pedido YP-1234')
    expect(html).toContain('YP-1234')
  })

  it('promete o prazo de postagem — é o que evita a dúvida dos dias seguintes', () => {
    const { html } = emailPagamento(base)
    expect(html).toContain('3 dias')
    expect(html).toContain('rastreio')
  })

  it('manda o botão para a área do cliente, não para a vitrine', () => {
    // O botão dizia "acompanhar meu pedido" e caía na home da loja: quem
    // acabou de pagar perguntou "e o meu pedido?" e recebia "veja nossos
    // produtos". O destino certo é onde ele vê as compras dele.
    const { html } = emailPagamento(base)
    expect(html).toContain('href="https://conta.frenesiperfumes.com.br"')
    expect(html).not.toContain('href="https://frenesiperfumes.com.br"')
  })

  it('mantém o fundo claro da nova identidade', () => {
    // A troca para fundo claro já foi desfeita uma vez por um teste esquecido.
    const { html } = emailPagamento(base)
    expect(html).toContain('background-color:#EDE6DA')
  })
})

describe('resumo da compra na confirmação', () => {
  const itens = [
    { descricao: '1 Million Masculino (Decant) 3ml', quantidade: 2, preco: 27, imagem: 'https://cdn/x.png' },
    { descricao: 'Prada Paradoxe (Decant) 3ml', quantidade: 1, preco: 52, imagem: null },
  ]
  const base = { nome: 'Ana', pedido: 'YP-9', itens, frete: 18.9 }

  it('a conta fecha: subtotal − desconto + frete = total', () => {
    // Em 520 dos 640 pedidos pagos a soma dos itens não bate com o total,
    // porque o desconto do checkout não é gravado. Ele é DEDUZIDO aqui — e é
    // o que permite mostrar preço por item sem entregar ao cliente um
    // comprovante que erra a própria conta.
    const { html } = emailPagamento({ ...base, total: 88.9 })
    expect(html).toContain('R$ 106,00') // subtotal: 2×27 + 52
    expect(html).toContain('&minus; R$ 36,00') // desconto deduzido
    expect(html).toContain('R$ 18,90') // frete
    expect(html).toContain('R$ 88,90') // total
  })

  it('sem desconto, a linha não aparece', () => {
    const { html } = emailPagamento({ ...base, total: 124.9 })
    expect(html).not.toContain('Desconto')
  })

  it('frete zero vira "grátis", e não some', () => {
    // Frete grátis é argumento de venda; esconder joga fora um ponto ganho.
    const { html } = emailPagamento({ ...base, frete: 0, total: 106 })
    expect(html).toContain('gr&aacute;tis')
  })

  it('item sem imagem não deixa <img> quebrada', () => {
    const { html } = emailPagamento({ ...base, total: 124.9 })
    expect(html).toContain('src="https://cdn/x.png"')
    expect(html).not.toContain('src=""')
    expect(html).not.toContain('src="null"')
  })

  it('sem itens, volta ao quadro antigo com o número do pedido', () => {
    const { html } = emailPagamento({ nome: 'Ana', pedido: 'YP-9', total: 50 })
    expect(html).toContain('PAGAMENTO APROVADO')
    expect(html).toContain('Pedido YP-9')
  })

  it('o cashback só aparece quando foi lido', () => {
    const sem = emailPagamento({ ...base, total: 124.9 }).html
    expect(sem).not.toContain('VOC&Ecirc; GANHOU DE VOLTA')

    const com = emailPagamento({
      ...base,
      total: 124.9,
      cashback: { valor: 12.49, validade: '16/10/2026' },
    }).html
    expect(com).toContain('VOC&Ecirc; GANHOU DE VOLTA')
    expect(com).toContain('R$ 12,49')
    expect(com).toContain('16/10/2026')
  })
})
