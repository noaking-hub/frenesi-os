import { margemDe, pisoMargem } from './precificacao'
import type { ParametrosPrecificacao, PerfumeBase, VarianteMl } from './types'

/**
 * Promoções: cupons nas duas plataformas e o rodízio da coleção Ofertas.
 *
 * As duas regras de ouro:
 *  - um cupom só funciona se existir na Shopify E na Yampi (o checkout é da
 *    Yampi — cupom só na Shopify é recusado na hora de pagar);
 *  - nenhum desconto automático fura o piso de margem, nem com aprovação.
 */

// ── Cupons ─────────────────────────────────────────────────────────────────

export type EstadoPlataforma = 'Ativo' | 'Pendente' | 'Divergente' | 'Encerrado'

export interface CupomPromo {
  codigo: string
  tipo: string
  regra: string
  usos: number
  /** 0 = sem limite de usos. */
  limite: number
  receita: number
  /** Desconto concedido em reais, somado dos pedidos que usaram o cupom. */
  desconto: number
  /** Margem líquida média dos pedidos com o cupom, em %. */
  margem: number
  status: 'Ativo' | 'Revisar' | 'Encerrado'
  validade: string
  shopify: EstadoPlataforma
  yampi: EstadoPlataforma
}

/** Ativo em uma plataforma só: o cliente vê o cupom mas o checkout recusa. */
export function cupomDessincronizado(c: CupomPromo): boolean {
  return c.status !== 'Encerrado' && c.shopify !== c.yampi
}

export interface ResumoCupons {
  vigentes: CupomPromo[]
  semLimite: number
  receita: number
  usos: number
  desconto: number
  /** Ponderada pela receita de cada cupom. */
  margemMedia: number
  abaixoPiso: number
  dessincronizados: CupomPromo[]
}

export function resumirCupons(cupons: CupomPromo[], p: ParametrosPrecificacao): ResumoCupons {
  const vigentes = cupons.filter((c) => c.status !== 'Encerrado')
  const receita = vigentes.reduce((a, c) => a + c.receita, 0)
  return {
    vigentes,
    semLimite: vigentes.filter((c) => c.limite === 0).length,
    receita,
    usos: vigentes.reduce((a, c) => a + c.usos, 0),
    desconto: vigentes.reduce((a, c) => a + c.desconto, 0),
    margemMedia: receita
      ? vigentes.reduce((a, c) => a + c.margem * c.receita, 0) / receita
      : 0,
    abaixoPiso: vigentes.filter((c) => c.margem < pisoMargem(p)).length,
    dessincronizados: cupons.filter(cupomDessincronizado),
  }
}

// ── Rodízio da coleção Ofertas ─────────────────────────────────────────────

export interface ItemVitrine {
  baseId: string
  variante: VarianteMl
  preco: number
  vendas30: number
  diasParado: number
}

export interface ConfigRodizio {
  ativo: boolean
  cicloHoras: number
  quantidade: number
  campeoes: number
  descontoMin: number
  descontoMax: number
}

export const RODIZIO_PADRAO: ConfigRodizio = {
  ativo: true,
  cicloHoras: 48,
  quantidade: 10,
  campeoes: 3,
  descontoMin: 8,
  descontoMax: 22,
}

function precoCom(preco: number, pct: number): number {
  return Math.round(preco * (1 - pct / 100) * 100) / 100
}

function custoUnitario(item: ItemVitrine, base: PerfumeBase, p: ParametrosPrecificacao): number {
  return base.custoPorMl * item.variante * (1 + p.perdaPct / 100)
}

/**
 * Maior desconto inteiro que ainda respeita o piso de margem. Desce de 1 em 1
 * ponto a partir do teto até a margem parar de furar o piso.
 */
export function descontoMaximo(
  item: ItemVitrine,
  base: PerfumeBase,
  p: ParametrosPrecificacao,
  tetoPct: number,
): number {
  const custo = custoUnitario(item, base, p)
  let pct = tetoPct
  while (pct > 0 && margemDe(precoCom(item.preco, pct), custo, p) < pisoMargem(p)) pct -= 1
  return pct
}

export interface ItemRodada {
  item: ItemVitrine
  base: PerfumeBase
  tipo: 'encalhado' | 'campeao'
  /** Desconto aplicado, já limitado pelo piso. */
  pct: number
  preco: number
  margem: number
  /** O desconto pretendido foi cortado pelo piso de margem. */
  limitado: boolean
}

export interface Rodada {
  selecao: ItemRodada[]
  /** Com o desconto mínimo a margem já furaria o piso — ficam de fora. */
  foraDoPiso: { item: ItemVitrine; base: PerfumeBase }[]
  vagasSemCandidato: number
  descontoMedio: number
  diasParadosMedio: number
  menorMargem: number
  limitadosPeloPiso: number
}

/**
 * Monta uma rodada do rodízio: sorteio ponderado e estável por semente.
 *
 * Encalhados entram com peso proporcional ao tempo parado; campeões, ao
 * volume de venda. Bases esgotadas ficam de fora automaticamente, e nenhum
 * item entra se até o desconto mínimo furar o piso de margem.
 */
export function montarRodada(
  vitrine: ItemVitrine[],
  bases: PerfumeBase[],
  p: ParametrosPrecificacao,
  cfg: ConfigRodizio,
  semente: number,
): Rodada {
  const qtd = Math.max(1, Math.min(16, cfg.quantidade || 1))
  const nCampeoes = Math.max(0, Math.min(qtd - 1, cfg.campeoes || 0))
  const baseDe = (i: ItemVitrine) => bases.find((b) => b.id === i.baseId)

  const comEstoque = vitrine
    .map((item) => ({ item, base: baseDe(item) }))
    .filter((x): x is { item: ItemVitrine; base: PerfumeBase } => Boolean(x.base))
    .filter((x) => x.base.volumeMl >= x.item.variante)

  const teto = (x: { item: ItemVitrine; base: PerfumeBase }) =>
    descontoMaximo(x.item, x.base, p, cfg.descontoMax)
  const foraDoPiso = comEstoque.filter((x) => teto(x) < cfg.descontoMin)
  const elegiveis = comEstoque.filter((x) => teto(x) >= cfg.descontoMin)

  // Gerador congruente linear: a mesma semente produz sempre a mesma rodada,
  // então "Sortear novamente" é trocar a semente — não um Math.random solto.
  let estado = semente * 104729 + 12345
  const aleatorio = () => {
    estado = (estado * 1103515245 + 12345) % 2147483648
    return estado / 2147483648
  }
  const sortear = <T>(pool: T[], n: number, peso: (x: T) => number): T[] => {
    const restante = pool.slice()
    const escolhidos: T[] = []
    while (escolhidos.length < n && restante.length) {
      const total = restante.reduce((a, x) => a + peso(x), 0)
      let alvo = aleatorio() * total
      let i = 0
      for (; i < restante.length - 1; i++) {
        alvo -= peso(restante[i])
        if (alvo <= 0) break
      }
      escolhidos.push(restante.splice(i, 1)[0])
    }
    return escolhidos
  }

  const nParados = qtd - nCampeoes
  // Pool com o dobro das vagas entre os mais parados: varia sem perder o foco.
  const poolParados = elegiveis
    .slice()
    .sort((a, b) => b.item.diasParado - a.item.diasParado)
    .slice(0, Math.max(nParados, Math.min(elegiveis.length, nParados * 2)))
  const parados = sortear(poolParados, nParados, (x) => x.item.diasParado + 1)

  const sobra = elegiveis.filter((x) => !parados.includes(x))
  const poolCampeoes = sobra
    .slice()
    .sort((a, b) => b.item.vendas30 - a.item.vendas30)
    .slice(0, Math.max(nCampeoes, Math.min(sobra.length, nCampeoes * 2)))
  const campeoes = sortear(poolCampeoes, nCampeoes, (x) => x.item.vendas30 + 1)

  const maxParado = Math.max(1, ...parados.map((x) => x.item.diasParado))
  const montar = (
    x: { item: ItemVitrine; base: PerfumeBase },
    tipo: ItemRodada['tipo'],
  ): ItemRodada => {
    // Campeão leva o desconto mínimo; encalhado escala com o tempo parado.
    const bruto =
      tipo === 'campeao'
        ? cfg.descontoMin
        : cfg.descontoMin + (cfg.descontoMax - cfg.descontoMin) * (x.item.diasParado / maxParado)
    const tetoItem = teto(x)
    const pct = Math.max(cfg.descontoMin, Math.min(Math.round(bruto), tetoItem))
    const preco = precoCom(x.item.preco, pct)
    return {
      item: x.item,
      base: x.base,
      tipo,
      pct,
      preco,
      margem: margemDe(preco, custoUnitario(x.item, x.base, p), p),
      limitado: pct < Math.round(bruto),
    }
  }

  const selecao = parados
    .map((x) => montar(x, 'encalhado'))
    .concat(campeoes.map((x) => montar(x, 'campeao')))

  return {
    selecao,
    foraDoPiso,
    vagasSemCandidato: qtd - selecao.length,
    descontoMedio: selecao.length
      ? selecao.reduce((a, s) => a + s.pct, 0) / selecao.length
      : 0,
    diasParadosMedio: selecao.length
      ? Math.round(selecao.reduce((a, s) => a + s.item.diasParado, 0) / selecao.length)
      : 0,
    menorMargem: selecao.length ? Math.min(...selecao.map((s) => s.margem)) : 0,
    limitadosPeloPiso: selecao.filter(
      (s) => s.pct < cfg.descontoMax && s.pct === descontoMaximo(s.item, s.base, p, cfg.descontoMax),
    ).length,
  }
}
