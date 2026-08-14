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
  situacaoLogistica,
  statusDoPedido,
} from '@/domain'
import type { ApuracaoLote, CoberturaBase, EventoLido, PerdaReal, ResumoSync } from '@/domain'

import { resumoDoExtrato } from './extrato'
import { origemDados, repositorio } from './repository'
import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * Os eventos de rastreio de todos os pedidos, agrupados por pedido.
 *
 * Uma leitura só em vez de uma por pedido: 612 consultas sequenciais levariam
 * mais de um minuto e a tela não abriria. O teto existe porque a tabela cresce
 * a cada varredura — passando dele, a tela continua funcionando com o status
 * derivado do que veio, em vez de travar tentando ler tudo.
 */
const TETO_EVENTOS = 20_000

async function eventosPorPedido(): Promise<Map<string, EventoLido[]>> {
  const mapa = new Map<string, EventoLido[]>()
  if (!supabaseConfigurado()) return mapa

  const { data, error } = await supabaseServer()
    .from('rastreio_eventos')
    .select('pedido_id, quando, descricao, local')
    .order('quando', { ascending: false })
    .limit(TETO_EVENTOS)
  if (error) {
    // Rastreio indisponível não pode derrubar a tela de pedidos: sem os
    // eventos, cada pedido cai no status que o código de rastreio já indica.
    console.error('[pedidos] leitura de eventos de rastreio falhou:', error)
    return mapa
  }

  for (const linha of (data ?? []) as Record<string, unknown>[]) {
    const id = String(linha.pedido_id)
    const lista = mapa.get(id) ?? []
    lista.push({
      quando: (linha.quando as string | null) ?? null,
      descricao: String(linha.descricao ?? ''),
      local: (linha.local as string | null) ?? null,
    })
    mapa.set(id, lista)
  }
  return mapa
}

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
  reservadoTotalMl: number
  disponivelTotalMl: number
  comEstoque: number
  esgotados: number
  semCarga: number
  semGiro: number
  criticos: number
  /** Bases cuja reserva passou do que existe no frasco. */
  comExcedente: number
  valorReposicao: number
}> {
  const bases = await repositorio().perfumesBase()
  // Quem acaba antes primeiro. Sem consumo não tem "antes": vai para o fim,
  // porque não há urgência calculável — não porque acabe hoje.
  const coberturas = bases
    .map(coberturaDe)
    .sort((a, b) => (a.dias ?? Number.POSITIVE_INFINITY) - (b.dias ?? Number.POSITIVE_INFINITY))

  return {
    coberturas,
    volumeTotalMl: coberturas.reduce((a, c) => a + c.fisicoMl, 0),
    reservadoTotalMl: coberturas.reduce((a, c) => a + c.reservadoMl, 0),
    disponivelTotalMl: coberturas.reduce((a, c) => a + c.disponivelMl, 0),
    comEstoque: bases.filter((b) => b.volumeMl > 0).length,
    // Esgotado é o que acabou: já teve compra, tem custo, e zerou. O que
    // nunca recebeu carga é outra coisa e tem sua própria contagem.
    esgotados: coberturas.filter((c) => c.criticidade === 'zero').length,
    semCarga: coberturas.filter((c) => c.criticidade === 'sem_carga').length,
    semGiro: coberturas.filter((c) => c.criticidade === 'sem_giro').length,
    criticos: coberturas.filter((c) => c.criticidade === 'atencao' || c.criticidade === 'urgente')
      .length,
    comExcedente: coberturas.filter((c) => c.excedenteMl > 0).length,
    // Valor do que está no frasco, ao custo de reposição — o físico, não o
    // disponível: reserva não tira o líquido do estoque.
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

/**
 * Os pedidos com a situação logística já resolvida.
 *
 * A tradução dos eventos acontece AQUI, no servidor, e só o resumo viaja para
 * o navegador. Mandar a linha do tempo inteira de 612 pedidos para preencher
 * uma coluna custaria centenas de kB por carregamento — e 99% desses eventos
 * nunca seriam abertos. Quem abre um pedido busca a linha do tempo daquele
 * pedido sob demanda.
 */
export async function carregarPedidos() {
  const pedidos = await repositorio().pedidos()
  const eventos = await eventosPorPedido()
  return pedidos.map((p) => ({
    pedido: p,
    devolucao: statusDoPedido(p),
    logistica: situacaoLogistica({
      rastreio: p.rastreio,
      entregueEm: p.entregueEm,
      eventos: eventos.get(p.id),
    }),
  }))
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


// ── Produto 360º ────────────────────────────────────────────────────────────

export interface VendasJanela {
  ml: number
  unidades: number
  faturamento: number
  pedidos: number
}

export interface Produto360Dados {
  /** Vendas pagas por janela de dias — 7, 30 e 90. */
  vendas: { d7: VendasJanela; d30: VendasJanela; d90: VendasJanela }
  /** Unidades vendidas em 90 dias por volumetria — elege a mais vendida. */
  porVariante: Partial<Record<number, number>>
  /** Entradas de estoque com custo — é o histórico de custo real. */
  lotes: {
    id: string
    fornecedor: string
    volumeMl: number
    custoTotal: number | null
    custoPorMl: number | null
    entrada: string
    encerradoEm: string | null
  }[]
  /** Trilha do livro de movimentações, mais recente primeiro. */
  movimentacoes: {
    tipo: string
    ocorridaEm: string
    volumeMl: number
    saldoMl: number | null
    ref: string | null
    descricao: string | null
    responsavel: string | null
  }[]
  /** O que a Shopify diz estar publicado por variante, e quando foi lido. */
  publicado: { variante: number; unidades: number; lidoEm: string | null }[]
}

const VAZIO_JANELA: VendasJanela = { ml: 0, unidades: 0, faturamento: 0, pedidos: 0 }

/**
 * O dossiê de um perfume-base para a tela Produto 360º.
 *
 * Três leituras dirigidas em vez de reusar as listas globais: a tela de um
 * produto não pode pagar o transporte do catálogo inteiro. Vendas contam só
 * pedido pago e não cancelado — o resto é ruído que inflaria giro e
 * cobertura, e cobertura errada compra estoque errado.
 */
export async function produto360(baseId: string): Promise<Produto360Dados> {
  const vazio: Produto360Dados = {
    vendas: { d7: VAZIO_JANELA, d30: VAZIO_JANELA, d90: VAZIO_JANELA },
    porVariante: {},
    lotes: [],
    movimentacoes: [],
    publicado: [],
  }
  if (!supabaseConfigurado()) return vazio

  const sb = supabaseServer()
  const d90 = new Date(Date.now() - 90 * 86_400_000).toISOString()

  const [itens, lotes, movs, pub] = await Promise.all([
    sb
      .from('pedido_itens')
      .select('variante, quantidade, preco, pedido_id, pedidos!inner(comprado_em, pagamento, situacao)')
      .eq('base_id', baseId)
      .eq('pedidos.pagamento', 'pago')
      .neq('pedidos.situacao', 'cancelado')
      .gte('pedidos.comprado_em', d90)
      .limit(5000),
    sb
      .from('lotes')
      .select('id, fornecedor, volume_ml, custo_total, entrada_em, encerrado_em')
      .eq('base_id', baseId)
      .order('entrada_em', { ascending: false }),
    sb
      .from('movimentacoes')
      .select('tipo, ocorrida_em, volume_ml, saldo_ml, ref, descricao, responsavel')
      .eq('base_id', baseId)
      .order('ocorrida_em', { ascending: false })
      .limit(40),
    sb.from('shopify_publicado').select('variante, publicado, lido_em').eq('base_id', baseId),
  ])
  for (const r of [itens, lotes, movs, pub]) {
    if (r.error) throw r.error
  }

  const agora = Date.now()
  const janelas = { d7: { ...VAZIO_JANELA }, d30: { ...VAZIO_JANELA }, d90: { ...VAZIO_JANELA } }
  const pedidosPorJanela = { d7: new Set<string>(), d30: new Set<string>(), d90: new Set<string>() }
  const porVariante: Partial<Record<number, number>> = {}

  for (const linha of (itens.data ?? []) as unknown as {
    variante: number | null
    quantidade: number
    preco: number | string
    pedido_id: string
    pedidos: { comprado_em: string }
  }[]) {
    const dias = (agora - Date.parse(linha.pedidos.comprado_em)) / 86_400_000
    const v = Number(linha.variante ?? 0)
    const qtd = Number(linha.quantidade) || 0
    const receita = Number(linha.preco) * qtd
    for (const chave of ['d7', 'd30', 'd90'] as const) {
      const limite = chave === 'd7' ? 7 : chave === 'd30' ? 30 : 90
      if (dias > limite) continue
      janelas[chave].ml += v * qtd
      janelas[chave].unidades += qtd
      janelas[chave].faturamento += receita
      pedidosPorJanela[chave].add(linha.pedido_id)
    }
    if (dias <= 90 && v > 0) porVariante[v] = (porVariante[v] ?? 0) + qtd
  }
  for (const chave of ['d7', 'd30', 'd90'] as const) {
    janelas[chave].pedidos = pedidosPorJanela[chave].size
  }

  return {
    vendas: janelas,
    porVariante,
    lotes: ((lotes.data ?? []) as unknown as {
      id: string
      fornecedor: string
      volume_ml: number | string
      custo_total: number | string | null
      entrada_em: string
      encerrado_em: string | null
    }[]).map((l) => {
      const volume = Number(l.volume_ml)
      const custo = l.custo_total === null ? null : Number(l.custo_total)
      return {
        id: l.id,
        fornecedor: l.fornecedor,
        volumeMl: volume,
        custoTotal: custo,
        custoPorMl: custo && volume > 0 ? custo / volume : null,
        entrada: l.entrada_em,
        encerradoEm: l.encerrado_em,
      }
    }),
    movimentacoes: ((movs.data ?? []) as unknown as {
      tipo: string
      ocorrida_em: string
      volume_ml: number | string
      saldo_ml: number | string | null
      ref: string | null
      descricao: string | null
      responsavel: string | null
    }[]).map((m) => ({
      tipo: m.tipo,
      ocorridaEm: m.ocorrida_em,
      volumeMl: Number(m.volume_ml),
      saldoMl: m.saldo_ml === null ? null : Number(m.saldo_ml),
      ref: m.ref,
      descricao: m.descricao,
      responsavel: m.responsavel,
    })),
    publicado: ((pub.data ?? []) as unknown as {
      variante: number
      publicado: number
      lido_em: string | null
    }[]).map((p) => ({ variante: p.variante, unidades: p.publicado, lidoEm: p.lido_em })),
  }
}
