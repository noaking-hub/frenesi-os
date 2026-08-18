import 'server-only'

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
 * senão, a tabela com coluna de e-mail — desempate pelo nome mais sugestivo.
 */
export function tabelaDeRespostas(tabelas: TabelaDoQuiz[]): TabelaDoQuiz | null {
  const forcada = (process.env.QUIZ_TABELA ?? '').trim()
  if (forcada) return tabelas.find((t) => t.tabela === forcada) ?? null

  const comEmail = tabelas.filter((t) => t.colunas.some((c) => COLUNAS_DE_EMAIL.includes(c.toLowerCase())))
  if (comEmail.length === 0) return null
  const sugestiva = comEmail.find((t) => /resposta|resultado|lead|submiss|quiz|curadoria/i.test(t.tabela))
  return sugestiva ?? comEmail[0]
}

const acha = (colunas: string[], candidatas: string[]) =>
  colunas.find((c) => candidatas.includes(c.toLowerCase())) ?? null

export interface ImportacaoDoQuiz {
  tabela: string | null
  lidas: number
  gravadas: number
  erro?: string
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
    const alvo = tabelaDeRespostas(await tabelasDoQuiz())
    if (!alvo) {
      return {
        tabela: null,
        lidas: 0,
        gravadas: 0,
        erro: 'nenhuma tabela com coluna de e-mail — defina QUIZ_TABELA com o nome certo',
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
