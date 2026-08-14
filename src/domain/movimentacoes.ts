import type { VarianteMl } from './types'

/**
 * Os tipos do ledger.
 *
 * `reserva` e `liberacao` NÃO movem líquido: elas comprometem e descomprometem
 * ml para pedidos pagos. Ficam no mesmo livro porque quem audita precisa ver
 * por que o disponível caiu sem o frasco esvaziar.
 */
export type TipoMovimentacao =
  | 'entrada'
  | 'saida'
  | 'ajuste'
  | 'devolucao'
  | 'reserva'
  | 'liberacao'
  | 'perda'
  | 'estorno'

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
  /** Saldo da base logo após o lançamento. `null` quando não foi congelado. */
  saldoMl: number | null
  /** Saldo imediatamente ANTES — o outro lado do "antes e depois". */
  saldoAnteriorMl?: number | null
  /** Ml reservados (+) ou liberados (−). Só em `reserva`/`liberacao`. */
  reservaMl?: number | null
  /** Reservado total da base depois desta linha. */
  saldoReservadoMl?: number | null
  /** Pedido que originou a linha, quando houver. */
  pedidoId?: string | null
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
  /** Saldo congelado na ABERTURA da contagem. Referência auditável. */
  sistemaMl: number
  /**
   * Ml que entraram ou saíram DEPOIS do congelamento.
   *
   * Sem isto, uma venda faturada no meio da contagem virava divergência
   * inventada: o ml saiu do sistema e não da prateleira de quem contava, e o
   * ajuste "corrigia" o saldo para um número errado.
   */
  movimentosMl: number
  /** O que o operador contou. `null` enquanto ninguém contou. */
  contadoMl: number | null
  responsavel: string | null
  quando: string | null
}

export interface LinhaInventario extends ContagemInventario {
  contado: boolean
  /** Snapshot + movimentos: o que deveria estar na prateleira agora. */
  esperadoMl: number
  /** Contado menos ESPERADO. Positivo sobrou, negativo faltou. */
  diferencaMl: number
  divergente: boolean
}

export function apurarContagem(c: ContagemInventario): LinhaInventario {
  const contado = c.contadoMl !== null && c.responsavel !== null
  const esperadoMl = c.sistemaMl + c.movimentosMl
  const diferencaMl = contado ? c.contadoMl! - esperadoMl : 0
  return { ...c, contado, esperadoMl, diferencaMl, divergente: contado && diferencaMl !== 0 }
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
  /** Bases que se moveram durante a contagem — divergência não é erro nelas. */
  comMovimento: number
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
    comMovimento: linhas.filter((l) => l.movimentosMl !== 0).length,
  }
}

// ── Disponibilidade por variante ───────────────────────────────────────────
//
// A Frenesi envasa sob demanda: não há decant pronto na prateleira esperando
// pedido. Por isso esta apuração responde "quantos DÁ para vender", e não
// "quantos existem" — e mantém as duas coisas separadas quando houver
// pré-envase de verdade.

export type EstadoVariante =
  | 'Disponível'
  | 'Últimas unidades'
  | 'Sob demanda'
  | 'Tudo reservado'
  | 'Sem volume'
  | 'Sem carga'

export interface LinhaDerivado {
  baseId: string
  perfume: string
  marca: string
  variante: VarianteMl
  /** Unidades físicas já envasadas e etiquetadas. Zero é o normal aqui. */
  envasadas: number
  /** Unidades prontas já comprometidas com pedidos. */
  reservadas: number
  /** Prontas menos comprometidas. NUNCA negativo — o excedente vira pendência. */
  disponiveis: number
  /** Unidades que o volume disponível da base ainda permite fracionar. */
  capacidade: number
  /** Prontas + capacidade: o total que a loja poderia vender hoje. */
  vendaveis: number
  /** Demanda que nem o pronto nem o volume cobrem. */
  pendentes: number
  /** Volume já fracionado, portanto fora do estoque de base. */
  volumeMl: number
  precoPraticado: number
  valorTotal: number
  estado: EstadoVariante
}

export function apurarDerivado(
  baseId: string,
  perfume: string,
  marca: string,
  variante: VarianteMl,
  envasadas: number,
  reservadas: number,
  precoPraticado: number,
  /** Ml livres da base — é o que sustenta a capacidade desta variante. */
  disponivelBaseMl = 0,
  /** A base já entrou no livro de movimentações. */
  temCarga = true,
): LinhaDerivado {
  // Estoque físico pronto não pode ser negativo: se há mais reserva que
  // unidade pronta, o que existe é demanda pendente — e ela tem nome próprio.
  const disponiveis = Math.max(0, envasadas - reservadas)
  const pendentes = Math.max(0, reservadas - envasadas)
  const capacidade = Math.max(0, Math.floor(disponivelBaseMl / variante))
  const vendaveis = disponiveis + capacidade

  const estado: EstadoVariante = !temCarga
    ? 'Sem carga'
    : vendaveis === 0
      ? // Unidade envasada que existe mas está toda comprometida não é "sem
        // volume": o frasco pronto está ali, com dono. A ação é separar e
        // despachar, não recomprar.
        envasadas > 0
        ? 'Tudo reservado'
        : 'Sem volume'
      : disponiveis === 0
        ? 'Sob demanda'
        : vendaveis <= 2
          ? 'Últimas unidades'
          : 'Disponível'

  return {
    baseId,
    perfume,
    marca,
    variante,
    envasadas,
    reservadas,
    disponiveis,
    capacidade,
    vendaveis,
    pendentes,
    volumeMl: envasadas * variante,
    precoPraticado,
    // Valor do que está pronto — capacidade não é estoque e não se valoriza.
    valorTotal: precoPraticado * disponiveis,
    estado,
  }
}
