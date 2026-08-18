import { describe, expect, it } from 'vitest'

import {
  CONCORRENTES,
  extrairCartoes,
  filtrarERanquear,
  mlDoTitulo,
  precoDoTexto,
  precoPorMl,
  primeiraPalavra,
  urlDeBusca,
} from '../pesquisa-de-mercado'

describe('pesquisa de mercado', () => {
  it('as seis lojas estão na lista, com a Eau de Léon incluída', () => {
    expect(CONCORRENTES).toHaveLength(6)
    expect(CONCORRENTES.map((c) => c.chave)).toContain('eaudeleon')
  })

  it('busca pela primeira palavra, como o price-lab fazia', () => {
    expect(primeiraPalavra('Invictus Victory Elixir')).toBe('Invictus')
    expect(urlDeBusca(CONCORRENTES[0], 'Invictus')).toBe(
      'https://tabsperfumes.com.br/search?q=Invictus',
    )
  })

  it('lê preço brasileiro com e sem milhar', () => {
    expect(precoDoTexto('R$ 24,90')).toBe(24.9)
    expect(precoDoTexto('R$ 1.234,56')).toBe(1234.56)
    expect(precoDoTexto('grátis')).toBeNull()
  })

  it('extrai cartões de âncoras /products/ com preço e imagem', () => {
    // O respiro entre os cards reproduz páginas reais: o contexto de preço de
    // um card não pode alcançar o do vizinho.
    const respiro = `<div class="meta">${'<span></span>'.repeat(140)}</div>`
    const html = `
      <div class="product-item">
        <a href="/products/decant-invictus-5ml">
          <img src="//cdn.loja.com/invictus.jpg" />
          Decant Invictus 5ml
        </a>
        <span class="price">R$ 34,90</span>
      </div>
      ${respiro}
      <div class="product-item">
        <a href="/products/decant-one-million-5ml">One Million 5ml</a>
        <span>3x de R$ 12,00</span><span>R$ 32,90</span>
      </div>`
    const cartoes = extrairCartoes(html, 'https://loja.com.br')
    expect(cartoes).toHaveLength(2)
    expect(cartoes[0].url).toBe('https://loja.com.br/products/decant-invictus-5ml')
    expect(cartoes[0].preco).toBe(34.9)
    expect(cartoes[0].imagem).toBe('https://cdn.loja.com/invictus.jpg')
    // O preço cheio vence o da parcela que aparece antes.
    expect(cartoes[1].preco).toBe(32.9)
  })

  it('deduplica a âncora da imagem e a do título do mesmo produto', () => {
    const html = `
      <a href="/products/x"><img src="/x.jpg"/></a>
      <a href="/products/x">Perfume X</a>`
    expect(extrairCartoes(html, 'https://loja.com')).toHaveLength(1)
  })

  it('filtra pelo termo, derruba cards genéricos e põe decant na frente', () => {
    const cartoes = [
      { titulo: 'Ver outros produtos', url: 'https://l/products/ver', preco: null, imagem: null },
      { titulo: 'Invictus Victory 100ml lacrado', url: 'https://l/products/a', preco: 599, imagem: null },
      { titulo: 'Decant Invictus 5ml', url: 'https://l/products/b', preco: 29.9, imagem: null },
      { titulo: 'Sauvage 10ml', url: 'https://l/products/c', preco: 49.9, imagem: null },
    ]
    const r = filtrarERanquear(cartoes, 'Invictus')
    expect(r.map((c) => c.titulo)).toEqual([
      'Decant Invictus 5ml',
      'Invictus Victory 100ml lacrado',
    ])
  })

  it('acha o termo também na URL, com acento normalizado', () => {
    const cartoes = [
      { titulo: 'Decant 5ml', url: 'https://l/products/hypnotic-poison', preco: 39.9, imagem: null },
    ]
    expect(filtrarERanquear(cartoes, 'Hypnôtic')).toHaveLength(1)
  })

  it('calcula o R$/ml quando o título anuncia o volume', () => {
    expect(mlDoTitulo('Decant Invictus 5ml')).toBe(5)
    expect(mlDoTitulo('Invictus 100 ml')).toBe(100)
    expect(mlDoTitulo('Invictus lacrado')).toBeNull()
    expect(precoPorMl({ titulo: 'Decant 5ml', url: '', preco: 34.9, imagem: null })).toBe(6.98)
    expect(precoPorMl({ titulo: 'sem volume', url: '', preco: 34.9, imagem: null })).toBeNull()
  })
})
