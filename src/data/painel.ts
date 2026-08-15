import 'server-only'

import { diaDaOperacao, saldoAberto, situacaoDe } from '@/domain'
import type { LancamentoGerencial } from '@/domain'

import { lerContas, lerLancamentos } from './financeiro'
import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * Dados do Dashboard Principal.
 *
 * O escopo é explícito sobre o que ele não pode ser: "não deve exibir
 * métricas sem ação ou sem contexto de comparação". Por isso toda grandeza
 * aqui vem em par — o valor do período e o mesmo valor do período de
 * comparação —, e a tela nunca precisa inventar um delta.
 *
 * A segunda regra que governa este arquivo é a integridade: o mesmo
 * recebimento não pode ser contado em Pedido e de novo como receita ao
 * classificar o extrato. Faturamento sai de PEDIDOS PAGOS; caixa sai de
 * LANÇAMENTOS BAIXADOS. As duas grandezas convivem sem se somar.
 */

export type Periodo = 'hoje' | 'ontem' | '7d' | '30d' | 'mes' | 'mes-anterior'

export const PERIODOS: { id: Periodo; rotulo: string }[] = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: 'ontem', rotulo: 'Ontem' },
  { id: '7d', rotulo: '7 dias' },
  { id: '30d', rotulo: '30 dias' },
  { id: 'mes', rotulo: 'Mês atual' },
  { id: 'mes-anterior', rotulo: 'Mês anterior' },
]

export interface Janela {
  de: string
  ate: string
  rotulo: string
  dias: number
}

/** Janela do período escolhido e a janela EQUIVALENTE anterior. */
export function janelasDe(periodo: Periodo, hoje: string): { atual: Janela; base: Janela } {
  const dia = (iso: string, n: number) =>
    new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

  const mes = hoje.slice(0, 7)
  const [ano, m] = mes.split('-').map(Number)
  const primeiroDoMes = `${mes}-01`
  const anteriorMes = m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, '0')}`
  const ultimoDoAnterior = dia(primeiroDoMes, -1)

  switch (periodo) {
    case 'hoje':
      return {
        atual: { de: hoje, ate: hoje, rotulo: 'Hoje', dias: 1 },
        base: { de: dia(hoje, -1), ate: dia(hoje, -1), rotulo: 'ontem', dias: 1 },
      }
    case 'ontem': {
      const o = dia(hoje, -1)
      return {
        atual: { de: o, ate: o, rotulo: 'Ontem', dias: 1 },
        base: { de: dia(o, -1), ate: dia(o, -1), rotulo: 'anteontem', dias: 1 },
      }
    }
    case '7d':
      return {
        atual: { de: dia(hoje, -6), ate: hoje, rotulo: 'Últimos 7 dias', dias: 7 },
        base: { de: dia(hoje, -13), ate: dia(hoje, -7), rotulo: 'os 7 dias anteriores', dias: 7 },
      }
    case 'mes':
      return {
        atual: {
          de: primeiroDoMes,
          ate: hoje,
          rotulo: 'Mês atual',
          dias: Number(hoje.slice(8)),
        },
        // Comparação por quantidade equivalente de dias, como manda §10.1:
        // comparar 14 dias de agosto com 31 de julho seria enganoso.
        base: {
          de: `${anteriorMes}-01`,
          ate: dia(`${anteriorMes}-01`, Number(hoje.slice(8)) - 1),
          rotulo: 'mesmo período do mês anterior',
          dias: Number(hoje.slice(8)),
        },
      }
    case 'mes-anterior':
      return {
        atual: {
          de: `${anteriorMes}-01`,
          ate: ultimoDoAnterior,
          rotulo: 'Mês anterior',
          dias: Number(ultimoDoAnterior.slice(8)),
        },
        base: {
          de: dia(`${anteriorMes}-01`, -Number(ultimoDoAnterior.slice(8))),
          ate: dia(`${anteriorMes}-01`, -1),
          rotulo: 'o mês retrasado',
          dias: Number(ultimoDoAnterior.slice(8)),
        },
      }
    default:
      return {
        atual: { de: dia(hoje, -29), ate: hoje, rotulo: 'Últimos 30 dias', dias: 30 },
        base: { de: dia(hoje, -59), ate: dia(hoje, -30), rotulo: 'os 30 dias anteriores', dias: 30 },
      }
  }
}

interface LinhaPedido {
  id: string
  cliente_id: string | null
  canal: string | null
  valor: number | string
  comprado_em: string
  pagamento: string
  situacao: string | null
}

interface LinhaItem {
  pedido_id: string
  descricao: string | null
  /** Volume do decant em ml — a coluna é smallint, não um título "5ml". */
  variante: number | null
  quantidade: number | string
  preco: number | string
  base_id: string | null
}

export interface ResumoVendas {
  faturamento: number
  pedidos: number
  ticket: number
  clientesNovos: number
  volumeMl: number
}

export interface PainelPrincipal {
  janela: Janela
  base: Janela
  atual: ResumoVendas
  anterior: ResumoVendas
  /**
   * Série diária do período escolhido: faturamento bruto dos pedidos pagos e
   * recebido LÍQUIDO das baixas de entrada (sem pernas de transferência).
   * A distância entre as duas curvas é tarifa, prazo de repasse e
   * inadimplência — por isso elas andam juntas no mesmo gráfico.
   */
  serieDiaria: { dia: string; faturamento: number; pedidos: number; recebido: number }[]
  porCategoria: { rotulo: string; valor: number }[]
  porCanal: { rotulo: string; valor: number; pedidos: number }[]
  topProdutos: { nome: string; ml: number; faturamento: number; baseId: string | null }[]
  /** Resultado gerencial da competência corrente, vindo da DRE. */
  resultado: number
  receitaLiquida: number
  margemPct: number
  /** Caixa do dia: só o que foi efetivamente movimentado hoje. */
  caixaDia: { entradas: number; saidas: number }
  saldoDisponivel: number
  aPagar7: { valor: number; qtd: number }
  aReceber7: { valor: number; qtd: number }
  vencidos: { valor: number; qtd: number }
  atividades: { quando: string; texto: string; tipo: string; href: string }[]
  semBanco: boolean
}

const VAZIO_VENDAS: ResumoVendas = {
  faturamento: 0,
  pedidos: 0,
  ticket: 0,
  clientesNovos: 0,
  volumeMl: 0,
}

/**
 * ml de um item. `variante` já É o volume (smallint no banco) — o resto do
 * domínio a trata assim. A primeira versão tentava ler "5ml" de um título e
 * quebrava o Dashboard inteiro em produção: número não tem .match().
 */
function mlDoItem(variante: number | null): number {
  const ml = Number(variante ?? 0)
  return Number.isFinite(ml) && ml > 0 ? ml : 0
}

/** Janela personalizada: o dono escolhe as duas datas no topo do Dashboard. */
function janelaLivre(de: string, ate: string): { atual: Janela; base: Janela } {
  const dias = Math.max(
    1,
    Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000) + 1,
  )
  const dia = (iso: string, n: number) =>
    new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
  return {
    atual: { de, ate, rotulo: 'Período escolhido', dias },
    // Base equivalente: a mesma quantidade de dias imediatamente anterior,
    // como manda §10.1 — comparar 5 dias com 31 seria enganoso.
    base: { de: dia(de, -dias), ate: dia(de, -1), rotulo: 'o período anterior equivalente', dias },
  }
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

export async function carregarPainelPrincipal(
  periodo: Periodo = '30d',
  livre?: { de?: string; ate?: string },
): Promise<PainelPrincipal> {
  const hoje = new Date().toISOString().slice(0, 10)
  const personalizado =
    livre?.de && livre?.ate && DATA_ISO.test(livre.de) && DATA_ISO.test(livre.ate) &&
    livre.de <= livre.ate && livre.ate <= hoje
  const { atual: janela, base } = personalizado
    ? janelaLivre(livre.de as string, livre.ate as string)
    : janelasDe(periodo, hoje)

  const vazio: PainelPrincipal = {
    janela,
    base,
    atual: VAZIO_VENDAS,
    anterior: VAZIO_VENDAS,
    serieDiaria: [],
    porCategoria: [],
    porCanal: [],
    topProdutos: [],
    resultado: 0,
    receitaLiquida: 0,
    margemPct: 0,
    caixaDia: { entradas: 0, saidas: 0 },
    saldoDisponivel: 0,
    aPagar7: { valor: 0, qtd: 0 },
    aReceber7: { valor: 0, qtd: 0 },
    vencidos: { valor: 0, qtd: 0 },
    atividades: [],
    semBanco: false,
  }
  if (!supabaseConfigurado()) return { ...vazio, semBanco: true }

  const sb = supabaseServer()
  const competencia = hoje.slice(0, 7)

  const diaAntes = (iso: string, n: number) =>
    new Date(Date.parse(`${iso}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10)

  // O gráfico segue o período escolhido; num período de um dia só, uma linha
  // não existe — a janela do gráfico se estica para os 7 dias que terminam
  // no fim do período, e o rótulo da tela diz isso.
  const graficoDe = janela.dias >= 7 ? janela.de : diaAntes(janela.ate, 6)

  // A janela ampla cobre período, comparação e gráfico numa consulta só:
  // três idas ao banco para a mesma tabela triplicariam a latência da tela.
  const inicio = [base.de, janela.de, graficoDe].sort()[0]

  const [{ data: pedidos }, contas, lancamentos, { data: dre }] = await Promise.all([
    sb
      .from('pedidos')
      .select('id, cliente_id, canal, valor, comprado_em, pagamento, situacao')
      // O dia de Brasília começa às 03:00Z e termina às 03:00Z do dia
      // seguinte. Buscar até "ate T23:59:59Z" deixava de fora justamente os
      // pedidos das 21h à meia-noite — os do fim do expediente.
      .gte('comprado_em', `${inicio}T03:00:00Z`)
      .lt('comprado_em', `${diaAntes(janela.ate, -1)}T03:00:00Z`)
      .limit(5000),
    lerContas(),
    lerLancamentos(),
    sb.rpc('dre_gerencial', { p_competencia: competencia }),
  ])

  const linhas = ((pedidos ?? []) as LinhaPedido[]).filter(
    // Cancelado e estornado não são venda: contá-los infla faturamento e
    // ticket, e §3 é explícito em excluí-los.
    (p) => p.pagamento === 'pago' && p.situacao !== 'cancelado',
  )

  const noPeriodo = (p: LinhaPedido, j: Janela) => {
    const d = diaDaOperacao(p.comprado_em)
    return d >= j.de && d <= j.ate
  }

  const idsAtual = linhas.filter((p) => noPeriodo(p, janela)).map((p) => p.id)
  const { data: itens } = idsAtual.length
    ? await sb
        .from('pedido_itens')
        .select('pedido_id, descricao, variante, quantidade, preco, base_id')
        .in('pedido_id', idsAtual.slice(0, 900))
    : { data: [] as LinhaItem[] }

  const itensAtual = (itens ?? []) as LinhaItem[]

  // Cliente novo: o primeiro pedido pago dele caiu na janela. A data de
  // cadastro não serve — quem se cadastrou em julho e comprou em agosto é
  // cliente novo de agosto.
  const primeiroPedido = new Map<string, string>()
  for (const p of linhas) {
    if (!p.cliente_id) continue
    const d = diaDaOperacao(p.comprado_em)
    const atual = primeiroPedido.get(p.cliente_id)
    if (!atual || d < atual) primeiroPedido.set(p.cliente_id, d)
  }

  const resumir = (j: Janela): ResumoVendas => {
    const doPeriodo = linhas.filter((p) => noPeriodo(p, j))
    const faturamento = doPeriodo.reduce((a, p) => a + Number(p.valor), 0)
    const novos = [...primeiroPedido.entries()].filter(([, d]) => d >= j.de && d <= j.ate).length
    const ids = new Set(doPeriodo.map((p) => p.id))
    const volume = itensAtual
      .filter((i) => ids.has(i.pedido_id))
      .reduce((a, i) => a + mlDoItem(i.variante) * Number(i.quantidade), 0)
    return {
      faturamento: Math.round(faturamento * 100) / 100,
      pedidos: doPeriodo.length,
      ticket: doPeriodo.length ? Math.round((faturamento / doPeriodo.length) * 100) / 100 : 0,
      clientesNovos: novos,
      volumeMl: Math.round(volume),
    }
  }

  const serie = new Map<string, { faturamento: number; pedidos: number; recebido: number }>()
  for (let d = graficoDe; d <= janela.ate; d = diaAntes(d, -1)) {
    serie.set(d, { faturamento: 0, pedidos: 0, recebido: 0 })
  }
  for (const p of linhas) {
    const d = diaDaOperacao(p.comprado_em)
    const alvo = serie.get(d)
    if (!alvo) continue
    alvo.faturamento += Number(p.valor)
    alvo.pedidos += 1
  }
  /**
   * Recebido LÍQUIDO — e desta vez líquido de verdade.
   *
   * A conversão do extrato lança a venda pelo valor BRUTO do pedido e a
   * tarifa do intermediador como uma saída separada. Somar só as entradas,
   * como esta série fazia, devolvia o bruto com a etiqueta "líquido": em
   * 10/08 a curva marcava R$ 1.161,29 e a tarifa de R$ 107,00 lançada no
   * mesmo dia não saía de lugar nenhum. Rótulo que mente é pior que número
   * ausente, porque ninguém confere o que parece certo.
   *
   * A tarifa é descontada no dia em que foi cobrada, que é o mesmo dia do
   * crédito: a conversão grava as duas com a mesma data.
   */
  for (const l of lancamentos) {
    if (l.canceladoEm || !l.baixadoEm || l.transferenciaId) continue
    const alvo = serie.get(l.baixadoEm)
    if (!alvo) continue
    if (l.tipo === 'entrada') alvo.recebido += l.recebido
    else if (l.categoriaId === 'taxas-de-pagamento') alvo.recebido -= l.recebido
  }

  const porCanal = new Map<string, { valor: number; pedidos: number }>()
  for (const p of linhas.filter((x) => noPeriodo(x, janela))) {
    const canal = p.canal || 'Sem canal'
    const atual = porCanal.get(canal) ?? { valor: 0, pedidos: 0 }
    atual.valor += Number(p.valor)
    atual.pedidos += 1
    porCanal.set(canal, atual)
  }

  // Categoria = gênero do perfume-base. É a classificação que o catálogo tem;
  // inventar outra aqui produziria um recorte que nenhuma outra tela repete.
  const basesIds = [...new Set(itensAtual.map((i) => i.base_id).filter(Boolean))] as string[]
  const { data: bases } = basesIds.length
    ? await sb.from('perfumes_base').select('id, nome, genero').in('id', basesIds.slice(0, 900))
    : { data: [] as { id: string; nome: string; genero: string | null }[] }

  const generoDe = new Map(
    ((bases ?? []) as { id: string; genero: string | null }[]).map((b) => [b.id, b.genero]),
  )
  const nomeDe = new Map(
    ((bases ?? []) as { id: string; nome: string }[]).map((b) => [b.id, b.nome]),
  )

  const porCategoria = new Map<string, number>()
  const porProduto = new Map<string, { ml: number; faturamento: number; baseId: string | null }>()
  for (const i of itensAtual) {
    const receita = Number(i.preco) * Number(i.quantidade)
    const genero = (i.base_id && generoDe.get(i.base_id)) || 'Sem classificação'
    porCategoria.set(genero, (porCategoria.get(genero) ?? 0) + receita)

    const nome = (i.base_id && nomeDe.get(i.base_id)) || i.descricao || 'Sem identificação'
    const atual = porProduto.get(nome) ?? { ml: 0, faturamento: 0, baseId: i.base_id }
    atual.ml += mlDoItem(i.variante) * Number(i.quantidade)
    atual.faturamento += receita
    porProduto.set(nome, atual)
  }

  type LinhaRpc = { linha: string; valor: string }
  const daDre = (nome: string) =>
    Number(((dre ?? []) as LinhaRpc[]).find((l) => l.linha === nome)?.valor ?? 0)
  const receitaLiquida = daDre('= Receita líquida')
  const resultado = daDre('= Resultado gerencial')

  const vivos = lancamentos.filter((l) => !l.canceladoEm)
  const emAberto = vivos.filter((l) => saldoAberto(l) > 0)
  const limite7 = new Date(Date.parse(`${hoje}T12:00:00Z`) + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10)

  const naJanela7 = (l: LancamentoGerencial) => l.venceEm && l.venceEm >= hoje && l.venceEm <= limite7
  const aPagar7 = emAberto.filter((l) => l.tipo === 'saida' && naJanela7(l))
  const aReceber7 = emAberto.filter((l) => l.tipo === 'entrada' && naJanela7(l))
  const vencidos = emAberto.filter((l) => situacaoDe(l, hoje) === 'vencido')

  // Caixa do dia: só o que foi BAIXADO hoje, e sem as pernas de
  // transferência — mover dinheiro entre contas próprias não é entrada nem
  // saída no consolidado.
  const doDia = vivos.filter((l) => l.baixadoEm === hoje && !l.transferenciaId)

  const atividades = [...vivos]
    .filter((l) => l.baixadoEm)
    .sort((a, b) => (b.baixadoEm ?? '').localeCompare(a.baixadoEm ?? ''))
    .slice(0, 6)
    .map((l) => ({
      quando: l.baixadoEm ?? '',
      texto: `${l.tipo === 'entrada' ? 'Recebimento' : 'Pagamento'}: ${l.descricao}`,
      tipo: l.origem,
      href: '/financeiro/lancamentos',
    }))

  return {
    janela,
    base,
    atual: resumir(janela),
    anterior: resumir(base),
    serieDiaria: [...serie.entries()].map(([dia, v]) => ({ dia, ...v })),
    porCategoria: [...porCategoria.entries()]
      .map(([rotulo, valor]) => ({ rotulo, valor }))
      .sort((a, b) => b.valor - a.valor),
    porCanal: [...porCanal.entries()]
      .map(([rotulo, v]) => ({ rotulo, ...v }))
      .sort((a, b) => b.valor - a.valor),
    topProdutos: [...porProduto.entries()]
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.faturamento - a.faturamento)
      .slice(0, 5),
    resultado,
    receitaLiquida,
    margemPct: receitaLiquida !== 0 ? (resultado / receitaLiquida) * 100 : 0,
    caixaDia: {
      entradas: doDia.filter((l) => l.tipo === 'entrada').reduce((a, l) => a + l.recebido, 0),
      saidas: doDia.filter((l) => l.tipo === 'saida').reduce((a, l) => a + l.recebido, 0),
    },
    saldoDisponivel: contas.reduce((a, c) => a + c.saldoDisponivel, 0),
    aPagar7: { valor: aPagar7.reduce((a, l) => a + saldoAberto(l), 0), qtd: aPagar7.length },
    aReceber7: { valor: aReceber7.reduce((a, l) => a + saldoAberto(l), 0), qtd: aReceber7.length },
    vencidos: { valor: vencidos.reduce((a, l) => a + saldoAberto(l), 0), qtd: vencidos.length },
    atividades,
    semBanco: false,
  }
}

/** Variação percentual com a regra §10: base zero não vira infinito. */
export function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return atual === 0 ? 0 : null
  return ((atual - anterior) / Math.abs(anterior)) * 100
}
