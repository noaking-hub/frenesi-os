import { VARIANTES, TETO_SHOPIFY } from './types'
import type { AcaoSync, PerfumeBase, ProdutoDerivado, VarianteMl } from './types'

/**
 * Estoque de perfume base, em ml.
 *
 * Três números diferentes, e confundi-los é o erro que este módulo existe
 * para não cometer:
 *
 *   FÍSICO     o que está no frasco — só muda por movimentação real
 *   RESERVADO  ml de pedidos pagos que ainda não saíram
 *   DISPONÍVEL físico − reservado, nunca negativo — é o que se pode vender
 *
 * Tudo que decide venda (sincronia, capacidade, cobertura) olha o
 * DISPONÍVEL. Tudo que audita o frasco (inventário, lote, perda) olha o
 * FÍSICO.
 */

/** Ml comprometidos. Base sem reserva declarada não tem compromisso. */
export function reservadoDe(base: PerfumeBase): number {
  return Math.max(0, base.reservadoMl ?? 0)
}

/**
 * O que sobra para vender. Nunca negativo: reserva acima do físico é
 * DEMANDA sem lastro — vira alerta na tela, não estoque negativo.
 */
export function disponivelDe(base: PerfumeBase): number {
  return Math.max(0, base.volumeMl - reservadoDe(base))
}

/** Quanto a reserva passou do que existe. Zero quando há lastro. */
export function excedenteDe(base: PerfumeBase): number {
  return Math.max(0, reservadoDe(base) - base.volumeMl)
}

/**
 * A base já entrou no livro de movimentações?
 *
 * Sem isso, volume zero não significa esgotado: significa que ninguém disse
 * ao ERP o que há no frasco. As duas situações pedem coisas opostas — uma
 * pede recompra, a outra pede que alguém abra a gaveta e conte.
 */
export function temCarga(base: PerfumeBase, derivados: ProdutoDerivado[] = []): boolean {
  return base.sobControle === true || base.volumeMl > 0 || derivados.some((d) => d.envasadas > 0)
}

/**
 * Unidades que uma variante permite, a partir do volume disponível.
 *
 * As capacidades das variantes NÃO se somam: 100 ml dão 20 unidades de 5 ml
 * OU 10 de 10 ml, nunca as duas coisas. Cada chamada responde por uma
 * variante isolada, e quem exibe precisa dizer que o pool é compartilhado.
 */
export function unidadesPossiveis(
  volumeDisponivelMl: number,
  variante: VarianteMl,
  prontos = 0,
): number {
  return prontos + Math.max(0, Math.floor(volumeDisponivelMl / variante))
}

export interface VarianteSync {
  variante: VarianteMl
  /** Decants prontos e não reservados. */
  prontos: number
  /** Unidades que o volume disponível ainda permite fracionar. */
  doVolume: number
  possivel: number
  /** O que está publicado na Shopify hoje. */
  publicado: number
  /** Unidades vendáveis sem lastro — pedidos que não seriam atendidos. */
  excesso: number
  acao: AcaoSync
  /** Valor que a sincronia vai gravar na Shopify. */
  novoValor: number
  /** Por que essa ação — sempre derivado dos números acima. */
  detalhe: string
  rotulo: string
}

/**
 * Decide o que fazer com uma variante na Shopify.
 *
 * O cliente controla estoque manualmente lá, sempre preenchendo 20 unidades por
 * variante e decrementando à mão. Isso desvia da realidade nos dois sentidos.
 *
 *   sem carga inicial                  → não mexer (o ERP não sabe o que existe)
 *   possível = 0                       → esgotar, ainda que haja 20 lá
 *   possível < publicado               → reduzir para possível
 *   publicado < 20 && possível >= 20   → repor ao teto (decremento desatualizado)
 *   possível >= publicado              → em dia
 *
 * Nunca sobe acima do teto de 20 — é política do cliente.
 */
export function sincronizarVariante(
  /** DISPONÍVEL, não físico: o que já está vendido não pode ser vendido de novo. */
  volumeDisponivelMl: number,
  variante: VarianteMl,
  prontos: number,
  publicado: number,
  temCargaInicial = true,
): VarianteSync {
  const doVolume = Math.max(0, Math.floor(volumeDisponivelMl / variante))
  const possivel = prontos + doVolume
  // Sem carga não há excesso a declarar: o publicado pode estar certo ou
  // errado, e contar como sobrevenda inventaria um alarme sem base.
  const excesso = temCargaInicial ? Math.max(0, publicado - possivel) : 0

  // O teto de 20 unidades EXISTIU aqui e foi removido por decisão do dono
  // (19/08): com estoque para produzir mais, segurar a vitrine em 20 era
  // esconder capacidade — o Vibrato podia 29 de 3 ml e publicava 20. A loja
  // agora espelha o "dá para" exato, para cima e para baixo.
  const acao: AcaoSync = !temCargaInicial
    ? 'sem_carga'
    : possivel === 0
      ? 'esgotar'
      : excesso > 0
        ? 'reduzir'
        : publicado < possivel
          ? 'repor'
          : 'ok'

  // `sem_carga` grava o que já está lá — ou seja, não grava: a sincronia só
  // escreve o que mudou.
  const novoValor = acao === 'ok' || acao === 'sem_carga' ? publicado : possivel

  const detalhe = !temCargaInicial
    ? 'sem carga inicial no ERP — a loja fica como está'
    : possivel === 0
      ? 'sem volume disponível para fracionar'
      : acao === 'repor'
        ? `disponível permite ${possivel} · loja publica menos`
        : prontos
          ? `${prontos} prontos + ${doVolume} do disponível`
          : `${doVolume} do volume disponível`

  const rotulo =
    acao === 'sem_carga'
      ? 'Sem carga'
      : acao === 'esgotar'
        ? 'Esgotar'
        : acao === 'reduzir'
          ? 'Reduzir'
          : acao === 'repor'
            ? 'Repor ao teto'
            : 'Em dia'

  return {
    variante,
    prontos,
    doVolume,
    possivel,
    publicado,
    excesso,
    acao,
    novoValor,
    detalhe,
    rotulo,
  }
}

export interface BaseSync {
  base: PerfumeBase
  variantes: VarianteSync[]
  pendentes: number
  resumo: string
  /** Ml livres que sustentam TODAS as variantes desta base, juntas. */
  disponivelMl: number
  /** Ml de pedidos pagos ainda não despachados. */
  reservadoMl: number
}

/**
 * A base inteira de uma vez — e é o único jeito correto.
 *
 * As cinco variantes bebem do MESMO pool de ml. Recalcular uma sozinha
 * publicaria 20 unidades de 5 ml e 20 de 10 ml no mesmo frasco de 100 ml:
 * 300 ml vendáveis onde há 100. Por isso a sincronia é sempre por base, com
 * as irmãs recalculadas juntas.
 */
export function sincronizarBase(
  base: PerfumeBase,
  derivados: ProdutoDerivado[],
  publicados: Record<string, number>,
): BaseSync {
  const meus = derivados.filter((x) => x.baseId === base.id)
  const carga = temCarga(base, meus)
  const disponivelMl = disponivelDe(base)

  const variantes = VARIANTES.map((v) => {
    const d = meus.find((x) => x.variante === v)
    // Unidade pronta reservada continua existindo no modelo, mas a reserva
    // que a operação realmente cria é em ml, no pool da base.
    const prontos = d ? Math.max(0, d.envasadas - d.reservadas) : 0
    const chave = `${base.id}|${v}`
    const publicado = publicados[chave] ?? TETO_SHOPIFY
    return sincronizarVariante(disponivelMl, v, prontos, publicado, carga)
  })

  const pendentes = variantes.filter((v) => v.acao !== 'ok' && v.acao !== 'sem_carga').length

  return {
    base,
    variantes,
    pendentes,
    disponivelMl,
    reservadoMl: reservadoDe(base),
    resumo: !carga
      ? 'Sem carga inicial — fora da sincronia'
      : pendentes === 0
        ? 'Todas as variantes em dia'
        : `${pendentes} ${pendentes === 1 ? 'variante fora' : 'variantes fora'} de sincronia`,
  }
}

export interface ResumoSync {
  bases: BaseSync[]
  esgotar: number
  reduzir: number
  repor: number
  emDia: number
  noTeto: number
  total: number
  /** Unidades sobrevendíveis: pedidos que não seriam atendidos. */
  excesso: number
  /** Bases fora da sincronia por nunca terem recebido carga inicial. */
  semCarga: number
}

export function resumoSync(bases: BaseSync[]): ResumoSync {
  const todas = bases.flatMap((b) => b.variantes)
  return {
    bases,
    esgotar: todas.filter((v) => v.acao === 'esgotar').length,
    reduzir: todas.filter((v) => v.acao === 'reduzir').length,
    repor: todas.filter((v) => v.acao === 'repor').length,
    emDia: todas.filter((v) => v.acao === 'ok').length,
    noTeto: todas.filter((v) => v.acao === 'ok' && v.publicado >= TETO_SHOPIFY).length,
    total: todas.length,
    excesso: todas.reduce((a, v) => a + v.excesso, 0),
    semCarga: bases.filter((b) => b.variantes.every((v) => v.acao === 'sem_carga')).length,
  }
}

/**
 * `sem_carga` separa "acabou" de "nunca soubemos". As duas dão volume zero e
 * pedem coisas opostas: uma pede recompra, a outra pede que alguém abra a
 * gaveta e diga quanto tem. Tratar as duas como esgotado enche a tela de
 * "recompra urgente" para perfume que está na prateleira.
 *
 * `sem_giro` é a terceira: tem estoque, ninguém compra. Sem consumo não
 * existe "acaba em N dias" — dividir por zero e mostrar "0 dias" fazia a
 * tela pedir recompra urgente do que está parado há meses.
 */
export type Criticidade = 'sem_carga' | 'sem_giro' | 'zero' | 'urgente' | 'atencao' | 'ok' | 'parado'

export interface CoberturaBase {
  base: PerfumeBase
  /** Ml no frasco. */
  fisicoMl: number
  /** Ml de pedidos pagos ainda não despachados. */
  reservadoMl: number
  /** Físico − reservado, nunca negativo. É o que dá para vender. */
  disponivelMl: number
  /** Reserva acima do físico: demanda que o estoque não cobre. */
  excedenteMl: number
  /**
   * Dias até acabar no ritmo atual: disponível ÷ consumo diário.
   * `null` quando não há consumo — não existe divisão por zero honesta.
   */
  dias: number | null
  criticidade: Criticidade
  /** Vocabulário do usuário: "Estoque acaba em 12 dias", não "ruptura". */
  cobertura: string
  acao: string
  cta: string
}

export function coberturaDe(base: PerfumeBase): CoberturaBase {
  const fisicoMl = base.volumeMl
  const reservadoMl = reservadoDe(base)
  const disponivelMl = disponivelDe(base)
  const excedenteMl = excedenteDe(base)

  // Sem consumo NÃO é zero dia: é ausência de informação. O escopo é
  // explícito — "Sem consumo" ou "Histórico insuficiente", nunca "acaba
  // hoje", porque "acaba hoje" dispara recompra de quem não vende.
  const dias =
    base.consumoDiarioMl > 0 ? Math.round(disponivelMl / base.consumoDiarioMl) : null

  const semCarga = fisicoMl === 0 && base.sobControle !== true

  const criticidade: Criticidade = semCarga
    ? 'sem_carga'
    : disponivelMl === 0
      ? 'zero'
      : dias === null
        ? 'sem_giro'
        : dias < 7
          ? 'urgente'
          : dias < 20
            ? 'atencao'
            : dias > 90
              ? 'parado'
              : 'ok'

  const acao =
    criticidade === 'sem_carga'
      ? base.consumoDiarioMl > 0
        ? 'Vende, mas está fora do controle · entra ao registrar a compra do próximo frasco'
        : 'Fora do controle de estoque · entra ao registrar a compra de um frasco'
      : criticidade === 'zero'
        ? excedenteMl > 0
          ? `Demanda acima do estoque · ${Math.round(excedenteMl)} ml vendidos sem lastro`
          : reservadoMl > 0
            ? 'Todo o volume está reservado · recomprar antes de vender mais'
            : 'Recompra urgente · pedidos pagos parados'
        : criticidade === 'sem_giro'
          ? 'Tem estoque e não vende · sem consumo para calcular cobertura'
          : criticidade === 'urgente'
            ? 'Recomprar esta semana'
            : criticidade === 'atencao'
              ? 'Programar produção antes de acabar'
              : criticidade === 'parado'
                ? 'Giro baixo · avaliar promoção antes de repor'
                : 'Sem ação necessária'

  const cobertura = semCarga
    ? 'Sem carga'
    : disponivelMl === 0
      ? 'Esgotado'
      : dias === null
        ? 'Sem consumo'
        : `${dias} ${dias === 1 ? 'dia' : 'dias'}`

  return {
    base,
    fisicoMl,
    reservadoMl,
    disponivelMl,
    excedenteMl,
    dias,
    criticidade,
    cobertura,
    acao,
    // Frasco novo deslacrado é uma COMPRA: volume cheio, custo cheio. É por
    // ela que a base entra no controle, sem precisar de mutirão de cadastro.
    cta: semCarga ? 'Registrar compra' : disponivelMl === 0 ? 'Recomprar' : 'Produzir',
  }
}

/** Alerta operacional de uma base — o que a tela precisa destacar. */
export interface AlertaEstoque {
  chave: 'ruptura' | 'critico' | 'excedente' | 'sem-custo' | 'sem-carga' | 'sem-giro' | 'lote-inconsistente'
  texto: string
  grau: 'erro' | 'atencao' | 'info'
}

/**
 * Os alertas da seção 11 do escopo, derivados — nunca digitados.
 *
 * `saldoLotesMl` entra quando se quer conferir o físico contra a soma dos
 * lotes abertos: divergência aí é lote inconsistente, e o número do frasco
 * deixa de ser confiável.
 */
export function alertasDaBase(c: CoberturaBase, saldoLotesMl?: number): AlertaEstoque[] {
  const alertas: AlertaEstoque[] = []
  const b = c.base

  if (c.criticidade === 'sem_carga') {
    alertas.push({
      chave: 'sem-carga',
      texto: 'Fora do controle de estoque · nunca teve compra registrada',
      grau: 'info',
    })
  }
  if (c.excedenteMl > 0) {
    alertas.push({
      chave: 'excedente',
      texto: `Reserva ${Math.round(c.excedenteMl)} ml acima do físico · demanda sem lastro`,
      grau: 'erro',
    })
  }
  if (c.criticidade === 'zero' && c.excedenteMl === 0) {
    alertas.push({ chave: 'ruptura', texto: 'Sem volume disponível para vender', grau: 'erro' })
  }
  if (c.criticidade === 'urgente' || c.criticidade === 'atencao') {
    alertas.push({
      chave: 'critico',
      texto: `Cobertura de ${c.dias} dias · abaixo do mínimo de 20`,
      grau: c.criticidade === 'urgente' ? 'erro' : 'atencao',
    })
  }
  if (c.criticidade === 'sem_giro') {
    alertas.push({ chave: 'sem-giro', texto: 'Sem consumo no período · cobertura não calculável', grau: 'info' })
  }
  if (b.custoPorMl <= 0 && c.fisicoMl > 0) {
    alertas.push({
      chave: 'sem-custo',
      texto: 'Sem custo por ml · valor em estoque e margem ficam sem base',
      grau: 'atencao',
    })
  }
  if (saldoLotesMl !== undefined && Math.abs(saldoLotesMl - c.fisicoMl) >= 0.05) {
    alertas.push({
      chave: 'lote-inconsistente',
      texto: `Lotes somam ${Math.round(saldoLotesMl)} ml e o saldo diz ${Math.round(c.fisicoMl)} ml`,
      grau: 'atencao',
    })
  }

  return alertas
}
