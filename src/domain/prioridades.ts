/**
 * "Prioridades agora" — a fila do escopo, §7.1.
 *
 * O escopo é explícito: "O Gerente deve consolidar exceções de todos os módulos
 * e ranqueá-las por urgência, impacto e capacidade de ação. A tela principal
 * deve evitar mostrar dezenas de alertas com o mesmo peso."
 *
 * Duas consequências que mandam neste arquivo. A primeira é que a fila é
 * calculada por REGRA, não pelo modelo: resposta que muda a cada execução não
 * pode ser auditada, e um modelo hierarquiza pelo que soa dramático em vez do
 * que custa dinheiro. A segunda é o teto — cinco itens, como manda §7.2. Fila
 * que mostra tudo tem o mesmo efeito de não mostrar nada.
 *
 * Cada item carrega os SETE campos que §7.1 exige. Não são enfeite: severidade
 * sem impacto financeiro não deixa comparar dois alertas, e impacto sem próxima
 * ação vira reclamação.
 */

/** Escala fechada do escopo §7.1. */
export type Severidade = 'critico' | 'alto' | 'medio' | 'informativo'

/** §7.1: "Qualidade do dado e da detecção." */
export interface Confianca {
  nivel: 'alta' | 'media' | 'baixa'
  motivo: string
}

/** §13.1 — quem tem competência para agir. */
export type Responsavel = 'Dono' | 'Financeiro' | 'Operação' | 'Atendimento'

export interface Prioridade {
  /** Estável entre execuções: permite dizer "isso é o mesmo de ontem". */
  id: string
  titulo: string
  severidade: Severidade
  /** Valor realizado ou estimado, quando aplicável. `null` quando não há. */
  impactoFinanceiro: number | null
  /** Pedidos, clientes ou produtos afetados. */
  impactoOperacional: string
  /** Prazo para ação ou data em que o risco se materializa. */
  urgencia: string
  confianca: Confianca
  responsavel: Responsavel
  proximaAcao: { texto: string; href: string }
}

/** O estado do ERP que as regras leem. Só números já apurados. */
export interface EstadoDaOperacao {
  caixaHoje: number
  diasAteNegativar: number | null
  menorSaldo: number
  menorSaldoEm: string | null
  vencidos: { valor: number; qtd: number }
  aPagar: { valor: number; qtd: number }
  conciliacaoAguardando: { valor: number; qtd: number }
  conciliacaoVencida: { valor: number; qtd: number }
  lancamentosSemCategoria: number
  estoque: {
    nome: string
    marca: string | null
    dias: number | null
    criticidade: string
    disponivelMl: number
    /** Pedidos pagos esperando este ml — é o impacto operacional real. */
    reservadoMl: number
  }[]
  faturamentoAtual: number
  faturamentoAnterior: number
  pedidosAtual: number
  pedidosAnterior: number
  rotuloDoPeriodo: string
  /** Pedidos pagos há mais de 3 dias sem código de rastreio (envio local fora). */
  expedicaoAtrasada?: { qtd: number; valor: number; maisAntigoDias: number }
  /** Rotinas automáticas com o MESMO ponto falhando em rodadas seguidas. */
  rotinasDoentes?: { rotina: string; onde: string; rodadasSeguidas: number; ultimoErro: string }[]
}

const PESO: Record<Severidade, number> = { critico: 0, alto: 1, medio: 2, informativo: 3 }

/** §7.2: "briefing curto com no máximo 5 assuntos prioritários". */
export const TETO_DA_FILA = 5

/**
 * Quanto o faturamento precisa cair para virar item.
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
      titulo: 'O caixa fica negativo dentro do horizonte projetado',
      severidade: e.diasAteNegativar <= 7 ? 'critico' : 'alto',
      impactoFinanceiro: e.menorSaldo,
      impactoOperacional: 'Compra de frasco e pagamento de fornecedor ficam sem lastro.',
      urgencia:
        e.diasAteNegativar === 0
          ? 'O saldo projetado já está negativo hoje.'
          : `Em ${e.diasAteNegativar} ${e.diasAteNegativar === 1 ? 'dia' : 'dias'}` +
            `${e.menorSaldoEm ? `, com o pior ponto em ${e.menorSaldoEm}` : ''}.`,
      confianca: {
        nivel: 'media',
        motivo: 'Projeção sobre contas lançadas; venda futura não está prevista.',
      },
      responsavel: 'Dono',
      proximaAcao: { texto: 'Ver o fluxo projetado', href: '/financeiro/fluxo-de-caixa' },
    })
  }

  if (e.vencidos.qtd > 0) {
    fila.push({
      id: 'contas-vencidas',
      titulo: 'Contas vencidas em aberto',
      severidade: 'critico',
      impactoFinanceiro: -e.vencidos.valor,
      impactoOperacional: `${e.vencidos.qtd} ${e.vencidos.qtd === 1 ? 'título' : 'títulos'} em atraso.`,
      urgencia: 'Já venceu — juro e corte de fornecedor correm agora.',
      confianca: { nivel: 'alta', motivo: 'Vencimento é data lançada, não estimativa.' },
      responsavel: 'Financeiro',
      proximaAcao: { texto: 'Abrir os lançamentos', href: '/financeiro/lancamentos' },
    })
  }

  // ── Dinheiro que vendeu mas não entrou ───────────────────────────────────
  if (e.conciliacaoVencida.qtd > 0) {
    fila.push({
      id: 'conciliacao-vencida',
      titulo: 'Vendas pagas que o gateway não creditou no prazo',
      severidade: 'alto',
      impactoFinanceiro: e.conciliacaoVencida.valor,
      impactoOperacional: `${e.conciliacaoVencida.qtd} ${
        e.conciliacaoVencida.qtd === 1 ? 'venda' : 'vendas'
      } de clientes que já receberam o pedido.`,
      urgencia: 'Passou do prazo de repasse — quanto mais tempo, mais difícil reclamar.',
      confianca: {
        nivel: 'alta',
        motivo: 'Comparação entre venda registrada e crédito no extrato da conta.',
      },
      responsavel: 'Financeiro',
      proximaAcao: { texto: 'Abrir a conciliação', href: '/financeiro/conciliacao' },
    })
  }

  // ── Estoque ──────────────────────────────────────────────────────────────
  //
  // `sem_carga` NUNCA entra na fila. É a base que existe no catálogo e da qual
  // nunca se comprou um frasco: ela não está zerada, está fora do controle de
  // estoque — e é regra da casa não contabilizar estoque de produto sem compra
  // registrada. Sem esta exclusão a fila anunciava "393 bases zeradas", que é
  // o catálogo inteiro, e um alerta que acusa tudo não acusa nada.
  const emOperacao = e.estoque.filter((b) => b.criticidade !== 'sem_carga')

  const zerados = emOperacao.filter((b) => b.criticidade === 'zero' || b.disponivelMl <= 0)
  if (zerados.length > 0) {
    const reservado = Math.round(zerados.reduce((a, b) => a + b.reservadoMl, 0))
    fila.push({
      id: 'estoque-zerado',
      titulo: 'Perfume base sem nada disponível',
      severidade: reservado > 0 ? 'critico' : 'alto',
      impactoFinanceiro: null,
      impactoOperacional:
        reservado > 0
          ? `${nomes(zerados)} · ${reservado} ml já vendidos e sem lastro.`
          : `${nomes(zerados)} · sem venda presa, mas sem poder vender.`,
      urgencia:
        reservado > 0
          ? 'Há pedido pago esperando: o atraso já começou.'
          : 'Antes da próxima campanha que empurrar essas bases.',
      confianca: { nivel: 'alta', motivo: 'Saldo por lote, com as reservas descontadas.' },
      responsavel: 'Operação',
      proximaAcao: { texto: 'Ver o estoque', href: '/estoque' },
    })
  }

  const acabando = emOperacao.filter(
    (b) => b.disponivelMl > 0 && b.dias !== null && b.criticidade === 'urgente',
  )
  if (acabando.length > 0) {
    const menor = acabando.reduce((a, b) => ((b.dias ?? 99) < (a.dias ?? 99) ? b : a))
    fila.push({
      id: 'estoque-urgente',
      titulo: 'Base acaba antes de dar tempo de repor',
      severidade: 'alto',
      impactoFinanceiro: null,
      impactoOperacional: `${acabando.length} ${acabando.length === 1 ? 'base' : 'bases'}: ${nomes(acabando, true)}.`,
      urgencia: `A primeira acaba em ${menor.dias} ${menor.dias === 1 ? 'dia' : 'dias'} no ritmo atual.`,
      confianca: {
        nivel: 'media',
        motivo: 'Cobertura projetada pelo consumo médio; campanha muda o ritmo.',
      },
      responsavel: 'Operação',
      proximaAcao: { texto: 'Ver a cobertura', href: '/estoque' },
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
        titulo: 'Faturamento caiu contra o período anterior',
        severidade: variacao <= -0.4 ? 'alto' : 'medio',
        impactoFinanceiro: e.faturamentoAtual - e.faturamentoAnterior,
        impactoOperacional: `${e.pedidosAtual} pedidos contra ${e.pedidosAnterior} do período anterior.`,
        urgencia: `${e.rotuloDoPeriodo} · queda de ${(Math.abs(variacao) * 100).toFixed(0)}%.`,
        confianca: {
          nivel: 'alta',
          motivo: 'Pedidos pagos pela data da venda, sem cancelados, nos dois períodos.',
        },
        responsavel: 'Dono',
        proximaAcao: { texto: 'Ver o relatório', href: '/relatorios' },
      })
    }
  }

  // ── Expedição ────────────────────────────────────────────────────────────
  // Pedido pago sem rastreio além do SLA de 72 h é cliente esperando algo que
  // ninguém está vendo — foi assim que 8 envios postados pela Frenet ficaram
  // invisíveis por dias: pacote na transportadora, tela em "não processado".
  if (e.expedicaoAtrasada && e.expedicaoAtrasada.qtd > 0) {
    const x = e.expedicaoAtrasada
    fila.push({
      id: 'expedicao-atrasada',
      titulo: 'Pedidos pagos sem rastreio além do prazo de expedição',
      severidade: x.maisAntigoDias >= 7 ? 'critico' : 'alto',
      impactoFinanceiro: x.valor,
      impactoOperacional: `${x.qtd} ${x.qtd === 1 ? 'pedido pago' : 'pedidos pagos'} há mais de 3 dias sem código no ERP.`,
      urgencia: `O mais antigo espera há ${x.maisAntigoDias} ${x.maisAntigoDias === 1 ? 'dia' : 'dias'}. Se já foi postado por fora, falta faturar na Yampi com o código.`,
      confianca: {
        nivel: 'alta',
        motivo: 'Pedidos pagos sem rastreio registrado; entrega local excluída.',
      },
      responsavel: 'Operação',
      proximaAcao: { texto: 'Ver os pedidos', href: '/pedidos' },
    })
  }

  // ── Saúde das rotinas ────────────────────────────────────────────────────
  // O mesmo ponto falhando em rodadas seguidas é integração quebrada — e
  // rotina que falha em silêncio é pior que desligada, porque parece cobrir.
  if (e.rotinasDoentes && e.rotinasDoentes.length > 0) {
    const pior = e.rotinasDoentes[0]
    const pontos = e.rotinasDoentes.slice(0, 3).map((d) => `${d.rotina} · ${d.onde}`)
    const sobra = e.rotinasDoentes.length - pontos.length
    fila.push({
      id: 'rotina-com-erro',
      titulo: 'Rotina automática falhando repetidamente',
      severidade: 'alto',
      impactoFinanceiro: null,
      impactoOperacional: `${pontos.join(', ')}${sobra > 0 ? ` e mais ${sobra}` : ''}.`,
      urgencia: `O mesmo erro se repete há ${pior.rodadasSeguidas} rodadas: ${pior.ultimoErro.slice(0, 120)}`,
      confianca: { nivel: 'alta', motivo: 'Relatórios das próprias rodadas, persistidos a cada execução.' },
      responsavel: 'Dono',
      proximaAcao: { texto: 'Ver as integrações', href: '/configuracoes/integracoes' },
    })
  }

  // ── Higiene do dado ──────────────────────────────────────────────────────
  // Informativo de propósito: não custa dinheiro hoje, mas é o que faz a DRE
  // mentir no fechamento.
  if (e.lancamentosSemCategoria > 0) {
    fila.push({
      id: 'sem-categoria',
      titulo: 'Lançamentos que a DRE não classifica',
      severidade: 'informativo',
      impactoFinanceiro: null,
      impactoOperacional: `${e.lancamentosSemCategoria} ${
        e.lancamentosSemCategoria === 1 ? 'lançamento fica' : 'lançamentos ficam'
      } fora do resultado por competência.`,
      urgencia: 'Antes de fechar o mês.',
      confianca: { nivel: 'alta', motivo: 'Contagem direta; transferências entre contas já excluídas.' },
      responsavel: 'Financeiro',
      proximaAcao: { texto: 'Classificar', href: '/financeiro/lancamentos' },
    })
  }

  return fila
    .sort((a, b) => {
      const p = PESO[a.severidade] - PESO[b.severidade]
      if (p !== 0) return p
      // Empate na severidade: decide o dinheiro em jogo, do maior para o menor.
      return Math.abs(b.impactoFinanceiro ?? 0) - Math.abs(a.impactoFinanceiro ?? 0)
    })
    .slice(0, TETO_DA_FILA)
}

// ── Briefing executivo (§7.2) ──────────────────────────────────────────────

/**
 * "O que mudou", "O que exige ação", "O que acompanhar".
 *
 * As três seções são do escopo, e a divisão não é estética: a primeira é
 * notícia, a segunda é trabalho e a terceira é vigilância. Misturá-las é o que
 * transforma briefing em lista de alertas — que §7.2 proíbe em outras palavras:
 * "não deve repetir indicadores estáveis sem motivo".
 */
export interface Briefing {
  mudou: string[]
  exigeAcao: string[]
  acompanhar: string[]
}

export function briefingDe(e: EstadoDaOperacao, fila: Prioridade[]): Briefing {
  const mudou: string[] = []

  if (e.faturamentoAnterior > 0) {
    const variacao = (e.faturamentoAtual - e.faturamentoAnterior) / e.faturamentoAnterior
    // Só é notícia se saiu do normal. Repetir "vendeu igual" todo dia é
    // exatamente o que o escopo manda não fazer.
    if (Math.abs(variacao) >= 0.1 && e.faturamentoAnterior >= BASE_MINIMA_PARA_COMPARAR) {
      mudou.push(
        `${e.rotuloDoPeriodo}: ${reais(e.faturamentoAtual)} em ${e.pedidosAtual} pedidos, ` +
          `${variacao > 0 ? 'alta' : 'queda'} de ${(Math.abs(variacao) * 100).toFixed(0)}% contra o período anterior.`,
      )
    }
  }

  if (e.conciliacaoAguardando.qtd > 0) {
    mudou.push(
      `${reais(e.conciliacaoAguardando.valor)} em ${e.conciliacaoAguardando.qtd} ` +
        `${e.conciliacaoAguardando.qtd === 1 ? 'venda' : 'vendas'} ainda dentro do prazo de repasse do gateway.`,
    )
  }

  // Só o que exige trabalho humano vai para a segunda seção. Informativo não é
  // ação: quem trata informativo como pendência para de distinguir os dois.
  const exigeAcao = fila
    .filter((p) => p.severidade !== 'informativo')
    .map((p) => `${p.titulo} — ${p.urgencia}`)

  const acompanhar: string[] = fila
    .filter((p) => p.severidade === 'informativo')
    .map((p) => `${p.titulo}: ${p.impactoOperacional}`)

  if (e.aPagar.qtd > 0) {
    acompanhar.push(
      `${reais(e.aPagar.valor)} a pagar em ${e.aPagar.qtd} ` +
        `${e.aPagar.qtd === 1 ? 'título' : 'títulos'}, com ${reais(e.caixaHoje)} em caixa.`,
    )
  }

  // O teto do escopo vale para o briefing inteiro, não por seção: cinco
  // assuntos é o que uma pessoa lê antes de começar a trabalhar.
  return limitar({ mudou, exigeAcao, acompanhar }, TETO_DA_FILA)
}

/** Corta pelo total, preservando a ordem de importância entre as seções. */
function limitar(b: Briefing, teto: number): Briefing {
  const saida: Briefing = { mudou: [], exigeAcao: [], acompanhar: [] }
  let resta = teto
  // "Exige ação" tem prioridade sobre "mudou", e "mudou" sobre "acompanhar":
  // se só couber uma linha, ela precisa ser a que pede trabalho.
  for (const item of b.exigeAcao) {
    if (resta-- <= 0) break
    saida.exigeAcao.push(item)
  }
  for (const item of b.mudou) {
    if (resta-- <= 0) break
    saida.mudou.push(item)
  }
  for (const item of b.acompanhar) {
    if (resta-- <= 0) break
    saida.acompanhar.push(item)
  }
  return saida
}

/** Resumo de uma linha para o topo da tela. */
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

export const ROTULO_DA_SEVERIDADE: Record<Severidade, string> = {
  critico: 'Crítico',
  alto: 'Alto',
  medio: 'Médio',
  informativo: 'Informativo',
}

function reais(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Até três nomes; o resto vira contagem, porque lista longa ninguém lê. */
function nomes(bases: { nome: string; dias: number | null }[], comDias = false): string {
  const primeiros = bases.slice(0, 3).map((b) => {
    if (!comDias || b.dias === null) return b.nome
    return `${b.nome} (${b.dias} ${b.dias === 1 ? 'dia' : 'dias'})`
  })
  const sobra = bases.length - primeiros.length
  return sobra > 0 ? `${primeiros.join(', ')} e mais ${sobra}` : primeiros.join(', ')
}
