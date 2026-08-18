import 'server-only'

import {
  alertasFinanceiros,
  avaliarVenda,
  brl,
  coberturaDeCaixa,
  competenciaAnterior,
  diaDaOperacao,
  LANCAMENTOS_POR_PAGINA,
  mesmoDiaNoProximoMes,
  montarDreGerencial,
  movimentacaoInterna,
  projetarCaixa,
  situacaoDe,
  saldoAberto,
  SEM_CATEGORIA,
  type AlertaFinanceiro,
  type CategoriaGerencial,
  type ContaFinanceira,
  type DreGerencial,
  type FiltroDeLancamentos,
  type LancamentoGerencial,
  type NaturezaGerencial,
  type OrigemSaldo,
  type ProjecaoDeCaixa,
  type SituacaoLancamento,
  type StatusVenda,
  type VendaConciliada,
  hojeEmSaoPaulo,
} from '@/domain'

import { supabaseConfigurado, supabaseServer, tudoDe } from './supabase'

/**
 * Leituras do módulo Financeiro.
 *
 * Cada função devolve o que UMA tela precisa, já derivado. As telas não fazem
 * conta: subtotal, projeção e status vêm daqui ou do domínio, e assim o mesmo
 * número aparece igual no card, na tabela e na exportação.
 *
 * Todas devolvem `semBanco` em vez de lançar — o ERP roda sem Supabase em
 * desenvolvimento, e uma tela quebrada não é um diagnóstico melhor que um
 * estado vazio explicado.
 */

const HOJE = () => hojeEmSaoPaulo()

/**
 * Prazo de repasse da Pagaleve, o intermediário de Pix parcelado.
 *
 * O cliente parcela em até 4x com 15 dias entre parcelas, então o valor só
 * fecha em 45 dias. Cobrar o prazo dos gateways integrados dessas vendas
 * inventa pendência onde há uma venda amortizando no combinado.
 */
const PRAZO_PAGALEVE_DIAS = 45

/**
 * N dias à frente (ou atrás) de HOJE, no calendário de São Paulo.
 *
 * Somar milissegundos sobre `Date.now()` e cortar o ISO herda o mesmo erro de
 * fuso do `HOJE()`: das 21h à meia-noite, "hoje + 30" devolvia 31 dias.
 * Ancorar no meio-dia da data local mantém a conta longe das bordas de
 * horário de verão também.
 */
function iso(dias: number): string {
  const base = new Date(`${hojeEmSaoPaulo()}T12:00:00Z`)
  base.setUTCDate(base.getUTCDate() + dias)
  return base.toISOString().slice(0, 10)
}

// ── Contas ─────────────────────────────────────────────────────────────────

interface LinhaConta {
  id: string
  nome: string
  tipo: string
  banco: string
  finalidade: string | null
  principal: boolean
  ativa: boolean
  origem_saldo: string
  saldo_disponivel: number | string
  saldo_a_liquidar: number | string
  saldo_bloqueado: number | string
  saldo_calculado: number | string
  saldo_informado: number | string
  saldo_informado_para: string | null
  movimentos_desde_o_informado: number | string | null
  entradas_30d: number | string
  saidas_30d: number | string
  sincronizado_em: string | null
  sincronizacao_status: string | null
  cor: string | null
}

export async function lerContas(): Promise<ContaFinanceira[]> {
  if (!supabaseConfigurado()) return []
  const linhas = await tudoDe<LinhaConta>('saldos_das_contas', (de, ate) =>
    supabaseServer()
      .from('saldos_das_contas')
      .select('*')
      // Conta encerrada não entra no caixa disponível. A do gateway anterior
      // estava somando R$ 41 mil que não existiam mais — o dinheiro foi
      // sacado e gasto meses atrás, e o saldo só permanecia porque a
      // importação das vendas deixou os lançamentos apontando para ela. Os
      // lançamentos ficam, que é o que concilia a venda; o SALDO não.
      .eq('ativa', true)
      .order('principal', { ascending: false })
      .range(de, ate) as unknown as PromiseLike<{ data: LinhaConta[] | null; error: unknown }>,
  )
  return linhas.map(
    (c): ContaFinanceira => ({
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      banco: c.banco,
      finalidade: c.finalidade,
      principal: c.principal,
      ativa: c.ativa,
      origemSaldo: (c.origem_saldo ?? 'calculado') as OrigemSaldo,
      saldoDisponivel: Number(c.saldo_disponivel),
      saldoALiquidar: Number(c.saldo_a_liquidar),
      saldoBloqueado: Number(c.saldo_bloqueado),
      saldoCalculado: Number(c.saldo_calculado),
      saldoInformado: Number(c.saldo_informado),
      saldoInformadoPara: c.saldo_informado_para ?? null,
      movimentosDesdeOInformado: Number(c.movimentos_desde_o_informado ?? 0),
      entradas30d: Number(c.entradas_30d),
      saidas30d: Number(c.saidas_30d),
      sincronizadoEm: c.sincronizado_em,
      sincronizacaoStatus: c.sincronizacao_status,
      cor: c.cor,
    }),
  )
}

// ── Lançamentos ────────────────────────────────────────────────────────────

interface LinhaLancamento {
  id: string
  descricao: string
  favorecido: string | null
  tipo: string
  categoria: string | null
  categoria_id: string | null
  centro_custo: string | null
  // Nulo no banco também, ainda que hoje toda linha tenha conta.
  conta_id: string | null
  competencia: string
  ocorrido_em: string
  vence_em: string | null
  baixado_em: string | null
  valor: number | string
  recebido: number | string
  multa: number | string
  juros: number | string
  desconto: number | string
  parcela: number | null
  parcelas: number | null
  recorrente: boolean
  recorrencia: string | null
  origem: string
  documento: string | null
  observacao: string | null
  transferencia_id: string | null
  cancelado_em: string | null
  categorias_financeiras: {
    natureza_gerencial: string
    impacta_dre: boolean
    impacta_caixa: boolean
  } | null
  contas_bancarias: { nome: string } | null
}

/**
 * O `!coluna` depois do nome da tabela não é enfeite.
 *
 * `lancamentos` tem DUAS chaves estrangeiras para `categorias_financeiras`
 * (`categoria`, que aponta para o nome, e `categoria_id`) e duas para
 * `contas_bancarias` (`conta_id` e `conta_destino_id`, esta última usada pela
 * transferência). Sem dizer qual delas seguir, o PostgREST recusa a consulta
 * inteira com PGRST201 — e a tela de Lançamentos não carregaria nenhuma linha.
 */
const CAMPOS_LANCAMENTO =
  'id, descricao, favorecido, tipo, categoria, categoria_id, centro_custo, conta_id, ' +
  'competencia, ocorrido_em, vence_em, baixado_em, valor, recebido, multa, juros, desconto, ' +
  'parcela, parcelas, recorrente, recorrencia, origem, documento, observacao, ' +
  'transferencia_id, cancelado_em, ' +
  'categorias_financeiras!lancamentos_categoria_id_fkey(natureza_gerencial, impacta_dre, impacta_caixa), ' +
  'contas_bancarias!lancamentos_conta_id_fkey(nome)'

export async function lerLancamentos(opcoes?: {
  de?: string
  ate?: string
  limite?: number
}): Promise<LancamentoGerencial[]> {
  if (!supabaseConfigurado()) return []

  const linhas = await tudoDe<LinhaLancamento>('lancamentos', (deIdx, ateIdx) => {
    let q = supabaseServer().from('lancamentos').select(CAMPOS_LANCAMENTO)
    // O filtro é por COMPETÊNCIA quando o período é o da DRE, e a tela de
    // lançamentos filtra por vencimento — quem chama escolhe passando as
    // datas; aqui a janela ampla cobre os dois usos sem duas consultas.
    if (opcoes?.de) q = q.gte('competencia', opcoes.de)
    if (opcoes?.ate) q = q.lte('competencia', opcoes.ate)
    return q
      // Do mais recente para o mais antigo. Ordenar por `vence_em` empurrava
      // 1.223 das 1.244 linhas para o fim da consulta — todas as que já
      // aconteceram, que são justamente as que a tela precisa mostrar.
      .order('ocorrido_em', { ascending: false })
      .range(deIdx, ateIdx) as unknown as PromiseLike<{
      data: LinhaLancamento[] | null
      error: unknown
    }>
  })

  return linhas.map(
    (l): LancamentoGerencial => ({
      id: l.id,
      descricao: l.descricao,
      favorecido: l.favorecido,
      tipo: l.tipo === 'entrada' ? 'entrada' : 'saida',
      categoriaId: l.categoria_id,
      categoria: l.categoria,
      natureza: (l.categorias_financeiras?.natureza_gerencial ?? null) as NaturezaGerencial | null,
      centroCusto: l.centro_custo,
      // Conta some do banco em teoria; na tela ela vira um traço, e nunca
      // `null` cru — o domínio promete texto aqui e as colunas confiam nisso.
      contaId: l.conta_id ?? '',
      conta: l.contas_bancarias?.nome ?? l.conta_id ?? '—',
      competencia: l.competencia,
      // O banco preenche `ocorrido_em` em toda linha; o coalesce é rede de
      // segurança para lançamento antigo criado antes da coluna existir.
      ocorridoEm: l.ocorrido_em ?? l.baixado_em ?? l.vence_em ?? l.competencia,
      venceEm: l.vence_em,
      baixadoEm: l.baixado_em,
      valor: Number(l.valor),
      recebido: Number(l.recebido),
      multa: Number(l.multa ?? 0),
      juros: Number(l.juros ?? 0),
      desconto: Number(l.desconto ?? 0),
      parcela: l.parcela,
      parcelas: l.parcelas,
      recorrente: l.recorrente,
      recorrencia: l.recorrencia,
      origem: l.origem,
      documento: l.documento,
      observacao: l.observacao,
      transferenciaId: l.transferencia_id,
      canceladoEm: l.cancelado_em,
      // Sem categoria, o lançamento conta nos dois regimes: é dinheiro que
      // andou e ainda não foi explicado. Silenciá-lo por falta de cadastro
      // seria premiar o que está por classificar.
      impactaDre: l.categorias_financeiras?.impacta_dre ?? true,
      impactaCaixa: l.categorias_financeiras?.impacta_caixa ?? true,
    }),
  )
}

// ── A tela de Lançamentos: filtro, página e totais vindos do banco ─────────
//
// `carregarLancamentos` abaixo continua existindo e continua lendo tudo — o
// Assessor pede a lista inteira de propósito, para responder perguntas em
// linguagem natural sobre ela. O que NÃO podia continuar é a TELA usar esse
// caminho: ela chamava `carregarLancamentos()` sem argumento, recebia as 1.268
// linhas (444.783 bytes medidos, 2 requisições PostgREST) e aplicava o filtro,
// a ordenação e a paginação em JavaScript. Com `?q=Icaro` isso significava
// transferir 434 KB para desenhar UMA linha — a razão medida foi 1268:1.
//
// Aqui a consulta desce inteira para o Postgres em UMA chamada de RPC, que
// devolve a página de 50 linhas E os somatórios do filtro inteiro no mesmo
// jsonb. Os somatórios voltarem juntos não é economia de round-trip: é a única
// forma de o rodapé continuar dizendo a verdade. Somar as 50 linhas visíveis
// faria "A pagar em aberto" encolher a cada página virada — um erro pior que a
// lentidão, porque não aparece.

/** Somatórios do FILTRO INTEIRO — nunca da página visível. */
export interface ResumoDoFiltro {
  /** Linhas que o filtro devolve, contadas no banco. */
  total: number
  entrou: number
  saiu: number
  movimentosEntrada: number
  movimentosSaida: number
  aReceberAberto: number
  aPagarAberto: number
}

/** Um vencimento à frente, já com o que falta receber ou pagar. */
export interface ProximoVencimento {
  id: string
  descricao: string
  venceEm: string
  categoria: string | null
  tipo: 'entrada' | 'saida'
  saldoAberto: number
}

/**
 * Os números que NÃO dependem do filtro da tela.
 *
 * Os cinco cartões do rodapé, o painel "Resumo do período", "Próximos
 * vencimentos" e os avisos de lançamento incompleto sempre falaram da base
 * inteira — eram calculados sobre a lista completa em memória. Com a lista
 * paginada essa fonte deixou de existir, e sem esta agregação eles passariam
 * a descrever só as 50 linhas da tela.
 */
export interface PanoramaDosLancamentos {
  /** Todos os lançamentos da base, cancelados inclusive: o "de 1268" do rodapé. */
  totalDaBase: number
  qtdSaidas: number
  qtdPagas: number
  /** Dias entre vencimento e baixa. Negativo é antecipação; null é "não dá para medir". */
  prazoPagamento: number | null
  prazoRecebimento: number | null
  totalAPagar: number
  totalAReceber: number
  vencidos: { valor: number; qtd: number }
  recorrentes: { valor: number; qtd: number }
  aprovacoes: { valor: number; qtd: number }
  semCategoria: { qtd: number; valor: number }
  semVencimento: { qtd: number; valor: number }
  recorrentesPorCategoria: { rotulo: string; valor: number }[]
  proximos: ProximoVencimento[]
}

/** Uma linha da lista, com a situação já derivada pelo banco. */
export interface LinhaDaTela {
  lancamento: LancamentoGerencial
  situacao: SituacaoLancamento
}

export interface TelaDeLancamentos {
  linhas: LinhaDaTela[]
  /**
   * O lançamento do `?lancamento=`, buscado FORA do filtro.
   *
   * O link do Assessor aponta para um lançamento sem saber que filtro está
   * valendo aqui, e um cancelado — que a lista esconde por padrão — continua
   * sendo um registro que alguém precisa abrir para entender o que aconteceu.
   */
  alvo: LinhaDaTela | null
  pagina: number
  paginas: number
  resumo: ResumoDoFiltro
  panorama: PanoramaDosLancamentos
  categorias: CategoriaGerencial[]
  contas: ContaFinanceira[]
  centrosCusto: { id: string; nome: string }[]
  hoje: string
  saldoProjetado: number
  semBanco: boolean
}

/** A linha como o `lancamentos_da_tela` devolve: joins achatados, situação pronta. */
interface LinhaDaRpc extends Omit<LinhaLancamento, 'categorias_financeiras' | 'contas_bancarias'> {
  natureza_gerencial: string | null
  impacta_dre: boolean
  impacta_caixa: boolean
  conta_nome: string | null
  saldo: number | string
  situacao: string
}

function traduzirLinhaDaTela(l: LinhaDaRpc): LinhaDaTela {
  return {
    lancamento: {
      id: l.id,
      descricao: l.descricao,
      favorecido: l.favorecido,
      tipo: l.tipo === 'entrada' ? 'entrada' : 'saida',
      categoriaId: l.categoria_id,
      categoria: l.categoria,
      natureza: (l.natureza_gerencial ?? null) as NaturezaGerencial | null,
      centroCusto: l.centro_custo,
      // Conta some do banco em teoria; na tela ela vira um traço, e nunca
      // `null` cru — o domínio promete texto aqui e as colunas confiam nisso.
      contaId: l.conta_id ?? '',
      conta: l.conta_nome ?? l.conta_id ?? '—',
      competencia: l.competencia,
      ocorridoEm: l.ocorrido_em ?? l.baixado_em ?? l.vence_em ?? l.competencia,
      venceEm: l.vence_em,
      baixadoEm: l.baixado_em,
      valor: Number(l.valor),
      recebido: Number(l.recebido),
      multa: Number(l.multa ?? 0),
      juros: Number(l.juros ?? 0),
      desconto: Number(l.desconto ?? 0),
      parcela: l.parcela,
      parcelas: l.parcelas,
      recorrente: l.recorrente,
      recorrencia: l.recorrencia,
      origem: l.origem,
      documento: l.documento,
      observacao: l.observacao,
      transferenciaId: l.transferencia_id,
      canceladoEm: l.cancelado_em,
      impactaDre: l.impacta_dre,
      impactaCaixa: l.impacta_caixa,
    },
    // A situação vem do banco porque foi lá que ela precisou existir para o
    // `?situacao=vencido` filtrar. Recalculá-la aqui com `situacaoDe` daria o
    // mesmo resultado — e é justamente por isso que ela não é recalculada:
    // dois cálculos da mesma regra é um convite a divergirem.
    situacao: l.situacao as SituacaoLancamento,
  }
}

/** `null` quando não há o que medir — a tela escreve "—", não "0,0 dias". */
function numeroOuNulo(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v)
}

export async function carregarTelaDeLancamentos(
  filtro: FiltroDeLancamentos,
): Promise<TelaDeLancamentos> {
  const hoje = HOJE()
  const vazio: TelaDeLancamentos = {
    linhas: [],
    alvo: null,
    pagina: 1,
    paginas: 1,
    resumo: {
      total: 0,
      entrou: 0,
      saiu: 0,
      movimentosEntrada: 0,
      movimentosSaida: 0,
      aReceberAberto: 0,
      aPagarAberto: 0,
    },
    panorama: {
      totalDaBase: 0,
      qtdSaidas: 0,
      qtdPagas: 0,
      prazoPagamento: null,
      prazoRecebimento: null,
      totalAPagar: 0,
      totalAReceber: 0,
      vencidos: { valor: 0, qtd: 0 },
      recorrentes: { valor: 0, qtd: 0 },
      aprovacoes: { valor: 0, qtd: 0 },
      semCategoria: { qtd: 0, valor: 0 },
      semVencimento: { qtd: 0, valor: 0 },
      recorrentesPorCategoria: [],
      proximos: [],
    },
    categorias: [],
    contas: [],
    centrosCusto: [],
    hoje,
    saldoProjetado: 0,
    semBanco: false,
  }
  if (!supabaseConfigurado()) return { ...vazio, semBanco: true }

  const sb = supabaseServer()
  // Quatro leituras independentes, uma onda só. Antes eram 12 requisições
  // PostgREST por render (19 com o detalhe aberto): duas páginas de 1.000
  // lançamentos, o catálogo inteiro de perfumes para alimentar um modal
  // fechado, e `lerContas` duas vezes na mesma renderização.
  const [lista, panorama, categorias, contas, centros] = await Promise.all([
    sb.rpc('lancamentos_da_tela', {
      p_hoje: hoje,
      // Janela vazia vira `null`, não string vazia: `ocorrido_em >= ''` é erro
      // de tipo no Postgres, e é assim que "Tudo" se diz.
      p_de: filtro.de || null,
      p_ate: filtro.ate || null,
      p_situacao: filtro.situacao,
      p_tipo: filtro.tipo,
      p_categoria: filtro.categoria,
      p_conta: filtro.conta,
      p_centro: filtro.centro,
      p_venc: filtro.venc,
      p_recorrente: filtro.recorrente,
      p_q: filtro.q,
      p_pagina: filtro.pagina,
      p_por_pagina: LANCAMENTOS_POR_PAGINA,
      p_lancamento: filtro.lancamento,
    }),
    sb.rpc('panorama_dos_lancamentos', { p_hoje: hoje }),
    lerCategorias(),
    lerContas(),
    lerCentrosCusto(),
  ])

  if (lista.error) throw lista.error
  if (panorama.error) throw panorama.error

  const l = lista.data as {
    linhas: LinhaDaRpc[]
    total: number
    pagina: number
    paginas: number
    resumo: Record<string, number>
    alvo: LinhaDaRpc | null
  }
  const p = panorama.data as {
    totais: Record<string, number | null>
    recorrentesPorCategoria: { rotulo: string; valor: number | string }[]
    proximos: {
      id: string
      descricao: string
      vence_em: string
      categoria: string | null
      tipo: string
      saldo: number | string
    }[]
  }
  const t = p.totais

  const totalAPagar = Number(t.total_a_pagar ?? 0)
  const totalAReceber = Number(t.total_a_receber ?? 0)
  const disponivel = contas.reduce((a, c) => a + c.saldoDisponivel, 0)

  return {
    linhas: (l.linhas ?? []).map(traduzirLinhaDaTela),
    alvo: l.alvo ? traduzirLinhaDaTela(l.alvo) : null,
    pagina: l.pagina,
    paginas: l.paginas,
    resumo: {
      total: Number(l.resumo.total ?? 0),
      entrou: Number(l.resumo.entrou ?? 0),
      saiu: Number(l.resumo.saiu ?? 0),
      movimentosEntrada: Number(l.resumo.movimentos_entrada ?? 0),
      movimentosSaida: Number(l.resumo.movimentos_saida ?? 0),
      aReceberAberto: Number(l.resumo.a_receber_aberto ?? 0),
      aPagarAberto: Number(l.resumo.a_pagar_aberto ?? 0),
    },
    panorama: {
      totalDaBase: Number(t.total_da_base ?? 0),
      qtdSaidas: Number(t.qtd_saidas ?? 0),
      qtdPagas: Number(t.qtd_pagas ?? 0),
      prazoPagamento: numeroOuNulo(t.prazo_pagamento),
      prazoRecebimento: numeroOuNulo(t.prazo_recebimento),
      totalAPagar,
      totalAReceber,
      vencidos: { valor: Number(t.vencidos_valor ?? 0), qtd: Number(t.vencidos_qtd ?? 0) },
      recorrentes: {
        valor: Number(t.recorrentes_valor ?? 0),
        qtd: Number(t.recorrentes_qtd ?? 0),
      },
      aprovacoes: { valor: Number(t.aprovacoes_valor ?? 0), qtd: Number(t.aprovacoes_qtd ?? 0) },
      semCategoria: {
        qtd: Number(t.sem_categoria_qtd ?? 0),
        valor: Number(t.sem_categoria_valor ?? 0),
      },
      semVencimento: {
        qtd: Number(t.sem_vencimento_qtd ?? 0),
        valor: Number(t.sem_vencimento_valor ?? 0),
      },
      recorrentesPorCategoria: (p.recorrentesPorCategoria ?? []).map((r) => ({
        rotulo: r.rotulo,
        valor: Number(r.valor),
      })),
      proximos: (p.proximos ?? []).map((x) => ({
        id: x.id,
        descricao: x.descricao,
        venceEm: x.vence_em,
        categoria: x.categoria,
        tipo: x.tipo === 'entrada' ? 'entrada' : 'saida',
        saldoAberto: Number(x.saldo),
      })),
    },
    categorias,
    contas,
    centrosCusto: centros,
    hoje,
    saldoProjetado: Math.round((disponivel + totalAReceber - totalAPagar) * 100) / 100,
    semBanco: false,
  }
}

export interface PainelLancamentos {
  lancamentos: LancamentoGerencial[]
  categorias: CategoriaGerencial[]
  contas: ContaFinanceira[]
  centrosCusto: { id: string; nome: string }[]
  hoje: string
  aPagarHoje: { valor: number; qtd: number }
  aReceberHoje: { valor: number; qtd: number }
  vencidos: { valor: number; qtd: number }
  recorrentes: { valor: number; qtd: number }
  aprovacoes: { valor: number; qtd: number }
  saldoProjetado: number
  semBanco: boolean
}

export async function carregarLancamentos(periodo?: {
  de: string
  ate: string
}): Promise<PainelLancamentos> {
  const vazio: PainelLancamentos = {
    lancamentos: [],
    categorias: [],
    contas: [],
    centrosCusto: [],
    hoje: HOJE(),
    aPagarHoje: { valor: 0, qtd: 0 },
    aReceberHoje: { valor: 0, qtd: 0 },
    vencidos: { valor: 0, qtd: 0 },
    recorrentes: { valor: 0, qtd: 0 },
    aprovacoes: { valor: 0, qtd: 0 },
    saldoProjetado: 0,
    semBanco: false,
  }
  if (!supabaseConfigurado()) return { ...vazio, semBanco: true }

  const hoje = HOJE()
  const [lancamentos, categorias, contas, centros] = await Promise.all([
    lerLancamentos(periodo ? { de: periodo.de, ate: periodo.ate } : undefined),
    lerCategorias(),
    lerContas(),
    lerCentrosCusto(),
  ])

  const vivos = lancamentos.filter((l) => !l.canceladoEm)
  const porSituacao = (s: SituacaoLancamento) => vivos.filter((l) => situacaoDe(l, hoje) === s)

  const soma = (ls: LancamentoGerencial[]) => ls.reduce((a, l) => a + saldoAberto(l), 0)

  const vencendoHoje = vivos.filter((l) => l.venceEm === hoje && saldoAberto(l) > 0)
  const vencidos = porSituacao('vencido')
  const recorrentes = vivos.filter((l) => l.recorrente)

  const disponivel = contas.reduce((a, c) => a + c.saldoDisponivel, 0)
  const aReceberTudo = vivos.filter((l) => l.tipo === 'entrada')
  const aPagarTudo = vivos.filter((l) => l.tipo === 'saida')

  return {
    lancamentos,
    categorias,
    contas,
    centrosCusto: centros,
    hoje,
    aPagarHoje: {
      valor: soma(vencendoHoje.filter((l) => l.tipo === 'saida')),
      qtd: vencendoHoje.filter((l) => l.tipo === 'saida').length,
    },
    aReceberHoje: {
      valor: soma(vencendoHoje.filter((l) => l.tipo === 'entrada')),
      qtd: vencendoHoje.filter((l) => l.tipo === 'entrada').length,
    },
    vencidos: { valor: soma(vencidos), qtd: vencidos.length },
    recorrentes: { valor: recorrentes.reduce((a, l) => a + l.valor, 0), qtd: recorrentes.length },
    // "Pendências de aprovação" do mockup: o que veio de integração e ainda
    // não foi conferido por gente.
    aprovacoes: (() => {
      const auto = vivos.filter((l) => l.origem !== 'Manual' && !l.baixadoEm)
      return { valor: soma(auto), qtd: auto.length }
    })(),
    saldoProjetado: Math.round((disponivel + soma(aReceberTudo) - soma(aPagarTudo)) * 100) / 100,
    semBanco: false,
  }
}

// ── Detalhe de um lançamento ───────────────────────────────────────────────

/**
 * Chaves do `bruto` (jsonb) do extrato que PODEM aparecer na tela, e como se
 * chamam em português.
 *
 * É uma lista de permissão, não de bloqueio, e o motivo é concreto: o payload
 * do Pagar.me carrega `email` do comprador junto da tarifa. Despejar o jsonb
 * inteiro num painel do Financeiro publicaria o e-mail de quem comprou numa
 * tela que ninguém abre para isso. Chave nova que o gateway inventar amanhã
 * fica de fora até alguém decidir que ela deve entrar.
 */
const CAMPOS_DO_GATEWAY: { chave: string; rotulo: string; dinheiro: boolean }[] = [
  { chave: 'bruto', rotulo: 'Bruto informado pelo gateway', dinheiro: true },
  { chave: 'pago', rotulo: 'Pago pelo cliente', dinheiro: true },
  { chave: 'tarifa', rotulo: 'Tarifa cobrada pelo gateway', dinheiro: true },
  { chave: 'impostos', rotulo: 'Impostos retidos', dinheiro: true },
  { chave: 'liquido', rotulo: 'Líquido creditado', dinheiro: true },
  { chave: 'parcelas', rotulo: 'Parcelas', dinheiro: false },
  { chave: 'meio', rotulo: 'Meio de pagamento', dinheiro: false },
  { chave: 'adquirente', rotulo: 'Adquirente', dinheiro: false },
  { chave: 'origem_relatorio', rotulo: 'Relatório de origem', dinheiro: false },
  { chave: 'fonte', rotulo: 'Identificador na origem', dinheiro: false },
  { chave: 'pedido_pagarme', rotulo: 'Pedido no Pagar.me', dinheiro: false },
]

/** A linha do extrato como o gateway a mandou, sem tradução do ERP. */
export interface LinhaCruaDoExtrato {
  /** 'mercadopago' | 'pagarme' — o nome técnico do arquivo, não o rótulo bonito. */
  origem: string
  chave: string
  ocorridoEm: string
  descricao: string
  contraparte: string
  documento: string
  tipo: 'entrada' | 'saida'
  valor: number
  interno: boolean
  ignorado: boolean
  motivoIgnorado: string
  lidoEm: string | null
  /** O que o gateway informou junto da linha, já filtrado (ver CAMPOS_DO_GATEWAY). */
  detalhesDoGateway: { rotulo: string; valor: string }[]
}

/** Outro lançamento amarrado a este por um FATO gravado, nunca por semelhança. */
export interface LancamentoIrmao {
  id: string
  descricao: string
  tipo: 'entrada' | 'saida'
  valor: number
  categoria: string | null
  ocorridoEm: string
  conta: string
  cancelado: boolean
  /** O que amarra os dois: o mesmo pedido ou as duas pernas da transferência. */
  vinculo: 'pedido' | 'transferencia'
}

export interface PedidoDoLancamento {
  id: string
  canal: string
  situacao: string | null
  pagamento: string
  gateway: string | null
  valor: number
  frete: number
  cashback: number
  compradoEm: string
  cliente: string | null
  itens: { descricao: string; variante: string | null; quantidade: number; preco: number }[]
}

export interface EdicaoRegistrada {
  id: number
  ocorridoEm: string
  acao: string
  operador: string | null
  justificativa: string | null
}

/**
 * Tudo que o banco sabe EXPLICAR sobre um lançamento.
 *
 * `lerLancamentos` traz o que a lista precisa e para por aí — `chave_externa`,
 * `pedido_id` e `criado_por` ficam de fora de propósito, porque multiplicar
 * três textos por 1.264 linhas é payload que ninguém lê. A pergunta "o que é
 * este lançamento?" só existe para UM de cada vez, e é aqui que ela é
 * respondida: procedência, linha de extrato que o originou, irmãos ligados
 * pelo mesmo pedido ou pela mesma transferência, o pedido que o gerou e o
 * histórico de edições.
 */
export interface ExplicacaoLancamento {
  id: string
  chaveExterna: string | null
  pedidoId: string | null
  /** O nome da outra ponta da transferência; o id fica no banco, sem uso na tela. */
  contaDestino: string | null
  serieId: string | null
  recorrenciaAte: string | null
  canceladoMotivo: string | null
  criadoEm: string | null
  /** Quem criou: 'conversão automática', 'regra: …' ou o nome de quem digitou. */
  criadoPor: string | null
  atualizadoEm: string | null
  /** Saque do gateway sem destino declarado — fora do caixa e fora da DRE. */
  aguardaDestino: boolean
  extrato: LinhaCruaDoExtrato | null
  irmaos: LancamentoIrmao[]
  pedido: PedidoDoLancamento | null
  historico: EdicaoRegistrada[]
  /** Quais das leituras acima FALHARAM — ver `LeiturasQueFalharam`. */
  naoLidas: LeiturasQueFalharam
}

/**
 * Quais leituras do detalhe falharam.
 *
 * Existe porque array vazio por ERRO e array vazio por AUSÊNCIA são a mesma
 * coisa para quem só olha o `.data`, e a tela transformava os dois na mesma
 * frase afirmativa. Sem esta distinção, uma consulta que falhou virava "este é
 * o único movimento financeiro registrado para o pedido", "o pedido não está
 * mais na base" ou — pior de todas — "nenhuma alteração registrada" numa
 * trilha de auditoria. Erro de rede não pode sair da tela como fato sobre o
 * dinheiro.
 */
export interface LeiturasQueFalharam {
  extrato: boolean
  irmaos: boolean
  pedido: boolean
  historico: boolean
}

interface IrmaoCru {
  id: string
  descricao: string
  tipo: string
  valor: number | string
  categoria: string | null
  ocorrido_em: string
  cancelado_em: string | null
  conta_id: string | null
  contas_bancarias: { nome: string } | null
}

const CAMPOS_IRMAO =
  'id, descricao, tipo, valor, categoria, ocorrido_em, cancelado_em, conta_id, ' +
  'contas_bancarias!lancamentos_conta_id_fkey(nome)'

function traduzirIrmao(l: IrmaoCru, vinculo: 'pedido' | 'transferencia'): LancamentoIrmao {
  return {
    id: l.id,
    descricao: l.descricao,
    tipo: l.tipo === 'entrada' ? 'entrada' : 'saida',
    valor: Number(l.valor),
    categoria: l.categoria,
    ocorridoEm: l.ocorrido_em,
    conta: l.contas_bancarias?.nome ?? l.conta_id ?? '—',
    cancelado: Boolean(l.cancelado_em),
    vinculo,
  }
}

export async function explicarLancamento(id: string): Promise<ExplicacaoLancamento | null> {
  if (!supabaseConfigurado() || !id) return null

  const sb = supabaseServer()
  const { data: base, error } = await sb
    .from('lancamentos')
    .select(
      'id, chave_externa, pedido_id, transferencia_id, conta_destino_id, serie_id, ' +
        'recorrencia_ate, cancelado_motivo, criado_em, criado_por, atualizado_em, aguarda_destino',
    )
    .eq('id', id)
    .maybeSingle()
  // Sem log, "não deu para ler" some no servidor e o dono fica com uma tela
  // que diz que algo falhou e ninguém consegue dizer o quê.
  if (error) console.error('[financeiro] explicar lançamento falhou:', id, error)
  if (error || !base) return null

  const l = base as unknown as {
    id: string
    chave_externa: string | null
    pedido_id: string | null
    transferencia_id: string | null
    conta_destino_id: string | null
    serie_id: string | null
    recorrencia_ate: string | null
    cancelado_motivo: string | null
    criado_em: string | null
    criado_por: string | null
    atualizado_em: string | null
    aguarda_destino: boolean | null
  }

  const [extrato, porPedido, porTransferencia, pedido, historico, contaDestino] = await Promise.all([
    // A ligação é 1:1 (toda linha do extrato tem lançamento, e o par nunca se
    // repete), mas a leitura não usa `maybeSingle`: uma importação torta que
    // apontasse duas linhas para o mesmo lançamento derrubaria a tela inteira
    // em vez de mostrar o detalhe com a primeira delas.
    sb
      .from('extrato_linhas')
      .select(
        'origem, chave, ocorrido_em, descricao, contraparte, documento, tipo, valor, ' +
          'interno, ignorado, motivo_ignorado, lido_em, bruto',
      )
      .eq('lancamento_id', id)
      .limit(1),
    // O ramo "não perguntei" precisa carregar `error: null` como o ramo que
    // consulta: sem ele o tipo da união não tem `error`, e foi assim que a
    // falha das leituras deste bloco ficou impossível de checar.
    l.pedido_id
      ? sb.from('lancamentos').select(CAMPOS_IRMAO).eq('pedido_id', l.pedido_id).neq('id', id)
      : Promise.resolve({ data: [], error: null }),
    l.transferencia_id
      ? sb
          .from('lancamentos')
          .select(CAMPOS_IRMAO)
          .eq('transferencia_id', l.transferencia_id)
          .neq('id', id)
      : Promise.resolve({ data: [], error: null }),
    l.pedido_id
      ? sb
          .from('pedidos')
          .select(
            'id, canal, situacao, pagamento, gateway, valor, frete, cashback, comprado_em, ' +
              // Só o NOME do cliente: e-mail, CPF e telefone não têm o que fazer
              // num painel que explica de onde veio um lançamento.
              'clientes(nome), pedido_itens(descricao, variante_titulo, quantidade, preco)',
          )
          .eq('id', l.pedido_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sb
      .from('financeiro_auditoria')
      .select('id, ocorrido_em, acao, operador, justificativa')
      .eq('entidade', 'lancamento')
      .eq('entidade_id', id)
      .order('ocorrido_em', { ascending: false })
      .limit(20),
    l.conta_destino_id
      ? sb.from('contas_bancarias').select('nome').eq('id', l.conta_destino_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  // Uma leitura que falhou é registrada no servidor e MARCADA para a tela. O
  // que não pode acontecer é o `.data` nulo virar array vazio e a tela ler
  // esse vazio como resposta: "nenhum irmão", "pedido removido da base",
  // "nenhuma alteração registrada" são afirmações sobre o dinheiro, e nenhuma
  // delas pode nascer de um timeout do Postgres.
  const naoLidas = {
    extrato: Boolean(extrato.error),
    irmaos: Boolean(porPedido.error || porTransferencia.error),
    pedido: Boolean(pedido.error),
    historico: Boolean(historico.error),
  }
  for (const [secao, falhou] of Object.entries(naoLidas)) {
    if (falhou) console.error('[financeiro] detalhe do lançamento', id, '— falhou lendo', secao)
  }

  const linha = ((extrato.data ?? []) as unknown as {
    origem: string
    chave: string
    ocorrido_em: string
    descricao: string
    contraparte: string
    documento: string
    tipo: string
    valor: number | string
    interno: boolean
    ignorado: boolean
    motivo_ignorado: string
    lido_em: string | null
    bruto: Record<string, unknown> | null
  }[])[0]

  const p = (pedido.data ?? null) as unknown as {
    id: string
    canal: string
    situacao: string | null
    pagamento: string
    gateway: string | null
    valor: number | string
    frete: number | string
    cashback: number | string
    comprado_em: string
    clientes: { nome: string } | null
    pedido_itens: {
      descricao: string
      variante_titulo: string | null
      quantidade: number
      preco: number | string
    }[] | null
  } | null

  return {
    id: l.id,
    chaveExterna: l.chave_externa,
    pedidoId: l.pedido_id,
    contaDestino: ((contaDestino.data ?? null) as { nome: string } | null)?.nome ?? null,
    serieId: l.serie_id,
    recorrenciaAte: l.recorrencia_ate,
    canceladoMotivo: l.cancelado_motivo,
    criadoEm: l.criado_em,
    criadoPor: l.criado_por,
    atualizadoEm: l.atualizado_em,
    aguardaDestino: Boolean(l.aguarda_destino),
    extrato: linha
      ? {
          origem: linha.origem,
          chave: linha.chave,
          ocorridoEm: linha.ocorrido_em,
          descricao: linha.descricao,
          contraparte: linha.contraparte,
          documento: linha.documento,
          tipo: linha.tipo === 'saida' ? 'saida' : 'entrada',
          valor: Number(linha.valor),
          interno: Boolean(linha.interno),
          ignorado: Boolean(linha.ignorado),
          motivoIgnorado: linha.motivo_ignorado ?? '',
          lidoEm: linha.lido_em,
          detalhesDoGateway: CAMPOS_DO_GATEWAY.flatMap(({ chave, rotulo, dinheiro }) => {
            const v = linha.bruto?.[chave]
            if (v === undefined || v === null || v === '') return []
            const n = Number(v)
            return [
              {
                rotulo,
                valor: dinheiro && !Number.isNaN(n) ? brl(n) : String(v),
              },
            ]
          }),
        }
      : null,
    irmaos: [
      ...((porPedido.data ?? []) as unknown as IrmaoCru[]).map((x) => traduzirIrmao(x, 'pedido')),
      // A perna da transferência entra só se o pedido já não a trouxe: os dois
      // vínculos podem apontar para a mesma linha, e listá-la duas vezes faria
      // a tela sugerir que existem dois lançamentos onde há um.
      ...((porTransferencia.data ?? []) as unknown as IrmaoCru[])
        .filter(
          (x) => !((porPedido.data ?? []) as unknown as IrmaoCru[]).some((y) => y.id === x.id),
        )
        .map((x) => traduzirIrmao(x, 'transferencia')),
    ].sort((a, b) => a.ocorridoEm.localeCompare(b.ocorridoEm)),
    pedido: p
      ? {
          id: p.id,
          canal: p.canal,
          situacao: p.situacao,
          pagamento: p.pagamento,
          gateway: p.gateway,
          valor: Number(p.valor),
          frete: Number(p.frete ?? 0),
          cashback: Number(p.cashback ?? 0),
          compradoEm: p.comprado_em,
          cliente: p.clientes?.nome ?? null,
          itens: (p.pedido_itens ?? []).map((i) => ({
            descricao: i.descricao,
            variante: i.variante_titulo,
            quantidade: Number(i.quantidade),
            preco: Number(i.preco),
          })),
        }
      : null,
    historico: ((historico.data ?? []) as Record<string, unknown>[]).map((a) => ({
      id: Number(a.id),
      ocorridoEm: String(a.ocorrido_em),
      acao: String(a.acao),
      operador: (a.operador as string) ?? null,
      justificativa: (a.justificativa as string) ?? null,
    })),
    naoLidas,
  }
}

// ── Categorias ─────────────────────────────────────────────────────────────

export async function lerCategorias(): Promise<CategoriaGerencial[]> {
  if (!supabaseConfigurado()) return []
  const sb = supabaseServer()
  const [{ data: cats }, { data: usos }] = await Promise.all([
    sb.from('categorias_financeiras').select('*').order('nome'),
    // A contagem vem AGREGADA do banco, não em linhas cruas.
    //
    // Isto aqui era `select categoria_id from lancamentos limit 5000`: 1.229
    // linhas atravessando a rede para produzir 8 números, a cada render, em
    // dois caminhos diferentes (`carregarLancamentos` e `carregarFilaDeDestino`).
    // A agregação custa o MESMO tempo no Postgres — 1,255 ms contra 1,115 ms,
    // os mesmos 71 buffers — e devolve 8 linhas.
    //
    // O `limit(5000)` que sumiu junto era uma bomba-relógio: aos 5.001
    // lançamentos a contagem passaria a mentir sem erro nenhum na tela, que é
    // exatamente o bug que o comentário de supabase.ts:35-41 descreve.
    sb.from('categorias_em_uso').select('categoria_id, em_uso'),
  ])

  const contagem = new Map<string, number>()
  for (const u of (usos ?? []) as { categoria_id: string; em_uso: number }[]) {
    contagem.set(u.categoria_id, Number(u.em_uso))
  }

  return ((cats ?? []) as Record<string, unknown>[]).map(
    (c): CategoriaGerencial => ({
      id: String(c.id),
      nome: String(c.nome),
      natureza: c.natureza_gerencial as NaturezaGerencial,
      impactaDre: Boolean(c.impacta_dre),
      impactaCaixa: Boolean(c.impacta_caixa),
      exigeDocumento: Boolean(c.exige_documento),
      usarEmAutomacao: Boolean(c.usar_em_automacao),
      contaContabil: String(c.conta_contabil ?? ''),
      centroCusto: (c.centro_custo as string) ?? null,
      ativa: Boolean(c.ativa),
      emUso: contagem.get(String(c.id)) ?? 0,
    }),
  )
}

export async function lerCentrosCusto(): Promise<{ id: string; nome: string }[]> {
  if (!supabaseConfigurado()) return []
  const { data } = await supabaseServer()
    .from('centros_custo')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome')
  return (data ?? []) as { id: string; nome: string }[]
}

// ── Fluxo de caixa ─────────────────────────────────────────────────────────

export interface PainelFluxo {
  projecao: ProjecaoDeCaixa
  contas: ContaFinanceira[]
  porCategoria: { categoria: string; valor: number; tipo: 'entrada' | 'saida' }[]
  compromissos: LancamentoGerencial[]
  cobertura: number | null
  de: string
  ate: string
  semBanco: boolean
}

export async function carregarFluxo(dias = 30): Promise<PainelFluxo> {
  const de = HOJE()
  const ate = iso(dias)
  const vazio: PainelFluxo = {
    projecao: projetarCaixa(0, []),
    contas: [],
    porCategoria: [],
    compromissos: [],
    cobertura: null,
    de,
    ate,
    semBanco: false,
  }
  if (!supabaseConfigurado()) return { ...vazio, semBanco: true }

  const sb = supabaseServer()
  const [{ data: fluxo }, contas, lancamentos] = await Promise.all([
    sb.rpc('fluxo_de_caixa', { p_de: iso(-15), p_ate: ate }),
    lerContas(),
    lerLancamentos(),
  ])

  const saldoHoje = contas.reduce((a, c) => a + c.saldoDisponivel, 0)
  const linhas = ((fluxo ?? []) as { dia: string; entradas: string; saidas: string; realizado: boolean }[]).map(
    (d) => ({
      dia: d.dia,
      entradas: Number(d.entradas),
      saidas: Number(d.saidas),
      realizado: d.realizado,
    }),
  )

  /**
   * A projeção parte do saldo REAL das contas e olha só para frente.
   *
   * A versão anterior tentava reconstruir o saldo de quinze dias atrás
   * subtraindo do saldo de hoje o movimento dos dias já realizados. É um erro
   * de categoria, e ele produzia um número visível: saldo de partida
   * −R$ 3.313,69, "risco de caixa Alto" e "negativa em 0 dias" numa operação
   * com R$ 14.804,06 em conta — enquanto o Dashboard, na mesma hora, dizia
   * "caixa sustentado".
   *
   * São dois defeitos somados. O primeiro é conceitual: `saldoDisponivel` não
   * é função do intervalo. Para o Inter e o Sicoob ele é `saldo_informado`,
   * digitado à mão e congelado; para o Mercado Pago é o acumulado da conta
   * inteira. Subtrair o fluxo de dezesseis dias de um estoque congelado não
   * devolve o saldo de dezesseis dias atrás — devolve um resíduo aritmético.
   * O segundo é que o passado JÁ ESTÁ no saldo: reprojetá-lo conta o mesmo
   * dinheiro duas vezes.
   *
   * O dia de hoje também fica de fora (`realizado` é `dia <= current_date`), e
   * é o certo: o que foi baixado hoje já está no saldo das contas.
   */
  const futuros = linhas.filter((l) => !l.realizado)
  const projecao = projetarCaixa(saldoHoje, futuros)

  // Mesmo corte do RPC de fluxo: transferência não entra na projeção porque
  // não muda o consolidado. Deixá-la aqui fazia o painel de compromissos
  // listar saque de gateway como conta a pagar.
  const vivos = lancamentos.filter(
    (l) => !l.canceladoEm && saldoAberto(l) > 0 && !movimentacaoInterna(l),
  )
  const porCategoria = new Map<string, { valor: number; tipo: 'entrada' | 'saida' }>()
  for (const l of vivos) {
    if (!l.venceEm || l.venceEm > ate) continue
    // Sem categoria é um grupo como outro qualquer: some-lo aqui esconderia
    // dinheiro real da projeção só porque ninguém classificou ainda.
    const chave = l.categoria ?? SEM_CATEGORIA
    const atual = porCategoria.get(chave) ?? { valor: 0, tipo: l.tipo }
    atual.valor += saldoAberto(l)
    porCategoria.set(chave, atual)
  }

  // O ritmo de saída vem do REALIZADO das contas, não da projeção. A projeção
  // só tem o que está agendado, e uma operação que paga tudo à vista tem
  // agenda vazia — o que faria a cobertura dizer "infinita" justamente para
  // quem gasta sem programar.
  const saidas30 = contas.reduce((a, c) => a + (c.saidas30d ?? 0), 0)

  return {
    projecao,
    contas,
    porCategoria: [...porCategoria.entries()]
      .map(([categoria, v]) => ({ categoria, ...v }))
      .sort((a, b) => b.valor - a.valor),
    compromissos: vivos
      .filter((l) => l.venceEm && l.venceEm >= de && l.venceEm <= ate)
      .sort((a, b) => (a.venceEm ?? '').localeCompare(b.venceEm ?? ''))
      .slice(0, 30),
    cobertura: coberturaDeCaixa(saldoHoje, saidas30, projecao.dias.length),
    de,
    ate,
    semBanco: false,
  }
}

// ── Fila de destino dos repasses ───────────────────────────────────────────

/**
 * Saques do gateway que ainda não disseram para onde foram.
 *
 * "Transferência para conta bancária" é tudo o que o extrato do Mercado Pago
 * escreve, tanto quando o dinheiro vai para o Inter quanto quando paga o
 * anúncio da Meta. O ERP não tem como saber a diferença — e chutar foi o que
 * produziu o pior número do módulo: R$ 1.205,49 de tráfego pago contados
 * como movimento interno, invisíveis na DRE e neutros no caixa.
 *
 * Enquanto a resposta não vem, a linha fica marcada e sai das duas contas:
 * não é despesa (pode ser transferência) e não é transferência completa
 * (falta a perna de entrada). Só a decisão de quem operou resolve, e é isso
 * que esta fila pede.
 */
export interface RepasseSemDestino {
  id: string
  descricao: string
  valor: number
  quando: string | null
  contaId: string
  conta: string
}

export interface FilaDeDestino {
  itens: RepasseSemDestino[]
  total: number
  contas: ContaFinanceira[]
  categorias: CategoriaGerencial[]
  semBanco: boolean
}

/** Só o par (quantidade, valor) — para o card e o alerta, sem trazer as linhas. */
async function resumoDaFilaDeDestino(): Promise<{ qtd: number; valor: number }> {
  const { data } = await supabaseServer()
    .from('lancamentos')
    .select('valor')
    .eq('aguarda_destino', true)
    .is('cancelado_em', null)
    .limit(2000)
  const linhas = (data ?? []) as { valor: number | string }[]
  return {
    qtd: linhas.length,
    valor: Math.round(linhas.reduce((a, l) => a + Number(l.valor), 0) * 100) / 100,
  }
}

export async function carregarFilaDeDestino(): Promise<FilaDeDestino> {
  const vazio: FilaDeDestino = {
    itens: [],
    total: 0,
    contas: [],
    categorias: [],
    semBanco: false,
  }
  if (!supabaseConfigurado()) return { ...vazio, semBanco: true }

  const [{ data }, contas, categorias] = await Promise.all([
    supabaseServer()
      .from('lancamentos')
      .select('id, descricao, valor, baixado_em, conta_id, contas_bancarias!lancamentos_conta_id_fkey(nome)')
      .eq('aguarda_destino', true)
      .is('cancelado_em', null)
      // O mais recente primeiro: é o que ainda está fresco na memória de quem
      // fez o saque, e é onde a resposta sai mais barata.
      .order('baixado_em', { ascending: false, nullsFirst: false })
      .limit(500),
    lerContas(),
    lerCategorias(),
  ])

  const itens = ((data ?? []) as unknown as {
    id: string
    descricao: string
    valor: number | string
    baixado_em: string | null
    conta_id: string | null
    contas_bancarias: { nome: string } | null
  }[]).map(
    (l): RepasseSemDestino => ({
      id: l.id,
      descricao: l.descricao,
      valor: Number(l.valor),
      quando: l.baixado_em,
      contaId: l.conta_id ?? '',
      conta: l.contas_bancarias?.nome ?? l.conta_id ?? '—',
    }),
  )

  return {
    itens,
    total: Math.round(itens.reduce((a, i) => a + i.valor, 0) * 100) / 100,
    contas,
    // Transferência não é despesa: oferecê-la na lista de categorias
    // reintroduziria pela mão o chute que a fila existe para eliminar.
    categorias: categorias.filter((c) => c.ativa && c.impactaCaixa && c.id !== 'transferencias'),
    semBanco: false,
  }
}

// ── DRE ────────────────────────────────────────────────────────────────────

export interface PainelDre {
  dre: DreGerencial
  competencia: string
  disponiveis: string[]
  porCategoria: { categoria: string; valor: number; natureza: NaturezaGerencial }[]
  evolucao: { competencia: string; resultado: number }[]
  semBanco: boolean
}

export async function carregarDre(competencia?: string): Promise<PainelDre> {
  const alvo = competencia ?? HOJE().slice(0, 7)
  const vazio: PainelDre = {
    dre: montarDreGerencial(alvo, [], []),
    competencia: alvo,
    disponiveis: [],
    porCategoria: [],
    evolucao: [],
    semBanco: false,
  }
  if (!supabaseConfigurado()) return { ...vazio, semBanco: true }

  const sb = supabaseServer()
  const anterior = competenciaAnterior(alvo)

  const [{ data: atual }, { data: passado }, { data: naturezas }, { data: receitas }] =
    await Promise.all([
      sb.rpc('dre_gerencial', { p_competencia: alvo }),
      sb.rpc('dre_gerencial', { p_competencia: anterior }),
      sb.from('lancamentos_por_natureza').select('*').eq('competencia', alvo),
      sb.from('receita_por_competencia').select('competencia').order('competencia', { ascending: false }),
    ])

  type LinhaRpc = { linha: string; ordem: number; valor: string; destaque: boolean }
  const linhasAtual = ((atual ?? []) as LinhaRpc[]).map((l) => ({
    linha: l.linha,
    valor: Number(l.valor),
    destaque: l.destaque,
  }))
  const linhasAnterior = ((passado ?? []) as LinhaRpc[]).map((l) => ({
    linha: l.linha,
    valor: Number(l.valor),
  }))

  const estruturaFixa = ((naturezas ?? []) as { natureza_gerencial: string; valor: string }[])
    .filter((n) => n.natureza_gerencial.startsWith('despesa'))
    .reduce((a, n) => a + Math.abs(Number(n.valor)), 0)

  // Seis meses de resultado: o suficiente para ver tendência sem virar
  // relatório histórico dentro de uma tela de mês.
  const meses: string[] = []
  let cursor = alvo
  for (let i = 0; i < 6; i++) {
    meses.unshift(cursor)
    cursor = competenciaAnterior(cursor)
  }
  const evolucao = await Promise.all(
    meses.map(async (m) => {
      const { data } = await sb.rpc('dre_gerencial', { p_competencia: m })
      const linha = ((data ?? []) as LinhaRpc[]).find((l) => l.linha === '= Resultado gerencial')
      return { competencia: m, resultado: Number(linha?.valor ?? 0) }
    }),
  )

  // O limite superior é o dia 1 do mês SEGUINTE, exclusivo. `${alvo}-31`
  // parece equivalente e não é: em setembro isso vira 2026-09-31, uma data
  // que não existe, e o Postgres recusa a consulta inteira.
  const [ano, mes] = alvo.split('-').map(Number)
  const proximo = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`

  const { data: porCat } = await sb
    .from('lancamentos')
    .select(
      'categoria, valor, tipo, categorias_financeiras!lancamentos_categoria_id_fkey(natureza_gerencial)',
    )
    .gte('competencia', `${alvo}-01`)
    .lt('competencia', proximo)
    .is('cancelado_em', null)

  const agrupado = new Map<string, { valor: number; natureza: NaturezaGerencial }>()
  for (const l of (porCat ?? []) as unknown as {
    categoria: string
    valor: string
    tipo: string
    categorias_financeiras: { natureza_gerencial: string } | null
  }[]) {
    const nat = (l.categorias_financeiras?.natureza_gerencial ?? 'despesa_administrativa') as NaturezaGerencial
    const atualCat = agrupado.get(l.categoria) ?? { valor: 0, natureza: nat }
    atualCat.valor += Number(l.valor) * (l.tipo === 'saida' ? 1 : -1)
    agrupado.set(l.categoria, atualCat)
  }

  return {
    dre: montarDreGerencial(alvo, linhasAtual, linhasAnterior, estruturaFixa),
    competencia: alvo,
    disponiveis: [
      ...new Set(((receitas ?? []) as { competencia: string }[]).map((r) => r.competencia)),
    ].slice(0, 24),
    porCategoria: [...agrupado.entries()]
      .map(([categoria, v]) => ({ categoria, ...v }))
      .filter((c) => c.valor > 0)
      .sort((a, b) => b.valor - a.valor),
    evolucao,
    semBanco: false,
  }
}

// ── Conciliação de vendas ──────────────────────────────────────────────────

export interface PainelConciliacao {
  vendas: VendaConciliada[]
  totais: Record<StatusVenda, { qtd: number; valor: number }>
  volumeBruto: number
  valorCreditado: number
  diferencaTotal: number
  taxaMediaReal: number
  taxaMediaPrevista: number
  semBanco: boolean
}

interface RepasseCru {
  pedido_id: string
  origem: string
  taxa_pct: string | null
  taxa_real: string | null
  recebido: string | null
  creditado_em: string | null
  meio: string | null
  bruto_gateway: string | null
  dispensado_em: string | null
  dispensa_motivo: string | null
  pedidos: {
    valor: string
    comprado_em: string
    pagamento: string
    situacao: string
    gateway: string | null
    clientes: { nome: string } | null
  } | null
}

export async function carregarConciliacao(): Promise<PainelConciliacao> {
  const zerado = (): Record<StatusVenda, { qtd: number; valor: number }> => ({
    conciliada: { qtd: 0, valor: 0 },
    taxa_divergente: { qtd: 0, valor: 0 },
    sem_credito: { qtd: 0, valor: 0 },
    valor_divergente: { qtd: 0, valor: 0 },
    estornada: { qtd: 0, valor: 0 },
    chargeback: { qtd: 0, valor: 0 },
    aguardando: { qtd: 0, valor: 0 },
    dispensada: { qtd: 0, valor: 0 },
  })
  const vazio: PainelConciliacao = {
    vendas: [],
    totais: zerado(),
    volumeBruto: 0,
    valorCreditado: 0,
    diferencaTotal: 0,
    taxaMediaReal: 0,
    taxaMediaPrevista: 0,
    semBanco: false,
  }
  if (!supabaseConfigurado()) return { ...vazio, semBanco: true }

  // TODOS os repasses, paginados pelo mesmo helper das outras leituras. A
  // versão anterior pedia 400 linhas com os pendentes na frente — e como
  // existem mais de 400 pendentes, NENHUM crédito chegava à tela: ela
  // anunciava "0 conciliadas" e "R$ 0,00 creditado" com 199 repasses já
  // pagos no banco. Pior, o erro era intermitente: bastava a fila de
  // pendentes cair abaixo do teto para os créditos reaparecerem sozinhos.
  //
  // KPI que muda com o tamanho da página não é KPI. Como toda a soma da tela
  // sai desta lista, ela precisa ser completa.
  const data = await tudoDe<RepasseCru>('repasses', (de, ate) =>
    supabaseServer()
      .from('repasses')
      .select(
        'pedido_id, origem, taxa_pct, taxa_real, recebido, creditado_em, meio, bruto_gateway, ' +
          'dispensado_em, dispensa_motivo, ' +
          'pedidos(valor, comprado_em, pagamento, situacao, gateway, clientes(nome))',
      )
      .order('pedido_id', { ascending: false })
      .range(de, ate) as unknown as PromiseLike<{ data: RepasseCru[] | null; error: unknown }>,
  )

  const hoje = HOJE()
  const totais = zerado()
  const vendas: VendaConciliada[] = []

  // O cronograma da Pagaleve, por pedido: a última parcela ainda não
  // liquidada. Crédito parcial com parcela futura é venda amortizando no
  // prazo — não pendência. A margem de 7 dias cobre o atraso normal entre o
  // vencimento e o repasse aparecer no extrato; passada ela, a venda volta a
  // cobrar ação de verdade.
  const MARGEM_PARCELA_DIAS = 7
  const diasDepois = (data: string, dias: number): string => {
    const t = Date.parse(`${data}T12:00:00Z`)
    return Number.isFinite(t) ? new Date(t + dias * 86_400_000).toISOString().slice(0, 10) : data
  }
  const ultimaParcelaPendente = new Map<string, string>()
  {
    const { data: pendentes } = await supabaseServer()
      .from('pagaleve_parcelas')
      .select('pedido_id, prevista_para')
      .is('liquidada_em', null)
      .not('pedido_id', 'is', null)
      .limit(2000)
    for (const p of (pendentes ?? []) as { pedido_id: string; prevista_para: string | null }[]) {
      const atual = ultimaParcelaPendente.get(p.pedido_id) ?? ''
      if ((p.prevista_para ?? '') > atual) ultimaParcelaPendente.set(p.pedido_id, p.prevista_para ?? '')
    }
  }

  for (const r of data) {
    if (!r.pedidos) continue
    const bruto = Number(r.bruto_gateway ?? r.pedidos.valor)
    const taxaReal = r.taxa_real === null ? null : Number(r.taxa_real)
    // Sem tarifa real conhecida, o esperado sai do parâmetro em % — que é
    // previsão, e a tela precisa dizer isso em vez de acusar divergência.
    const taxaEsperada = taxaReal ?? Math.round(bruto * (Number(r.taxa_pct ?? 0) / 100) * 100) / 100
    const recebido = r.recebido === null ? null : Number(r.recebido)
    const compradoEm = diaDaOperacao(r.pedidos.comprado_em)

    // PRAZO DE REPASSE DEPENDE DE QUEM REPASSA.
    //
    // Cinco dias serve para Mercado Pago e Pagar.me, que creditam a venda
    // inteira de uma vez. Não serve para a Pagaleve: ali o cliente parcela o
    // Pix em até 4x com 15 dias entre parcelas, então o valor só fecha em 45
    // dias, e o dinheiro chega em depósitos que não correspondem a um pedido
    // específico. Cobrar cinco dias dessas vendas foi o que encheu a fila de
    // conciliação com 26 "pendências" que nunca foram pendência nenhuma —
    // eram vendas em curso, amortizando no prazo combinado.
    //
    // A assinatura é inequívoca: venda paga sem meio e sem gateway é venda que
    // não passou por nenhum intermediário integrado.
    const foraDosGatewaysIntegrados = !r.meio && !r.pedidos.gateway
    const prazoVencido = compradoEm < iso(foraDosGatewaysIntegrados ? -PRAZO_PAGALEVE_DIAS : -5)

    // O cronograma importado manda mais que o prazo genérico: enquanto a
    // última parcela pendente (mais a margem) não vencer, a venda está
    // amortizando — vale para o Pix parcelado, cujo `meio` gravado tirava a
    // venda da regra antiga de prazo e a jogava em "valor divergente".
    const ultimaPendente = ultimaParcelaPendente.get(r.pedido_id)
    const parcelasACaminho =
      ultimaPendente !== undefined &&
      (ultimaPendente === '' || hoje <= diasDepois(ultimaPendente, MARGEM_PARCELA_DIAS))

    const { status, liquidoEsperado, diferenca } = avaliarVenda({
      bruto,
      taxaEsperada,
      taxaReal,
      dispensada: Boolean(r.dispensado_em),
      cancelada: r.pedidos.situacao === 'cancelado',
      liquidoRecebido: recebido,
      pagamentoConfirmado: r.pedidos.pagamento === 'pago',
      estornada: r.pedidos.situacao === 'cancelado',
      prazoVencido: parcelasACaminho ? false : prazoVencido,
      parcelasACaminho,
    })

    totais[status].qtd += 1
    totais[status].valor += bruto

    vendas.push({
      pedidoId: r.pedido_id,
      cliente: r.pedidos.clientes?.nome ?? '—',
      canal: r.origem,
      meio: r.meio ?? '—',
      transacaoId: null,
      bruto,
      taxaEsperada,
      taxaReal,
      liquidoEsperado,
      liquidoRecebido: recebido,
      previstoEm: compradoEm,
      recebidoEm: r.creditado_em,
      status,
      diferenca,
    })
  }

  const comCredito = vendas.filter((v) => v.liquidoRecebido !== null)
  const brutoTotal = vendas.reduce((a, v) => a + v.bruto, 0)

  return {
    vendas,
    totais,
    volumeBruto: brutoTotal,
    valorCreditado: comCredito.reduce((a, v) => a + (v.liquidoRecebido ?? 0), 0),
    diferencaTotal: vendas.reduce((a, v) => a + v.diferenca, 0),
    taxaMediaReal:
      brutoTotal > 0
        ? (vendas.reduce((a, v) => a + (v.taxaReal ?? 0), 0) / brutoTotal) * 100
        : 0,
    taxaMediaPrevista:
      brutoTotal > 0
        ? (vendas.reduce((a, v) => a + v.taxaEsperada, 0) / brutoTotal) * 100
        : 0,
    semBanco: false,
  }
}

// ── Configurações financeiras ──────────────────────────────────────────────

export interface CompetenciaFechada {
  competencia: string
  fechadaEm: string
  fechadaPor: string | null
  reabertaEm: string | null
  reabertaPor: string | null
  reaberturaMotivo: string | null
  observacao: string | null
  /** Números do mês no momento da consulta, para conferir antes de fechar. */
  lancamentos: number
  resultado: number
}

export interface PainelConfiguracoes {
  competencias: CompetenciaFechada[]
  /** Meses com movimento que ainda não foram fechados. */
  abertas: { competencia: string; lancamentos: number; semCategoria: number }[]
  centros: { id: string; nome: string; ativo: boolean; emUso: number }[]
  contas: ContaFinanceira[]
  categorias: CategoriaGerencial[]
  auditoria: {
    id: number
    ocorridoEm: string
    entidade: string
    entidadeId: string
    acao: string
    operador: string | null
  }[]
  semBanco: boolean
}

/**
 * Tudo que a tela de Configurações precisa, em uma leitura.
 *
 * As competências ABERTAS saem dos lançamentos, não de uma tabela: um mês só
 * existe para o fechamento quando teve movimento, e listar os doze meses do
 * ano ofereceria fechar novembro em agosto.
 */
export async function carregarConfiguracoes(): Promise<PainelConfiguracoes> {
  const vazio: PainelConfiguracoes = {
    competencias: [],
    abertas: [],
    centros: [],
    contas: [],
    categorias: [],
    auditoria: [],
    semBanco: false,
  }
  if (!supabaseConfigurado()) return { ...vazio, semBanco: true }

  const sb = supabaseServer()
  const [{ data: fechadas }, lancamentos, contas, categorias, { data: centros }, { data: log }] =
    await Promise.all([
      sb.from('competencias_fechadas').select('*').order('competencia', { ascending: false }),
      lerLancamentos(),
      lerContas(),
      lerCategorias(),
      sb.from('centros_custo').select('id, nome, ativo').order('nome'),
      sb
        .from('financeiro_auditoria')
        .select('id, ocorrido_em, entidade, entidade_id, acao, operador')
        .order('ocorrido_em', { ascending: false })
        .limit(20),
    ])

  const vivos = lancamentos.filter((l) => !l.canceladoEm)

  const porMes = new Map<string, { lancamentos: number; semCategoria: number; resultado: number }>()
  for (const l of vivos) {
    const mes = l.competencia.slice(0, 7)
    const atual = porMes.get(mes) ?? { lancamentos: 0, semCategoria: 0, resultado: 0 }
    atual.lancamentos += 1
    if (!l.categoriaId) atual.semCategoria += 1
    // Transferência não é resultado; somá-la aqui daria um número diferente
    // do que a DRE mostra na mesma competência.
    if (!l.transferenciaId) atual.resultado += l.tipo === 'entrada' ? l.valor : -l.valor
    porMes.set(mes, atual)
  }

  const emUsoCentro = new Map<string, number>()
  for (const l of vivos) {
    if (l.centroCusto) emUsoCentro.set(l.centroCusto, (emUsoCentro.get(l.centroCusto) ?? 0) + 1)
  }

  const linhasFechadas = ((fechadas ?? []) as Record<string, unknown>[]).map(
    (f): CompetenciaFechada => {
      const mes = String(f.competencia)
      const resumo = (f.resumo ?? null) as { observacao?: string } | null
      return {
        competencia: mes,
        fechadaEm: String(f.fechada_em),
        fechadaPor: (f.fechada_por as string) ?? null,
        reabertaEm: (f.reaberta_em as string) ?? null,
        reabertaPor: (f.reaberta_por as string) ?? null,
        reaberturaMotivo: (f.reabertura_motivo as string) ?? null,
        observacao: resumo?.observacao ?? null,
        lancamentos: porMes.get(mes)?.lancamentos ?? 0,
        resultado: Math.round((porMes.get(mes)?.resultado ?? 0) * 100) / 100,
      }
    },
  )

  const travadas = new Set(
    linhasFechadas.filter((f) => !f.reabertaEm).map((f) => f.competencia),
  )

  return {
    competencias: linhasFechadas,
    abertas: [...porMes.entries()]
      .filter(([mes]) => !travadas.has(mes))
      .map(([competencia, v]) => ({
        competencia,
        lancamentos: v.lancamentos,
        semCategoria: v.semCategoria,
      }))
      .sort((a, b) => b.competencia.localeCompare(a.competencia)),
    centros: ((centros ?? []) as { id: string; nome: string; ativo: boolean }[]).map((c) => ({
      ...c,
      emUso: emUsoCentro.get(c.id) ?? 0,
    })),
    contas,
    categorias,
    auditoria: ((log ?? []) as Record<string, unknown>[]).map((a) => ({
      id: Number(a.id),
      ocorridoEm: String(a.ocorrido_em),
      entidade: String(a.entidade),
      entidadeId: String(a.entidade_id),
      acao: String(a.acao),
      operador: (a.operador as string) ?? null,
    })),
    semBanco: false,
  }
}

// ── Visão Financeira (landing) ─────────────────────────────────────────────

export interface VisaoFinanceira {
  caixaHoje: number
  caixaALiquidar: number
  caixaBloqueado: number
  saldo7: number
  saldo30: number
  aReceber: { valor: number; qtd: number }
  /** Tudo em aberto, inclusive parcelas de 2028 — o número do rodapé. */
  aPagar: { valor: number; qtd: number }
  /** O que vence até `aPagarAte` — o número do card. */
  aPagarJanela: { valor: number; qtd: number; ate: string }
  vencidos: { valor: number; qtd: number }
  pendenciasConciliacao: { qtd: number; valor: number }
  repassesSemDestino: { qtd: number; valor: number }
  resultadoMes: number
  /**
   * O mesmo resultado no mês anterior.
   *
   * Um lucro solto não diz nada — R$ 3.000 é ótimo depois de R$ 1.000 e péssimo
   * depois de R$ 9.000. É a comparação que transforma o número numa informação,
   * e é o que evita ter de abrir a DRE só para saber se o mês está melhor.
   */
  resultadoMesAnterior: number
  receitaLiquidaMes: number
  margemMes: number
  projecao: ProjecaoDeCaixa
  contas: ContaFinanceira[]
  proximosCompromissos: LancamentoGerencial[]
  proximosRecebimentos: LancamentoGerencial[]
  saidasPorCategoria: { categoria: string; valor: number }[]
  alertas: AlertaFinanceiro[]
  competencia: string
  semBanco: boolean
}

/**
 * A Visão Financeira de uma COMPETÊNCIA.
 *
 * O mês passou a ser parâmetro porque a tela respondia a uma pergunta só —
 * "como está este mês?" — e a pergunta seguinte ("e o mês passado, fechou
 * como?") obrigava a abrir a DRE e voltar. Sem argumento, continua sendo o
 * mês corrente: o caminho de sempre não mudou.
 *
 * O que o filtro NÃO move é o caixa: saldo de hoje e projeção de 7 e 30 dias
 * são o presente e o futuro, e não existem "em julho". Trocar a competência
 * para julho e ver um saldo de julho seria inventar um extrato histórico que
 * o ERP não guarda. Esses cartões continuam sendo o agora, e a tela diz isso.
 */
export async function carregarVisaoFinanceira(
  competenciaAlvo?: string,
): Promise<VisaoFinanceira> {
  const competencia = /^\d{4}-\d{2}$/.test(competenciaAlvo ?? '')
    ? competenciaAlvo!
    : HOJE().slice(0, 7)
  const vazio: VisaoFinanceira = {
    caixaHoje: 0,
    caixaALiquidar: 0,
    caixaBloqueado: 0,
    saldo7: 0,
    saldo30: 0,
    aReceber: { valor: 0, qtd: 0 },
    aPagar: { valor: 0, qtd: 0 },
    aPagarJanela: { valor: 0, qtd: 0, ate: mesmoDiaNoProximoMes(HOJE()) },
    vencidos: { valor: 0, qtd: 0 },
    pendenciasConciliacao: { qtd: 0, valor: 0 },
    repassesSemDestino: { qtd: 0, valor: 0 },
    resultadoMes: 0,
    resultadoMesAnterior: 0,
    receitaLiquidaMes: 0,
    margemMes: 0,
    projecao: projetarCaixa(0, []),
    contas: [],
    proximosCompromissos: [],
    proximosRecebimentos: [],
    saidasPorCategoria: [],
    alertas: [],
    competencia,
    semBanco: false,
  }
  if (!supabaseConfigurado()) return { ...vazio, semBanco: true }

  const hoje = HOJE()
  const sb = supabaseServer()

  const [
    contas,
    lancamentos,
    { data: dre },
    { data: dreAnterior },
    { data: fluxo },
    conciliacao,
    semDestino,
    { count: semCategoria },
  ] = await Promise.all([
      lerContas(),
      lerLancamentos(),
      sb.rpc('dre_gerencial', { p_competencia: competencia }),
      sb.rpc('dre_gerencial', { p_competencia: competenciaAnterior(competencia) }),
      sb.rpc('fluxo_de_caixa', { p_de: hoje, p_ate: iso(90) }),
      carregarConciliacao(),
      resumoDaFilaDeDestino(),
      // Linhas do extrato que ainda não viraram caixa. A versão anterior
      // consultava uma coluna `categoria` que não existe nesta tabela: o
      // banco respondia 400, o erro era descartado junto com o resultado e o
      // indicador aparecia zerado — um número errado em silêncio, que é pior
      // do que número nenhum.
      sb
        .from('extrato_linhas')
        .select('chave', { count: 'exact', head: true })
        .is('lancamento_id', null)
        .eq('ignorado', false)
        .eq('interno', false),
    ])

  const caixaHoje = contas.reduce((a, c) => a + c.saldoDisponivel, 0)
  const dias = ((fluxo ?? []) as { dia: string; entradas: string; saidas: string; realizado: boolean }[]).map(
    (d) => ({
      dia: d.dia,
      entradas: Number(d.entradas),
      saidas: Number(d.saidas),
      realizado: d.realizado,
    }),
  )
  const projecao = projetarCaixa(caixaHoje, dias)

  // Transferência em aberto não é obrigação: ninguém deve nada a si mesmo.
  const vivos = lancamentos.filter(
    (l) => !l.canceladoEm && saldoAberto(l) > 0 && !movimentacaoInterna(l),
  )
  const aReceber = vivos.filter((l) => l.tipo === 'entrada')
  const aPagar = vivos.filter((l) => l.tipo === 'saida')
  const vencidos = vivos.filter((l) => situacaoDe(l, hoje) === 'vencido')

  /**
   * "Contas a pagar" passa a ser o que vence NA JANELA, com o total ao lado.
   *
   * O card mostrava R$ 19.317,80 — a soma de tudo que está em aberto, e
   * "tudo" incluía parcelas de financiamento até abril de 2028. Ao lado de um
   * "saldo projetado 30 dias", o número lido como dívida imediata assusta sem
   * informar: nada daquilo vence este mês.
   *
   * A janela é o MESMO DIA DO MÊS SEGUINTE, não `hoje + 30`. As parcelas caem
   * todas no dia 16; com trinta dias corridos, em 16/08 o horizonte morre em
   * 15/09 e a parcela de 16/09 fica de fora por um dia — o card diria
   * "R$ 0,00 a pagar" na véspera de uma parcela. Um mês à frente é como a
   * operação pensa, e é o que faz a janela nunca perder a parcela seguinte.
   */
  const ateJanela = mesmoDiaNoProximoMes(hoje)
  const naJanela = aPagar.filter((l) => l.venceEm && l.venceEm <= ateJanela)

  const somaAberto = (ls: LancamentoGerencial[]) => ls.reduce((a, l) => a + saldoAberto(l), 0)

  type LinhaRpc = { linha: string; valor: string }
  const linha = (nome: string) =>
    Number(((dre ?? []) as LinhaRpc[]).find((l) => l.linha === nome)?.valor ?? 0)
  const linhaAnterior = (nome: string) =>
    Number(((dreAnterior ?? []) as LinhaRpc[]).find((l) => l.linha === nome)?.valor ?? 0)

  /**
   * Composição de saídas: só o que É despesa.
   *
   * Transferência entre contas próprias saía aqui como categoria — e era a
   * maior de todas: R$ 15.381,19 de R$ 20.957,04, 73% do gráfico, num mês em
   * que a operação não gastou 15 mil com nada. Cada saque do gateway para o
   * banco entrava como "gasto" e empurrava o gasto de verdade para o rodapé
   * da rosca.
   *
   * O corte é o mesmo do fluxo de caixa (`impacta_caixa`) somado ao regime de
   * competência (`impacta_dre`), e não uma lista de ids: categoria nova criada
   * amanhã já nasce classificada certo.
   */
  const saidasPorCategoria = new Map<string, number>()
  for (const l of lancamentos) {
    if (l.tipo !== 'saida' || l.canceladoEm) continue
    if (l.competencia.slice(0, 7) !== competencia) continue
    if (movimentacaoInterna(l) || !l.impactaDre) continue
    const chave = l.categoria ?? SEM_CATEGORIA
    saidasPorCategoria.set(chave, (saidasPorCategoria.get(chave) ?? 0) + l.valor)
  }

  const naFila = conciliacao.totais.taxa_divergente.qtd +
    conciliacao.totais.valor_divergente.qtd +
    conciliacao.totais.sem_credito.qtd +
    conciliacao.totais.chargeback.qtd

  const pontoDoDia = (n: number) => projecao.dias[Math.min(n, projecao.dias.length - 1)]?.saldo ?? caixaHoje

  return {
    caixaHoje,
    caixaALiquidar: contas.reduce((a, c) => a + c.saldoALiquidar, 0),
    caixaBloqueado: contas.reduce((a, c) => a + c.saldoBloqueado, 0),
    saldo7: pontoDoDia(6),
    saldo30: pontoDoDia(29),
    aReceber: { valor: somaAberto(aReceber), qtd: aReceber.length },
    aPagar: { valor: somaAberto(aPagar), qtd: aPagar.length },
    aPagarJanela: { valor: somaAberto(naJanela), qtd: naJanela.length, ate: ateJanela },
    vencidos: { valor: somaAberto(vencidos), qtd: vencidos.length },
    pendenciasConciliacao: {
      qtd: naFila,
      valor: Math.abs(conciliacao.diferencaTotal),
    },
    repassesSemDestino: semDestino,
    resultadoMes: linha('= Resultado gerencial'),
    resultadoMesAnterior: linhaAnterior('= Resultado gerencial'),
    receitaLiquidaMes: linha('= Receita líquida'),
    margemMes: linha('= Margem de contribuição'),
    projecao,
    contas,
    proximosCompromissos: [...aPagar]
      .sort((a, b) => (a.venceEm ?? '9999').localeCompare(b.venceEm ?? '9999'))
      .slice(0, 6),
    // Recebimento SEM data prevista continua na lista, no fim. Filtrá-lo
    // fazia a tela se contradizer: o card anunciava "5 recebimentos
    // previstos" e o painel logo abaixo dizia "nenhum recebimento agendado"
    // — porque as cinco entradas em aberto estão sem vencimento. Mostrá-las
    // com "—" é o que revela que falta preencher a data, e é a data que as
    // coloca na projeção de caixa.
    proximosRecebimentos: [...aReceber]
      .sort((a, b) => (a.venceEm ?? '9999').localeCompare(b.venceEm ?? '9999'))
      .slice(0, 6),
    saidasPorCategoria: [...saidasPorCategoria.entries()]
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8),
    alertas: alertasFinanceiros({
      projecao,
      vencidos: { quantidade: vencidos.length, valor: somaAberto(vencidos) },
      semCategoria: semCategoria ?? 0,
      conciliacaoPendente: naFila,
      contasDesatualizadas: contas
        .filter((c) => c.ativa && c.origemSaldo !== 'calculado' && c.sincronizadoEm)
        .map((c) => ({
          nome: c.nome,
          horas: Math.floor((Date.now() - Date.parse(c.sincronizadoEm!)) / 3_600_000),
        }))
        .filter((c) => c.horas >= 24),
      chargebacksSemJustificativa: conciliacao.totais.chargeback.qtd,
      competenciaAberta: competencia,
      repassesSemDestino: { quantidade: semDestino.qtd, valor: semDestino.valor },
    }),
    competencia,
    semBanco: false,
  }
}
