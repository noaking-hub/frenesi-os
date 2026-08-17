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
  const base = { nome: 'Icaro Moreno', pedido: 'YP-1234', total: 'R$ 216,00', pagamento: 'Pix' }

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

  it('nomeia o meio de pagamento quando sabe qual foi', () => {
    const { html } = emailPagamento(base)
    expect(html).toContain('Pago em Pix')
  })

  it('some com a frase do meio quando não sabe, em vez de exibir vazio', () => {
    // "Pago em —" parece defeito; a ausência da frase não parece nada.
    const { html } = emailPagamento({ ...base, pagamento: null })
    expect(html).not.toContain('Pago em')
    expect(html).toContain('Pagamento aprovado')
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

  it('mantém o fundo claro da nova identidade', () => {
    // A troca para fundo claro já foi desfeita uma vez por um teste esquecido.
    const { html } = emailPagamento(base)
    expect(html).toContain('background-color:#EDE6DA')
  })
})
