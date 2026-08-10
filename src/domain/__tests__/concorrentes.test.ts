import { describe, expect, it } from 'vitest'

import { buscarNoCatalogo, casarTitulo, formasDeBusca, tokensDe } from '..'

/** Recorte real do catálogo, incluindo os pares que se confundem. */
const BASES = [
  { id: 'sauvage-edp', nome: 'Sauvage Masculino Eau de Parfum (Decant)', marca: 'Dior' },
  { id: 'sauvage-edt', nome: 'Sauvage Masculino Eau de Toilette (Decant)', marca: 'Dior' },
  { id: 'sauvage-elixir', nome: 'Sauvage Elixir Eau de Parfum (Decant)', marca: 'Dior' },
  { id: 'bleu-edp', nome: 'Bleu de Chanel Masculino Eau de Parfum (Decant)', marca: 'Chanel' },
  { id: 'bleu-edt', nome: 'Bleu de Chanel Masculino Eau de Toilette (Decant)', marca: 'Chanel' },
  { id: 'homme-intense', nome: 'Dior Homme Intense Masculino Eau de Parfum (Decant)', marca: 'Dior' },
  { id: 'coco-mad', nome: 'Coco Mademoiselle Feminino Eau de Parfum (Decant)', marca: 'Chanel' },
]

describe('casar título de concorrente com o catálogo', () => {
  it('ignora volume, acento e caixa ao tokenizar', () => {
    const t = tokensDe('Decant 5ml — Coco Mademoiselle Eau de Parfum')
    expect(t.has('coco')).toBe(true)
    expect(t.has('mademoiselle')).toBe(true)
    // Volume e palavra genérica não distinguem produto nenhum.
    expect(t.has('5')).toBe(false)
    expect(t.has('ml')).toBe(false)
    expect(t.has('decant')).toBe(false)
  })

  it('casa quando o título traz o nome inteiro', () => {
    const c = casarTitulo('Decant Coco Mademoiselle Chanel Feminino Eau de Parfum 5ml', BASES)
    expect(c?.baseId).toBe('coco-mad')
  })

  it('não casa Eau de Parfum com Eau de Toilette', () => {
    const edp = casarTitulo('Bleu de Chanel Masculino Eau de Parfum - Decant 10ml', BASES)
    expect(edp?.baseId).toBe('bleu-edp')
    const edt = casarTitulo('Bleu de Chanel Masculino Eau de Toilette - Decant 10ml', BASES)
    expect(edt?.baseId).toBe('bleu-edt')
  })

  it('recusa em vez de chutar quando o título é ambíguo', () => {
    // Sem dizer a concentração, "Sauvage Dior" serve a três bases nossas.
    // Casar com uma delas empurraria o preço de venda de um produto pelo
    // preço de outro — pior que não saber.
    expect(casarTitulo('Sauvage Dior Decant', BASES)).toBeNull()
  })

  it('recusa título curto demais ou de outro produto', () => {
    expect(casarTitulo('Estojo vazio 5ml', BASES)).toBeNull()
    expect(casarTitulo('', BASES)).toBeNull()
    expect(casarTitulo('Frete', BASES)).toBeNull()
  })

  it('não confunde Sauvage Elixir com Sauvage Eau de Parfum', () => {
    const c = casarTitulo('Sauvage Elixir Dior Eau de Parfum decant 5ml', BASES)
    expect(c?.baseId).toBe('sauvage-elixir')
  })
})

describe('achar o perfume do catálogo pelo que foi digitado', () => {
  it('acha mesmo com palavra nossa no meio', () => {
    // O caso real: a loja escreve "Bleu de Chanel Eau de Parfum", o nosso
    // catálogo escreve "Bleu de Chanel Masculino Eau de Parfum (Decant)".
    // Num `includes` de frase contígua, o "Masculino" no meio derrubava tudo
    // e o nosso preço não aparecia na comparação.
    const r = buscarNoCatalogo('Bleu de Chanel Eau de Parfum', BASES)
    expect(r[0].id).toBe('bleu-edp')
  })

  it('põe na frente quem tem menos palavra sobrando', () => {
    const r = buscarNoCatalogo('Sauvage Eau de Parfum', BASES)
    // "Sauvage Elixir Eau de Parfum" também atende, mas tem o Elixir sobrando.
    expect(r[0].id).toBe('sauvage-edp')
    expect(r.map((b) => b.id)).toContain('sauvage-elixir')
  })

  it('não devolve Eau de Toilette para quem pediu Eau de Parfum', () => {
    const r = buscarNoCatalogo('Bleu de Chanel Eau de Parfum', BASES)
    expect(r.map((b) => b.id)).not.toContain('bleu-edt')
  })

  it('ignora acento e caixa dos dois lados', () => {
    const bases = [{ id: 'idole', nome: 'Idôle Feminino Eau de Parfum (Decant)', marca: 'Lancôme' }]
    expect(buscarNoCatalogo('idole lancome', bases)[0].id).toBe('idole')
  })

  it('devolve vazio quando falta uma palavra, em vez de aproximar', () => {
    expect(buscarNoCatalogo('Bleu de Chanel Extrait', BASES)).toEqual([])
  })
})

describe('EDT é Eau de Toilette', () => {
  it('acha o mesmo perfume escrito das duas formas', () => {
    const porExtenso = buscarNoCatalogo('Bleu de Chanel Eau de Toilette', BASES)
    const emSigla = buscarNoCatalogo('Bleu de Chanel EDT', BASES)
    expect(porExtenso[0].id).toBe('bleu-edt')
    expect(emSigla[0].id).toBe('bleu-edt')
  })

  it('continua separando toilette de parfum', () => {
    // Juntar as formas não pode virar ignorar a concentração: são dois
    // produtos com preços diferentes.
    expect(buscarNoCatalogo('Bleu de Chanel EDP', BASES)[0].id).toBe('bleu-edp')
    expect(buscarNoCatalogo('Bleu de Chanel EDT', BASES).map((b) => b.id)).not.toContain('bleu-edp')
  })

  it('procura as duas formas no título do concorrente', () => {
    // A Tabs escreve "EDT"; a Eau de Leon, "Eau de Toilette". Uma busca só
    // tem de alcançar as duas.
    const grupos = formasDeBusca('Bleu de Chanel Eau de Toilette')
    const daConcentracao = grupos.find((g) => g.includes('edt'))
    expect(daConcentracao).toEqual(['edt', 'eau de toilette'])
    expect(grupos.map((g) => g[0])).toEqual(expect.arrayContaining(['bleu', 'chanel', 'edt']))
  })

  it('casa título de concorrente que abrevia com base que escreve por extenso', () => {
    const c = casarTitulo('(Decant) Chanel - Bleu de Chanel EDT 10ml', BASES)
    expect(c?.baseId).toBe('bleu-edt')
  })
})
