import 'server-only'

import { carregarPainelPrincipal, PERIODOS, type Periodo } from '@/data/painel'
import {
  carregarConciliacao,
  carregarLancamentos,
  carregarVisaoFinanceira,
  lerContas,
} from '@/data/financeiro'
import { carregarEstoque } from '@/data/consultas'
import { carregarCentralDoGerente } from './prioridades'
import { lerExtrato } from '@/data/extrato'
import { brl } from '@/domain'

/**
 * CATÁLOGO DE FERRAMENTAS DO ASSESSOR — só leitura.
 *
 * A regra crítica do escopo (seção 5) é que o Gerente CONSOME as métricas
 * oficiais do ERP e nunca as recalcula. Por isso nenhuma ferramenta aqui
 * escreve SQL: cada uma chama a mesma função que a tela correspondente chama,
 * e devolve o mesmo número. Se a tela de Conciliação diz 26 pendências, a
 * ferramenta diz 26 — não porque foram somadas duas vezes, mas porque é a
 * mesma soma.
 *
 * Isso também é o que impede a classe de erro mais cara de um assistente
 * sobre ERP: dois números diferentes para a mesma pergunta, um na tela e
 * outro no chat, sem ninguém saber qual está certo.
 *
 * O modelo não recebe acesso ao banco. Recebe esta lista, e só ela.
 */

/** Contrato de uma ferramenta: o que o modelo vê e o que o ERP executa. */
export interface Ferramenta {
  nome: string
  descricao: string
  /** JSON Schema dos parâmetros, no formato que a API da Anthropic espera. */
  parametros: Record<string, unknown>
  /** Nível de risco do escopo. Fase 1 só tem leitura, então tudo é 'leitura'. */
  risco: 'leitura'
  executar: (args: Record<string, unknown>) => Promise<unknown>
}

const PERIODO_VALIDO = PERIODOS.map((p) => p.id)

function periodoDe(args: Record<string, unknown>): Periodo {
  const p = String(args.periodo ?? '30d')
  return (PERIODO_VALIDO.includes(p as Periodo) ? p : '30d') as Periodo
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

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: 'resumo_do_periodo',
    descricao:
      'Faturamento, pedidos pagos, ticket médio, clientes novos e volume em ml de um período, ' +
      'com a variação contra o período anterior equivalente. É a mesma conta do Dashboard.',
    parametros: ESQUEMA_PERIODO,
    risco: 'leitura',
    executar: async (args) => {
      const p = await carregarPainelPrincipal(periodoDe(args))
      return {
        periodo: `${p.janela.de} a ${p.janela.ate}`,
        comparadoCom: p.base.rotulo,
        faturamento: p.atual.faturamento,
        pedidosPagos: p.atual.pedidos,
        ticketMedio: p.atual.ticket,
        clientesNovos: p.atual.clientesNovos,
        volumeMl: p.atual.volumeMl,
        anterior: {
          faturamento: p.anterior.faturamento,
          pedidosPagos: p.anterior.pedidos,
          ticketMedio: p.anterior.ticket,
        },
        observacao:
          'Faturamento conta pedidos PAGOS pela data da venda, no fuso de Brasília, sem cancelados.',
      }
    },
  },
  {
    nome: 'faturamento_por_dia',
    descricao:
      'Série diária de faturado (pedidos pagos, pela data da VENDA) e recebido líquido ' +
      '(o que entrou no caixa naquele dia, já sem as tarifas). As duas medem coisas ' +
      'diferentes e só fecham no acumulado — nunca dia a dia.',
    parametros: ESQUEMA_PERIODO,
    risco: 'leitura',
    executar: async (args) => {
      const p = await carregarPainelPrincipal(periodoDe(args))
      return {
        dias: p.serieDiaria,
        totalFaturado: Math.round(p.serieDiaria.reduce((a, d) => a + d.faturamento, 0) * 100) / 100,
        totalRecebido: Math.round(p.serieDiaria.reduce((a, d) => a + d.recebido, 0) * 100) / 100,
      }
    },
  },
  {
    nome: 'situacao_do_caixa',
    descricao:
      'Saldo disponível por conta ativa, saldo consolidado e o que está previsto entrar e sair. ' +
      'Conta encerrada não entra no disponível.',
    parametros: { type: 'object', properties: {} },
    risco: 'leitura',
    executar: async () => {
      const contas = await lerContas()
      return {
        contas: contas.map((c) => ({
          nome: c.nome,
          banco: c.banco,
          saldoDisponivel: c.saldoDisponivel,
          origemDoSaldo: c.origemSaldo,
        })),
        consolidado: Math.round(contas.reduce((a, c) => a + c.saldoDisponivel, 0) * 100) / 100,
      }
    },
  },
  {
    nome: 'visao_financeira',
    descricao:
      'Painel gerencial do mês: contas a pagar e a receber em aberto, projeção de caixa, ' +
      'composição das saídas por categoria e o resumo da DRE por competência.',
    parametros: { type: 'object', properties: {} },
    risco: 'leitura',
    executar: async () => {
      const v = await carregarVisaoFinanceira()
      return {
        caixaHoje: v.caixaHoje,
        aPagar: v.aPagar,
        aReceber: v.aReceber,
        vencidos: v.vencidos,
        resultadoDoMes: v.resultadoMes,
        receitaLiquidaDoMes: v.receitaLiquidaMes,
        margemDoMes: v.margemMes,
        pendenciasDeConciliacao: v.pendenciasConciliacao,
        projecao: {
          menorSaldo: v.projecao.menorSaldo,
          menorSaldoEm: v.projecao.menorSaldoEm,
          diasAteNegativar: v.projecao.diasAteNegativar,
          entradasPrevistas: v.projecao.entradasPrevistas,
          saidasPrevistas: v.projecao.saidasPrevistas,
        },
        saidasPorCategoria: v.saidasPorCategoria,
      }
    },
  },
  {
    nome: 'lancamentos_pendentes',
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
    risco: 'leitura',
    executar: async (args) => {
      const p = await carregarLancamentos()
      const limite = Math.min(60, Math.max(1, Number(args.limite ?? 20)))
      const situacao = args.situacao ? String(args.situacao) : null
      const vivos = p.lancamentos.filter((l) => !l.canceladoEm && !l.baixadoEm)
      const filtrados =
        situacao === 'sem-categoria'
          ? p.lancamentos.filter((l) => !l.canceladoEm && !l.categoriaId)
          : vivos
      return {
        total: filtrados.length,
        lancamentos: filtrados.slice(0, limite).map((l) => ({
          descricao: l.descricao,
          tipo: l.tipo,
          valor: l.valor,
          venceEm: l.venceEm,
          categoria: l.categoria ?? 'sem categoria',
          conta: l.conta,
        })),
      }
    },
  },
  {
    nome: 'conciliacao_pendente',
    descricao:
      'Vendas que ainda exigem decisão na conciliação: sem crédito, tarifa divergente ou ' +
      'valor divergente. Traz também a tarifa média real cobrada pelo intermediador.',
    parametros: { type: 'object', properties: {} },
    risco: 'leitura',
    executar: async () => {
      const c = await carregarConciliacao()
      return {
        totais: c.totais,
        volumeBruto: c.volumeBruto,
        valorCreditado: c.valorCreditado,
        tarifaMediaReal: c.taxaMediaReal,
        exemplos: c.vendas
          .filter((v) => v.status === 'sem_credito' || v.status === 'taxa_divergente')
          .slice(0, 10)
          .map((v) => ({
            pedido: v.pedidoId,
            cliente: v.cliente,
            bruto: v.bruto,
            recebido: v.liquidoRecebido,
            status: v.status,
          })),
      }
    },
  },
  {
    nome: 'estoque_e_cobertura',
    descricao:
      'Perfumes base com saldo em ml, reservado, disponível e cobertura em dias. ' +
      'É a fonte para responder risco de ruptura e o que repor.',
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
    risco: 'leitura',
    executar: async (args) => {
      const e = await carregarEstoque()
      const limite = Math.min(60, Math.max(1, Number(args.limite ?? 20)))
      const urgente = (c: (typeof e.coberturas)[number]) =>
        c.criticidade === 'urgente' || c.criticidade === 'atencao' || c.criticidade === 'zero'
      const lista = args.apenasCriticos ? e.coberturas.filter(urgente) : e.coberturas
      return {
        totalDeBases: e.coberturas.length,
        criticos: e.criticos,
        esgotados: e.esgotados,
        semGiro: e.semGiro,
        disponivelTotalMl: e.disponivelTotalMl,
        // Já vem ordenado por quem acaba antes: a ordem É a prioridade.
        bases: lista.slice(0, limite).map((c) => ({
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
      }
    },
  },
  {
    nome: 'prioridades_do_dia',
    descricao:
      'A fila do que exige decisão agora, JÁ ORDENADA por severidade pelo ERP: caixa que ' +
      'negativa, contas vencidas, vendas sem crédito fora do prazo, base zerada ou acabando, ' +
      'queda de faturamento e lançamentos sem categoria. Use esta ferramenta quando ' +
      'perguntarem o que fazer, o que está pegando ou como está a operação hoje. NÃO ' +
      'reordene a fila nem invente urgência: a ordem é a resposta.',
    parametros: { type: 'object', properties: {} },
    risco: 'leitura',
    executar: async () => {
      const c = await carregarCentralDoGerente()
      return {
        resumo: c.resumo,
        // A ordem do array É a prioridade — calculada por regra fixa, não por
        // julgamento. Cada item traz os sete campos do escopo, para o modelo
        // poder relatar impacto e responsável sem adivinhar nenhum dos dois.
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
        briefing: c.briefing,
        resumoExecutivoDoDia: c.executivo,
        modulosConsultados: c.modulosConsultados,
      }
    },
  },
  {
    nome: 'extrato_recente',
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
    risco: 'leitura',
    executar: async (args) => {
      const p = await lerExtrato({
        situacao: 'todas',
        de: args.de ? String(args.de) : undefined,
        ate: args.ate ? String(args.ate) : undefined,
        busca: args.busca ? String(args.busca) : undefined,
        limite: Math.min(60, Math.max(1, Number(args.limite ?? 25))),
      })
      return {
        encontrados: p.total,
        linhas: p.linhas.map((l) => ({
          quando: l.ocorridoEm,
          descricao: l.descricao,
          contraparte: l.contraparte,
          tipo: l.tipo,
          valor: l.valor,
          conta: l.contaNome,
          pedido: l.pedidoId,
        })),
      }
    },
  },
]

export const FERRAMENTA_POR_NOME = new Map(FERRAMENTAS.map((f) => [f.nome, f]))

/** O catálogo no formato que a API da Anthropic espera. */
export function catalogoParaModelo() {
  return FERRAMENTAS.map((f) => ({
    name: f.nome,
    description: f.descricao,
    input_schema: f.parametros,
  }))
}

/** Formata dinheiro para o texto do sistema, sem o modelo ter de fazê-lo. */
export const dinheiro = brl
