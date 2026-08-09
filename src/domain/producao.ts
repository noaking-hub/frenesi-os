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
  /** Volume líquido que vai para os frascos — e que sai do estoque. */
  liquidoMl: number
  /** Líquido mais a perda estimada. Serve de folga, não é baixa. */
  consumoMl: number
  /** O que sobra na base depois de confirmar. */
  restanteMl: number
  insuficiente: boolean
  /** Quantas unidades o volume atual permite, nesta variante e com esta perda. */
  maximoUnidades: number
  mensagem: string
}

/**
 * Simula o impacto de uma ordem antes de confirmar.
 *
 * O que sai do estoque é o LÍQUIDO envasado. A perda técnica do parâmetro é
 * estimativa de preço, não movimentação: ninguém a mediu ainda. A perda real
 * aparece inteira quando o frasco é declarado vazio — comprado menos
 * envasado. Se a estimativa saísse do estoque aqui, o encerramento mediria
 * só o resíduo do palpite.
 *
 * Ela entra na folga: envasar 24 decants de 5 ml exige 123,6 ml disponíveis
 * com 3% de perda, mesmo baixando 120. É prudência, e por isso `maximo` conta
 * a perda.
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
  const restanteMl = Math.round((base.volumeMl - liquidoMl) * 10) / 10
  // Falta folga para a perda, não só para o líquido.
  const insuficiente = base.volumeMl < consumoMl
  const maximoUnidades = Math.floor(base.volumeMl / (variante * fator))

  const mensagem = insuficiente
    ? quantidade > 0
      ? `${base.nome} tem ${fmt(base.volumeMl)} ml — dá para no máximo ${maximoUnidades} ${maximoUnidades === 1 ? 'unidade' : 'unidades'} de ${variante} ml, guardando a folga de ${fmt(p.perdaPct)}% para a perda.`
      : 'Informe a quantidade a produzir.'
    : quantidade > 0
      ? `Confirmar baixa ${fmt(liquidoMl)} ml envasados e deixa ${base.nome} com ${fmt(restanteMl)} ml. A perda real deste frasco só é medida quando ele for declarado vazio.`
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
