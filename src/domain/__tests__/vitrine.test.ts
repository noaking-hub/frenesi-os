import { describe, expect, it } from 'vitest'

import { ehPaginaDeProduto, nomeDaPagina, precosDeReferencia, variantesDoHtml } from '..'

describe('quais URLs do sitemap são produto', () => {
  it('recusa a vitrine, que é o que quebrou a primeira coleta', () => {
    // `/produtos/` entrava no filtro antigo. A listagem traz o card de cada
    // produto sem o tamanho, e foi assim que 2.639 preços foram lidos e
    // nenhum serviu.
    expect(ehPaginaDeProduto('https://tabsperfumes.com.br/produtos/')).toBe(false)
    expect(ehPaginaDeProduto('https://tabsperfumes.com.br/produtos')).toBe(false)
    expect(ehPaginaDeProduto('https://tabsperfumes.com.br/produtos/page/2')).toBe(false)
  })

  it('aceita a página de um produto', () => {
    expect(
      ehPaginaDeProduto('https://tabsperfumes.com.br/produtos/decant-lancome-idole-edp/'),
    ).toBe(true)
    expect(ehPaginaDeProduto('https://loja.com/products/bleu-de-chanel-5ml')).toBe(true)
  })

  it('ignora âncora e parâmetro ao decidir', () => {
    expect(ehPaginaDeProduto('https://loja.com/produtos/idole-edp/?variant=42#abas')).toBe(true)
    expect(ehPaginaDeProduto('https://loja.com/produtos/?page=3')).toBe(false)
  })
})

describe('variações do produto na Nuvemshop', () => {
  /** Formato do atributo, com as aspas escapadas como o HTML entrega. */
  const html = (json: string) => `<div data-variants="${json.replace(/"/g, '&quot;')}" ></div>`

  it('lê rótulo e preço de cada tamanho', () => {
    const v = variantesDoHtml(
      html(
        JSON.stringify([
          { id: 1, option0: '2ml - 25~30 Borrifadas', price: '34.90' },
          { id: 2, option0: '5ml - 70~75 Borrifadas', price: '69.90' },
          { id: 3, option0: '10ml - 140~150 Borrifadas', price: 119.9 },
        ]),
      ),
    )
    expect(v).toEqual([
      { rotulo: '2ml - 25~30 Borrifadas', preco: 34.9 },
      { rotulo: '5ml - 70~75 Borrifadas', preco: 69.9 },
      { rotulo: '10ml - 140~150 Borrifadas', preco: 119.9 },
    ])
  })

  it('aceita preço com vírgula e com símbolo', () => {
    const v = variantesDoHtml(html(JSON.stringify([{ name: '5ml', price: 'R$ 1.234,56' }])))
    expect(v[0].preco).toBeCloseTo(1234.56, 2)
  })

  it('descarta preço absurdo em vez de publicar um menor do mercado falso', () => {
    const v = variantesDoHtml(
      html(JSON.stringify([{ name: '5ml', price: 6990000 }, { name: '10ml', price: '119.90' }])),
    )
    expect(v).toEqual([{ rotulo: '10ml', preco: 119.9 }])
  })

  it('devolve vazio quando não há payload, em vez de inventar', () => {
    expect(variantesDoHtml('<html><body>sem nada</body></html>')).toEqual([])
    expect(variantesDoHtml('<div data-variants="{quebrado"></div>')).toEqual([])
  })
})

describe('de qual produto a página fala', () => {
  it('usa o og:title, não o primeiro Product do carrossel', () => {
    // A página traz os relacionados com JSON-LD próprio. Pegar o primeiro
    // gravava o preço da página com o nome do vizinho — foi assim que um
    // 5 ml de Coco Mademoiselle apareceu com preço de R$ 229,90.
    const html = `
      <head>
        <meta property="og:title" content="(Decant) Lancôme - Idôle Eau de Parfum (EDP)">
        <title>(Decant) Lancôme - Idôle | Tabs Perfumes</title>
      </head>
      <script type="application/ld+json">
        {"@type":"Product","name":"(Decant) Afnan - 9pm","offers":{"price":"59.66"}}
      </script>`
    expect(nomeDaPagina(html)).toBe('(Decant) Lancôme - Idôle Eau de Parfum (EDP)')
  })

  it('cai para o <title> e corta o nome da loja', () => {
    expect(nomeDaPagina('<title>(Decant) Armaf - Club de Nuit | Tabs Perfumes</title>')).toBe(
      '(Decant) Armaf - Club de Nuit',
    )
  })

  it('devolve nulo quando a página não se identifica', () => {
    expect(nomeDaPagina('<html><body>nada</body></html>')).toBeNull()
  })

  it('desescapa entidade no título', () => {
    expect(nomeDaPagina('<meta property="og:title" content="Chanel &amp; Co 5ml">')).toBe(
      'Chanel & Co 5ml',
    )
  })
})

describe('payload que não é JSON', () => {
  it('não quebra com o LS.product, que é objeto JS e não JSON', () => {
    // Chave sem aspas, string em aspas simples, escape   no meio: o
    // JSON.parse recusa isso. Devolver vazio deixa a leitura cair no
    // data-variants; estourar derrubaria a loja inteira.
    const html = `<script>
      LS.product = { id : 213068630,
        name : 'Good\\u0020Girl\\u0020Blush\\u0020Elixir',
        requires_shipping: true }
    </script>`
    expect(variantesDoHtml(html)).toEqual([])
  })

  it('prefere o data-variants quando a página publica os dois', () => {
    const html = `<script>LS.product = { id: 1, name: 'quebrado' }</script>
      <div data-variants="${JSON.stringify([{ name: '5ml', price: '69.90' }]).replace(/"/g, '&quot;')}"></div>`
    expect(variantesDoHtml(html)).toEqual([{ rotulo: '5ml', preco: 69.9 }])
  })
})

describe('delimitador do atributo', () => {
  const variantes = [
    { id: 1, option0: '5ml', price: '69.90' },
    { id: 2, option0: '10ml', price: '119.90' },
  ]

  it('lê atributo com aspa simples e JSON de aspa dupla dentro', () => {
    // É o formato de uma das lojas. A leitura antiga fechava a captura na
    // primeira aspa dupla do JSON e devolvia vazio — 400 páginas viravam
    // quatro preços.
    const html = `<div data-variants='${JSON.stringify(variantes)}'></div>`
    expect(variantesDoHtml(html)).toEqual([
      { rotulo: '5ml', preco: 69.9 },
      { rotulo: '10ml', preco: 119.9 },
    ])
  })

  it('lê atributo com aspa dupla e entidades dentro', () => {
    const html = `<div data-variants="${JSON.stringify(variantes).replace(/"/g, '&quot;')}"></div>`
    expect(variantesDoHtml(html)).toHaveLength(2)
  })

  it('não confunde o apóstrofo do nome com o fim do atributo', () => {
    const com = [{ option0: '5ml', price: '69.90', name: "L&#39;Homme" }]
    const html = `<div data-variants='${JSON.stringify(com)}'></div>`
    expect(variantesDoHtml(html)).toHaveLength(1)
  })
})

describe('a página traz o atributo mais de uma vez', () => {
  const bons = [
    { option0: '5ml', price: '69.90' },
    { option0: '10ml', price: '119.90' },
  ]

  it('ignora o template vazio que vem antes do produto', () => {
    // É o caso de uma das lojas: um atributo vazio aparece primeiro, e pegar
    // a primeira ocorrência devolvia nada para a página inteira.
    const html = `
      <div data-variants=""></div>
      <div data-variants='${JSON.stringify(bons)}'></div>`
    expect(variantesDoHtml(html)).toHaveLength(2)
  })

  it('fica com o payload do produto, não com o do card do carrossel', () => {
    const card = [{ option0: '3ml', price: '39.90' }]
    const html = `
      <article data-variants='${JSON.stringify(card)}'></article>
      <form data-variants='${JSON.stringify(bons)}'></form>`
    // O principal é o que rende mais variações.
    expect(variantesDoHtml(html).map((v) => v.rotulo)).toEqual(['5ml', '10ml'])
  })

  it('desescapa entidade numérica, decimal e hexadecimal', () => {
    const dec = JSON.stringify(bons).replace(/"/g, '&#34;')
    const hex = JSON.stringify(bons).replace(/"/g, '&#x22;')
    expect(variantesDoHtml(`<div data-variants="${dec}"></div>`)).toHaveLength(2)
    expect(variantesDoHtml(`<div data-variants="${hex}"></div>`)).toHaveLength(2)
  })
})

describe('validação do payload contra o JSON-LD do produto principal', () => {
  const ld = (nome: string, preco: string) =>
    `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: nome,
      offers: { price: preco },
    })}</script>`
  const attr = (variantes: unknown) =>
    `<div data-variants="${JSON.stringify(variantes).replace(/"/g, '&quot;')}"></div>`

  const doProduto = [
    { option0: '2ml', price: '34.90' },
    { option0: '5ml', price: '84.90' },
  ]
  const doWidget = [
    { option0: '5ml', price: '50.90' },
    { option0: '10ml', price: '99.90' },
    { option0: '15ml', price: '139.90' },
  ]

  it('rejeita o payload do widget mesmo quando ele tem mais variações', () => {
    // O caso real: um widget presente em TODA página da loja vencia por
    // quantidade, e 510 preços de outro produto entraram com o nome do
    // produto da página — Erba Pura 5 ml saiu por R$ 50,90 no lugar de
    // R$ 84,90.
    const html = `
      <meta property="og:title" content="Xerjoff - Erba Pura Eau de Parfum (decant)">
      ${ld('Xerjoff - Erba Pura Eau de Parfum (decant)', '34.90')}
      ${attr(doWidget)}
      ${attr(doProduto)}`
    expect(variantesDoHtml(html)).toEqual([
      { rotulo: '2ml', preco: 34.9 },
      { rotulo: '5ml', preco: 84.9 },
    ])
  })

  it('devolve vazio quando NENHUM payload compartilha preço com a referência', () => {
    // Melhor cair no JSON-LD do que gravar o preço de um widget.
    const html = `
      ${ld('Erba Pura', '84.90')}
      ${attr(doWidget)}`
    expect(variantesDoHtml(html)).toEqual([])
  })

  it('sem preço no JSON-LD, mantém o payload de mais variações', () => {
    expect(variantesDoHtml(attr(doWidget))).toHaveLength(3)
  })

  it('o promocional também valida: JSON-LD publica o preço em promoção', () => {
    const emPromocao = [{ option0: '5ml', price: '99.90', promotional_price: '84.90' }]
    const html = `${ld('Erba Pura', '84.90')}${attr(emPromocao)}`
    expect(variantesDoHtml(html)).toEqual([{ rotulo: '5ml', preco: 99.9 }])
  })

  it('a referência vem do Product cujo nome é o da página, não do carrossel', () => {
    const html = `
      <meta property="og:title" content="Erba Pura (decant)">
      ${ld('Coco Mademoiselle (decant)', '39.90')}
      ${ld('Erba Pura (decant)', '84.90')}`
    expect(precosDeReferencia(html)).toEqual([84.9])
  })

  it('lê lowPrice de AggregateOffer como referência', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Erba Pura',
      offers: { '@type': 'AggregateOffer', lowPrice: '34.90', highPrice: '139.90' },
    })}</script>`
    expect(precosDeReferencia(html)).toEqual([34.9, 139.9])
  })
})

describe('tema que esconde o produto da página do JSON-LD (só WebPage)', () => {
  // O caso real da Eau de Leon: o produto da página vira @type WebPage, e os
  // ÚNICOS Products do JSON-LD são os oito do carrossel. A validação por
  // preço elegia o "menos diferente" (o Asad, um terço das palavras) como
  // referência, validava o payload dele, e o Erba Pura saiu gravado com
  // "5ml R$50,90 · 10ml R$86,90" — tamanhos e preços de OUTRO perfume.
  const attr = (variantes: unknown) =>
    `<div data-variants="${JSON.stringify(variantes).replace(/"/g, '&quot;')}"></div>`
  const ldAsad = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'Product',
    name: 'Lattafa - Asad Eau de Parfum (decant)',
    offers: { price: '25.90' },
  })}</script>`
  const doProduto = [
    { product_id: 256, option0: '2ml', price: '84.90' },
    { product_id: 256, option0: '5ml', price: '205.90' },
  ]
  const doCarrossel = [
    { product_id: 999, option0: '2ml', price: '25.90' },
    { product_id: 999, option0: '5ml', price: '50.90' },
    { product_id: 999, option0: '10ml', price: '86.90' },
  ]
  const ls = `<script>LS.product = { id : 256, name : 'Erba Pura' }</script>`

  it('o payload certo vem pelo id da página, mesmo com o carrossel maior', () => {
    const html = `
      <meta property="og:title" content="Xerjoff - Erba Pura Eau de Parfum (decant)">
      ${ls}
      ${ldAsad}
      ${attr(doCarrossel)}
      ${attr(doProduto)}`
    expect(variantesDoHtml(html)).toEqual([
      { rotulo: '2ml', preco: 84.9 },
      { rotulo: '5ml', preco: 205.9 },
    ])
  })

  it('id declarado e nenhum payload da página: vazio, não o vizinho', () => {
    const html = `<script>LS.product = { id : 111 }</script>${attr(doCarrossel)}`
    expect(variantesDoHtml(html)).toEqual([])
  })

  it('carrossel não vira referência: nome que não condiz devolve vazio', () => {
    const ldAventus = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Creed - Aventus Eau de Parfum (decant)',
      offers: { price: '109.90' },
    })}</script>`
    const html = `
      <meta property="og:title" content="Xerjoff - Erba Pura Eau de Parfum (decant)">
      ${ldAsad}
      ${ldAventus}`
    expect(precosDeReferencia(html)).toEqual([])
  })
})
