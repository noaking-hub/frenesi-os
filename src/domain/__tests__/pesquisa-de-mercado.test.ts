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

  it('com mais de uma palavra, o refino manda: "Polo Black" não é a família Polo', () => {
    const cartoes = [
      { titulo: 'Polo Blue Decant 5ml', url: 'https://l/products/a', preco: 30, imagem: null },
      { titulo: 'Polo Black Decant 5ml', url: 'https://l/products/b', preco: 28, imagem: null },
      { titulo: 'Polo Sport Decant 5ml', url: 'https://l/products/c', preco: 27, imagem: null },
      { titulo: 'Polo Black Decant 10ml', url: 'https://l/products/d', preco: 52, imagem: null },
    ]
    const r = filtrarERanquear(cartoes, 'Polo Black')
    expect(r.map((c) => c.titulo)).toEqual(['Polo Black Decant 5ml', 'Polo Black Decant 10ml'])
    // Sem nenhum cartão com todas as palavras, vale o recorte da primeira.
    expect(filtrarERanquear(cartoes, 'Polo Inexistente')).toHaveLength(4)
  })

  it('âncora sem nome ("ver produto") não vira cartão', () => {
    const cartoes = [
      { titulo: 'ver produto', url: 'https://l/products/polo-black', preco: 58, imagem: null },
      { titulo: '', url: 'https://l/products/polo-blue', preco: 58, imagem: null },
    ]
    expect(filtrarERanquear(cartoes, 'Polo')).toHaveLength(0)
  })

  it('parcela não é preço: "10x de R$ 27,30" perde para o R$ 273,00 cheio', () => {
    const html = `
      <a href="/products/vibrato-decant" class="product-link" title="Vibrato Decant 10ml">
        <img data-src="//cdn.l.com/v.jpg" />
      </a>
      <span class="price">R$ 273,00</span>
      <span class="installments">10x de R$ 27,30 sem juros</span>`
    const [c] = extrairCartoes(html, 'https://loja.com')
    expect(c.preco).toBe(273)
  })

  it('preço com tag entre o R$ e o número, como The Gregs escreve', () => {
    const html = `
      <a href="/products/vibrato-100" class="product-item" title="SOSPIRO VIBRATO EDP - UNISSEX 100ML">
      </a>
      <span class="money">R$</span><span>1.099,90</span>`
    const [c] = extrairCartoes(html, 'https://loja.com')
    expect(c.preco).toBe(1099.9)
  })

  it('o card termina onde começa o vizinho: preço de um não vaza para o outro', () => {
    const html = `
      <a href="/products/caro" class="product" title="Perfume Caro 100ml"></a>
      <span>R$ 899,00</span>
      <a href="/products/barato" class="product" title="Decant Barato 5ml"></a>
      <span>R$ 29,90</span>`
    const cartoes = extrairCartoes(html, 'https://loja.com')
    expect(cartoes.find((c) => c.titulo.includes('Caro'))?.preco).toBe(899)
    expect(cartoes.find((c) => c.titulo.includes('Barato'))?.preco).toBe(29.9)
  })

  it('extração Nuvemshop: título no atributo, imagem no data-src do lazy-load', () => {
    const html = `
      <a href="/products/polo-black-5ml" class="item-link product-link" title="Polo Black Decant 5ml">
        <img src="data:image/gif;base64,x" data-src="//cdn.loja.com/polo-black.jpg" />
        ver produto
      </a>
      <span class="preco">R$&nbsp;34,90</span>`
    const cartoes = extrairCartoes(html, 'https://loja.com.br')
    expect(cartoes).toHaveLength(1)
    expect(cartoes[0].titulo).toBe('Polo Black Decant 5ml')
    expect(cartoes[0].imagem).toBe('https://cdn.loja.com/polo-black.jpg')
    expect(cartoes[0].preco).toBe(34.9)
  })

  it('Nuvemshop com preço longe da âncora: o data-product-price em centavos vence', () => {
    // A The Gregs e a Eau de Léon escrevem o preço a ~8 mil caracteres da
    // âncora (srcset gigante no meio) — o corte curto deixava o card sem
    // valor. E o span riscado "de R$ 2.899,00" não pode vencer o atual.
    const respiro = '<span class="x"></span>'.repeat(300)
    const html = `
      <a href="https://thegregsexclusive.com/produtos/sospiro-vibrato-edp-unissex-100ml/" title="SOSPIRO VIBRATO EDP - UNISSEX 100ML" class="js-product-item-image-link-private">
        <img src="//acdn-us.mitiendanube.com/products/vibrato-480-0.webp" />
      </a>
      ${respiro}
      <div class="item-price-container">
        <span class="js-price-display item-price font-weight-bold" data-product-price="275405">R$2.754,05</span>
        <span class="js-compare-price-display price-compare">R$2.899,00</span>
      </div>`
    const [c] = extrairCartoes(html, 'https://thegregsexclusive.com')
    expect(c.titulo).toBe('SOSPIRO VIBRATO EDP - UNISSEX 100ML')
    expect(c.preco).toBe(2754.05)
  })

  it('Eau de Léon: o "R$0,00" escondido do compare não engole o preço real', () => {
    const respiro = '<div class="y"></div>'.repeat(300)
    const html = `
      <a href="https://eaudeleon.com.br/produtos/sospiro-vibrato-eau-de-parfum-decant/" title="Sospiro - Vibrato Eau de Parfum (decant)" class="js-product-item-image-link-private">
        <img src="//acdn-us.mitiendanube.com/products/sospiro-vibrato-480-0.webp" />
      </a>
      ${respiro}
      <span class="js-price-display price-compare" style="display:none;">R$0,00</span>
      <span class="js-price-display item-price" data-product-price="8190">R$81,90</span>`
    const [c] = extrairCartoes(html, 'https://eaudeleon.com.br')
    expect(c.preco).toBe(81.9)
  })

  it('Gabi: span de preço vazio, o valor vem do JSON googleItems pelo id do produto', () => {
    // Na Gabi o servidor manda <span class="js-price-display"></span> VAZIO —
    // é o JavaScript da loja que preenche. O único preço da página está no
    // JSON de Analytics dentro de um <script>, casado pelo data-product.
    const html = `
      <a href="https://www.gabiperfumes.com.br/produtos/vibrato-eau-de-parfum-sospiro-decant-17iqo/" title="Vibrato Eau de Parfum – Sospiro (Decant)" class="js-product-item-image-link-private">
        <img src="data:image/gif;base64,x" data-srcset="//cdn.gabi.com/v-240-0.webp 240w, //cdn.gabi.com/v-1024-1024.webp 1024w" />
      </a>
      <span class="js-price-display h4 font-large"></span>
      <div class="botao-sacola js-open-variants" data-product="326651321"></div>
      <script>
        const googleItems = [{"info":{"item_id":"1460026519","item_brand":"Sospiro","item_name":"Vibrato Eau de Parfum – Sospiro (Decant) (2 ml)","item_variant":"2 ml","price":75,"item_category":"DECANTS"},"source":{"product_id":"326651321","variant_id":"1460026519"}}];
      </script>`
    const [c] = extrairCartoes(html, 'https://gabiperfumes.com.br')
    expect(c.titulo).toBe('Vibrato Eau de Parfum – Sospiro (Decant)')
    expect(c.preco).toBe(75)
    expect(c.imagem).toBe('https://cdn.gabi.com/v-1024-1024.webp')
  })

  it('sem id no card, o título como prefixo do item_name ainda resgata o preço', () => {
    const html = `
      <a href="/produtos/vibrato-decant/" title="Vibrato Eau de Parfum – Sospiro (Decant)" class="js-product-item-link"></a>
      <span class="js-price-display"></span>
      <script>
        var googleItems = [{"info":{"item_name":"Vibrato Eau de Parfum – Sospiro (Decant) (5 ml)","price":150},"source":{"product_id":"1"}},{"info":{"item_name":"Vibrato Eau de Parfum – Sospiro (Decant) (2 ml)","price":75},"source":{"product_id":"1"}}];
      </script>`
    const [c] = extrairCartoes(html, 'https://loja.com')
    expect(c.preco).toBe(75)
  })

  it('calcula o R$/ml quando o título anuncia o volume', () => {
    expect(mlDoTitulo('Decant Invictus 5ml')).toBe(5)
    expect(mlDoTitulo('Invictus 100 ml')).toBe(100)
    expect(mlDoTitulo('Invictus lacrado')).toBeNull()
    expect(precoPorMl({ titulo: 'Decant 5ml', url: '', preco: 34.9, imagem: null })).toBe(6.98)
    expect(precoPorMl({ titulo: 'sem volume', url: '', preco: 34.9, imagem: null })).toBeNull()
  })
})
