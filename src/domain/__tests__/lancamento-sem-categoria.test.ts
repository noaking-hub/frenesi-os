import { describe, expect, it } from 'vitest'

import { iconeDaCategoria } from '@/components/erp/Marcas'
import { SEM_CATEGORIA } from '@/domain'

/**
 * O lançamento sem categoria derrubou a tela de Lançamentos inteira.
 *
 * A coluna `categoria` aceita nulo no banco — todo crédito que vem do extrato
 * entra assim, esperando alguém classificar. A interface do TypeScript dizia
 * `string`, então o compilador não viu nada de errado em `nome.toLowerCase()`,
 * e a página respondeu 500 no primeiro dia em que um crédito a classificar
 * apareceu. Nenhum teste cobria o caminho porque nenhum teste passava nulo.
 *
 * O erro não estava no ícone: estava num tipo que mentia sobre o banco. Esses
 * testes prendem o comportamento na ponta que quebrou.
 */
describe('lançamento sem categoria', () => {
  it('o ícone aceita nulo em vez de estourar', () => {
    expect(() => iconeDaCategoria(null)).not.toThrow()
    expect(iconeDaCategoria(null)).toBe('etiqueta')
    expect(iconeDaCategoria(undefined)).toBe('etiqueta')
    expect(iconeDaCategoria('')).toBe('etiqueta')
  })

  it('categoria conhecida continua achando o próprio ícone', () => {
    expect(iconeDaCategoria('Taxas de pagamento')).toBe('porcento')
    expect(iconeDaCategoria('Meta ADS - Tráfego Pago')).toBe('megafone')
    expect(iconeDaCategoria('Transferências')).toBe('transferir')
  })

  it('o rótulo do grupo sem categoria é um só', () => {
    // Três telas agrupam por categoria. Se cada uma escrevesse o próprio
    // texto, o mesmo dinheiro apareceria em dois grupos no mesmo relatório.
    expect(SEM_CATEGORIA).toBe('Sem categoria')
  })

  it('agrupar por categoria não perde o que está sem classificar', () => {
    const lancamentos = [
      { categoria: 'Vendas', valor: 100 },
      { categoria: null, valor: 40 },
      { categoria: null, valor: 60 },
    ]
    const porCategoria = new Map<string, number>()
    for (const l of lancamentos) {
      const chave = l.categoria ?? SEM_CATEGORIA
      porCategoria.set(chave, (porCategoria.get(chave) ?? 0) + l.valor)
    }
    expect(porCategoria.get(SEM_CATEGORIA)).toBe(100)
    expect([...porCategoria.values()].reduce((a, b) => a + b, 0)).toBe(200)
  })
})
