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

describe('modo HTML do zero', () => {
  const base = {
    nome: 'Marina Fontes',
    itens: ['1× Erba Pura · 5 ml'],
    valor: 84.9,
    linkCheckout: 'https://loja.com/carrinho/abc',
  }
  const modelo = {
    assunto: 'Oi {nome}',
    titulo: '',
    mensagem: '',
    textoBotao: '',
    html: `<html><body>
      <h1>Oi {nome}, faltou {total}</h1>
      {itens}
      [[cupom]]<p>Use {cupom} e ganhe {desconto}%</p>[[/cupom]]
      <a href="{link}">Fechar pedido</a>
    </body></html>`,
  }

  it('o documento é o da operação, com itens, nome, total e link no lugar', () => {
    const { assunto, html } = emailRecuperacao({ ...base, cupom: null }, modelo)
    expect(assunto).toBe('Oi Marina')
    expect(html).toContain('Oi Marina, faltou R$')
    expect(html).toContain('Erba Pura')
    expect(html).toContain('href="https://loja.com/carrinho/abc"')
    // A moldura padrão NÃO aparece: o HTML é só o escrito.
    expect(html).not.toContain('decants de perfumaria')
  })

  it('o bloco [[cupom]] some inteiro sem cupom e abre com cupom', () => {
    const sem = emailRecuperacao({ ...base, cupom: null }, modelo)
    expect(sem.html).not.toContain('Use ')
    expect(sem.html).not.toContain('[[cupom]]')
    const com = emailRecuperacao({ ...base, cupom: { codigo: 'VOLTA10-ABC234', pct: 10 } }, modelo)
    expect(com.html).toContain('Use VOLTA10-ABC234 e ganhe 10%')
    expect(com.html).not.toContain('[[cupom]]')
  })

  it('escapa o título do produto também no HTML próprio', () => {
    const { html } = emailRecuperacao(
      { ...base, itens: ['<img src=x onerror=alert(1)>'], cupom: null },
      modelo,
    )
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
  })
})
