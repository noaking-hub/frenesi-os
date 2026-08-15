import 'server-only'

import {
  alertasFinanceiros,
  avaliarVenda,
  coberturaDeCaixa,
  competenciaAnterior,
  montarDreGerencial,
  projetarCaixa,
  situacaoDe,
  saldoAberto,
  SEM_CATEGORIA,
  type AlertaFinanceiro,
  type CategoriaGerencial,
  type ContaFinanceira,
  type DreGerencial,
  type LancamentoGerencial,
  type NaturezaGerencial,
  type OrigemSaldo,
  type ProjecaoDeCaixa,
  type SituacaoLancamento,
  type StatusVenda,
  type VendaConciliada,
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

const HOJE = () => new Date().toISOString().slice(0, 10)

function iso(dias: number): string {
  return new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10)
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
  categorias_financeiras: { natureza_gerencial: string } | null
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
  'competencia, vence_em, baixado_em, valor, recebido, multa, juros, desconto, ' +
  'parcela, parcelas, recorrente, recorrencia, origem, documento, observacao, ' +
  'transferencia_id, cancelado_em, ' +
  'categorias_financeiras!lancamentos_categoria_id_fkey(natureza_gerencial), ' +
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
      .order('vence_em', { ascending: true, nullsFirst: false })
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
    }),
  )
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

// ── Categorias ─────────────────────────────────────────────────────────────

export async function lerCategorias(): Promise<CategoriaGerencial[]> {
  if (!supabaseConfigurado()) return []
  const sb = supabaseServer()
  const [{ data: cats }, { data: usos }] = await Promise.all([
    sb.from('categorias_financeiras').select('*').order('nome'),
    sb.from('lancamentos').select('categoria_id').not('categoria_id', 'is', null).limit(5000),
  ])

  const contagem = new Map<string, number>()
  for (const u of (usos ?? []) as { categoria_id: string }[]) {
    contagem.set(u.categoria_id, (contagem.get(u.categoria_id) ?? 0) + 1)
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

  // A projeção começa do saldo de HOJE, não do início da série: os dias
  // passados aparecem no gráfico como contexto, mas o dinheiro que existe já
  // é o resultado deles.
  const passados = linhas.filter((l) => l.realizado)
  const saldoInicial =
    saldoHoje - passados.reduce((a, d) => a + d.entradas - d.saidas, 0)

  const projecao = projetarCaixa(saldoInicial, linhas)

  const vivos = lancamentos.filter((l) => !l.canceladoEm && saldoAberto(l) > 0)
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

  const saidas30 = projecao.dias.reduce((a, d) => a + d.saidas, 0)

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
  pedidos: {
    valor: string
    comprado_em: string
    pagamento: string
    situacao: string
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
          'pedidos(valor, comprado_em, pagamento, situacao, clientes(nome))',
      )
      .order('pedido_id', { ascending: false })
      .range(de, ate) as unknown as PromiseLike<{ data: RepasseCru[] | null; error: unknown }>,
  )

  const hoje = HOJE()
  const totais = zerado()
  const vendas: VendaConciliada[] = []

  for (const r of data) {
    if (!r.pedidos) continue
    const bruto = Number(r.bruto_gateway ?? r.pedidos.valor)
    const taxaReal = r.taxa_real === null ? null : Number(r.taxa_real)
    // Sem tarifa real conhecida, o esperado sai do parâmetro em % — que é
    // previsão, e a tela precisa dizer isso em vez de acusar divergência.
    const taxaEsperada = taxaReal ?? Math.round(bruto * (Number(r.taxa_pct ?? 0) / 100) * 100) / 100
    const recebido = r.recebido === null ? null : Number(r.recebido)
    const compradoEm = r.pedidos.comprado_em.slice(0, 10)
    const prazoVencido = compradoEm < iso(-5)

    const { status, liquidoEsperado, diferenca } = avaliarVenda({
      bruto,
      taxaEsperada,
      taxaReal,
      liquidoRecebido: recebido,
      pagamentoConfirmado: r.pedidos.pagamento === 'pago',
      estornada: r.pedidos.situacao === 'cancelado',
      prazoVencido,
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
  aPagar: { valor: number; qtd: number }
  vencidos: { valor: number; qtd: number }
  pendenciasConciliacao: { qtd: number; valor: number }
  resultadoMes: number
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

export async function carregarVisaoFinanceira(): Promise<VisaoFinanceira> {
  const competencia = HOJE().slice(0, 7)
  const vazio: VisaoFinanceira = {
    caixaHoje: 0,
    caixaALiquidar: 0,
    caixaBloqueado: 0,
    saldo7: 0,
    saldo30: 0,
    aReceber: { valor: 0, qtd: 0 },
    aPagar: { valor: 0, qtd: 0 },
    vencidos: { valor: 0, qtd: 0 },
    pendenciasConciliacao: { qtd: 0, valor: 0 },
    resultadoMes: 0,
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

  const [contas, lancamentos, { data: dre }, { data: fluxo }, conciliacao, { count: semCategoria }] =
    await Promise.all([
      lerContas(),
      lerLancamentos(),
      sb.rpc('dre_gerencial', { p_competencia: competencia }),
      sb.rpc('fluxo_de_caixa', { p_de: hoje, p_ate: iso(90) }),
      carregarConciliacao(),
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

  const vivos = lancamentos.filter((l) => !l.canceladoEm && saldoAberto(l) > 0)
  const aReceber = vivos.filter((l) => l.tipo === 'entrada')
  const aPagar = vivos.filter((l) => l.tipo === 'saida')
  const vencidos = vivos.filter((l) => situacaoDe(l, hoje) === 'vencido')

  const somaAberto = (ls: LancamentoGerencial[]) => ls.reduce((a, l) => a + saldoAberto(l), 0)

  type LinhaRpc = { linha: string; valor: string }
  const linha = (nome: string) =>
    Number(((dre ?? []) as LinhaRpc[]).find((l) => l.linha === nome)?.valor ?? 0)

  const saidasPorCategoria = new Map<string, number>()
  for (const l of lancamentos) {
    if (l.tipo !== 'saida' || l.canceladoEm) continue
    if (l.competencia.slice(0, 7) !== competencia) continue
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
    vencidos: { valor: somaAberto(vencidos), qtd: vencidos.length },
    pendenciasConciliacao: {
      qtd: naFila,
      valor: Math.abs(conciliacao.diferencaTotal),
    },
    resultadoMes: linha('= Resultado gerencial'),
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
    }),
    competencia,
    semBanco: false,
  }
}
