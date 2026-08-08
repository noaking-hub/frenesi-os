import { volumeConsumido } from './fracionamento'
import type { ParametrosPrecificacao, PerfumeBase, VarianteMl } from './types'

export type StatusOrdem =
  | 'Em envase'
  | 'Aguardando conferência'
  | 'Bloqueada'
  | 'Concluída'

export interface OrdemProducao {
  id: string
  baseId: string
  perfume: string
  marca: string
  variante: VarianteMl
  quantidade: number
  /** Volume que a ordem consome do estoque, já com a perda embutida. */
  volumeMl: number
  status: StatusOrdem
  responsavel: string
  prazo: string
  /** Por que a ordem existe — reposição, pedidos da semana, kit… */
  motivo: string
}

/** Ordem que ainda vai consumir volume (ou está travada esperando por ele). */
export function ordemAberta(o: OrdemProducao): boolean {
  return o.status !== 'Concluída'
}

/** Em andamento de fato: aberta e não travada por falta de base. */
export function ordemEmAndamento(o: OrdemProducao): boolean {
  return ordemAberta(o) && o.status !== 'Bloqueada'
}

export interface ResumoOrdens {
  abertas: number
  bloqueadas: number
  /** Volume das ordens em andamento — as bloqueadas não consomem nada ainda. */
  volumeEmEnvaseMl: number
  unidadesAProduzir: number
}

export function resumirOrdens(ordens: OrdemProducao[]): ResumoOrdens {
  const abertas = ordens.filter(ordemAberta)
  return {
    abertas: abertas.length,
    bloqueadas: ordens.filter((o) => o.status === 'Bloqueada').length,
    volumeEmEnvaseMl: ordens
      .filter(ordemEmAndamento)
      .reduce((a, o) => a + o.volumeMl, 0),
    unidadesAProduzir: abertas.reduce((a, o) => a + o.quantidade, 0),
  }
}

export interface SimulacaoOrdem {
  base: PerfumeBase
  variante: VarianteMl
  quantidade: number
  /** Volume líquido que vai para os frascos. */
  liquidoMl: number
  /** Volume que sai do estoque: líquido + perda técnica estimada. */
  consumoMl: number
  /** O que sobra na base depois de confirmar. Negativo = não dá. */
  restanteMl: number
  insuficiente: boolean
  /** Quantas unidades o volume atual permite, nesta variante e com esta perda. */
  maximoUnidades: number
  mensagem: string
}

/**
 * Simula o impacto de uma ordem antes de confirmar.
 *
 * O consumo embute a perda técnica do parâmetro — envasar 24 decants de 5 ml
 * com 3% de perda tira 123,6 ml do estoque, não 120. Se o restante fica
 * negativo, a confirmação é bloqueada e a mensagem diz o máximo possível.
 */
export function simularOrdem(
  base: PerfumeBase,
  variante: VarianteMl,
  quantidade: number,
  p: ParametrosPrecificacao,
): SimulacaoOrdem {
  const fator = 1 + p.perdaPct / 100
  const liquidoMl = quantidade * variante
  const consumoMl = volumeConsumido(quantidade, variante, p.perdaPct)
  const restanteMl = Math.round((base.volumeMl - consumoMl) * 10) / 10
  const insuficiente = restanteMl < 0
  const maximoUnidades = Math.floor(base.volumeMl / (variante * fator))

  const mensagem = insuficiente
    ? quantidade > 0
      ? `${base.nome} tem ${fmt(base.volumeMl)} ml — dá para no máximo ${maximoUnidades} ${maximoUnidades === 1 ? 'unidade' : 'unidades'} de ${variante} ml com a perda de ${fmt(p.perdaPct)}%.`
      : 'Informe a quantidade a produzir.'
    : quantidade > 0
      ? `Confirmar baixa ${fmt(consumoMl)} ml do estoque (${fmt(liquidoMl)} ml envasados + ${fmt(p.perdaPct)}% de perda) e deixa ${base.nome} com ${fmt(restanteMl)} ml.`
      : 'Informe a quantidade a produzir.'

  return {
    base,
    variante,
    quantidade,
    liquidoMl,
    consumoMl,
    restanteMl,
    insuficiente,
    maximoUnidades,
    mensagem,
  }
}

function fmt(n: number): string {
  const s = (Math.round(n * 10) / 10).toString().replace('.', ',')
  const [i, d] = s.split(',')
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? `,${d}` : '')
}
