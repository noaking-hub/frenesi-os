import 'server-only'

import { carregarPainelPrincipal, PERIODOS, type Periodo } from '@/data/painel'
import {
  carregarConciliacao,
  carregarDre,
  carregarFluxo,
  carregarLancamentos,
  carregarVisaoFinanceira,
  lerContas,
} from '@/data/financeiro'
import { carregarEstoque, carregarFilaDeEnvase } from '@/data/consultas'
import { carregarCentralDoGerente } from './prioridades'
import { lerExtrato } from '@/data/extrato'
import {
  paginar,
  simularCompraDeBase,
  simularImpactoNoCaixa,
  type Ator,
  type CanalDoGerente,
  type ContratoDaFerramenta,
  type RetornoDaFerramenta,
} from '@/domain'

/**
 * CATÁLOGO DE FERRAMENTAS DO GERENTE.
 *
 * A regra crítica do escopo (§5 e §17) é que o Gerente CONSOME as métricas
 * oficiais do ERP e nunca as recalcula. Por isso nenhuma ferramenta aqui
 * escreve SQL: cada uma chama a mesma função que a tela correspondente chama, e
 * devolve o mesmo número. Se a tela de Conciliação diz 26 pendências, a
 * ferramenta diz 26 — não porque foram somadas duas vezes, mas porque é a mesma
 * soma.
 *
 * Isso também é o que impede a classe de erro mais cara de um assistente sobre
 * ERP: dois números diferentes para a mesma pergunta, um na tela e outro no
 * chat, sem ninguém saber qual está certo.
 *
 * Cada ferramenta declara o contrato do Anexo A — modo, risco, permissões,
 * timeout e idempotência. O modo é o que governa tudo: READ e SIMULATE podem
 * rodar em paralelo e sem confirmação, WRITE passa pelo Policy Engine. Hoje não
 * há nenhuma WRITE registrada, e a Fase 1 continua sendo leitura por
 * ARQUITETURA e não por promessa: mesmo que alguém registre uma, o motor a
 * recusa enquanto `GERENTE_ESCRITA` não estiver ligada.
 */

/**
 * Quem está executando. READ e SIMULATE ignoram; WRITE não sobrevive sem.
 *
 * Passar o contexto por parâmetro, e não por variável de módulo, é o que
 * permite o mesmo catálogo servir ERP e WhatsApp no mesmo processo sem que uma
 * requisição enxergue o ator da outra.
 */
export interface ContextoDaExecucao {
  ator: Ator
  canal: CanalDoGerente
  traceId: string
  conversaId: string | null
}

/** Contrato + execução. O contrato é domínio puro; a execução mora aqui. */
export interface Ferramenta extends ContratoDaFerramenta {
  executar: (
    args: Record<string, unknown>,
    ctx: ContextoDaExecucao,
  ) => Promise<RetornoDaFerramenta | unknown>
  /**
   * A PRÉVIA de uma ferramenta de escrita (§8.1 e §9).
   *
   * Quando a política responde "exige confirmação", o motor chama isto em vez
   * de `executar`. A prévia resolve os registros, calcula o impacto, cria a
   * ação pendente assinada e devolve ao modelo um resumo do que ACONTECERIA —
   * jamais um resultado. É a separação que impede o assistente de dizer
   * "classifiquei 23 lançamentos" antes de alguém ter aprovado.
   */
  prever?: (
    args: Record<string, unknown>,
    ctx: ContextoDaExecucao,
  ) => Promise<RetornoDaFerramenta>
}

const PERIODO_VALIDO = PERIODOS.map((p) => p.id)

function periodoDe(args: Record<string, unknown>): Periodo {
  const p = String(args.periodo ?? '30d')
  return (PERIODO_VALIDO.includes(p as Periodo) ? p : '30d') as Periodo
}

function limiteDe(args: Record<string, unknown>, padrao: number, teto: number): number {
  return Math.min(teto, Math.max(1, Number(args.limite ?? padrao) || padrao))
}

const ESQUEMA_PERIODO = {
  type: 'object',
  properties: {
    periodo: {
      type: 'string',
      enum: PERIODO_VALIDO,
      description:
        'Janela a analisar. Padrão 30d. "mes" é o mês corrente, "mes-anterior" o fechado.',
    },
  },
} as const

/** Valores comuns a toda ferramenta de leitura, para não repetir em cada uma. */
type Comuns = Pick<ContratoDaFerramenta, 'modo' | 'risco' | 'permissoes' | 'timeoutMs' | 'idempotente'>

const LEITURA: Comuns = {
  modo: 'READ',
  risco: 'A',
  permissoes: [],
  timeoutMs: 12_000,
  idempotente: true,
}

/** Simulação: também não altera nada, mas o resultado vem marcado como cenário. */
const SIMULACAO: Comuns = {
  modo: 'SIMULATE',
  risco: 'A',
  permissoes: [],
  timeoutMs: 12_000,
  idempotente: true,
}

export const FERRAMENTAS: Ferramenta[] = [
  {
    ...LEITURA,
    nome: 'resumo_do_periodo',
    versao: '2.0.0',
    descricao:
      'Faturamento, pedidos pagos, ticket médio, clientes novos e volume em ml de um período, ' +
      'com a variação contra o período anterior equivalente. É a mesma conta do Dashboard.',
    parametros: ESQUEMA_PERIODO,
    executar: async (args) => {
      const p = await carregarPainelPrincipal(periodoDe(args))
      return {
        resumo: `${p.janela.rotulo}: ${p.atual.pedidos} pedidos pagos somando R$ ${p.atual.faturamento.toFixed(2)}.`,
        totais: {
          faturamento: p.atual.faturamento,
          pedidosPagos: p.atual.pedidos,
          ticketMedio: p.atual.ticket,
          clientesNovos: p.atual.clientesNovos,
          volumeMl: p.atual.volumeMl,
          faturamentoAnterior: p.anterior.faturamento,
          pedidosAnterior: p.anterior.pedidos,
          ticketMedioAnterior: p.anterior.ticket,
        },
        metadados: {
          periodo: `${p.janela.de} a ${p.janela.ate}`,
          comparadoCom: p.base.rotulo,
          observacao:
            'Faturamento conta pedidos PAGOS pela data da venda, fuso de Brasília, sem cancelados.',
        },
      } satisfies RetornoDaFerramenta
    },
  },
  {
    ...LEITURA,
    nome: 'faturamento_por_dia',
    versao: '2.0.0',
    descricao:
      'Série diária de faturado (pedidos pagos, pela data da VENDA) e recebido líquido ' +
      '(o que entrou no caixa naquele dia, já sem as tarifas). As duas medem coisas ' +
      'diferentes e só fecham no acumulado — nunca dia a dia.',
    parametros: ESQUEMA_PERIODO,
    executar: async (args) => {
      const p = await carregarPainelPrincipal(periodoDe(args))
      const faturado = soma(p.serieDiaria.map((d) => d.faturamento))
      const recebido = soma(p.serieDiaria.map((d) => d.recebido))
      return paginar(p.serieDiaria, 62, {
        resumo: `${p.janela.rotulo}: R$ ${faturado.toFixed(2)} faturados e R$ ${recebido.toFixed(2)} recebidos líquidos.`,
        totais: { totalFaturado: faturado, totalRecebido: recebido },
        metadados: {
          alerta:
            'Faturado e recebido não fecham dia a dia por natureza: venda de segunda pode cair na quarta.',
        },
      })
    },
  },
  {
    ...LEITURA,
    nome: 'situacao_do_caixa',
    versao: '2.0.0',
    descricao:
      'Saldo disponível por conta ativa e o consolidado. Conta encerrada não entra no disponível.',
    parametros: { type: 'object', properties: {} },
    executar: async () => {
      const contas = await lerContas()
      const consolidado = soma(contas.map((c) => c.saldoDisponivel))
      return paginar(
        contas.map((c) => ({
          nome: c.nome,
          banco: c.banco,
          saldoDisponivel: c.saldoDisponivel,
          origemDoSaldo: c.origemSaldo,
        })),
        20,
        {
          resumo: `R$ ${consolidado.toFixed(2)} disponíveis em ${contas.length} conta(s) ativa(s).`,
          totais: { consolidado },
        },
      )
    },
  },
  {
    ...LEITURA,
    nome: 'visao_financeira',
    versao: '2.0.0',
    descricao:
      'Painel gerencial do mês: contas a pagar e a receber em aberto, projeção de caixa, ' +
      'composição das saídas por categoria e resumo da DRE por competência.',
    parametros: { type: 'object', properties: {} },
    executar: async () => {
      const v = await carregarVisaoFinanceira()
      return {
        resumo:
          `Caixa hoje R$ ${v.caixaHoje.toFixed(2)}; a pagar R$ ${v.aPagar.valor.toFixed(2)} ` +
          `(${v.aPagar.qtd}), a receber R$ ${v.aReceber.valor.toFixed(2)} (${v.aReceber.qtd}), ` +
          `vencidos R$ ${v.vencidos.valor.toFixed(2)} (${v.vencidos.qtd}).`,
        totais: {
          caixaHoje: v.caixaHoje,
          aPagarValor: v.aPagar.valor,
          aPagarQtd: v.aPagar.qtd,
          aReceberValor: v.aReceber.valor,
          aReceberQtd: v.aReceber.qtd,
          vencidosValor: v.vencidos.valor,
          vencidosQtd: v.vencidos.qtd,
          resultadoDoMes: v.resultadoMes,
          receitaLiquidaDoMes: v.receitaLiquidaMes,
          margemDoMesPct: v.margemMes,
          pendenciasDeConciliacaoValor: v.pendenciasConciliacao.valor,
          pendenciasDeConciliacaoQtd: v.pendenciasConciliacao.qtd,
          menorSaldoProjetado: v.projecao.menorSaldo,
          diasAteNegativar: v.projecao.diasAteNegativar,
          entradasPrevistas: v.projecao.entradasPrevistas,
          saidasPrevistas: v.projecao.saidasPrevistas,
        },
        itens: v.saidasPorCategoria,
        metadados: { menorSaldoEm: v.projecao.menorSaldoEm },
      } satisfies RetornoDaFerramenta
    },
  },
  {
    ...LEITURA,
    nome: 'fluxo_de_caixa',
    versao: '1.0.0',
    descricao:
      'Série do fluxo de caixa projetado: entradas, saídas e saldo acumulado por dia. ' +
      'É a fonte oficial para responder quando o caixa aperta.',
    parametros: { type: 'object', properties: {} },
    executar: async () => {
      const f = await carregarFluxo()
      const p = f.projecao
      return paginar(p.dias, 62, {
        resumo:
          `Projecao de ${f.de} a ${f.ate}: saldo final R$ ${p.saldoFinal.toFixed(2)}, ` +
          `menor saldo R$ ${p.menorSaldo.toFixed(2)}${p.menorSaldoEm ? ` em ${p.menorSaldoEm}` : ''}.`,
        totais: {
          saldoInicial: p.saldoInicial,
          saldoFinal: p.saldoFinal,
          entradasPrevistas: p.entradasPrevistas,
          saidasPrevistas: p.saidasPrevistas,
          menorSaldo: p.menorSaldo,
          diasAteNegativar: p.diasAteNegativar,
          coberturaEmDias: f.cobertura,
        },
        metadados: { menorSaldoEm: p.menorSaldoEm, risco: p.risco, porCategoria: f.porCategoria },
      })
    },
  },
  {
    ...LEITURA,
    nome: 'dre_do_mes',
    versao: '1.0.0',
    descricao:
      'DRE gerencial por competência: receita bruta e líquida, margem de contribuição, ' +
      'resultado e ponto de equilíbrio. Números oficiais, não recalculados.',
    parametros: { type: 'object', properties: {} },
    executar: async () => {
      const p = await carregarDre()
      const d = p.dre
      return {
        resumo:
          `Competência ${p.competencia}: receita líquida R$ ${d.receitaLiquida.toFixed(2)}, ` +
          `resultado R$ ${d.resultado.toFixed(2)} (margem líquida ${d.margemLiquidaPct.toFixed(1)}%).`,
        totais: {
          competencia: p.competencia,
          receitaBruta: d.receitaBruta,
          receitaLiquida: d.receitaLiquida,
          margemContribuicao: d.margemContribuicao,
          margemContribuicaoPct: d.margemContribuicaoPct,
          resultado: d.resultado,
          margemLiquidaPct: d.margemLiquidaPct,
          pontoEquilibrio: d.pontoEquilibrio,
        },
        itens: d.linhas,
        metadados: { porCategoria: p.porCategoria, evolucao: p.evolucao },
      } satisfies RetornoDaFerramenta
    },
  },
  {
    ...LEITURA,
    nome: 'lancamentos_pendentes',
    versao: '2.0.0',
    descricao:
      'Contas a pagar e a receber em aberto, com vencimento, categoria e conta. ' +
      'Serve para responder o que vence, o que atrasou e o que falta classificar.',
    parametros: {
      type: 'object',
      properties: {
        situacao: {
          type: 'string',
          enum: ['vencido', 'agendado', 'previsto', 'parcial', 'sem-categoria'],
          description: 'Filtra a fila. "sem-categoria" lista o que a DRE não classifica.',
        },
        limite: { type: 'integer', description: 'Quantos trazer. Padrão 20, teto 60.' },
      },
    },
    executar: async (args) => {
      const p = await carregarLancamentos()
      const situacao = args.situacao ? String(args.situacao) : null
      const vivos = p.lancamentos.filter((l) => !l.canceladoEm && !l.baixadoEm)
      const filtrados =
        situacao === 'sem-categoria'
          ? // Transferência entre contas próprias não tem categoria porque NÃO É
            // despesa. Contá-la aqui encheria a fila de linha que ninguém deve
            // classificar.
            p.lancamentos.filter((l) => !l.canceladoEm && !l.categoriaId && !l.transferenciaId)
          : vivos
      return paginar(
        filtrados.map((l) => ({
          descricao: l.descricao,
          tipo: l.tipo,
          valor: l.valor,
          venceEm: l.venceEm,
          categoria: l.categoria ?? 'sem categoria',
          conta: l.conta,
        })),
        limiteDe(args, 20, 60),
        {
          resumo: `${filtrados.length} lançamento(s)${situacao ? ` em "${situacao}"` : ' em aberto'}.`,
          totais: { valorTotal: soma(filtrados.map((l) => l.valor)) },
        },
      )
    },
  },
  {
    ...LEITURA,
    nome: 'conciliacao_pendente',
    versao: '2.0.0',
    descricao:
      'Vendas que ainda exigem decisão na conciliação: sem crédito, tarifa divergente ou ' +
      'valor divergente. Traz também a tarifa média real cobrada pelo intermediador.',
    parametros: { type: 'object', properties: {} },
    executar: async () => {
      const c = await carregarConciliacao()
      const exigemDecisao = c.vendas.filter(
        (v) => v.status === 'sem_credito' || v.status === 'taxa_divergente',
      )
      return paginar(
        exigemDecisao.map((v) => ({
          pedido: v.pedidoId,
          cliente: v.cliente,
          bruto: v.bruto,
          recebido: v.liquidoRecebido,
          status: v.status,
        })),
        15,
        {
          resumo: `${exigemDecisao.length} venda(s) exigem decisão na conciliação.`,
          totais: {
            volumeBruto: c.volumeBruto,
            valorCreditado: c.valorCreditado,
            tarifaMediaRealPct: c.taxaMediaReal,
          },
          metadados: {
            porStatus: c.totais,
            observacao:
              'Venda pela Pagaleve fica "aguardando" por até 45 dias — isso é o prazo do ' +
              'parcelamento, não pendência.',
          },
        },
      )
    },
  },
  {
    ...LEITURA,
    nome: 'estoque_e_cobertura',
    versao: '2.0.0',
    descricao:
      'Perfumes base com saldo em ml, reservado, disponível e cobertura em dias, já ordenados ' +
      'por quem acaba antes. É a fonte para risco de ruptura e para o que repor.',
    parametros: {
      type: 'object',
      properties: {
        apenasCriticos: {
          type: 'boolean',
          description: 'Só o que está abaixo do limite de cobertura.',
        },
        limite: { type: 'integer', description: 'Quantos trazer. Padrão 20, teto 60.' },
      },
    },
    executar: async (args) => {
      const e = await carregarEstoque()
      const urgente = (c: (typeof e.coberturas)[number]) =>
        c.criticidade === 'urgente' || c.criticidade === 'atencao' || c.criticidade === 'zero'
      const lista = args.apenasCriticos ? e.coberturas.filter(urgente) : e.coberturas
      return paginar(
        // A ordem já vem do ERP e É a prioridade — não reordenar.
        lista.map((c) => ({
          nome: c.base.nome,
          marca: c.base.marca,
          fisicoMl: c.fisicoMl,
          reservadoMl: c.reservadoMl,
          disponivelMl: c.disponivelMl,
          coberturaDias: c.dias,
          cobertura: c.cobertura,
          criticidade: c.criticidade,
          custoPorMl: c.base.custoPorMl,
        })),
        limiteDe(args, 20, 60),
        {
          resumo: `${e.criticos} base(s) abaixo do limite e ${e.esgotados} esgotada(s), de ${e.coberturas.length} sob controle.`,
          totais: {
            totalDeBases: e.coberturas.length,
            criticos: e.criticos,
            esgotados: e.esgotados,
            semGiro: e.semGiro,
            disponivelTotalMl: e.disponivelTotalMl,
          },
          metadados: {
            observacao:
              'Só entram bases com compra de frasco/lote registrada. Base sem compra não é ' +
              'crítica, é ausente do controle.',
          },
        },
      )
    },
  },
  {
    ...LEITURA,
    nome: 'ranking_de_produtos',
    versao: '1.0.0',
    descricao:
      'Perfumes mais vendidos no período, por volume em ml e por faturamento. ' +
      'Responde "o que mais vendeu" e "o que mais faturou", que não são a mesma lista.',
    parametros: ESQUEMA_PERIODO,
    executar: async (args) => {
      const p = await carregarPainelPrincipal(periodoDe(args))
      return paginar(p.topProdutos, 20, {
        resumo: `Top produtos de ${p.janela.rotulo.toLowerCase()}, por volume e faturamento.`,
        totais: { volumeMlDoPeriodo: p.atual.volumeMl, faturamento: p.atual.faturamento },
        metadados: { periodo: `${p.janela.de} a ${p.janela.ate}` },
      })
    },
  },
  {
    ...LEITURA,
    nome: 'fila_de_envase',
    versao: '1.0.0',
    descricao:
      'Pedidos pagos aguardando envase, com o volume em ml que a fila consome. ' +
      'Responde backlog de produção e gargalo.',
    parametros: { type: 'object', properties: {} },
    executar: async () => {
      const f = await carregarFilaDeEnvase()
      return paginar(f.porPerfume, 20, {
        resumo:
          `${f.pedidos} pedido(s) na fila de envase, somando ${f.mlTotal} ml em ${f.perfumes} perfume(s)` +
          `${f.bloqueados > 0 ? `; ${f.bloqueados} bloqueado(s) por falta de volume` : ''}.`,
        totais: {
          pedidos: f.pedidos,
          mlTotal: f.mlTotal,
          perfumes: f.perfumes,
          bloqueados: f.bloqueados,
        },
        metadados: { insumosConsumidos: f.insumos },
      })
    },
  },
  {
    ...LEITURA,
    nome: 'prioridades_do_dia',
    versao: '2.0.0',
    descricao:
      'A fila do que exige decisão agora, JÁ ORDENADA por severidade pelo ERP: caixa que ' +
      'negativa, contas vencidas, vendas sem crédito fora do prazo, base zerada ou acabando, ' +
      'queda de faturamento e lançamentos sem categoria. Use quando perguntarem o que fazer, ' +
      'o que está pegando ou como está a operação hoje. NÃO reordene a fila nem invente ' +
      'urgência: a ordem é a resposta.',
    parametros: { type: 'object', properties: {} },
    executar: async () => {
      const c = await carregarCentralDoGerente()
      return {
        resumo: c.resumo,
        // A ordem do array É a prioridade — regra fixa, não julgamento. Cada
        // item traz os sete campos do escopo §7.1, para o modelo poder relatar
        // impacto e responsável sem adivinhar nenhum dos dois.
        itens: c.itens.map((p) => ({
          severidade: p.severidade,
          titulo: p.titulo,
          impactoFinanceiro: p.impactoFinanceiro,
          impactoOperacional: p.impactoOperacional,
          urgencia: p.urgencia,
          confianca: p.confianca,
          responsavelSugerido: p.responsavel,
          proximaAcao: p.proximaAcao,
        })),
        metadados: {
          briefing: c.briefing,
          resumoExecutivoDoDia: c.executivo,
          modulosConsultados: c.modulosConsultados,
          apuradoEm: c.apuradoEm,
        },
      } satisfies RetornoDaFerramenta
    },
  },
  {
    ...LEITURA,
    nome: 'extrato_recente',
    versao: '2.0.0',
    descricao:
      'Movimentos do extrato bancário, com origem, contraparte e vínculo com pedido. ' +
      'As reservas internas do gateway não aparecem: elas se anulam e não são dinheiro.',
    parametros: {
      type: 'object',
      properties: {
        de: { type: 'string', description: 'Data inicial AAAA-MM-DD.' },
        ate: { type: 'string', description: 'Data final AAAA-MM-DD.' },
        busca: { type: 'string', description: 'Texto em descrição, contraparte ou pedido.' },
        limite: { type: 'integer', description: 'Quantos trazer. Padrão 25, teto 60.' },
      },
    },
    executar: async (args) => {
      const limite = limiteDe(args, 25, 60)
      const p = await lerExtrato({
        situacao: 'todas',
        de: args.de ? String(args.de) : undefined,
        ate: args.ate ? String(args.ate) : undefined,
        busca: args.busca ? String(args.busca) : undefined,
        limite,
      })
      return paginar(
        p.linhas.map((l) => ({
          quando: l.ocorridoEm,
          descricao: l.descricao,
          contraparte: l.contraparte,
          tipo: l.tipo,
          valor: l.valor,
          conta: l.contaNome,
          pedido: l.pedidoId,
        })),
        limite,
        { resumo: `${p.total} movimento(s) encontrados no extrato.`, totais: { encontrados: p.total } },
      )
    },
  },

  // ── Simulações (§4.4 do escopo do produto, Fase 2 do escopo do motor) ─────
  {
    ...SIMULACAO,
    nome: 'simular_compra_de_base',
    versao: '1.0.0',
    descricao:
      'CENÁRIO: quanto tempo de cobertura e quanto custo uma compra de X ml de um perfume base ' +
      'geraria. Não grava nada. O consumo diário sai da cobertura oficial do ERP, não de uma ' +
      'conta própria. Use antes de recomendar reposição.',
    parametros: {
      type: 'object',
      properties: {
        base: { type: 'string', description: 'Nome do perfume base, como aparece no estoque.' },
        comprarMl: { type: 'number', description: 'Quantos ml comprar.' },
        custoPorMl: {
          type: 'number',
          description: 'Custo por ml da compra pretendida. Sem isto, usa o custo médio do ERP.',
        },
      },
      required: ['base', 'comprarMl'],
    },
    executar: async (args) => {
      const e = await carregarEstoque()
      const alvo = String(args.base ?? '').toLowerCase()
      const c =
        e.coberturas.find((x) => x.base.nome.toLowerCase() === alvo) ??
        e.coberturas.find((x) => x.base.nome.toLowerCase().includes(alvo))
      if (!c) {
        return {
          resumo: `Não encontrei "${args.base}" entre as bases sob controle de estoque.`,
          metadados: {
            dica: 'Use estoque_e_cobertura para ver os nomes exatos das bases com lote registrado.',
          },
        } satisfies RetornoDaFerramenta
      }
      const cenario = simularCompraDeBase({
        nome: c.base.nome,
        disponivelMl: c.disponivelMl,
        diasDeCobertura: c.dias,
        custoPorMl: c.base.custoPorMl,
        comprarMl: Number(args.comprarMl),
        custoPorMlDaCompra: args.custoPorMl == null ? null : Number(args.custoPorMl),
      })
      if ('erro' in cenario) {
        return { resumo: cenario.erro } satisfies RetornoDaFerramenta
      }
      return {
        resumo:
          `CENÁRIO — comprar ${cenario.comprarMl} ml de ${cenario.base} levaria a cobertura de ` +
          `${cenario.coberturaHojeDias} para ${cenario.coberturaDepoisDias} dias.`,
        totais: {
          consumoDiarioMl: cenario.consumoDiarioMl,
          disponivelHojeMl: cenario.disponivelHojeMl,
          disponivelDepoisMl: cenario.disponivelDepoisMl,
          coberturaHojeDias: cenario.coberturaHojeDias,
          coberturaDepoisDias: cenario.coberturaDepoisDias,
          custoEstimado: cenario.custoEstimado,
        },
        metadados: {
          cenario: true,
          origemDoCusto: cenario.origemDoCusto,
          aviso: cenario.aviso,
          regra: 'Simulação nunca é realizado e nunca é gravada.',
        },
      } satisfies RetornoDaFerramenta
    },
  },
  {
    ...SIMULACAO,
    nome: 'simular_impacto_no_caixa',
    versao: '1.0.0',
    descricao:
      'CENÁRIO: se a operação desembolsar um valor, o caixa aguenta? Mede pelo MENOR saldo ' +
      'projetado do período, não pelo saldo de hoje — há dinheiro hoje e pode não haver na ' +
      'data do vencimento. Não grava nada.',
    parametros: {
      type: 'object',
      properties: { desembolso: { type: 'number', description: 'Valor a sair do caixa, em reais.' } },
      required: ['desembolso'],
    },
    executar: async (args) => {
      const v = await carregarVisaoFinanceira()
      const cenario = simularImpactoNoCaixa({
        caixaHoje: v.caixaHoje,
        menorSaldoProjetado: v.projecao.menorSaldo,
        menorSaldoEm: v.projecao.menorSaldoEm,
        desembolso: Number(args.desembolso),
      })
      return {
        resumo: `CENÁRIO — ${cenario.veredito}`,
        totais: {
          desembolso: cenario.desembolso,
          caixaHoje: cenario.caixaHoje,
          caixaDepois: cenario.caixaDepois,
          menorSaldoAntes: cenario.menorSaldoAntes,
          menorSaldoDepois: cenario.menorSaldoDepois,
        },
        metadados: {
          cenario: true,
          menorSaldoEm: cenario.menorSaldoEm,
          regra: 'Simulação nunca é realizado e nunca é gravada.',
        },
      } satisfies RetornoDaFerramenta
    },
  },
]

export const FERRAMENTA_POR_NOME = new Map(FERRAMENTAS.map((f) => [f.nome, f]))

/**
 * O catálogo no formato da API, já filtrado pelo que o ator pode ver.
 *
 * A descrição leva o modo na frente porque o modelo decide o que chamar lendo
 * a descrição: marcar CENÁRIO ali é o que evita ele apresentar simulação como
 * dado apurado — a mesma razão de o retorno também vir marcado.
 */
export function catalogoParaModelo(ferramentas: Ferramenta[] = FERRAMENTAS) {
  return ferramentas.map((f) => ({
    name: f.nome,
    description: f.modo === 'SIMULATE' ? `[CENÁRIO] ${f.descricao}` : f.descricao,
    input_schema: f.parametros,
  }))
}

function soma(xs: number[]): number {
  return Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100
}
