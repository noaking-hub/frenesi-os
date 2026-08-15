/**
 * O que exige decisão hoje — apurado por REGRA, não por modelo.
 *
 * A tentação óbvia num módulo de IA é perguntar ao modelo "o que é urgente?".
 * Isso seria errado por três motivos que importam num ERP financeiro: a
 * resposta muda de uma execução para outra, ninguém consegue auditar o
 * critério, e o modelo hierarquiza pelo que soa dramático em vez do que custa
 * dinheiro. Aqui a fila é calculada por regras fixas sobre números que o ERP
 * já apurou; a IA entra depois, só para redigir o que a regra achou.
 *
 * Cada regra tem que responder três coisas: o que está errado, quanto custa,
 * e onde se resolve. Item sem número é opinião, e item sem link é reclamação.
 */

export type Severidade = 'critico' | 'alto' | 'medio'

export interface Prioridade {
  /** Estável entre execuções: é o que permite dizer "isso é o mesmo de ontem". */
  id: string
  severidade: Severidade
  titulo: string
  /** A frase com o número. Sem número, o item não entra na fila. */
  detalhe: string
  /** Onde se resolve. */
  href: string
  acao: string
  /** Quanto está em jogo, quando dá para dizer em reais. */
  valor?: number
}

/** O estado do ERP que as regras leem. Só números já apurados. */
export interface EstadoDaOperacao {
  caixaHoje: number
  diasAteNegativar: number | null
  menorSaldo: number
  menorSaldoEm: string | null
  vencidos: { valor: number; qtd: number }
  aPagar: { valor: number; qtd: number }
  conciliacaoSemCredito: { valor: number; qtd: number }
  /** Vendas sem crédito cujo prazo de repasse já passou — essas exigem ação. */
  conciliacaoVencida: { valor: number; qtd: number }
  lancamentosSemCategoria: number
  estoque: {
    nome: string
    marca: string | null
    dias: number | null
    criticidade: string
    disponivelMl: number
  }[]
  faturamentoAtual: number
  faturamentoAnterior: number
  rotuloDoPeriodo: string
}

/** Ordem de exibição: o que dói mais primeiro. */
const PESO: Record<Severidade, number> = { critico: 0, alto: 1, medio: 2 }

/**
 * Quanto o faturamento precisa cair para virar item de fila.
 *
 * 20% e não 5%: venda oscila, e uma fila que acende a cada respiro deixa de
 * ser lida. O alerta que aparece todo dia é igual a alerta nenhum.
 */
const QUEDA_QUE_IMPORTA = 0.2

/** Faturamento mínimo do período anterior para a comparação significar algo. */
const BASE_MINIMA_PARA_COMPARAR = 500

export function prioridadesDe(e: EstadoDaOperacao): Prioridade[] {
  const fila: Prioridade[] = []

  // ── Caixa ────────────────────────────────────────────────────────────────
  if (e.diasAteNegativar !== null) {
    fila.push({
      id: 'caixa-negativa',
      severidade: e.diasAteNegativar <= 7 ? 'critico' : 'alto',
      titulo: 'O caixa fica negativo antes do fim do horizonte',
      detalhe:
        e.diasAteNegativar === 0
          ? `O saldo projetado já está negativo hoje, e chega a ${reais(e.menorSaldo)} no pior dia.`
          : `Faltam ${e.diasAteNegativar} ${e.diasAteNegativar === 1 ? 'dia' : 'dias'} para o saldo ficar negativo` +
            `${e.menorSaldoEm ? `, com o pior ponto em ${e.menorSaldoEm}` : ''} (${reais(e.menorSaldo)}).`,
      href: '/financeiro/fluxo-de-caixa',
      acao: 'Ver o fluxo projetado',
      valor: e.menorSaldo,
    })
  }

  if (e.vencidos.qtd > 0) {
    fila.push({
      id: 'contas-vencidas',
      severidade: 'critico',
      titulo: 'Contas vencidas em aberto',
      detalhe: `${e.vencidos.qtd} ${e.vencidos.qtd === 1 ? 'conta venceu' : 'contas venceram'} e ${
        e.vencidos.qtd === 1 ? 'não foi paga' : 'não foram pagas'
      }: ${reais(e.vencidos.valor)}.`,
      href: '/financeiro/lancamentos',
      acao: 'Abrir os lançamentos',
      valor: e.vencidos.valor,
    })
  }

  // ── Dinheiro que vendeu mas não entrou ───────────────────────────────────
  if (e.conciliacaoVencida.qtd > 0) {
    fila.push({
      id: 'conciliacao-vencida',
      severidade: 'alto',
      titulo: 'Vendas pagas que o gateway não creditou no prazo',
      detalhe: `${e.conciliacaoVencida.qtd} ${
        e.conciliacaoVencida.qtd === 1 ? 'venda passou' : 'vendas passaram'
      } do prazo de repasse sem crédito na conta: ${reais(e.conciliacaoVencida.valor)}.`,
      href: '/financeiro/conciliacao',
      acao: 'Abrir a conciliação',
      valor: e.conciliacaoVencida.valor,
    })
  }

  // ── Estoque ──────────────────────────────────────────────────────────────
  //
  // `sem_carga` NUNCA entra na fila. É a base que existe no catálogo e da qual
  // nunca se comprou um frasco: ela não está zerada, ela está fora do controle
  // de estoque — e é regra da casa não contabilizar estoque de produto sem
  // compra registrada. Sem esta exclusão a fila anunciava "393 bases zeradas",
  // que é o catálogo inteiro, e um alerta que acusa tudo não acusa nada.
  const emOperacao = e.estoque.filter((b) => b.criticidade !== 'sem_carga')

  // Zerado e "acaba antes de repor" são problemas diferentes e viram itens
  // diferentes: um já custa venda perdida, o outro ainda dá para evitar.
  const zerados = emOperacao.filter((b) => b.criticidade === 'zero' || b.disponivelMl <= 0)
  if (zerados.length > 0) {
    fila.push({
      id: 'estoque-zerado',
      severidade: 'critico',
      titulo: 'Perfume base sem nada disponível',
      detalhe: `${zerados.length} ${zerados.length === 1 ? 'base está zerada' : 'bases estão zeradas'}: ${nomes(zerados)}.`,
      href: '/estoque',
      acao: 'Ver o estoque',
    })
  }

  const acabando = emOperacao.filter(
    (b) => b.disponivelMl > 0 && b.dias !== null && b.criticidade === 'urgente',
  )
  if (acabando.length > 0) {
    fila.push({
      id: 'estoque-urgente',
      severidade: 'alto',
      titulo: 'Base acaba antes de dar tempo de repor',
      detalhe: `${acabando.length} ${acabando.length === 1 ? 'base tem' : 'bases têm'} cobertura curta: ${nomes(acabando, true)}.`,
      href: '/estoque',
      acao: 'Ver a cobertura',
    })
  }

  // ── Queda de venda ───────────────────────────────────────────────────────
  // Só compara contra uma base que signifique alguma coisa: -100% sobre R$ 80
  // do período anterior é ruído, não sinal.
  if (e.faturamentoAnterior >= BASE_MINIMA_PARA_COMPARAR) {
    const variacao = (e.faturamentoAtual - e.faturamentoAnterior) / e.faturamentoAnterior
    if (variacao <= -QUEDA_QUE_IMPORTA) {
      fila.push({
        id: 'queda-de-faturamento',
        severidade: variacao <= -0.4 ? 'alto' : 'medio',
        titulo: 'Faturamento caiu contra o período anterior',
        detalhe:
          `${e.rotuloDoPeriodo}: ${reais(e.faturamentoAtual)} contra ${reais(e.faturamentoAnterior)} ` +
          `do período anterior — queda de ${(Math.abs(variacao) * 100).toFixed(0)}%.`,
        href: '/relatorios',
        acao: 'Ver o relatório',
        valor: e.faturamentoAtual - e.faturamentoAnterior,
      })
    }
  }

  // ── Higiene do dado ──────────────────────────────────────────────────────
  // Entra por último e como 'medio' de propósito: não custa dinheiro hoje,
  // mas é o que faz a DRE mentir no fechamento.
  if (e.lancamentosSemCategoria > 0) {
    fila.push({
      id: 'sem-categoria',
      severidade: 'medio',
      titulo: 'Lançamentos que a DRE não classifica',
      detalhe: `${e.lancamentosSemCategoria} ${
        e.lancamentosSemCategoria === 1 ? 'lançamento está' : 'lançamentos estão'
      } sem categoria e ficam fora do resultado por competência.`,
      href: '/financeiro/lancamentos',
      acao: 'Classificar',
    })
  }

  return fila.sort((a, b) => {
    const p = PESO[a.severidade] - PESO[b.severidade]
    if (p !== 0) return p
    // Empate na severidade: decide o dinheiro em jogo, do maior para o menor.
    return Math.abs(b.valor ?? 0) - Math.abs(a.valor ?? 0)
  })
}

/** Resumo de uma linha para o topo da tela e para o briefing. */
export function resumoDaFila(fila: Prioridade[]): string {
  if (fila.length === 0) return 'Nada exige decisão agora.'
  const criticos = fila.filter((p) => p.severidade === 'critico').length
  if (criticos > 0) {
    return `${criticos} ${criticos === 1 ? 'item crítico' : 'itens críticos'} e ${fila.length - criticos} ${
      fila.length - criticos === 1 ? 'outro' : 'outros'
    } na fila.`
  }
  return `${fila.length} ${fila.length === 1 ? 'item' : 'itens'} para decidir, nenhum crítico.`
}

function reais(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Até três nomes; o resto vira contagem, porque lista longa ninguém lê. */
function nomes(
  bases: { nome: string; dias: number | null }[],
  comDias = false,
): string {
  const primeiros = bases.slice(0, 3).map((b) => {
    if (!comDias || b.dias === null) return b.nome
    return `${b.nome} (${b.dias} ${b.dias === 1 ? 'dia' : 'dias'})`
  })
  const sobra = bases.length - primeiros.length
  return sobra > 0 ? `${primeiros.join(', ')} e mais ${sobra}` : primeiros.join(', ')
}
