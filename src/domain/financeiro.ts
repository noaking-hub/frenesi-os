/**
 * Domínio financeiro: lançamentos, contas, conciliação de repasses e DRE.
 *
 * O princípio de sempre: subtotal não se digita. Receita líquida, margem de
 * contribuição e resultado saem da soma das linhas; o status de um repasse sai
 * da comparação entre o recebido e o líquido esperado.
 */

/**
 * `Parcial` existe porque a venda parcelada é o caso comum, não a exceção.
 * Sem ele, um lançamento de R$ 1.299 com R$ 400 recebidos só podia ser "pago"
 * — afirmando que entrou o dobro do que entrou — ou "a receber" — escondendo
 * que quase um terço já entrou.
 */
export type StatusLancamento =
  | 'Pago'
  | 'Recebido'
  | 'Parcial'
  | 'A pagar'
  | 'Vencido'
  | 'Previsto'

export interface Lancamento {
  id: string
  data: string
  descricao: string
  categoria: string
  conta: string
  tipo: 'entrada' | 'saida'
  /** O total combinado. */
  valor: number
  /** Quanto já entrou ou saiu de fato. */
  recebido: number
  status: StatusLancamento
  recorrente: boolean
  /** Cadência da repetição, quando existe: mensal, semanal… */
  recorrencia: string | null
  /** Liga as ocorrências de uma mesma repetição. */
  serieId: string | null
  categoriaId: string
  contaId: string
  /** AAAA-MM-DD, para o formulário de edição. */
  ocorridoEm: string
  venceEm: string | null
  /** De onde o lançamento veio: Manual, Recorrente, Conciliação, Estoque, Assessor IA. */
  origem: string
}

/** O que ainda falta entrar ou sair. Nunca negativo. */
export function saldoEmAberto(l: Lancamento): number {
  return Math.max(0, Math.round((l.valor - l.recebido) * 100) / 100)
}

/**
 * Status a partir dos fatos, nunca gravado.
 *
 * Um enum guardado envelheceria sozinho à meia-noite do vencimento — a conta
 * que estava "a pagar" ontem está vencida hoje sem ninguém ter tocado nela.
 */
export function statusDoLancamento(
  l: { tipo: 'entrada' | 'saida'; valor: number; recebido: number; venceEm: string | null },
  hoje: string,
): StatusLancamento {
  if (l.recebido >= l.valor) return l.tipo === 'entrada' ? 'Recebido' : 'Pago'
  if (l.recebido > 0) return 'Parcial'
  if (!l.venceEm) return 'Previsto'
  return l.venceEm < hoje ? 'Vencido' : 'A pagar'
}

/** Ainda tem dinheiro a entrar ou sair. */
export function lancamentoPendente(l: Lancamento): boolean {
  return l.status !== 'Pago' && l.status !== 'Recebido'
}

export interface ResumoLancamentos {
  aPagar: number
  aPagarQtd: number
  vencido: number
  vencidoQtd: number
  /** O que ainda falta entrar. */
  aReceber: number
  aReceberQtd: number
  recorrentes: number
  recorrentesQtd: number
}

/**
 * Os totais somam o que FALTA, não o valor cheio.
 *
 * Um lançamento de R$ 1.299 com R$ 400 já recebidos deve R$ 899 ao "a
 * receber". Somar o total mostraria como pendente um dinheiro que já está na
 * conta — e o saldo projetado, que soma as duas coisas, contaria esses R$ 400
 * duas vezes.
 */
export function resumirLancamentos(lancs: Lancamento[]): ResumoLancamentos {
  const emAberto = lancs.filter((l) => l.tipo === 'saida' && lancamentoPendente(l))
  const vencidos = emAberto.filter((l) => l.status === 'Vencido')
  const aPagar = emAberto.filter((l) => l.status !== 'Vencido')
  const aReceber = lancs.filter((l) => l.tipo === 'entrada' && lancamentoPendente(l))
  const recorrentes = lancs.filter((l) => l.recorrente)

  const falta = (ls: Lancamento[]) => ls.reduce((a, l) => a + saldoEmAberto(l), 0)

  return {
    aPagar: falta(aPagar),
    aPagarQtd: aPagar.length,
    vencido: falta(vencidos),
    vencidoQtd: vencidos.length,
    aReceber: falta(aReceber),
    aReceberQtd: aReceber.length,
    recorrentes: recorrentes.reduce((a, l) => a + l.valor, 0),
    recorrentesQtd: recorrentes.length,
  }
}

// ── Contas ─────────────────────────────────────────────────────────────────

export interface ContaBancaria {
  id: string
  nome: string
  tipo: string
  banco: string
  saldo: number
  entradasMes: number
  saidasMes: number
  uso: string
  principal: boolean
  /**
   * Saldo que a própria conta informou. Quando existe, `saldo` é ele.
   *
   * Distinguir os dois importa: somar pagamentos não dá saldo, porque saque e
   * transferência não são pagamentos recebidos. Uma conta sem saldo informado
   * mostra uma estimativa, e a tela precisa poder dizer isso.
   */
  saldoInformado: number | null
  saldoInformadoEm: string | null
}

export function saldoConsolidado(contas: ContaBancaria[]): number {
  return contas.reduce((a, c) => a + c.saldo, 0)
}

/** Fatia do caixa que esta conta representa, em %. */
export function participacao(conta: ContaBancaria, contas: ContaBancaria[]): number {
  const total = saldoConsolidado(contas)
  return total ? (conta.saldo / total) * 100 : 0
}

// ── Conciliação de repasses ────────────────────────────────────────────────

export interface Repasse {
  pedidoId: string
  /** Canal e forma de pagamento: "Shopify · Cartão 3x", "Yampi · Pix"… */
  origem: string
  /** Valor do pedido. */
  esperado: number
  /** Taxa do intermediador sobre este pagamento, em %. Pix é 0. */
  taxaPct: number
  /** O que caiu na conta. Null enquanto o repasse não chega. */
  recebido: number | null
  /** O pagamento em si foi confirmado (Pix pago, cartão aprovado). */
  pagamentoConfirmado: boolean
}

export type StatusConciliacao =
  | 'previsto'
  | 'pendente'
  | 'confirmado'
  | 'conciliado'
  | 'divergente'

export interface ResultadoConciliacao {
  repasse: Repasse
  /** Esperado menos a taxa do intermediador — o que DEVERIA cair na conta. */
  liquidoEsperado: number
  /** Recebido menos o líquido esperado. Null enquanto não recebeu. */
  diferenca: number | null
  status: StatusConciliacao
  precisaAcao: boolean
}

/** Tolerância de centavos para arredondamento do intermediador. */
const TOLERANCIA_CONCILIACAO = 0.05

/**
 * O status da conciliação é DERIVADO dos números, nunca marcado à mão:
 *
 *   pagamento não confirmado          → previsto
 *   confirmado, repasse não caiu      → pendente
 *   caiu o líquido esperado, sem taxa → confirmado (Pix: recebido = pedido)
 *   caiu o líquido esperado, com taxa → conciliado
 *   caiu outra coisa                  → divergente (a diferença diz quanto)
 */
export function conciliarRepasse(r: Repasse): ResultadoConciliacao {
  const liquidoEsperado = Math.round(r.esperado * (1 - r.taxaPct / 100) * 100) / 100

  if (!r.pagamentoConfirmado) {
    return { repasse: r, liquidoEsperado, diferenca: null, status: 'previsto', precisaAcao: false }
  }
  if (r.recebido === null) {
    // Cartão parcelado demora dias — pendente vira ação quando estoura o prazo;
    // aqui a ação fica ligada para o operador cobrar o intermediador.
    return { repasse: r, liquidoEsperado, diferenca: null, status: 'pendente', precisaAcao: true }
  }

  const diferenca = Math.round((r.recebido - liquidoEsperado) * 100) / 100
  if (Math.abs(diferenca) <= TOLERANCIA_CONCILIACAO) {
    return {
      repasse: r,
      liquidoEsperado,
      diferenca: null,
      status: r.taxaPct > 0 ? 'conciliado' : 'confirmado',
      precisaAcao: false,
    }
  }

  return { repasse: r, liquidoEsperado, diferenca, status: 'divergente', precisaAcao: true }
}

// ── Categorias ─────────────────────────────────────────────────────────────

/**
 * O que a categoria faz com o resultado.
 *
 * `Receita` existe para a venda que não passa pela loja — balcão, dinheiro na
 * mão. A receita do DRE sai dos pedidos pagos, e continua saindo: só o
 * lançamento classificado numa categoria de receita se soma a eles, em linha
 * própria, para que o total nunca vire um número que não bate com nenhuma das
 * duas fontes.
 */
export type NaturezaCategoria = 'Receita' | 'Custo variável' | 'Despesa fixa' | 'Despesa'

export interface CategoriaFinanceira {
  nome: string
  natureza: NaturezaCategoria
  /** Total classificado nesta categoria no mês fechado. */
  valorMes: number
  lancamentos: number
}

export interface ResumoCategorias {
  total: number
  variaveis: number
  fixas: number
  despesas: number
  /**
   * Tudo que não é custo variável: a estrutura que existe vendendo ou não.
   * É o numerador do ponto de equilíbrio.
   */
  estruturaFixa: number
  totalLancamentos: number
}

export function resumirCategorias(categorias: CategoriaFinanceira[]): ResumoCategorias {
  return {
    total: categorias.reduce((a, c) => a + c.valorMes, 0),
    variaveis: categorias.filter((c) => c.natureza === 'Custo variável').length,
    fixas: categorias.filter((c) => c.natureza === 'Despesa fixa').length,
    despesas: categorias.filter((c) => c.natureza === 'Despesa').length,
    estruturaFixa: categorias
      .filter((c) => c.natureza !== 'Custo variável')
      .reduce((a, c) => a + c.valorMes, 0),
    totalLancamentos: categorias.reduce((a, c) => a + c.lancamentos, 0),
  }
}

/** Fatia da categoria sobre o total classificado, em %. */
export function participacaoCategoria(
  c: CategoriaFinanceira,
  categorias: CategoriaFinanceira[],
): number {
  const total = categorias.reduce((a, x) => a + x.valorMes, 0)
  return total ? (c.valorMes / total) * 100 : 0
}

// ── DRE ────────────────────────────────────────────────────────────────────

export interface ItemDre {
  linha: string
  /** Sempre positivo; o tipo diz se soma ou subtrai. */
  valor: number
  nota: string
}

export type TipoLinhaDre = 'receita' | 'deducao' | 'subtotal' | 'custo' | 'despesa' | 'resultado'

export interface LinhaDre {
  linha: string
  /** Assinado: deduções, custos e despesas são negativos. */
  valor: number
  tipo: TipoLinhaDre
  nota: string
  /** Peso sobre a receita bruta, em % (sempre do valor absoluto). */
  pctBruta: number
}

export interface Dre {
  linhas: LinhaDre[]
  receitaBruta: number
  receitaLiquida: number
  margemContribuicao: number
  resultado: number
  /** Margem de contribuição sobre a receita líquida, em %. */
  margemContribuicaoPct: number
  /** Resultado sobre a receita bruta, em %. */
  margemLiquidaPct: number
}

/**
 * Monta o DRE derivando TODOS os subtotais:
 *
 *   receita líquida        = bruta − deduções
 *   margem de contribuição = líquida − custos variáveis
 *   resultado              = margem − despesas
 *
 * Quem fornece os dados fornece só as linhas primitivas — se um subtotal
 * viesse digitado, ele poderia discordar da própria soma.
 */
export function montarDre(
  receitas: ItemDre | ItemDre[],
  deducoes: ItemDre[],
  custos: ItemDre[],
  despesas: ItemDre[],
): Dre {
  // Uma lista, e não um número só, porque a receita tem mais de uma origem: a
  // loja e a venda de balcão. Colapsar as duas num total esconderia de onde
  // veio o faturamento, que é justamente a pergunta que alguém faz quando o
  // número surpreende.
  const linhasReceita = Array.isArray(receitas) ? receitas : [receitas]
  const bruta = linhasReceita.reduce((a, r) => a + r.valor, 0)
  const liquida = bruta - deducoes.reduce((a, d) => a + d.valor, 0)
  const margem = liquida - custos.reduce((a, c) => a + c.valor, 0)
  const resultado = margem - despesas.reduce((a, d) => a + d.valor, 0)

  const pct = (v: number) => (bruta ? (Math.abs(v) / bruta) * 100 : 0)
  const linha = (
    l: string,
    valor: number,
    tipo: TipoLinhaDre,
    nota: string,
  ): LinhaDre => ({ linha: l, valor, tipo, nota, pctBruta: pct(valor) })

  const margemPctLiquida = liquida ? (margem / liquida) * 100 : 0

  return {
    linhas: [
      ...linhasReceita.map((r) => linha(r.linha, r.valor, 'receita', r.nota)),
      // O subtotal só aparece quando há mais de uma origem: com uma só, ele
      // repetiria a linha de cima com outro nome.
      ...(linhasReceita.length > 1
        ? [linha('Receita bruta', bruta, 'subtotal', 'Loja e vendas fora dela')]
        : []),
      ...deducoes.map((d) => linha(d.linha, -d.valor, 'deducao', d.nota)),
      linha('Receita líquida', liquida, 'subtotal', 'Base das margens líquidas'),
      ...custos.map((c) => linha(c.linha, -c.valor, 'custo', c.nota)),
      linha(
        'Margem de contribuição',
        margem,
        'subtotal',
        `${fmtPct(pct(margem))} da bruta · ${fmtPct(margemPctLiquida)} da líquida`,
      ),
      ...despesas.map((d) => linha(d.linha, -d.valor, 'despesa', d.nota)),
      linha(
        'Resultado líquido',
        resultado,
        'resultado',
        `${fmtPct(pct(resultado))} da bruta · margem líquida de ${fmtPct(liquida ? (resultado / liquida) * 100 : 0)}`,
      ),
    ],
    receitaBruta: bruta,
    receitaLiquida: liquida,
    margemContribuicao: margem,
    resultado,
    margemContribuicaoPct: margemPctLiquida,
    margemLiquidaPct: pct(resultado),
  }
}

/**
 * Ponto de equilíbrio: quanto é preciso faturar (líquido) para a margem de
 * contribuição cobrir a estrutura fixa. Abaixo disso o mês dá prejuízo.
 */
export function pontoEquilibrio(estruturaFixa: number, dre: Dre): number {
  const margemFracao = dre.margemContribuicaoPct / 100
  return margemFracao > 0 ? estruturaFixa / margemFracao : 0
}

function fmtPct(n: number): string {
  return `${(Math.round(n * 10) / 10).toString().replace('.', ',')}%`
}
