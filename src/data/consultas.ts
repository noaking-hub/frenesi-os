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
import { avaliarInsumo, insumosDoEnvase } from '@/domain'
import type {
  ApuracaoLote,
  CoberturaBase,
  EventoLido,
  Insumo,
  InsumoAvaliado,
  PerdaReal,
  ResumoSync,
  TipoInsumo,
  VarianteMl,
} from '@/domain'

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

// ── Fila de envase ─────────────────────────────────────────────────────────

/** Data no fuso da operação: o servidor roda em UTC e adiantaria tudo em 3h. */
function diaCurto(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

export interface ItemDoEnvase {
  variante: number
  unidades: number
  ml: number
}

export interface PedidoNaFila {
  pedidoId: string
  cliente: string
  compradoEm: string
  /** Já formatado no servidor: o cliente não tem acesso ao fuso da operação. */
  quando: string
  entregaLocal: boolean
  itens: ItemDoEnvase[]
  mlTotal: number
  /** Bases deste pedido sem volume disponível que as cubra. */
  bloqueios: string[]
}

export interface PerfumeNaFila {
  baseId: string
  perfume: string
  marca: string
  /** Ml a envasar somando todos os pedidos da fila. */
  mlAEnvasar: number
  /** Ml livres hoje, já descontado o que outros pedidos comprometeram. */
  disponivelMl: number
  fisicoMl: number
  pedidos: number
  itens: ItemDoEnvase[]
  /** Falta volume para atender a fila inteira desta base. */
  faltaMl: number
}

export interface InsumoDaFila {
  id: string
  nome: string
  necessario: number
  emEstoque: number
  falta: number
}

export interface FilaDeEnvase {
  porPerfume: PerfumeNaFila[]
  porPedido: PedidoNaFila[]
  /** O que a fila consome de frasco, válvula e tampa. */
  insumos: InsumoDaFila[]
  pedidos: number
  mlTotal: number
  perfumes: number
  /** Pedidos que não dá para envasar hoje por falta de volume. */
  bloqueados: number
  semBanco: boolean
}

/**
 * O que precisa ser envasado agora.
 *
 * A fila é DERIVADA das reservas — pedidos pagos que ainda não saíram. Ela
 * não cria ordem nem baixa estoque: quem baixa é o faturamento, e ter dois
 * caminhos de baixa para o mesmo envase é o que fazia o ml sair duas vezes
 * no modelo antigo de ordem de produção.
 *
 * Duas visões da mesma verdade: por PERFUME (quantos frascos pegar da
 * prateleira e quanto tirar de cada um) e por PEDIDO (o que separar para
 * cada cliente).
 */
export async function carregarFilaDeEnvase(): Promise<FilaDeEnvase> {
  const vazia: FilaDeEnvase = {
    porPerfume: [],
    porPedido: [],
    insumos: [],
    pedidos: 0,
    mlTotal: 0,
    perfumes: 0,
    bloqueados: 0,
    semBanco: false,
  }
  if (!supabaseConfigurado()) return { ...vazia, semBanco: true }

  const sb = supabaseServer()
  const [{ data: reservas }, bases] = await Promise.all([
    sb
      .from('reservas_estoque')
      .select('pedido_id, base_id, ml, criada_em, pedidos(comprado_em, entrega_local, clientes(nome))')
      .is('liberada_em', null),
    repositorio().perfumesBase(),
  ])

  const linhas = (reservas ?? []) as unknown as {
    pedido_id: string
    base_id: string
    ml: number | string
    criada_em: string
    pedidos: {
      comprado_em: string
      entrega_local: boolean
      clientes: { nome: string } | null
    } | null
  }[]
  if (linhas.length === 0) return vazia

  // Os itens vêm dos pedidos da fila — é o que diz QUAIS variantes envasar,
  // e não só quantos ml no total.
  const pedidoIds = [...new Set(linhas.map((l) => l.pedido_id))]
  const { data: itens } = await sb
    .from('pedido_itens')
    .select('pedido_id, base_id, variante, quantidade')
    .in('pedido_id', pedidoIds)
    .not('base_id', 'is', null)
    .not('variante', 'is', null)

  const doPedido = new Map<string, { baseId: string; variante: number; quantidade: number }[]>()
  for (const i of (itens ?? []) as unknown as {
    pedido_id: string
    base_id: string
    variante: number
    quantidade: number
  }[]) {
    const lista = doPedido.get(i.pedido_id) ?? []
    lista.push({ baseId: i.base_id, variante: i.variante, quantidade: i.quantidade })
    doPedido.set(i.pedido_id, lista)
  }

  const porBase = new Map(bases.map((b) => [b.id, b]))
  const somarItens = (lista: { variante: number; quantidade: number }[]): ItemDoEnvase[] => {
    const mapa = new Map<number, ItemDoEnvase>()
    for (const i of lista) {
      const atual = mapa.get(i.variante) ?? { variante: i.variante, unidades: 0, ml: 0 }
      atual.unidades += i.quantidade
      atual.ml += i.quantidade * i.variante
      mapa.set(i.variante, atual)
    }
    return [...mapa.values()].sort((a, b) => a.variante - b.variante)
  }

  // ── Por perfume: o que pegar da prateleira ───────────────────────────────
  const perfumes = new Map<string, PerfumeNaFila>()
  for (const l of linhas) {
    const base = porBase.get(l.base_id)
    const atual = perfumes.get(l.base_id) ?? {
      baseId: l.base_id,
      perfume: base?.nome ?? l.base_id,
      marca: base?.marca ?? '',
      mlAEnvasar: 0,
      // O disponível JÁ desconta esta fila inteira — é o saldo depois de
      // todas as reservas, não antes. Por isso a falta se mede contra o
      // físico, e não contra ele.
      disponivelMl: base?.volumeMl ?? 0,
      fisicoMl: base?.volumeMl ?? 0,
      pedidos: 0,
      itens: [],
      faltaMl: 0,
    }
    atual.mlAEnvasar += Number(l.ml)
    atual.pedidos += 1
    const itensDaBase = (doPedido.get(l.pedido_id) ?? []).filter((i) => i.baseId === l.base_id)
    atual.itens = somarItens([
      ...atual.itens.flatMap((i) => [{ variante: i.variante, quantidade: i.unidades }]),
      ...itensDaBase,
    ])
    perfumes.set(l.base_id, atual)
  }
  for (const p of perfumes.values()) {
    p.faltaMl = Math.max(0, Math.round((p.mlAEnvasar - p.fisicoMl) * 10) / 10)
  }

  // ── Por pedido: o que separar para cada cliente ──────────────────────────
  const pedidos = new Map<string, PedidoNaFila>()
  for (const l of linhas) {
    const atual = pedidos.get(l.pedido_id) ?? {
      pedidoId: l.pedido_id,
      cliente: l.pedidos?.clientes?.nome ?? 'Cliente sem cadastro',
      compradoEm: l.pedidos?.comprado_em ?? l.criada_em,
      quando: diaCurto(l.pedidos?.comprado_em ?? l.criada_em),
      entregaLocal: l.pedidos?.entrega_local ?? false,
      itens: [],
      mlTotal: 0,
      bloqueios: [],
    }
    atual.mlTotal += Number(l.ml)
    const base = porBase.get(l.base_id)
    // Bloqueio é falta de líquido no frasco, não falta de disponível: o
    // disponível já está comprometido com este mesmo pedido.
    if ((base?.volumeMl ?? 0) < Number(l.ml)) {
      atual.bloqueios.push(base?.nome ?? l.base_id)
    }
    pedidos.set(l.pedido_id, atual)
  }
  for (const p of pedidos.values()) {
    p.itens = somarItens(doPedido.get(p.pedidoId) ?? [])
  }

  const listaPerfumes = [...perfumes.values()].sort((a, b) => b.mlAEnvasar - a.mlAEnvasar)
  const listaPedidos = [...pedidos.values()].sort(
    (a, b) => new Date(a.compradoEm).getTime() - new Date(b.compradoEm).getTime(),
  )

  // O que esta fila consome de embalagem — a bancada precisa disso junto
  // com o perfume, senão descobre a falta de tampa com o frasco na mão.
  const consumo = insumosDoEnvase(
    listaPedidos.flatMap((p) => p.itens.map((i) => ({ variante: i.variante as VarianteMl, unidades: i.unidades }))),
  )
  const { data: emEstoque } = await sb.from('insumos').select('id, nome, unidades')
  const insumos: InsumoDaFila[] = [...consumo.entries()]
    .map(([id, necessario]) => {
      const linha = ((emEstoque ?? []) as unknown as { id: string; nome: string; unidades: number }[]).find(
        (i) => i.id === id,
      )
      const saldo = linha?.unidades ?? 0
      return {
        id,
        nome: linha?.nome ?? id,
        necessario,
        emEstoque: saldo,
        falta: Math.max(0, necessario - saldo),
      }
    })
    .sort((a, b) => b.falta - a.falta || b.necessario - a.necessario)

  return {
    porPerfume: listaPerfumes,
    porPedido: listaPedidos,
    insumos,
    pedidos: listaPedidos.length,
    mlTotal: listaPerfumes.reduce((a, p) => a + p.mlAEnvasar, 0),
    perfumes: listaPerfumes.length,
    bloqueados: listaPedidos.filter((p) => p.bloqueios.length > 0).length,
    semBanco: false,
  }
}

// ── Insumos de envase ──────────────────────────────────────────────────────

export interface PainelInsumos {
  itens: InsumoAvaliado[]
  totalUnidades: number
  valorEmEstoque: number
  /** Itens que não cobrem a fila já vendida. */
  insuficientes: number
  abaixoDoMinimo: number
  semBanco: boolean
}

/**
 * Insumos com a demanda da fila já descontada.
 *
 * O saldo sozinho engana: 80 tampas parecem muitas até se ver que os
 * pedidos pagos de hoje consomem 120. A tela precisa das duas coisas na
 * mesma linha.
 */
export async function carregarInsumos(): Promise<PainelInsumos> {
  const vazio: PainelInsumos = {
    itens: [],
    totalUnidades: 0,
    valorEmEstoque: 0,
    insuficientes: 0,
    abaixoDoMinimo: 0,
    semBanco: false,
  }
  if (!supabaseConfigurado()) return { ...vazio, semBanco: true }

  const sb = supabaseServer()
  const [{ data: linhas }, fila, { data: consumo }] = await Promise.all([
    sb.from('insumos').select('*').eq('ativo', true).order('frasco_ml').order('tipo'),
    carregarFilaDeEnvase(),
    // Consumo diário dos últimos 30 dias, para a cobertura.
    sb
      .from('insumo_movimentacoes')
      .select('insumo_id, unidades')
      .eq('tipo', 'saida')
      .gte('ocorrida_em', new Date(Date.now() - 30 * 86_400_000).toISOString()),
  ])

  const insumos = ((linhas ?? []) as unknown as {
    id: string
    nome: string
    tipo: TipoInsumo
    frasco_ml: number | null
    unidades: number
    custo_unitario: number | string
    minimo: number
    ativo: boolean
  }[]).map(
    (i): Insumo => ({
      id: i.id,
      nome: i.nome,
      tipo: i.tipo,
      frascoMl: (i.frasco_ml as 8 | 15 | null) ?? null,
      unidades: i.unidades,
      custoUnitario: Number(i.custo_unitario),
      minimo: i.minimo,
      ativo: i.ativo,
    }),
  )

  // A fila diz quantas unidades de cada variante estão vendidas e não saíram;
  // `insumosDe` traduz isso em frascos, válvulas e tampas.
  const itensDaFila = fila.porPedido.flatMap((p) =>
    p.itens.map((i) => ({ variante: i.variante as VarianteMl, unidades: i.unidades })),
  )
  const necessario = insumosDoEnvase(itensDaFila)

  const saidas = new Map<string, number>()
  for (const m of (consumo ?? []) as unknown as { insumo_id: string; unidades: number }[]) {
    saidas.set(m.insumo_id, (saidas.get(m.insumo_id) ?? 0) + Math.abs(m.unidades))
  }

  const itens = insumos.map((i) =>
    avaliarInsumo(i, necessario.get(i.id) ?? 0, (saidas.get(i.id) ?? 0) / 30),
  )

  return {
    itens,
    totalUnidades: itens.reduce((a, i) => a + i.insumo.unidades, 0),
    valorEmEstoque: itens.reduce((a, i) => a + i.valorEmEstoque, 0),
    insuficientes: itens.filter((i) => i.estado === 'insuficiente' || i.estado === 'zerado').length,
    abaixoDoMinimo: itens.filter((i) => i.estado === 'baixo').length,
    semBanco: false,
  }
}
