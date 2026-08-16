import 'server-only'

/**
 * Conector da Pagaleve — o intermediário de Pix parcelado.
 *
 * A Pagaleve é o terceiro caminho de dinheiro da operação, e o único que o ERP
 * não enxergava. O cliente parcela o Pix em até 4x com 15 dias entre parcelas,
 * então uma venda só fecha em 45 dias, e o dinheiro chega em depósitos que não
 * correspondem a um pedido específico. Foi isso que encheu a conciliação de 26
 * pendências que nunca foram pendência.
 *
 * O caminho até aqui foi por sondagem, e vale registrar porque explica o
 * formato: a API fica atrás de um AWS API Gateway, que a princípio parecia
 * exigir assinatura SigV4. Não exige — `us-east-1` respondeu "The security
 * token included in the request is invalid", que é o erro para Access Key ID
 * inexistente no IAM. A chave da Pagaleve não é credencial AWS; o gateway só
 * reclamava de assinatura porque havia um header `Authorization` na
 * requisição.
 *
 * Quem entregou o formato foi a própria API. `POST /v1/authentication`
 * respondeu 400 com a lista de campos que faltavam: "username should not be
 * empty", "password must be a string". Então a "Chave de API" do painel é o
 * `username` e a "Senha da Chave de API" é o `password`, e a troca devolve um
 * token de sessão.
 */

const BASE = process.env.PAGALEVE_BASE ?? 'https://api.pagaleve.com.br'

/** Descoberto pela sondagem, não suposto. */
const AUTENTICACAO = '/v1/authentication'

/** A sessão vale 60 minutos; renova antes disso para não perder no meio. */
const VIDA_DO_TOKEN_MS = 50 * 60_000

function credenciais(): { usuario: string; senha: string } | null {
  const usuario = process.env.PAGALEVE_CHAVE
  const senha = process.env.PAGALEVE_SENHA
  return usuario && senha ? { usuario, senha } : null
}

export function pagaleveConfigurada(): boolean {
  return credenciais() !== null
}

export function comoEstaConfigurada(): string {
  if (credenciais()) return 'PAGALEVE_CHAVE + PAGALEVE_SENHA'
  const faltando = [
    process.env.PAGALEVE_CHAVE ? null : 'PAGALEVE_CHAVE',
    process.env.PAGALEVE_SENHA ? null : 'PAGALEVE_SENHA',
  ].filter(Boolean)
  return `faltando: ${faltando.join(' e ')}`
}

/**
 * Token em memória do processo.
 *
 * Autenticar a cada chamada custaria uma ida à rede por requisição e gastaria
 * a sessão à toa. O cache é do processo — a função serverless pode ser
 * reciclada a qualquer momento, e nesse caso ela simplesmente autentica de
 * novo. Cache que sobrevive demais é pior: token expirado guardado é uma
 * falha que só aparece na hora errada.
 */
let sessao: { token: string; expiraEm: number } | null = null

export async function autenticar(forcar = false): Promise<string> {
  const c = credenciais()
  if (!c) throw new Error('PAGALEVE_CHAVE e PAGALEVE_SENHA não estão definidas no site.')
  if (!forcar && sessao && sessao.expiraEm > Date.now()) return sessao.token

  const r = await fetch(`${BASE}${AUTENTICACAO}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // Os nomes vieram da própria API, na resposta 400 que listou o que
    // faltava. Não são chute.
    body: JSON.stringify({ username: c.usuario, password: c.senha }),
  })
  const texto = await r.text()
  if (!r.ok) {
    throw new Error(`Pagaleve recusou a autenticação (${r.status}): ${texto.slice(0, 300)}`)
  }

  const json = JSON.parse(texto) as Record<string, unknown>
  const token = primeiroToken(json)
  if (!token) {
    throw new Error(
      `Pagaleve autenticou mas não devolveu token reconhecível. Campos: ${Object.keys(json).join(', ')}`,
    )
  }
  sessao = { token, expiraEm: Date.now() + VIDA_DO_TOKEN_MS }
  return token
}

/** O nome do campo do token varia; aceita os usuais, incluindo aninhado. */
function primeiroToken(json: Record<string, unknown>): string | null {
  const nomes = ['access_token', 'accessToken', 'token', 'id_token', 'idToken', 'jwt']
  for (const n of nomes) {
    const v = json[n]
    if (typeof v === 'string' && v.length > 0) return v
  }
  for (const v of Object.values(json)) {
    if (v && typeof v === 'object') {
      const achado = primeiroToken(v as Record<string, unknown>)
      if (achado) return achado
    }
  }
  return null
}

/** Requisição autenticada, com uma reautenticação se o token tiver morrido. */
export async function pedirNaPagaleve(
  caminho: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await autenticar()
  const chamar = (t: string) =>
    fetch(`${BASE}${caminho}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        authorization: `Bearer ${t}`,
        'content-type': 'application/json',
      },
    })

  const r = await chamar(token)
  // 401 com token em mãos significa sessão morta antes da hora — reautentica
  // uma vez. Duas seria laço, e laço contra API de terceiro vira bloqueio.
  if (r.status !== 401) return r
  return chamar(await autenticar(true))
}

// ── Leitura ────────────────────────────────────────────────────────────────

/** Uma venda pela Pagaleve. Valores em CENTAVOS, como a API devolve. */
export interface TransacaoPagaleve {
  checkout_id: string
  order_reference: string
  order_amount: number
  current_amount: number
  refunded_amount: number
  total_fee_amount: number
  merchant_service_fee: number
  merchant_transaction_fee: number
  order_purchase_date: string
  timestamp: string
}

/** Um repasse da Pagaleve para a conta. `final_amount` negativo é saída de lá. */
export interface TransferenciaPagaleve {
  id: string
  transaction_type: string
  type: string
  amount: number
  final_amount: number
  total_fee_amount: number
  transferred_date: string
  status: string
  accumulated_days: string[]
}

interface Pagina<T> {
  items?: T[]
  total_count?: number
}

/**
 * Percorre uma listagem até o fim.
 *
 * A paginação não está documentada em lugar que eu alcance, então o laço
 * confia no `total_count` que a própria resposta traz e para quando a página
 * vem vazia — o que também protege caso os parâmetros sejam ignorados: sem a
 * parada por página vazia, um `limit` desconhecido viraria laço infinito
 * relendo a primeira página.
 */
async function listar<T>(caminho: string, teto = 40): Promise<{ itens: T[]; total: number }> {
  const itens: T[] = []
  let total = 0

  for (let pagina = 0; pagina < teto; pagina++) {
    const juncao = caminho.includes('?') ? '&' : '?'
    const r = await pedirNaPagaleve(`${caminho}${juncao}limit=100&offset=${pagina * 100}`)
    if (!r.ok) {
      throw new Error(`${caminho} respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`)
    }
    const json = (await r.json()) as Pagina<T>
    const lote = json.items ?? []
    total = json.total_count ?? total
    if (lote.length === 0) break
    itens.push(...lote)
    if (itens.length >= total && total > 0) break
  }
  return { itens, total }
}

export function listarTransacoes() {
  return listar<TransacaoPagaleve>('/v1/transactions')
}

export function listarTransferencias() {
  return listar<TransferenciaPagaleve>('/v1/transfers')
}

/** Centavos para reais, que é a unidade de todo o resto do ERP. */
export function emReais(centavos: number): number {
  return Math.round(centavos) / 100
}

// ── Sondagem ───────────────────────────────────────────────────────────────

interface Tentativa {
  alvo: string
  status: number | null
  erro?: string
  chaves?: string[]
  amostra?: string
}

/**
 * Corpo cortado e sem PII.
 *
 * A sondagem existe para descobrir NOMES DE CAMPO, não para transportar dado
 * de cliente. Seiscentos caracteres bastam para reconhecer um schema.
 */
function resumo(texto: string): string {
  return texto.replace(/\s+/g, ' ').slice(0, 600)
}

function chavesDe(json: unknown): string[] {
  if (Array.isArray(json)) return json.length > 0 ? chavesDe(json[0]) : []
  if (json && typeof json === 'object') return Object.keys(json as Record<string, unknown>)
  return []
}

/**
 * Onde vendas e repasses podem morar.
 *
 * Todos sob `/v1`, porque é o prefixo que a autenticação revelou. Varrer fora
 * dele seria gastar requisição contra um caminho que a API já disse não usar.
 */
const CAMINHOS = [
  '/v1/checkouts',
  '/v1/orders',
  '/v1/payments',
  '/v1/transactions',
  '/v1/settlements',
  '/v1/transfers',
  '/v1/merchants',
  '/v1/merchant',
  '/v1/refunds',
  '/v1/reports',
  '/v1/financial',
  '/v1/receivables',
]

export interface Sondagem {
  base: string
  credencial: string
  autenticou: boolean
  erroDeAutenticacao?: string
  camposDoToken?: string[]
  leitura: Tentativa[]
}

/**
 * Autentica e varre os caminhos de leitura com o token real.
 *
 * Agora que o formato de autenticação é conhecido, a varredura deixa de
 * adivinhar duas coisas ao mesmo tempo. Um 404 aqui é resultado limpo: diz que
 * o caminho não existe, sem a dúvida de ser a credencial.
 */
export async function sondar(): Promise<Sondagem> {
  const saida: Sondagem = {
    base: BASE,
    credencial: comoEstaConfigurada(),
    autenticou: false,
    leitura: [],
  }
  if (!pagaleveConfigurada()) return saida

  try {
    await autenticar(true)
    saida.autenticou = true
  } catch (e) {
    saida.erroDeAutenticacao = e instanceof Error ? e.message : String(e)
    return saida
  }

  for (const caminho of CAMINHOS) {
    try {
      const r = await pedirNaPagaleve(caminho)
      const texto = await r.text()
      let json: unknown = null
      try {
        json = JSON.parse(texto)
      } catch {
        /* não-JSON */
      }
      saida.leitura.push({
        alvo: `GET ${caminho}`,
        status: r.status,
        chaves: json ? chavesDe(json) : undefined,
        amostra: resumo(texto),
      })
    } catch (e) {
      saida.leitura.push({
        alvo: `GET ${caminho}`,
        status: null,
        erro: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return saida
}
