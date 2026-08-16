import 'server-only'

import { FERRAMENTAS as LEITURA, type Ferramenta } from './ferramentas'
import { FERRAMENTAS_FINANCEIRAS } from './ferramentas-escrita'
import { FERRAMENTAS_OPERACIONAIS } from './ferramentas-operacao'

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
  ...FERRAMENTAS_FINANCEIRAS,
  ...FERRAMENTAS_OPERACIONAIS,
]

const repetidos = FERRAMENTAS.map((f) => f.nome).filter((n, i, todos) => todos.indexOf(n) !== i)
if (repetidos.length > 0) {
  throw new Error(`Ferramentas com nome repetido no catálogo: ${[...new Set(repetidos)].join(', ')}`)
}

export const FERRAMENTA_POR_NOME = new Map(FERRAMENTAS.map((f) => [f.nome, f]))

export type { Ferramenta }
export { catalogoParaModelo } from './ferramentas'
