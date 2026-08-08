import 'server-only'

import {
  aguardaBaixaShopify,
  apurarLote,
  lancamentoPendente,
  resumirLancamentos,
  apurarPerdaReal,
  calcularPreco,
  coberturaDe,
  conciliarLotesAbertos,
  resumirOcorrencias,
  resumoSync,
  sincronizarBase,
  statusDoPedido,
} from '@/domain'
import type { ApuracaoLote, CoberturaBase, PerdaReal, ResumoSync } from '@/domain'

import { repositorio } from './repository'

/**
 * Consultas derivadas compartilhadas pelas telas.
 *
 * Se duas telas mostram a mesma grandeza, elas chamam a MESMA função daqui —
 * nunca duas constantes. É o que impede o Dashboard e a tela de Lotes de
 * discordarem sobre a perda real.
 */

export async function carregarEstoque(): Promise<{
  coberturas: CoberturaBase[]
  volumeTotalMl: number
  comEstoque: number
  esgotados: number
  criticos: number
  valorReposicao: number
}> {
  const bases = await repositorio().perfumesBase()
  const coberturas = bases
    .map(coberturaDe)
    .sort((a, b) => a.dias - b.dias)

  return {
    coberturas,
    volumeTotalMl: bases.reduce((a, b) => a + b.volumeMl, 0),
    comEstoque: bases.filter((b) => b.volumeMl > 0).length,
    esgotados: bases.filter((b) => b.volumeMl === 0).length,
    criticos: coberturas.filter((c) => c.criticidade === 'atencao' || c.criticidade === 'urgente')
      .length,
    valorReposicao: bases.reduce((a, b) => a + b.volumeMl * b.custoPorMl, 0),
  }
}

export async function carregarLotes(): Promise<{
  apuracoes: ApuracaoLote[]
  perda: PerdaReal
  conciliacao: ReturnType<typeof conciliarLotesAbertos>
}> {
  const repo = repositorio()
  const [lotes, bases, parametros] = await Promise.all([
    repo.lotes(),
    repo.perfumesBase(),
    repo.parametros(),
  ])

  return {
    apuracoes: lotes.map((l) => apurarLote(l, parametros)),
    perda: apurarPerdaReal(lotes, bases, parametros),
    conciliacao: conciliarLotesAbertos(lotes, bases, parametros),
  }
}

export async function carregarSincronia(): Promise<ResumoSync> {
  const repo = repositorio()
  const [bases, derivados, publicados] = await Promise.all([
    repo.perfumesBase(),
    repo.produtosDerivados(),
    repo.shopifyPublicado(),
  ])
  return resumoSync(bases.map((b) => sincronizarBase(b, derivados, publicados)))
}

export async function carregarPrecificacao(baseId: string, varianteSel: number) {
  const repo = repositorio()
  const [bases, parametros, precos] = await Promise.all([
    repo.perfumesBase(),
    repo.parametros(),
    repo.precoPraticado(),
  ])
  const base = bases.find((b) => b.id === baseId) ?? bases[0]

  return { bases, base, parametros, precos, varianteSel }
}

export async function carregarPedidos() {
  const pedidos = await repositorio().pedidos()
  return pedidos.map((p) => ({ pedido: p, devolucao: statusDoPedido(p) }))
}

/** Devoluções elegíveis de um cliente, para o portal. */
export async function pedidosDoCliente(identificacao: string) {
  const alvo = identificacao.trim().toLowerCase()
  const pedidos = await repositorio().pedidos()
  return pedidos
    .filter((p) => p.email.toLowerCase() === alvo)
    .map((p) => ({ pedido: p, devolucao: statusDoPedido(p) }))
}

/**
 * Pendências acionáveis do Dashboard.
 *
 * São DERIVADAS, não fixas: cada linha é uma contagem real e navega para a
 * tela responsável por resolvê-la.
 */
export interface Pendencia {
  contagem: number
  titulo: string
  hint: string
  etiqueta: string
  tom: 'ok' | 'atencao' | 'erro' | 'info' | 'ouro' | 'neutro'
  href: string
}

export async function carregarDashboard() {
  const repo = repositorio()
  const [estoque, lotes, sync, parametros, solicitacoes, ocorrencias, envios] = await Promise.all([
    carregarEstoque(),
    carregarLotes(),
    carregarSincronia(),
    repo.parametros(),
    repo.solicitacoes(),
    repo.ocorrencias(),
    repo.envios(),
  ])

  const devAguardando = solicitacoes.filter(
    (d) => d.status === 'Nova' || d.status === 'Em análise' || d.status === 'Aguardando fotos',
  )
  const resumoOe = resumirOcorrencias(ocorrencias)
  const filaBaixa = envios.filter(aguardaBaixaShopify)

  const bases = await repo.perfumesBase()
  const esgotadas = bases.filter((b) => b.volumeMl === 0)
  const emRisco = estoque.criticos + estoque.esgotados

  const { PEDIDOS_A_SEPARAR, CARRINHOS_PRIORIDADE_ALTA, COMANDOS_IA_AGUARDANDO } =
    await import('./fixtures')

  // As contas a pagar do dashboard são os MESMOS lançamentos da tela de
  // Lançamentos — derivados, nunca uma lista paralela.
  const lancamentos = await repo.lancamentos()
  const fin = resumirLancamentos(lancamentos)
  const pendentesFin = lancamentos.filter(lancamentoPendente)

  const pendencias: Pendencia[] = [
    {
      contagem: PEDIDOS_A_SEPARAR,
      titulo: 'Pedidos para separar',
      hint: 'Pagos e aguardando envio',
      etiqueta: 'Urgente',
      tom: 'atencao',
      href: '/pedidos',
    },
    {
      contagem: lotes.perda.subestimado ? 1 : 0,
      titulo: 'Perda técnica acima do parâmetro',
      hint: `Medida ${lotes.perda.mediaPct.toFixed(1).replace('.', ',')}% nos lotes encerrados · parâmetro ${String(parametros.perdaPct).replace('.', ',')}%`,
      etiqueta: 'Preço',
      tom: 'atencao',
      href: '/estoque/lotes',
    },
    {
      contagem: emRisco,
      titulo: 'Perfumes base em risco',
      hint: esgotadas.length
        ? `${esgotadas.map((b) => b.nome).join(', ')} esgotado · outros abaixo de 20 dias de cobertura`
        : 'Abaixo de 20 dias de cobertura',
      etiqueta: 'Bloqueia',
      tom: 'erro',
      href: '/estoque',
    },
    {
      contagem: sync.esgotar + sync.reduzir + sync.repor,
      titulo: 'Variantes fora de sincronia na Shopify',
      hint: `${sync.excesso} unidades vendáveis sem volume que as sustente`,
      etiqueta: 'Estoque',
      tom: sync.esgotar ? 'erro' : 'atencao',
      href: '/estoque/sincronia',
    },
    {
      contagem: devAguardando.length,
      titulo: 'Devoluções aguardando análise',
      hint: devAguardando.length
        ? `${brlSimples(devAguardando.reduce((a, d) => a + d.valor, 0))} em solicitações do portal`
        : 'Nenhuma solicitação parada',
      etiqueta: 'Devoluções',
      tom: 'ouro',
      href: '/pedidos/devolucoes',
    },
    {
      contagem: filaBaixa.length,
      titulo: 'Entregas sem baixa na Shopify',
      // A Yampi confirma a entrega mas não avisa a Shopify — o pedido fica aberto lá.
      hint: 'Confirmadas na Yampi e ainda abertas na Shopify',
      etiqueta: 'Entregas',
      tom: 'info',
      href: '/pedidos/envios',
    },
    {
      contagem: resumoOe.abertas,
      titulo: 'Ocorrências de entrega abertas',
      hint: `${brlSimples(resumoOe.valorParado)} parados · ${resumoOe.atrasadas} além do prazo`,
      etiqueta: 'Transporte',
      tom: 'erro',
      href: '/pedidos/ocorrencias',
    },
    {
      contagem: pendentesFin.length,
      titulo: 'Contas a pagar e vencidas',
      hint: `${brlSimples(fin.aPagar + fin.vencido)} · ${fin.vencidoQtd} vencida`,
      etiqueta: 'Financeiro',
      tom: fin.vencidoQtd ? 'erro' : 'atencao',
      href: '/financeiro/lancamentos',
    },
    {
      contagem: CARRINHOS_PRIORIDADE_ALTA,
      titulo: 'Carrinhos com prioridade alta',
      hint: 'Acima de R$ 400,00 · abandonados há menos de 6h',
      etiqueta: 'CRM',
      tom: 'ouro',
      href: '/crm/carrinhos',
    },
    {
      contagem: COMANDOS_IA_AGUARDANDO,
      titulo: 'Comandos da IA aguardando confirmação',
      hint: 'Lançamento financeiro e criação de cupom',
      etiqueta: 'Assessor IA',
      tom: 'ouro',
      href: '/assessor',
    },
  ]

  return { estoque, lotes, sync, parametros, bases, pendencias, calcularPreco }
}

function brlSimples(n: number): string {
  return `R$ ${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/, '.')}`
}
