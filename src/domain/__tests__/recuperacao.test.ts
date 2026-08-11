import { describe, expect, it } from 'vitest'

import { emailRecuperacao } from '..'

describe('e-mail de recuperação de carrinho', () => {
  const base = {
    nome: 'Marina Fontes',
    itens: ['1× Baccarat Rouge 540 · 5 ml', '2× Sauvage Elixir · 10 ml'],
    valor: 249.7,
    linkCheckout: 'https://loja.com/carrinho/abc',
  }

  it('chama pelo primeiro nome e lista os itens do carrinho', () => {
    const { assunto, html } = emailRecuperacao(base)
    expect(assunto).toContain('Marina')
    expect(html).toContain('Baccarat Rouge 540')
    expect(html).toContain('Sauvage Elixir')
    expect(html).toContain('249,70')
  })

  it('sem nome, a saudação é neutra em vez de "null,"', () => {
    const { assunto, html } = emailRecuperacao({ ...base, nome: null })
    expect(assunto).not.toContain('null')
    expect(html).not.toContain('null')
  })

  it('o cupom só aparece quando existe', () => {
    const sem = emailRecuperacao(base)
    expect(sem.html).not.toContain('desconto para fechar')
    const com = emailRecuperacao({ ...base, cupom: { codigo: 'VOLTA10', pct: 10 } })
    expect(com.html).toContain('VOLTA10')
    expect(com.html).toContain('10% de desconto')
  })

  it('sem link de checkout não sai botão quebrado', () => {
    const { html } = emailRecuperacao({ ...base, linkCheckout: null })
    expect(html).not.toContain('Concluir meu pedido')
  })

  it('escapa HTML vindo do título do produto', () => {
    const { html } = emailRecuperacao({ ...base, itens: ['1× <script>alert(1)</script>'] })
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;')
  })

  it('usa o modelo editado, com {nome} e {total} preenchidos', () => {
    const modelo = {
      assunto: 'Volta aqui, {nome}!',
      titulo: '{nome}, faltou só o fim.',
      mensagem: 'Seu carrinho de {total} está guardado.\n\nQualquer dúvida, responde este e-mail.',
      textoBotao: 'Voltar ao carrinho',
    }
    const { assunto, html } = emailRecuperacao(base, modelo)
    expect(assunto).toBe('Volta aqui, Marina!')
    expect(html).toContain('Marina, faltou só o fim.')
    expect(html).toContain('249,70 está guardado.')
    expect(html).toContain('Qualquer dúvida, responde este e-mail.')
    expect(html).toContain('Voltar ao carrinho')
  })

  it('sem nome, o {nome} do modelo some sem deixar vírgula órfã', () => {
    const modelo = {
      assunto: '{nome}, seu carrinho espera',
      titulo: '{nome}, ficou pronto.',
      mensagem: 'Tudo separado.',
      textoBotao: 'Concluir',
    }
    const { assunto, html } = emailRecuperacao({ ...base, nome: null }, modelo)
    expect(assunto).toBe('Seu carrinho espera')
    expect(html).toContain('Ficou pronto.')
  })
})
