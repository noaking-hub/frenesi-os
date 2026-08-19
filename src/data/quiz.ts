import 'server-only'

import { curadoriaPorDna, emailComoIdentidade, paresDePerfil, recomendacoesPorAfinidade, type CliqueComPerfil, type EscolhaDaCuradoria, type PerfumeComDna, type Recomendacao } from '@/domain'

import { supabaseConfigurado, supabaseServer, tudoDe } from './supabase'

/**
 * Curadoria Olfativa (quiz-frenesi) — Fase 1: leitura.
 *
 * O quiz é um projeto separado, com Supabase próprio. O ERP NÃO escreve lá:
 * importa as respostas de hora em hora e cruza com os clientes por e-mail —
 * é o que transforma o quiz de página solta em ponta medível do funil.
 *
 * O schema do quiz não é nosso e pode mudar sem aviso. Por isso a importação
 * é DESCOBERTA, não contrato: as tabelas vêm do OpenAPI que o PostgREST
 * publica na raiz, a tabela de respostas é a que tem coluna de e-mail, e a
 * linha inteira é guardada em `dados` (jsonb) — o dia em que o formato do
 * perfil interessar, ele já estará aqui, desde a primeira resposta.
 */

const URL_VAR = 'QUIZ_SUPABASE_URL'
const KEY_VAR = 'QUIZ_SUPABASE_SERVICE_KEY'

export function quizConfigurado(): boolean {
  return Boolean(process.env[URL_VAR]?.trim() && process.env[KEY_VAR]?.trim())
}

function credenciais(): { url: string; chave: string } {
  return {
    url: (process.env[URL_VAR] ?? '').trim().replace(/\/+$/, ''),
    chave: (process.env[KEY_VAR] ?? '').trim(),
  }
}

async function chamarQuiz<T>(caminho: string): Promise<T> {
  const { url, chave } = credenciais()
  const resposta = await fetch(`${url}${caminho}`, {
    headers: { apikey: chave, Authorization: `Bearer ${chave}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  const cru = await resposta.text()
  if (!resposta.ok) {
    throw new Error(`O Supabase do quiz respondeu ${resposta.status} em ${caminho}: ${cru.slice(0, 200)}`)
  }
  return JSON.parse(cru) as T
}

export interface TabelaDoQuiz {
  tabela: string
  colunas: string[]
}

/** As tabelas do quiz, pelo OpenAPI que o PostgREST publica na raiz. */
export async function tabelasDoQuiz(): Promise<TabelaDoQuiz[]> {
  const raiz = await chamarQuiz<{ definitions?: Record<string, { properties?: Record<string, unknown> }> }>(
    '/rest/v1/',
  )
  return Object.entries(raiz.definitions ?? {}).map(([tabela, def]) => ({
    tabela,
    colunas: Object.keys(def.properties ?? {}),
  }))
}

const COLUNAS_DE_EMAIL = ['email', 'e_mail', 'email_cliente', 'user_email', 'mail']
const COLUNAS_DE_DATA = ['created_at', 'criado_em', 'inserted_at', 'respondido_em', 'data', 'submitted_at']
const COLUNAS_DE_ID = ['id', 'uuid']

/**
 * Qual tabela guarda as respostas: `QUIZ_TABELA` decide quando definida;
 * senão, a tabela com coluna de e-mail — e, na falta dela, a de EVENTOS do
 * quiz (nome sugestivo + data de criação). O quiz de hoje não captura
 * e-mail: o que existe é `quiz_clicks`, cada clique numa recomendação com o
 * perfil de respostas junto. Anônimo, mas é o sinal de demanda — e no dia em
 * que o quiz ganhar captura de e-mail, a detecção por e-mail volta a mandar.
 */
export function tabelaDeRespostas(tabelas: TabelaDoQuiz[]): TabelaDoQuiz | null {
  const forcada = (process.env.QUIZ_TABELA ?? '').trim()
  if (forcada) return tabelas.find((t) => t.tabela === forcada) ?? null

  // Backup não é fonte: importar cópia velha duplicaria tudo com data errada.
  const vivas = tabelas.filter((t) => !/backup/i.test(t.tabela))

  const comEmail = vivas.filter((t) => t.colunas.some((c) => COLUNAS_DE_EMAIL.includes(c.toLowerCase())))
  if (comEmail.length > 0) {
    const sugestiva = comEmail.find((t) => /resposta|resultado|lead|submiss|quiz|curadoria/i.test(t.tabela))
    return sugestiva ?? comEmail[0]
  }

  return (
    vivas.find(
      (t) =>
        /click|resposta|resultado|lead|submiss|evento/i.test(t.tabela) &&
        t.colunas.some((c) => COLUNAS_DE_DATA.includes(c.toLowerCase())),
    ) ?? null
  )
}

const acha = (colunas: string[], candidatas: string[]) =>
  colunas.find((c) => candidatas.includes(c.toLowerCase())) ?? null

export interface ImportacaoDoQuiz {
  tabela: string | null
  lidas: number
  gravadas: number
  erro?: string
  /** O que a descoberta viu — é o diagnóstico quando a detecção falha. */
  tabelasEncontradas?: string[]
}

/**
 * Importa as respostas para `quiz_respostas`, idempotente pelo id de origem.
 *
 * Lê as 1.000 mais recentes por rodada: o quiz não apaga resposta, e upsert
 * repetido custa pouco — é o mesmo desenho da importação de pedidos.
 */
export async function importarRespostasDoQuiz(): Promise<ImportacaoDoQuiz> {
  if (!quizConfigurado() || !supabaseConfigurado()) {
    return { tabela: null, lidas: 0, gravadas: 0, erro: 'quiz não configurado' }
  }
  try {
    const tabelas = await tabelasDoQuiz()
    const alvo = tabelaDeRespostas(tabelas)
    if (!alvo) {
      // O schema visto vai junto: sem ele o erro manda procurar às cegas.
      return {
        tabela: null,
        lidas: 0,
        gravadas: 0,
        erro: 'nenhuma tabela com coluna de e-mail — defina QUIZ_TABELA com o nome certo',
        tabelasEncontradas: tabelas.map((t) => `${t.tabela}(${t.colunas.slice(0, 12).join(', ')})`),
      }
    }

    const colEmail = acha(alvo.colunas, COLUNAS_DE_EMAIL)
    const colData = acha(alvo.colunas, COLUNAS_DE_DATA)
    const colId = acha(alvo.colunas, COLUNAS_DE_ID)
    const ordem = colData ? `?order=${colData}.desc&limit=1000` : '?limit=1000'
    const linhas = await chamarQuiz<Record<string, unknown>[]>(`/rest/v1/${alvo.tabela}${ordem}`)

    const registros = linhas
      .map((l, i) => {
        const idOrigem = colId && l[colId] != null ? String(l[colId]) : null
        const quando = colData && typeof l[colData] === 'string' ? (l[colData] as string) : null
        // Sem id de origem não há idempotência honesta: e-mail+data identifica
        // a resposta com folga suficiente para não duplicar na rodada seguinte.
        const email = colEmail && typeof l[colEmail] === 'string' ? (l[colEmail] as string).trim().toLowerCase() : null
        const id = idOrigem ?? (email && quando ? `${email}@${quando}` : null)
        if (!id) return null
        return {
          id: `${alvo.tabela}:${id}`,
          email: email || null,
          respondido_em: quando,
          dados: l,
          tabela_origem: alvo.tabela,
          _i: i,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map(({ _i: _ignorado, ...r }) => r)

    if (registros.length) {
      const { error } = await supabaseServer().from('quiz_respostas').upsert(registros)
      if (error) throw error
    }
    return { tabela: alvo.tabela, lidas: linhas.length, gravadas: registros.length }
  } catch (e) {
    return { tabela: null, lidas: 0, gravadas: 0, erro: e instanceof Error ? e.message : String(e) }
  }
}

export interface ResumoDoQuiz {
  respostas: number
  comEmail: number
  viraramClientes: number
  /** Pedidos pagos do mesmo e-mail DEPOIS da resposta — atribuição, não certeza. */
  receitaAtribuida: number
  ultimaImportacao: string | null
}

/** O placar da curadoria, para a tela de integrações e o relatório da rotina. */
export async function resumoDoQuiz(): Promise<ResumoDoQuiz> {
  const vazio: ResumoDoQuiz = {
    respostas: 0,
    comEmail: 0,
    viraramClientes: 0,
    receitaAtribuida: 0,
    ultimaImportacao: null,
  }
  if (!supabaseConfigurado()) return vazio
  try {
    const sb = supabaseServer()
    const respostas = await tudoDe<{ email: string | null; respondido_em: string | null; importado_em: string }>(
      'quiz_respostas',
      (de, ate) => sb.from('quiz_respostas').select('email, respondido_em, importado_em').range(de, ate),
    )
    if (!respostas.length) return vazio

    // A resposta mais ANTIGA de cada e-mail é o começo da janela de atribuição.
    const primeiraResposta = new Map<string, number>()
    for (const r of respostas) {
      if (!r.email) continue
      const em = r.respondido_em ? Date.parse(r.respondido_em) : Date.parse(r.importado_em)
      const atual = primeiraResposta.get(r.email)
      if (atual === undefined || em < atual) primeiraResposta.set(r.email, em)
    }

    let viraramClientes = 0
    let receitaAtribuida = 0
    if (primeiraResposta.size) {
      const emails = [...primeiraResposta.keys()]
      const { data: clientes } = await sb
        .from('clientes')
        .select('id, email')
        .in('email', emails.slice(0, 900))
      const porCliente = new Map(
        ((clientes ?? []) as { id: string; email: string | null }[])
          .filter((c) => c.email)
          .map((c) => [c.id, c.email!.trim().toLowerCase()]),
      )
      viraramClientes = porCliente.size
      if (porCliente.size) {
        const { data: pagos } = await sb
          .from('pedidos')
          .select('cliente_id, valor, comprado_em')
          .eq('pagamento', 'pago')
          .in('cliente_id', [...porCliente.keys()])
        for (const p of ((pagos ?? []) as { cliente_id: string; valor: string; comprado_em: string }[])) {
          const email = porCliente.get(p.cliente_id)
          const inicio = email ? primeiraResposta.get(email) : undefined
          if (inicio !== undefined && Date.parse(p.comprado_em) >= inicio) {
            receitaAtribuida += Number(p.valor)
          }
        }
      }
    }

    return {
      respostas: respostas.length,
      comEmail: primeiraResposta.size,
      viraramClientes,
      receitaAtribuida: Math.round(receitaAtribuida * 100) / 100,
      ultimaImportacao: respostas.reduce<string | null>(
        (a, r) => (a === null || r.importado_em > a ? r.importado_em : a),
        null,
      ),
    }
  } catch (e) {
    console.error('[quiz] resumo falhou:', e)
    return vazio
  }
}

// ── Painel da Curadoria (CRM → Curadoria Olfativa) ─────────────────────────

export interface CupomDesviado {
  cupom: string
  dono: string
  usadoPor: string
  pedido: string
}

/**
 * Cupom CURA usado por e-mail que não é o dono do lead.
 *
 * A Yampi não sabe amarrar cupom a e-mail de visitante sem cadastro, então a
 * trava dura é o limite de 1 uso — e esta vigilância é o resto: o desvio não
 * passa despercebido, vira alerta do Gerente.
 */
export async function cuponsDaCuradoriaDesviados(): Promise<CupomDesviado[]> {
  if (!supabaseConfigurado()) return []
  try {
    const sb = supabaseServer()
    const desde = new Date(Date.now() - 60 * 86_400_000).toISOString()
    const { data: pedidos } = await sb
      .from('pedidos')
      .select('id, cupom, clientes(email)')
      .ilike('cupom', 'CURA%')
      .gte('comprado_em', desde)
    const usos = ((pedidos ?? []) as unknown as {
      id: string
      cupom: string
      clientes: { email: string | null } | null
    }[]).filter((p) => p.cupom)
    if (!usos.length) return []

    const { data: leads } = await sb
      .from('quiz_respostas')
      .select('email, dados')
      .eq('tabela_origem', 'lead-cupom')
      .in('dados->>cupom', usos.map((u) => u.cupom))
    const donoDoCupom = new Map(
      ((leads ?? []) as { email: string | null; dados: { cupom?: string } }[])
        .filter((l) => l.email && l.dados?.cupom)
        .map((l) => [l.dados.cupom!, l.email!]),
    )

    return usos.flatMap((u) => {
      const dono = donoDoCupom.get(u.cupom)
      const usadoPor = u.clientes?.email ? emailComoIdentidade(u.clientes.email) : null
      if (!dono || !usadoPor || usadoPor === dono) return []
      return [{ cupom: u.cupom, dono, usadoPor, pedido: u.id }]
    })
  } catch (e) {
    console.error('[quiz] vigilância de cupons falhou:', e)
    return []
  }
}

export interface PainelDaCuradoria {
  interacoes: number
  leads: number
  viraramClientes: number
  /** Pedidos pagos que USARAM um cupom CURA — atribuição determinística. */
  receitaViaCupom: number
  cuponsUsados: number
  /** Pedidos pagos do mesmo e-mail depois da resposta — atribuição por janela. */
  receitaPorJanela: number
  topPerfumes: { nome: string; cliques: number }[]
  /** O perfil olfativo agregado: cada pergunta com as respostas mais comuns. */
  perfil: { pergunta: string; valores: { valor: string; qtd: number }[] }[]
  cliquesPorDia: { dia: string; qtd: number }[]
  leadsRecentes: {
    email: string
    quando: string
    cupom: string | null
    cupomUsado: boolean
    virouCliente: boolean
    /** O perfil olfativo declarado por ESTE lead no quiz. */
    perfil: [string, string][]
    /** Perfumes clicados na mesma sessão (perfil idêntico ao do lead). */
    clicadosNaSessao: string[]
    /** Perfumes de quem respondeu parecido — a recomendação para este lead. */
    recomendacoes: Recomendacao[]
    /** Perfil × DNA do catálogo do quiz — a curadoria principal, explicada. */
    curadoria: EscolhaDaCuradoria[]
  }[]
  desviados: CupomDesviado[]
}

export async function painelDaCuradoria(): Promise<PainelDaCuradoria> {
  const vazio: PainelDaCuradoria = {
    interacoes: 0,
    leads: 0,
    viraramClientes: 0,
    receitaViaCupom: 0,
    cuponsUsados: 0,
    receitaPorJanela: 0,
    topPerfumes: [],
    perfil: [],
    cliquesPorDia: [],
    leadsRecentes: [],
    desviados: [],
  }
  if (!supabaseConfigurado()) return vazio
  const sb = supabaseServer()

  const linhas = await tudoDe<{
    email: string | null
    respondido_em: string | null
    importado_em: string
    tabela_origem: string
    dados: Record<string, unknown>
  }>('quiz_respostas', (de, ate) =>
    sb
      .from('quiz_respostas')
      .select('email, respondido_em, importado_em, tabela_origem, dados')
      .order('respondido_em', { ascending: false })
      .range(de, ate),
  )

  const cliques = linhas.filter((l) => l.tabela_origem !== 'lead-cupom')
  const leads = linhas.filter((l) => l.tabela_origem === 'lead-cupom')

  // Top perfumes clicados — o sinal de demanda do quiz.
  const porPerfume = new Map<string, number>()
  for (const c of cliques) {
    const nome = typeof c.dados.perfume_nome === 'string' ? c.dados.perfume_nome : null
    if (nome) porPerfume.set(nome, (porPerfume.get(nome) ?? 0) + 1)
  }
  const topPerfumes = [...porPerfume.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([nome, cliques]) => ({ nome, cliques }))

  // Perfil olfativo agregado: pergunta → valores mais votados. As respostas
  // vêm do clique (o quiz manda o perfil junto) e do lead.
  const porPergunta = new Map<string, Map<string, number>>()
  for (const l of linhas) {
    const respostas = l.tabela_origem === 'lead-cupom' ? (l.dados.respostas ?? null) : l.dados.respostas
    for (const [pergunta, valor] of paresDePerfil(respostas)) {
      const valores = porPergunta.get(pergunta) ?? new Map<string, number>()
      valores.set(valor, (valores.get(valor) ?? 0) + 1)
      porPergunta.set(pergunta, valores)
    }
  }
  const perfil = [...porPergunta.entries()]
    .map(([pergunta, valores]) => ({
      pergunta,
      valores: [...valores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([valor, qtd]) => ({ valor, qtd })),
    }))
    .sort((a, b) => {
      const soma = (x: typeof a) => x.valores.reduce((s, v) => s + v.qtd, 0)
      return soma(b) - soma(a)
    })
    .slice(0, 6)

  // Cliques por dia, últimos 30 — o ritmo do quiz.
  const porDia = new Map<string, number>()
  const corte30 = Date.now() - 30 * 86_400_000
  for (const c of cliques) {
    const em = Date.parse(c.respondido_em ?? c.importado_em)
    if (!Number.isFinite(em) || em < corte30) continue
    const dia = new Date(em).toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' })
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1)
  }
  const cliquesPorDia = [...porDia.entries()].sort().map(([dia, qtd]) => ({ dia, qtd }))

  // Conversão dos leads: cliente pelo e-mail, receita pela janela e pelo cupom.
  const emails = [...new Set(leads.map((l) => l.email).filter((e): e is string => Boolean(e)))]
  const clientesPorEmail = new Map<string, string>()
  if (emails.length) {
    const { data: clientes } = await sb.from('clientes').select('id, email').in('email', emails.slice(0, 900))
    for (const c of (clientes ?? []) as { id: string; email: string | null }[]) {
      if (c.email) clientesPorEmail.set(c.email.trim().toLowerCase(), c.id)
    }
  }

  const cupons = leads
    .map((l) => (typeof l.dados.cupom === 'string' ? l.dados.cupom : null))
    .filter((c): c is string => Boolean(c))
  let receitaViaCupom = 0
  const cuponsUsadosSet = new Set<string>()
  if (cupons.length) {
    const { data: comCupom } = await sb
      .from('pedidos')
      .select('cupom, valor')
      .eq('pagamento', 'pago')
      .in('cupom', cupons)
    for (const p of (comCupom ?? []) as { cupom: string; valor: string }[]) {
      cuponsUsadosSet.add(p.cupom)
      receitaViaCupom += Number(p.valor)
    }
  }

  let receitaPorJanela = 0
  let viraramClientes = 0
  const clientesQueViraram = new Set<string>()
  if (clientesPorEmail.size) {
    const { data: pagos } = await sb
      .from('pedidos')
      .select('cliente_id, valor, comprado_em')
      .eq('pagamento', 'pago')
      .in('cliente_id', [...clientesPorEmail.values()])
    const primeiroLead = new Map<string, number>()
    for (const l of leads) {
      if (!l.email) continue
      const em = Date.parse(l.respondido_em ?? l.importado_em)
      const atual = primeiroLead.get(l.email)
      if (atual === undefined || em < atual) primeiroLead.set(l.email, em)
    }
    const emailDoCliente = new Map([...clientesPorEmail.entries()].map(([e, id]) => [id, e]))
    for (const p of (pagos ?? []) as { cliente_id: string; valor: string; comprado_em: string }[]) {
      const email = emailDoCliente.get(p.cliente_id)
      const inicio = email ? primeiroLead.get(email) : undefined
      clientesQueViraram.add(p.cliente_id)
      if (inicio !== undefined && Date.parse(p.comprado_em) >= inicio) {
        receitaPorJanela += Number(p.valor)
      }
    }
    viraramClientes = clientesPorEmail.size
  }

  // Cada clique com o perfil de quem clicou: é a base da recomendação por
  // afinidade — e do casamento "clicou na mesma sessão" (perfil idêntico).
  const cliquesComPerfil: CliqueComPerfil[] = cliques.flatMap((c) => {
    const nome = typeof c.dados.perfume_nome === 'string' ? c.dados.perfume_nome : null
    if (!nome) return []
    return [{ perfume: nome, pares: paresDePerfil(c.dados.respostas) }]
  })

  const dna = await catalogoComDna()

  const leadsRecentes = leads.slice(0, 20).map((l) => {
    const cupom = typeof l.dados.cupom === 'string' ? l.dados.cupom : null
    const perfil = paresDePerfil(l.dados.respostas)
    const chaveDoPerfil = JSON.stringify(perfil)
    const clicadosNaSessao =
      perfil.length > 0
        ? [...new Set(
            cliquesComPerfil
              .filter((c) => JSON.stringify(c.pares) === chaveDoPerfil)
              .map((c) => c.perfume),
          )]
        : []
    return {
      email: l.email ?? '—',
      quando: l.respondido_em ?? l.importado_em,
      cupom,
      cupomUsado: cupom ? cuponsUsadosSet.has(cupom) : false,
      virouCliente: Boolean(l.email && clientesPorEmail.has(l.email)),
      perfil,
      clicadosNaSessao,
      recomendacoes: recomendacoesPorAfinidade(perfil, cliquesComPerfil, 5, new Set(clicadosNaSessao)),
      curadoria: curadoriaPorDna(perfil, dna),
    }
  })

  return {
    interacoes: cliques.length,
    leads: leads.length,
    viraramClientes,
    receitaViaCupom: Math.round(receitaViaCupom * 100) / 100,
    cuponsUsados: cuponsUsadosSet.size,
    receitaPorJanela: Math.round(receitaPorJanela * 100) / 100,
    topPerfumes,
    perfil,
    cliquesPorDia,
    leadsRecentes,
    desviados: await cuponsDaCuradoriaDesviados(),
  }
}

// ── Catálogo e DNA olfativo do quiz ────────────────────────────────────────

/** Página a página, porque o PostgREST corta em ~1.000 linhas por resposta. */
async function tudoDoQuiz(caminho: string): Promise<Record<string, unknown>[]> {
  const tudo: Record<string, unknown>[] = []
  for (let offset = 0; offset <= 20_000; offset += 1000) {
    const lote = await chamarQuiz<Record<string, unknown>[]>(
      `${caminho}${caminho.includes('?') ? '&' : '?'}limit=1000&offset=${offset}`,
    )
    tudo.push(...lote)
    if (lote.length < 1000) break
  }
  return tudo
}

const textoOuNulo = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export interface ImportacaoDoCatalogo {
  perfumes: number
  tags: number
  erro?: string
}

/**
 * Espelha a base de conhecimento do quiz: `perfumes` + `perfume_tags`.
 *
 * É ela que faz a curadoria do quiz ser boa — e é ela que faltou quando o
 * Gerente, correto, se recusou a recomendar sem dado. Espelhada aqui, a
 * recomendação do ERP passa a cruzar perfil × DNA deterministicamente.
 */
export async function importarCatalogoDoQuiz(): Promise<ImportacaoDoCatalogo> {
  if (!quizConfigurado() || !supabaseConfigurado()) {
    return { perfumes: 0, tags: 0, erro: 'quiz não configurado' }
  }
  try {
    const sb = supabaseServer()

    const perfumes = (await tudoDoQuiz('/rest/v1/perfumes'))
      .filter((p) => p.id != null && typeof p.nome === 'string')
      .map((p) => ({
        id: String(p.id),
        nome: p.nome as string,
        marca: textoOuNulo(p.marca),
        genero: textoOuNulo(p.genero),
        ativo: p.ativo !== false,
        em_estoque: p.em_estoque !== false,
        // A descrição escrita PARA o quiz é a voz da curadoria; a base cobre
        // quem não tem.
        descricao: textoOuNulo(p.descricao_quiz) ?? textoOuNulo(p.descricao_base),
        importado_em: new Date().toISOString(),
      }))
    for (let i = 0; i < perfumes.length; i += 500) {
      const { error } = await sb.from('quiz_perfumes').upsert(perfumes.slice(i, i + 500))
      if (error) throw error
    }

    const tags = (await tudoDoQuiz('/rest/v1/perfume_tags'))
      .filter((t) => t.perfume_id != null && typeof t.categoria === 'string' && typeof t.valor === 'string')
      .map((t) => ({
        perfume_id: String(t.perfume_id),
        categoria: (t.categoria as string).trim(),
        valor: (t.valor as string).trim(),
      }))
    for (let i = 0; i < tags.length; i += 1000) {
      const { error } = await sb.from('quiz_perfume_tags').upsert(tags.slice(i, i + 1000))
      if (error) throw error
    }

    return { perfumes: perfumes.length, tags: tags.length }
  } catch (e) {
    return { perfumes: 0, tags: 0, erro: e instanceof Error ? e.message : String(e) }
  }
}

/** O catálogo espelhado pronto para o motor: só ativo e em estoque no quiz. */
export async function catalogoComDna(): Promise<PerfumeComDna[]> {
  if (!supabaseConfigurado()) return []
  const sb = supabaseServer()
  const [{ data: perfumes }, tags] = await Promise.all([
    sb.from('quiz_perfumes').select('id, nome, marca, genero, descricao').eq('ativo', true).eq('em_estoque', true),
    tudoDe<{ perfume_id: string; categoria: string; valor: string }>('quiz_perfume_tags', (de, ate) =>
      sb.from('quiz_perfume_tags').select('perfume_id, categoria, valor').range(de, ate),
    ),
  ])
  const porPerfume = new Map<string, [string, string][]>()
  for (const t of tags) {
    const lista = porPerfume.get(t.perfume_id) ?? []
    lista.push([t.categoria, t.valor])
    porPerfume.set(t.perfume_id, lista)
  }
  return ((perfumes ?? []) as { id: string; nome: string; marca: string | null; genero: string | null; descricao: string | null }[]).map(
    (p) => ({
      nome: p.nome,
      marca: p.marca,
      genero: p.genero,
      tags: porPerfume.get(p.id) ?? [],
      descricao: p.descricao,
    }),
  )
}
