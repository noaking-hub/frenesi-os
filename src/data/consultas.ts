import 'server-only'

import {
  aguardaBaixaShopify,
  apurarLote,
  brl,
  plural,
  lancamentoPendente,
  resumirLancamentos,
  apurarPerdaReal,
  calcularPreco,
  coberturaDe,
  conciliarLotesAbertos,
  desvioAds,
  resumirOcorrencias,
  resumoSync,
  sincronizarBase,
  statusDoPedido,
} from '@/domain'
import type { ApuracaoLote, CoberturaBase, PerdaReal, ResumoSync } from '@/domain'

import { resumoDoExtrato } from './extrato'
import { origemDados, repositorio } from './repository'

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
  semCarga: number
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
    // Esgotado é o que acabou: já teve compra, tem custo, e zerou. O que
    // nunca recebeu carga é outra coisa e tem sua própria contagem.
    esgotados: coberturas.filter((c) => c.criticidade === 'zero').length,
    semCarga: coberturas.filter((c) => c.criticidade === 'sem_carga').length,
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
  /** De onde a contagem vem. 'demonstracao' some quando o Supabase está ligado. */
  origem: 'banco' | 'demonstracao'
}

export async function carregarDashboard() {
  const repo = repositorio()
  // Com o Supabase conectado, o Dashboard só mostra o que vem do banco.
  // Módulos ainda em fixtures (pedidos, financeiro, CRM, IA) ficam de fora
  // em vez de exibir número de demonstração misturado com dado real.
  const sincronizado = origemDados() === 'supabase'
  const [estoque, lotes, sync, parametros, solicitacoes, ocorrencias, envios, receita] =
    await Promise.all([
      carregarEstoque(),
      carregarLotes(),
      carregarSincronia(),
      repo.parametros(),
      repo.solicitacoes(),
      repo.ocorrencias(),
      repo.envios(),
      repo.receitaMensal(),
    ])
  // Mesma ideia da perda real: o ADS foi correto um dia. A receita muda todo
  // mês e o percentual não — sem esta conferência ele envelhece calado.
  const ads = desvioAds(parametros.adsMensal ?? null, receita.receitaProdutos, parametros)

  const devAguardando = solicitacoes.filter(
    (d) => d.status === 'Nova' || d.status === 'Em análise' || d.status === 'Aguardando fotos',
  )
  const resumoOe = resumirOcorrencias(ocorrencias)
  const filaBaixa = envios.filter(aguardaBaixaShopify)

  const bases = await repo.perfumesBase()
  // Volume zero tem dois significados opostos e o Dashboard precisa separá-los:
  // sem carga é "o ERP não sabe", esgotada é "acabou". Só a segunda é risco.
  const esgotadas = bases.filter((b) => b.volumeMl === 0 && b.sobControle)
  const emRisco = estoque.criticos + esgotadas.length


  // As contas a pagar do dashboard são os MESMOS lançamentos da tela de
  // Lançamentos — derivados, nunca uma lista paralela.
  const lancamentos = await repo.lancamentos()
  const fin = resumirLancamentos(lancamentos)
  const pendentesFin = lancamentos.filter(lancamentoPendente)

  // Pedidos e extrato: as duas filas de trabalho de verdade da operação.
  const pedidos = await repo.pedidos()
  const aSeparar = pedidos.filter(
    (p) =>
      p.pagamento === 'pago' && (p.envio === 'Não iniciado' || p.envio === 'Aguardando envio'),
  )
  const extrato = await resumoDoExtrato().catch(() => null)

  const pendencias: Pendencia[] = [
    {
      contagem: aSeparar.length,
      titulo: 'Pedidos pagos aguardando envio',
      hint: aSeparar.length
        ? `${brlSimples(aSeparar.reduce((a, p) => a + p.valor, 0))} vendidos e ainda não despachados`
        : 'Nenhum pedido parado',
      etiqueta: 'Urgente',
      tom: 'atencao',
      href: '/pedidos',
      origem: 'banco',
    },
    {
      contagem: extrato?.aDecidir ?? 0,
      titulo: 'Extrato precisa de você',
      hint: 'Despesas a categorizar e entradas sem pedido correspondente',
      etiqueta: 'Financeiro',
      tom: 'atencao',
      href: '/financeiro/extrato',
      origem: 'banco',
    },
    {
      contagem: lotes.perda.subestimado ? 1 : 0,
      titulo: 'Perda técnica acima do parâmetro',
      hint: `Medida ${lotes.perda.mediaPct.toFixed(1).replace('.', ',')}% nos lotes encerrados · parâmetro ${String(parametros.perdaPct).replace('.', ',')}%`,
      etiqueta: 'Preço',
      tom: 'atencao',
      href: '/estoque/lotes',
      origem: 'banco',
    },
    {
      contagem: emRisco,
      titulo: 'Perfumes base em risco',
      hint: esgotadas.length
        ? `${esgotadas.slice(0, 3).map((b) => b.nome).join(', ')}${esgotadas.length > 3 ? ` e mais ${esgotadas.length - 3}` : ''} esgotado · outros abaixo de 20 dias de cobertura`
        : 'Abaixo de 20 dias de cobertura',
      etiqueta: 'Bloqueia',
      tom: 'erro',
      href: '/estoque',
      origem: 'banco',
    },
    {
      contagem: ads?.subestimado ? 1 : 0,
      titulo: 'Marketing acima do parâmetro',
      hint: ads
        ? `${brl(parametros.adsMensal ?? 0)}/mês sobre a receita dos últimos 30 dias dá ${ads.medido.toFixed(1).replace('.', ',')}% · o parâmetro está em ${String(parametros.adsPct).replace('.', ',')}%`
        : 'Sem gasto mensal de tráfego declarado',
      etiqueta: 'Preço',
      tom: 'atencao',
      href: '/configuracoes/precificacao',
      origem: 'banco',
    },
    {
      // Já tem volume, mas ninguém disse o que custou: a margem sai errada.
      contagem: bases.filter((b) => b.volumeMl > 0 && b.custoPorMl === 0).length,
      titulo: 'Perfumes sem custo cadastrado',
      hint: 'Com volume em estoque · preço e margem saem errados até informar o custo por ml',
      etiqueta: 'Cadastro',
      tom: 'atencao',
      href: '/produtos',
      origem: 'banco',
    },
    {
      contagem: sync.esgotar + sync.reduzir + sync.repor,
      titulo: 'Variantes fora de sincronia na Shopify',
      hint: `${sync.excesso} unidades vendáveis sem volume que as sustente`,
      etiqueta: 'Estoque',
      tom: sync.esgotar ? 'erro' : 'atencao',
      href: '/estoque/sincronia',
      origem: 'banco',
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
      origem: 'banco',
    },
    {
      contagem: filaBaixa.length,
      titulo: 'Entregas sem baixa na Shopify',
      // A Yampi confirma a entrega mas não avisa a Shopify — o pedido fica aberto lá.
      hint: 'Confirmadas na Yampi e ainda abertas na Shopify',
      etiqueta: 'Entregas',
      tom: 'info',
      href: '/pedidos/envios',
      origem: 'banco',
    },
    {
      contagem: resumoOe.abertas,
      titulo: 'Ocorrências de entrega abertas',
      hint: `${brlSimples(resumoOe.valorParado)} parados · ${resumoOe.atrasadas} além do prazo`,
      etiqueta: 'Transporte',
      tom: 'erro',
      href: '/pedidos/ocorrencias',
      origem: 'banco',
    },
    {
      contagem: pendentesFin.length,
      titulo: 'Contas a pagar e vencidas',
      hint: `${brlSimples(fin.aPagar + fin.vencido)} · ${fin.vencidoQtd} vencida`,
      etiqueta: 'Financeiro',
      tom: fin.vencidoQtd ? 'erro' : 'atencao',
      href: '/financeiro/lancamentos',
      origem: 'banco',
    },
  ]

  return {
    estoque,
    lotes,
    sync,
    parametros,
    bases,
    sincronizado,
    pendencias: sincronizado ? pendencias.filter((p) => p.origem === 'banco') : pendencias,
    calcularPreco,
  }
}

function brlSimples(n: number): string {
  return `R$ ${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/, '.')}`
}

