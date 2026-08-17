import 'server-only'

import { ferramentasInalcancaveis } from '@/domain'

import { FERRAMENTAS as LEITURA, type Ferramenta } from './ferramentas'
import { FERRAMENTAS_FINANCEIRAS } from './ferramentas-escrita'
import { FERRAMENTAS_OPERACIONAIS } from './ferramentas-operacao'
import { FERRAMENTAS_PEDIDOS } from './ferramentas-pedidos'

/**
 * O catálogo completo, montado num lugar só.
 *
 * A junção mora aqui, e não dentro de `ferramentas.ts`, para não criar ciclo:
 * as ferramentas de escrita precisam do TIPO `Ferramenta`, que vive lá. Um
 * `import` de volta fecharia o círculo e o bundler resolveria isso de um jeito
 * que só aparece em produção.
 *
 * A checagem de nome duplicado roda na carga do módulo de propósito. Duas
 * ferramentas com o mesmo nome fariam o `Map` guardar uma e o catálogo enviar
 * as duas ao modelo — ele chamaria uma e o ERP executaria a outra. É o tipo de
 * bug que passa em todos os testes e queima um sábado.
 */
export const FERRAMENTAS: Ferramenta[] = [
  ...LEITURA,
  ...FERRAMENTAS_PEDIDOS,
  ...FERRAMENTAS_FINANCEIRAS,
  ...FERRAMENTAS_OPERACIONAIS,
]

const repetidos = FERRAMENTAS.map((f) => f.nome).filter((n, i, todos) => todos.indexOf(n) !== i)
if (repetidos.length > 0) {
  throw new Error(`Ferramentas com nome repetido no catálogo: ${[...new Set(repetidos)].join(', ')}`)
}

/**
 * E nenhuma ferramenta pode exigir permissão que papel nenhum concede.
 *
 * Esta trava nasceu de um prejuízo real. As ferramentas de escrita exigiam
 * `financeiro.escrever`; o ator do ERP nascia só com `gerente.ler`. Como
 * `catalogoVisivel` ESCONDE o que a política nega, elas sumiam do catálogo sem
 * erro, sem log, sem nada — e o assistente, não vendo a ferramenta, respondia
 * que "o ERP não disponibiliza ferramenta de escrita para regras". Uma
 * limitação inventada, que sobreviveu a duas fases inteiras do escopo.
 *
 * Aqui, na carga do módulo, o mesmo erro vira build quebrada. É onde ele
 * custa minutos em vez de semanas.
 */
const orfas = ferramentasInalcancaveis(FERRAMENTAS)
if (orfas.length > 0) {
  throw new Error(
    'Ferramentas que papel nenhum alcança (some do catálogo em silêncio): ' +
      orfas.map((o) => `${o.nome} exige ${o.faltando.join(', ')}`).join('; '),
  )
}

export const FERRAMENTA_POR_NOME = new Map(FERRAMENTAS.map((f) => [f.nome, f]))

export type { Ferramenta }
export { catalogoParaModelo } from './ferramentas'
