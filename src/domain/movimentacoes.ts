import type { VarianteMl } from './types'

export type TipoMovimentacao = 'entrada' | 'saida' | 'ajuste' | 'devolucao'

export interface Movimentacao {
  id: string
  baseId: string
  perfume: string
  tipo: TipoMovimentacao
  data: string
  /** Positivo entra, negativo sai. Em ml. */
  volumeMl: number
  /**
   * Volume efetivamente envasado numa saída de produção.
   * A perda técnica é a diferença entre |volumeMl| e este valor.
   */
  liquidoMl: number | null
  /** Origem: id do lote, da ordem de produção ou da devolução. */
  ref: string
  motivo: string
  responsavel: string
  /** Saldo da base logo após a movimentação. */
  /** Saldo da base logo após o lançamento. `null` quando não foi congelado. */
  saldoMl: number | null
}

/**
 * Perda técnica de uma saída de produção: o que saiu do estoque menos o que
 * entrou no frasco. É a mesma grandeza que os lotes apuram no fim — aqui,
 * lançamento a lançamento.
 */
export function perdaTecnica(mov: Movimentacao): number {
  if (mov.tipo !== 'saida' || mov.liquidoMl === null) return 0
  return Math.abs(mov.volumeMl) - mov.liquidoMl
}

export type OrigemAjuste = 'encerramento-lote' | 'divergencia-contagem' | 'outro'

/**
 * Classifica um ajuste pela referência, não por um campo à parte.
 *
 * Encerrar um lote GERA a movimentação de ajuste com `ref` = id do lote, então
 * a referência já diz o que aconteceu — guardar um segundo campo abriria espaço
 * para os dois discordarem.
 */
export function origemDoAjuste(mov: Movimentacao): OrigemAjuste {
  if (mov.tipo !== 'ajuste') return 'outro'
  if (/^LT-/i.test(mov.ref)) return 'encerramento-lote'
  if (/^INV-/i.test(mov.ref)) return 'divergencia-contagem'
  return 'outro'
}

export interface ResumoMovimentacoes {
  total: number
  /** Compras de base e retorno de devolução. */
  entradasMl: number
  /** Volume consumido em produção (valor absoluto). */
  saidasMl: number
  /** Volume que efetivamente virou decant. */
  envasadoMl: number
  perdaMl: number
  /** Perda sobre o envasado, em %. Comparável ao parâmetro. */
  perdaPct: number
  ajustesMl: number
  encerramentosDeLote: number
  divergenciasDeContagem: number
}

export function resumirMovimentacoes(movs: Movimentacao[]): ResumoMovimentacoes {
  const saidas = movs.filter((m) => m.tipo === 'saida')
  const saidasMl = saidas.reduce((a, m) => a + Math.abs(m.volumeMl), 0)
  const envasadoMl = saidas.reduce((a, m) => a + (m.liquidoMl ?? Math.abs(m.volumeMl)), 0)
  const perdaMl = saidas.reduce((a, m) => a + perdaTecnica(m), 0)
  const ajustes = movs.filter((m) => m.tipo === 'ajuste')

  return {
    total: movs.length,
    entradasMl: movs
      .filter((m) => m.tipo === 'entrada' || m.tipo === 'devolucao')
      .reduce((a, m) => a + m.volumeMl, 0),
    saidasMl,
    envasadoMl,
    perdaMl,
    perdaPct: envasadoMl ? (perdaMl / envasadoMl) * 100 : 0,
    ajustesMl: ajustes.reduce((a, m) => a + Math.abs(m.volumeMl), 0),
    encerramentosDeLote: ajustes.filter((m) => origemDoAjuste(m) === 'encerramento-lote').length,
    divergenciasDeContagem: ajustes.filter(
      (m) => origemDoAjuste(m) === 'divergencia-contagem',
    ).length,
  }
}

// ── Inventário ─────────────────────────────────────────────────────────────

export interface ContagemInventario {
  baseId: string
  perfume: string
  /** O que o ERP diz que existe. */
  sistemaMl: number
  /** O que o operador contou. `null` enquanto ninguém contou. */
  contadoMl: number | null
  responsavel: string | null
  quando: string | null
}

export interface LinhaInventario extends ContagemInventario {
  contado: boolean
  /** Contado menos sistema. Positivo sobrou, negativo faltou. */
  diferencaMl: number
  divergente: boolean
}

export function apurarContagem(c: ContagemInventario): LinhaInventario {
  const contado = c.contadoMl !== null && c.responsavel !== null
  const diferencaMl = contado ? c.contadoMl! - c.sistemaMl : 0
  return { ...c, contado, diferencaMl, divergente: contado && diferencaMl !== 0 }
}

export interface ResumoInventario {
  linhas: LinhaInventario[]
  contadas: number
  total: number
  pendentes: number
  semDivergencia: number
  divergentes: number
  /** Soma das diferenças. É o que o fechamento vai lançar em Movimentações. */
  diferencaLiquidaMl: number
}

export function apurarInventario(contagens: ContagemInventario[]): ResumoInventario {
  const linhas = contagens.map(apurarContagem)
  const contadas = linhas.filter((l) => l.contado)

  return {
    linhas,
    contadas: contadas.length,
    total: linhas.length,
    pendentes: linhas.length - contadas.length,
    semDivergencia: contadas.filter((l) => !l.divergente).length,
    divergentes: contadas.filter((l) => l.divergente).length,
    diferencaLiquidaMl: contadas.reduce((a, l) => a + l.diferencaMl, 0),
  }
}

// ── Produtos derivados ─────────────────────────────────────────────────────

export interface LinhaDerivado {
  baseId: string
  perfume: string
  marca: string
  variante: VarianteMl
  envasadas: number
  reservadas: number
  disponiveis: number
  /** Volume já fracionado, portanto fora do estoque de base. */
  volumeMl: number
  precoPraticado: number
  valorTotal: number
  estado: 'Disponível' | 'Últimas unidades' | 'Tudo reservado'
}

export function apurarDerivado(
  baseId: string,
  perfume: string,
  marca: string,
  variante: VarianteMl,
  envasadas: number,
  reservadas: number,
  precoPraticado: number,
): LinhaDerivado {
  const disponiveis = envasadas - reservadas
  return {
    baseId,
    perfume,
    marca,
    variante,
    envasadas,
    reservadas,
    disponiveis,
    volumeMl: envasadas * variante,
    precoPraticado,
    valorTotal: precoPraticado * envasadas,
    estado:
      disponiveis === 0
        ? 'Tudo reservado'
        : disponiveis <= 2
          ? 'Últimas unidades'
          : 'Disponível',
  }
}
