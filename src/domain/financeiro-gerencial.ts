/**
 * Financeiro gerencial: os dois regimes, e as regras que os mantêm separados.
 *
 * O módulo inteiro nasce de uma distinção: **caixa** é quando o dinheiro se
 * move, **competência** é quando o fato econômico acontece. A venda de 30 de
 * agosto que o gateway paga em 15 de setembro é resultado de agosto e caixa de
 * setembro. Misturar os dois é o que fazia o Financeiro antigo somar a mesma
 * venda duas vezes — uma no pedido, outra no crédito.
 *
 * Aqui ficam só as regras. Quem lê o banco é `src/data/financeiro.ts`; quem
 * desenha é a tela. Nenhum subtotal é digitado: todos saem das linhas.
 */

// ── Naturezas gerenciais ───────────────────────────────────────────────────

/**
 * Rótulo do grupo que junta o que ainda não foi classificado.
 *
 * Existe como constante, e não como texto solto em cada tela, porque três
 * lugares agrupam por categoria e um deles escrevendo diferente criaria dois
 * grupos para a mesma coisa no mesmo relatório.
 */
export const SEM_CATEGORIA = 'Sem categoria'

/**
 * Onde a categoria entra no resultado. É o campo que decide se um pagamento
 * vira despesa, custo do produto, investimento — ou nada disso.
 */
export type NaturezaGerencial =
  | 'receita_operacional'
  | 'deducao_receita'
  | 'cmv'
  | 'despesa_fixa'
  | 'despesa_comercial'
  | 'despesa_administrativa'
  | 'despesa_financeira'
  | 'investimento'
  | 'transferencia'
  | 'aporte_retirada'

export const ROTULO_NATUREZA: Record<NaturezaGerencial, string> = {
  receita_operacional: 'Receita operacional',
  deducao_receita: 'Dedução da receita',
  cmv: 'CMV / custo variável',
  despesa_fixa: 'Despesa fixa',
  despesa_comercial: 'Despesa comercial',
  despesa_administrativa: 'Despesa administrativa',
  despesa_financeira: 'Despesa financeira',
  investimento: 'Investimento / ativo',
  transferencia: 'Transferência',
  aporte_retirada: 'Aporte / retirada',
}

/**
 * Naturezas que NÃO passam pelo resultado.
 *
 * Transferência move dinheiro entre bolsos e aporte é patrimônio do sócio —
 * nenhum dos dois é ganho nem gasto da operação. Deixá-los na DRE inflaria
 * receita e despesa no mesmo mês, com resultado final igual e todas as
 * margens erradas.
 */
export function impactaResultado(n: NaturezaGerencial): boolean {
  return n !== 'transferencia' && n !== 'aporte_retirada' && n !== 'investimento'
}

/** Naturezas de saída — usado para colorir e para somar despesas. */
export function ehSaida(n: NaturezaGerencial): boolean {
  return (
    n === 'cmv' ||
    n === 'despesa_fixa' ||
    n === 'despesa_comercial' ||
    n === 'despesa_administrativa' ||
    n === 'despesa_financeira' ||
    n === 'deducao_receita'
  )
}

export interface CategoriaGerencial {
  id: string
  nome: string
  natureza: NaturezaGerencial
  impactaDre: boolean
  impactaCaixa: boolean
  exigeDocumento: boolean
  usarEmAutomacao: boolean
  contaContabil: string
  centroCusto: string | null
  ativa: boolean
  /** Quantos lançamentos já usam — categoria em uso não se apaga. */
  emUso: number
}

/** Categoria usada não pode ser excluída; inativar preserva o histórico. */
export function podeExcluirCategoria(c: CategoriaGerencial): boolean {
  return c.emUso === 0
}

// ── Lançamentos ────────────────────────────────────────────────────────────

export type TipoLancamento =
  | 'conta_pagar'
  | 'conta_receber'
  | 'provisao'
  | 'despesa_recorrente'
  | 'receita_recorrente'
  | 'parcelamento'
  | 'imposto_provisionado'
  | 'aporte_retirada'
  | 'transferencia'
  | 'ajuste'

export type SituacaoLancamento =
  | 'previsto'
  | 'agendado'
  | 'vencido'
  | 'parcial'
  | 'liquidado'
  | 'cancelado'

export const ROTULO_SITUACAO_LANCAMENTO: Record<SituacaoLancamento, string> = {
  previsto: 'Previsto',
  agendado: 'Agendado',
  vencido: 'Vencido',
  parcial: 'Parcial',
  liquidado: 'Liquidado',
  cancelado: 'Cancelado',
}

export interface LancamentoGerencial {
  id: string
  descricao: string
  favorecido: string | null
  tipo: 'entrada' | 'saida'
  categoriaId: string | null
  /** Nulo quando o lançamento veio do extrato e ninguém classificou ainda. */
  categoria: string | null
  natureza: NaturezaGerencial | null
  centroCusto: string | null
  contaId: string
  conta: string
  /** Data do fato econômico — a DRE usa esta. */
  competencia: string
  /**
   * O dia em que o dinheiro se moveu — ou vai se mover.
   *
   * É a única data que TODO lançamento tem. `venceEm` só existe para
   * compromisso agendado (21 de 1.244 na base real) e `baixadoEm` só depois da
   * baixa; ordenar ou filtrar por qualquer uma das duas joga fora quase tudo.
   * Uma lista de "o que entrou e saiu" precisa de uma data que nunca falte, e
   * esta é ela.
   */
  ocorridoEm: string
  /** Data esperada da baixa — a projeção usa esta. */
  venceEm: string | null
  /** Data efetiva da baixa — o caixa usa esta. */
  baixadoEm: string | null
  valor: number
  recebido: number
  multa: number
  juros: number
  desconto: number
  parcela: number | null
  parcelas: number | null
  recorrente: boolean
  recorrencia: string | null
  origem: string
  documento: string | null
  observacao: string | null
  transferenciaId: string | null
  canceladoEm: string | null
  /**
   * O que a categoria deixa entrar em cada regime.
   *
   * Vêm da categoria, não do lançamento, e viajam junto porque é o que separa
   * dinheiro de contabilidade: uma transferência entre contas próprias move
   * caixa nas duas pontas e não é despesa em lugar nenhum. Sem estes dois
   * campos aqui, cada tela tinha de reabrir `categorias_financeiras` para
   * saber disso — e, quando não reabria, "Transferências" aparecia como a
   * maior despesa do mês.
   *
   * Sem categoria, o padrão é `true` nos dois: um movimento não classificado
   * é dinheiro de verdade que ainda não foi explicado, não dinheiro a ignorar.
   */
  impactaDre: boolean
  impactaCaixa: boolean
}

/**
 * É movimentação interna? (dinheiro trocando de bolso, não saindo dele)
 *
 * Duas marcas, porque as duas aparecem sozinhas na base: `transferenciaId`
 * existe desde a importação do extrato, e a categoria `impactaCaixa = false`
 * cobre o que foi classificado à mão sem par. Qualquer uma das duas basta
 * para o lançamento não ser despesa nem receita.
 */
export function movimentacaoInterna(l: LancamentoGerencial): boolean {
  return l.transferenciaId !== null || !l.impactaCaixa
}

/**
 * A janela de "contas a pagar": o mesmo dia do mês seguinte.
 *
 * Trinta dias corridos parecem equivalentes e não são. As parcelas da
 * operação caem todas no dia 16; em 16/08 uma janela de trinta dias termina
 * em 15/09 e deixa a parcela de 16/09 de fora por um dia — o card anunciaria
 * "R$ 0,00 a pagar" na véspera de uma parcela. Um mês à frente é o horizonte
 * de quem paga mensalidade, e nunca perde a parcela seguinte.
 *
 * O `Math.min` com o último dia do mês de destino cuida do transbordo que o
 * `setMonth(+1)` do JavaScript produz: 31/01 viraria 03/03; aqui vira 28/02,
 * que é quando o boleto de fim de mês realmente vence.
 */
export function mesmoDiaNoProximoMes(dia: string): string {
  const [ano, mes, d] = dia.split('-').map(Number)
  const alvoAno = mes === 12 ? ano + 1 : ano
  const alvoMes = mes === 12 ? 1 : mes + 1
  const ultimoDia = new Date(Date.UTC(alvoAno, alvoMes, 0)).getUTCDate()
  return `${alvoAno}-${String(alvoMes).padStart(2, '0')}-${String(Math.min(d, ultimoDia)).padStart(2, '0')}`
}

/** O que ainda falta movimentar. Nunca negativo. */
export function saldoAberto(l: LancamentoGerencial): number {
  return Math.max(0, arredonda(l.valor + l.multa + l.juros - l.desconto - l.recebido))
}

/**
 * A situação sai dos fatos e da data de hoje — nunca de um campo gravado.
 *
 * Guardar "a pagar" numa coluna faria a conta vencer à meia-noite sem ninguém
 * tocar nela, e a tela mostraria "agendado" no dia seguinte ao vencimento.
 */
export function situacaoDe(l: LancamentoGerencial, hoje: string): SituacaoLancamento {
  if (l.canceladoEm) return 'cancelado'
  if (saldoAberto(l) <= 0) return 'liquidado'
  if (l.recebido > 0) return 'parcial'
  if (!l.venceEm) return 'previsto'
  return l.venceEm < hoje ? 'vencido' : 'agendado'
}

/**
 * Baixa parcial mantém o saldo remanescente correto.
 *
 * O caso que quebra implementações ingênuas: pagar R$ 400 de uma conta de
 * R$ 1.000 não pode virar "pago" (afirma que saíram mil) nem continuar "a
 * pagar" pelo valor cheio (esconde os 400 que já saíram).
 */
export function aplicarBaixa(
  l: LancamentoGerencial,
  valor: number,
  data: string,
): LancamentoGerencial {
  const recebido = arredonda(Math.min(l.recebido + valor, l.valor + l.multa + l.juros - l.desconto))
  return {
    ...l,
    recebido,
    baixadoEm: recebido >= arredonda(l.valor + l.multa + l.juros - l.desconto) ? data : l.baixadoEm,
  }
}

// ── Contas e qualidade do saldo ────────────────────────────────────────────

export type OrigemSaldo = 'api' | 'informado' | 'calculado'

export const ROTULO_ORIGEM_SALDO: Record<OrigemSaldo, string> = {
  api: 'Lido via integração',
  informado: 'Informado manualmente',
  calculado: 'Calculado pelo ERP',
}

export interface ContaFinanceira {
  id: string
  nome: string
  tipo: string
  banco: string
  finalidade: string | null
  principal: boolean
  ativa: boolean
  origemSaldo: OrigemSaldo
  saldoDisponivel: number
  saldoALiquidar: number
  saldoBloqueado: number
  saldoCalculado: number
  saldoInformado: number
  /**
   * A DATA a que o saldo informado se refere — o fechamento daquele dia.
   *
   * Não confundir com a hora em que alguém clicou em salvar, que é auditoria.
   * É esta data que decide o que soma por cima: tudo o que foi baixado DEPOIS
   * dela. Sem ela, o saldo informado congelava a conta para sempre, e a tela
   * exibia saídas de 30 dias ao lado de um saldo que nunca as sentiu.
   */
  saldoInformadoPara: string | null
  /** Quantos lançamentos já andaram desde a data de referência. */
  movimentosDesdeOInformado: number
  entradas30d: number
  saidas30d: number
  sincronizadoEm: string | null
  sincronizacaoStatus: string | null
  cor: string | null
}

/**
 * A diferença entre o que a conta diz e o que o ERP calculou.
 *
 * `null` quando não há como comparar — conta sem saldo externo não tem
 * divergência, tem ausência de informação, e as duas coisas não se parecem.
 */
export function divergenciaDeSaldo(c: ContaFinanceira): number | null {
  if (c.origemSaldo === 'calculado') return null
  return arredonda(c.saldoInformado - c.saldoCalculado)
}

/** Fatia desta conta no caixa consolidado, em %. */
export function concentracao(c: ContaFinanceira, contas: ContaFinanceira[]): number {
  const total = contas.reduce((a, x) => a + x.saldoDisponivel, 0)
  return total > 0 ? (c.saldoDisponivel / total) * 100 : 0
}

/** Horas desde a última leitura. `null` quando nunca sincronizou. */
export function horasDesdeSincronia(c: ContaFinanceira, agora: number): number | null {
  if (!c.sincronizadoEm) return null
  return Math.floor((agora - Date.parse(c.sincronizadoEm)) / 3_600_000)
}

// ── Fluxo de caixa ─────────────────────────────────────────────────────────

export interface DiaDeCaixa {
  dia: string
  entradas: number
  saidas: number
  realizado: boolean
  /** Saldo acumulado ao fim do dia, calculado pela projeção. */
  saldo: number
}

export interface ProjecaoDeCaixa {
  dias: DiaDeCaixa[]
  saldoInicial: number
  saldoFinal: number
  entradasPrevistas: number
  saidasPrevistas: number
  /** O pior momento do horizonte — é ele que decide se há risco. */
  menorSaldo: number
  menorSaldoEm: string | null
  /** Dias até o saldo ficar negativo. `null` quando não fica. */
  diasAteNegativar: number | null
  risco: 'alto' | 'medio' | 'baixo'
}

/**
 * Projeta o caixa dia a dia a partir do saldo de hoje.
 *
 * O que importa não é o saldo do fim do período — é o MENOR saldo do caminho.
 * Terminar o mês positivo não ajuda quem não tem dinheiro no dia 23, e é
 * exatamente esse ponto que a projeção precisa antecipar.
 */
export function projetarCaixa(saldoInicial: number, dias: Omit<DiaDeCaixa, 'saldo'>[]): ProjecaoDeCaixa {
  let acumulado = saldoInicial
  let menor = saldoInicial
  let menorEm: string | null = null
  let primeiroNegativo: number | null = null

  const comSaldo: DiaDeCaixa[] = dias.map((d, i) => {
    acumulado = arredonda(acumulado + d.entradas - d.saidas)
    if (acumulado < menor) {
      menor = acumulado
      menorEm = d.dia
    }
    if (acumulado < 0 && primeiroNegativo === null) primeiroNegativo = i
    return { ...d, saldo: acumulado }
  })

  const previstos = comSaldo.filter((d) => !d.realizado)

  return {
    dias: comSaldo,
    saldoInicial,
    saldoFinal: acumulado,
    entradasPrevistas: arredonda(previstos.reduce((a, d) => a + d.entradas, 0)),
    saidasPrevistas: arredonda(previstos.reduce((a, d) => a + d.saidas, 0)),
    menorSaldo: menor,
    menorSaldoEm: menorEm,
    diasAteNegativar: primeiroNegativo,
    risco: menor < 0 ? 'alto' : menor < saldoInicial * 0.2 ? 'medio' : 'baixo',
  }
}

/** Quantos dias o caixa de hoje cobre no ritmo de saída do período. */
export function coberturaDeCaixa(saldo: number, saidasNoPeriodo: number, dias: number): number | null {
  const porDia = dias > 0 ? saidasNoPeriodo / dias : 0
  if (porDia <= 0) return null
  return Math.floor(saldo / porDia)
}

// ── DRE gerencial ──────────────────────────────────────────────────────────

export interface LinhaDreGerencial {
  linha: string
  valor: number
  /** Subtotais e resultado ganham peso visual e barra separadora. */
  destaque: boolean
  /** Sobre a receita LÍQUIDA, que é a base de comparação do varejo. */
  pctReceita: number
  /** Mesmo mês do período anterior, para a coluna de variação. */
  anterior: number
  variacao: number
  variacaoPct: number
}

export interface DreGerencial {
  competencia: string
  linhas: LinhaDreGerencial[]
  receitaBruta: number
  receitaLiquida: number
  margemContribuicao: number
  resultado: number
  margemContribuicaoPct: number
  margemLiquidaPct: number
  /** Faturamento líquido necessário para cobrir a estrutura fixa. */
  pontoEquilibrio: number
}

/**
 * Monta a DRE a partir das linhas cruas do banco, casando com o mês anterior.
 *
 * O banco entrega os valores já assinados (deduções negativas). A função
 * calcula percentuais e variações — e a base do percentual é a receita
 * LÍQUIDA, não a bruta: comparar despesa com um faturamento que inclui
 * imposto e devolução infla a margem aparente.
 */
export function montarDreGerencial(
  competencia: string,
  atual: { linha: string; valor: number; destaque: boolean }[],
  anterior: { linha: string; valor: number }[],
  estruturaFixa = 0,
): DreGerencial {
  const anteriorPor = new Map(anterior.map((l) => [l.linha, l.valor]))
  const valorDe = (nome: string) => atual.find((l) => l.linha === nome)?.valor ?? 0

  const receitaBruta = valorDe('Receita bruta')
  const receitaLiquida = valorDe('= Receita líquida')
  const margem = valorDe('= Margem de contribuição')
  const resultado = valorDe('= Resultado gerencial')

  const linhas: LinhaDreGerencial[] = atual.map((l) => {
    const ant = anteriorPor.get(l.linha) ?? 0
    const variacao = arredonda(l.valor - ant)
    return {
      ...l,
      pctReceita: receitaLiquida !== 0 ? (l.valor / receitaLiquida) * 100 : 0,
      anterior: ant,
      variacao,
      variacaoPct: ant !== 0 ? (variacao / Math.abs(ant)) * 100 : 0,
    }
  })

  const margemPct = receitaLiquida !== 0 ? (margem / receitaLiquida) * 100 : 0

  return {
    competencia,
    linhas,
    receitaBruta,
    receitaLiquida,
    margemContribuicao: margem,
    resultado,
    margemContribuicaoPct: margemPct,
    margemLiquidaPct: receitaLiquida !== 0 ? (resultado / receitaLiquida) * 100 : 0,
    // Sem margem de contribuição positiva não existe ponto de equilíbrio:
    // vender mais aumentaria o prejuízo, e um número aqui sugeriria o oposto.
    pontoEquilibrio: margemPct > 0 ? arredonda(estruturaFixa / (margemPct / 100)) : 0,
  }
}

// ── Alertas ────────────────────────────────────────────────────────────────

export type SeveridadeAlerta = 'critico' | 'atencao' | 'informativo'

export interface AlertaFinanceiro {
  id: string
  severidade: SeveridadeAlerta
  titulo: string
  detalhe: string
  /** Para onde o alerta leva. Alerta sem ação é ruído. */
  href: string
  valor?: number
}

/**
 * Os alertas do escopo §14, derivados dos números — nunca cadastrados.
 *
 * A regra que os torna úteis: cada um abre o registro que precisa de decisão.
 * Um alerta que só informa vira paisagem depois da segunda vez.
 */
export function alertasFinanceiros(dados: {
  projecao: ProjecaoDeCaixa
  vencidos: { quantidade: number; valor: number }
  semCategoria: number
  conciliacaoPendente: number
  contasDesatualizadas: { nome: string; horas: number }[]
  chargebacksSemJustificativa: number
  competenciaAberta: string | null
  /** Saques do gateway sem destino declarado — ver `carregarFilaDeDestino`. */
  repassesSemDestino?: { quantidade: number; valor: number }
}): AlertaFinanceiro[] {
  const alertas: AlertaFinanceiro[] = []

  if (dados.projecao.menorSaldo < 0 && dados.projecao.menorSaldoEm) {
    alertas.push({
      id: 'caixa-negativo',
      severidade: 'critico',
      titulo: 'Saldo projetado fica negativo',
      detalhe: `Em ${diaCurtoPt(dados.projecao.menorSaldoEm)}, chegando a ${brlSimples(dados.projecao.menorSaldo)}`,
      href: '/financeiro/fluxo-de-caixa',
      valor: dados.projecao.menorSaldo,
    })
  }

  if (dados.vencidos.quantidade > 0) {
    alertas.push({
      id: 'vencidos',
      severidade: 'critico',
      titulo: `${dados.vencidos.quantidade} ${dados.vencidos.quantidade === 1 ? 'obrigação vencida' : 'obrigações vencidas'}`,
      detalhe: `${brlSimples(dados.vencidos.valor)} em atraso`,
      href: '/financeiro/lancamentos?situacao=vencido',
      valor: dados.vencidos.valor,
    })
  }

  if (dados.conciliacaoPendente > 0) {
    alertas.push({
      id: 'conciliacao',
      severidade: 'atencao',
      titulo: `${dados.conciliacaoPendente} ${dados.conciliacaoPendente === 1 ? 'venda exige' : 'vendas exigem'} decisão`,
      detalhe: 'Divergência de taxa, venda sem crédito ou estorno',
      href: '/financeiro/conciliacao',
    })
  }

  // Antes de "sem categoria" porque é pior: o movimento sem categoria pelo
  // menos aparece como despesa em algum lugar. O repasse sem destino não
  // aparece em lugar nenhum — some da DRE e é neutro no caixa.
  if (dados.repassesSemDestino && dados.repassesSemDestino.quantidade > 0) {
    const { quantidade, valor } = dados.repassesSemDestino
    alertas.push({
      id: 'repasse-sem-destino',
      severidade: 'atencao',
      titulo: `${quantidade} ${quantidade === 1 ? 'repasse sem destino' : 'repasses sem destino'}`,
      detalhe: `${brlSimples(valor)} saíram do gateway sem dizer para onde`,
      href: '/financeiro/repasses',
      valor,
    })
  }

  if (dados.semCategoria > 0) {
    alertas.push({
      id: 'sem-categoria',
      severidade: 'atencao',
      titulo: `${dados.semCategoria} ${dados.semCategoria === 1 ? 'movimento sem categoria' : 'movimentos sem categoria'}`,
      detalhe: 'Sem categoria eles não entram na DRE nem no fechamento',
      href: '/financeiro/extrato',
    })
  }

  for (const c of dados.contasDesatualizadas) {
    alertas.push({
      id: `conta-${c.nome}`,
      severidade: c.horas > 48 ? 'atencao' : 'informativo',
      titulo: `${c.nome} sem atualização`,
      detalhe: `Última leitura há ${c.horas} h`,
      href: '/financeiro/contas',
    })
  }

  if (dados.chargebacksSemJustificativa > 0) {
    alertas.push({
      id: 'chargeback',
      severidade: 'critico',
      titulo: `${dados.chargebacksSemJustificativa} chargeback sem documentação`,
      detalhe: 'Prazo de contestação corre contra a loja',
      href: '/financeiro/conciliacao?status=chargeback',
    })
  }

  const ordem: Record<SeveridadeAlerta, number> = { critico: 0, atencao: 1, informativo: 2 }
  return alertas.sort((a, b) => ordem[a.severidade] - ordem[b.severidade])
}

// ── Conciliação de vendas ──────────────────────────────────────────────────

export type StatusVenda =
  | 'conciliada'
  | 'taxa_divergente'
  | 'sem_credito'
  | 'valor_divergente'
  | 'estornada'
  | 'chargeback'
  | 'aguardando'
  /** Não há extrato do período: conciliar é impossível, não pendente. */
  | 'dispensada'

export const ROTULO_STATUS_VENDA: Record<StatusVenda, string> = {
  conciliada: 'Conciliada',
  taxa_divergente: 'Taxa divergente',
  sem_credito: 'Sem crédito',
  valor_divergente: 'Valor divergente',
  estornada: 'Estornada',
  chargeback: 'Chargeback',
  aguardando: 'Aguardando',
  dispensada: 'Sem extrato',
}

export interface VendaConciliada {
  pedidoId: string
  cliente: string
  canal: string
  meio: string
  transacaoId: string | null
  bruto: number
  taxaEsperada: number
  taxaReal: number | null
  liquidoEsperado: number
  liquidoRecebido: number | null
  previstoEm: string | null
  recebidoEm: string | null
  status: StatusVenda
  diferenca: number
}

/** Centavos de arredondamento do adquirente não são divergência. */
const TOLERANCIA = 0.05

/**
 * O status sai da cadeia de evidências, não da igualdade de valores.
 *
 * A diferença entre taxa REAL e taxa ESPERADA é divergência; a taxa cobrada
 * corretamente é custo, e chamá-la de divergência foi o que encheu a fila
 * antiga de alarme falso — a tela gritava em toda venda no cartão.
 */
export function avaliarVenda(v: {
  bruto: number
  taxaEsperada: number
  taxaReal: number | null
  liquidoRecebido: number | null
  estornada?: boolean
  chargeback?: boolean
  pagamentoConfirmado: boolean
  prazoVencido?: boolean
  /** Marcada como impossível de conciliar, com motivo registrado. */
  dispensada?: boolean
  /** Pedido cancelado não é venda: não há o que conciliar nele. */
  cancelada?: boolean
}): { status: StatusVenda; liquidoEsperado: number; diferenca: number } {
  const liquidoEsperado = arredonda(v.bruto - v.taxaEsperada)

  // A dispensa vem ANTES de tudo: ela é a decisão já tomada sobre esta venda,
  // e reavaliá-la a devolveria para a fila de onde alguém a tirou de
  // propósito. Cancelada idem — o pedido deixou de valer.
  if (v.dispensada || v.cancelada) {
    return { status: 'dispensada', liquidoEsperado, diferenca: 0 }
  }

  if (v.chargeback) return { status: 'chargeback', liquidoEsperado, diferenca: -v.bruto }
  if (v.estornada) return { status: 'estornada', liquidoEsperado, diferenca: -v.bruto }
  if (!v.pagamentoConfirmado) return { status: 'aguardando', liquidoEsperado, diferenca: 0 }

  if (v.liquidoRecebido === null) {
    return {
      status: v.prazoVencido ? 'sem_credito' : 'aguardando',
      liquidoEsperado,
      diferenca: 0,
    }
  }

  const diferenca = arredonda(v.liquidoRecebido - liquidoEsperado)
  if (Math.abs(diferenca) <= TOLERANCIA) {
    return { status: 'conciliada', liquidoEsperado, diferenca: 0 }
  }

  // Taxa maior que a contratada explica a diferença: é problema de taxa, não
  // de valor, e a ação é ajustar a regra do adquirente.
  const taxaDivergente =
    v.taxaReal !== null && Math.abs(v.taxaReal - v.taxaEsperada) > TOLERANCIA
  return {
    status: taxaDivergente ? 'taxa_divergente' : 'valor_divergente',
    liquidoEsperado,
    diferenca,
  }
}

// ── Utilidades ─────────────────────────────────────────────────────────────

function arredonda(v: number): number {
  return Math.round(v * 100) / 100
}

function brlSimples(v: number): string {
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

/** dd/MM a partir de AAAA-MM-DD, sem passar por Date (que desloca fuso). */
export function diaCurtoPt(iso: string): string {
  const [, m, d] = iso.split('-')
  return d && m ? `${d}/${m}` : iso
}

/** "agosto de 2026" a partir de "2026-08". */
export function competenciaPorExtenso(competencia: string): string {
  const [ano, mes] = competencia.split('-')
  const nomes = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ]
  const i = Number(mes) - 1
  return nomes[i] ? `${nomes[i]} de ${ano}` : competencia
}

/** Competência anterior a "2026-08" → "2026-07". */
export function competenciaAnterior(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number)
  if (!ano || !mes) return competencia
  return mes === 1
    ? `${ano - 1}-12`
    : `${ano}-${String(mes - 1).padStart(2, '0')}`
}
