import { describe, expect, it } from 'vitest'

import { aplicarSite, emailRecuperacao, imagemDoCatalogoParaItem, metricasDeRecuperacao } from '..'

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

  it('a linha do item traz a foto quando o carrinho informa, e herda o estilo do template', () => {
    const { html } = emailRecuperacao(
      {
        ...base,
        itens: ['1× Erba Pura · 5 ml', '1× Eros · 10 ml'],
        imagens: ['https://cdn.loja.com/erba.png', null],
        cupom: null,
      },
      modelo,
    )
    expect(html).toContain('src="https://cdn.loja.com/erba.png"')
    // Só uma foto: o segundo item veio sem imagem e não pode sair <img> vazio.
    expect(html.match(/<img /g)?.length).toBe(1)
    // A lista herda cor e fonte do documento — cores fixas claras foi o que
    // deixou o bloco ilegível no template escuro.
    expect(html).toContain('color:inherit')
    // O total é do template ({total}), não da tabela de itens.
    expect(html.split('84,90').length - 1).toBe(1)
  })
})

describe('aplicarSite', () => {
  it('troca {site} pela URL sem barra final', () => {
    expect(aplicarSite('<img src="{site}/marca/icon-whatsapp.png">', 'https://erp.com/')).toBe(
      '<img src="https://erp.com/marca/icon-whatsapp.png">',
    )
  })

  it('sem URL conhecida, o caminho fica relativo em vez de literal', () => {
    expect(aplicarSite('{site}/marca/x.png', null)).toBe('/marca/x.png')
  })
})

describe('imagem do catálogo para o item do carrinho', () => {
  const catalogo = [
    { nome: 'La Vie Est Belle Feminino Eau de Parfum (Decant)', imagem: 'https://cdn/lvb.jpg' },
    { nome: 'La Vie Est Belle Iris Absolu Feminino Eau de Parfum (Decant)', imagem: 'https://cdn/iris.jpg' },
    { nome: 'Miss Dior Feminino Eau de Parfum (Decant)', imagem: 'https://cdn/miss.jpg' },
  ]

  it('casa pelo prefixo do nome, ignorando o volume no fim', () => {
    expect(
      imagemDoCatalogoParaItem('La Vie Est Belle Feminino Eau de Parfum (Decant) 3ml', catalogo),
    ).toBe('https://cdn/lvb.jpg')
  })

  it('o nome mais longo vence: a variação não cai na base', () => {
    expect(
      imagemDoCatalogoParaItem(
        'La Vie Est Belle Iris Absolu Feminino Eau de Parfum (Decant) 5ml',
        catalogo,
      ),
    ).toBe('https://cdn/iris.jpg')
  })

  it('ignora o prefixo de quantidade "2× " e acentos', () => {
    expect(
      imagemDoCatalogoParaItem('2× Miss Dior Feminino Eau de Parfum (Decant) 3ml', catalogo),
    ).toBe('https://cdn/miss.jpg')
  })

  it('sem casamento, sem invenção', () => {
    expect(imagemDoCatalogoParaItem('Produto que não temos 5ml', catalogo)).toBeNull()
  })
})

describe('métricas da recuperação', () => {
  const AGORA = Date.UTC(2026, 7, 18, 12) // ter 18/08/2026 12:00 UTC
  const diasAtras = (n: number) => new Date(AGORA - n * 86_400_000).toISOString()
  const envio = (
    carrinhoId: string,
    email: string,
    dias: number,
    cupom: string | null = null,
  ) => ({ carrinhoId, email, enviadoEm: diasAtras(dias), cupom })
  const pedido = (email: string, dias: number, valor = 100) => ({
    email,
    compradoEm: diasAtras(dias),
    valor,
  })

  it('sem envios devolve tudo zerado e sem semanas', () => {
    const m = metricasDeRecuperacao([], [pedido('a@b.c', 1)], AGORA)
    expect(m.enviados).toBe(0)
    expect(m.recuperados).toBe(0)
    expect(m.semanas).toEqual([])
  })

  it('atribui a conversão ao ÚLTIMO toque antes do pedido', () => {
    const m = metricasDeRecuperacao(
      [envio('c1', 'ana@ex.com', 10), envio('c1', 'ana@ex.com', 3)],
      [pedido('Ana@Ex.com ', 2, 180)],
      AGORA,
    )
    expect(m.enviados).toBe(2)
    expect(m.contatados).toBe(1)
    expect(m.recuperados).toBe(1)
    expect(m.receita).toBe(180)
    expect(m.porToque).toEqual([
      { toque: 1, enviados: 1, conversoes: 0 },
      { toque: 2, enviados: 1, conversoes: 1 },
    ])
  })

  it('pedido fora da janela de 7 dias não conta', () => {
    const m = metricasDeRecuperacao(
      [envio('c1', 'ana@ex.com', 10)],
      [pedido('ana@ex.com', 1)],
      AGORA,
    )
    expect(m.recuperados).toBe(0)
    expect(m.receita).toBe(0)
    expect(m.porToque).toEqual([{ toque: 1, enviados: 1, conversoes: 0 }])
  })

  it('separa carrinhos com e sem cupom nos baldes certos', () => {
    const m = metricasDeRecuperacao(
      [
        envio('c1', 'ana@ex.com', 5, 'VOLTA10'),
        envio('c2', 'bia@ex.com', 5),
        envio('c3', 'clara@ex.com', 5, 'VOLTA10'),
      ],
      [pedido('ana@ex.com', 3)],
      AGORA,
    )
    expect(m.cupom.com).toEqual({ contatados: 2, recuperados: 1 })
    expect(m.cupom.sem).toEqual({ contatados: 1, recuperados: 0 })
  })

  it('gráfico tem SEMPRE 8 semanas, com as vazias zeradas', () => {
    const m = metricasDeRecuperacao(
      [envio('c1', 'ana@ex.com', 1)],
      [pedido('ana@ex.com', 0, 90)],
      AGORA,
    )
    expect(m.semanas).toHaveLength(8)
    expect(m.semanas[0]).toEqual({ inicio: '2026-06-29', enviados: 0, conversoes: 0 })
    expect(m.semanas[7]).toEqual({ inicio: '2026-08-17', enviados: 1, conversoes: 1 })
  })

  it('carrinho contatado só antes dos 30 dias fica fora dos cards mas entra no gráfico', () => {
    const m = metricasDeRecuperacao([envio('c1', 'ana@ex.com', 40)], [], AGORA)
    expect(m.contatados).toBe(0)
    expect(m.enviados).toBe(0)
    expect(m.semanas.reduce((a, s) => a + s.enviados, 0)).toBe(1)
  })
})
