import { describe, expect, it } from 'vitest'

import { ehPaginaDeProduto, variantesDoHtml } from '..'

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
