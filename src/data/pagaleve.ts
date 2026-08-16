import 'server-only'

import { assinar } from '@/domain/sigv4'

/**
 * Conector da Pagaleve — o intermediário de Pix parcelado.
 *
 * A Pagaleve é o terceiro caminho de dinheiro da operação, e o único que o ERP
 * não enxergava. O cliente parcela o Pix em até 4x com 15 dias entre parcelas,
 * então uma venda só fecha em 45 dias, e o dinheiro chega em depósitos que não
 * correspondem a um pedido específico. Foi isso que encheu a conciliação de
 * pendências que nunca foram pendência.
 *
 * A API fica atrás de um AWS API Gateway com assinatura SigV4 — descoberto
 * pela sondagem, não suposto: o gateway respondeu, palavra por palavra,
 * "Authorization header requires 'Credential' parameter". Então a "Chave de
 * API" do painel é um Access Key ID e a "Senha da Chave de API" é um Secret
 * Access Key, e cada requisição vai assinada.
 *
 * A sondagem continua existindo porque duas coisas ainda não são conhecidas: a
 * REGIÃO do escopo da assinatura e os CAMINHOS reais. Descobrir cada uma por
 * deploy sairia caro; descobrir as duas numa varredura sai numa ida só.
 */

const BASE = process.env.PAGALEVE_BASE ?? 'https://api.pagaleve.com.br'

/**
 * Regiões candidatas, na ordem de probabilidade.
 *
 * `sa-east-1` primeiro porque a Pagaleve é brasileira e processa Pix — dado
 * financeiro nacional costuma ficar em São Paulo. `us-east-1` logo depois
 * porque é o padrão de quem não escolheu região.
 */
const REGIOES = ['sa-east-1', 'us-east-1', 'us-east-2', 'us-west-2']

/** Caminhos de autenticação plausíveis, para a troca de chave por token. */
const CAMINHOS_DE_AUTENTICACAO = [
  '/authentication',
  '/auth',
  '/v1/authentication',
  '/v1/auth',
  '/token',
  '/sessions',
  '/merchant/authentication',
]

/** Onde vendas e repasses costumam morar numa API de intermediário. */
const CAMINHOS = [
  '/checkouts',
  '/orders',
  '/v1/orders',
  '/merchant/orders',
  '/payments',
  '/settlements',
  '/transfers',
  '/financial/statement',
  '/',
]

function credenciais(): { chave: string; senha: string } | null {
  const chave = process.env.PAGALEVE_CHAVE
  const senha = process.env.PAGALEVE_SENHA
  return chave && senha ? { chave, senha } : null
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
 * A sondagem existe para descobrir NOMES DE CAMPO e mensagens de erro, não
 * para transportar dado de cliente. Seiscentos caracteres cabem a mensagem
 * inteira da AWS, que é onde costuma vir a região esperada.
 */
function resumo(texto: string): string {
  return texto.replace(/\s+/g, ' ').slice(0, 600)
}

function chavesDe(json: unknown): string[] {
  if (Array.isArray(json)) return json.length > 0 ? chavesDe(json[0]) : []
  if (json && typeof json === 'object') return Object.keys(json as Record<string, unknown>)
  return []
}

/** Uma requisição assinada, com a resposta reduzida à sua forma. */
async function pedir(
  caminho: string,
  region: string,
  metodo = 'GET',
  corpo = '',
): Promise<Tentativa> {
  const c = credenciais()
  if (!c) return { alvo: caminho, status: null, erro: 'sem credencial' }

  const url = `${BASE}${caminho}`
  const assinado = assinar(
    {
      accessKeyId: c.chave,
      secretAccessKey: c.senha,
      region,
      // `execute-api` é o serviço de todo API Gateway; não há alternativa
      // plausível aqui, então ele não entra na varredura.
      service: 'execute-api',
    },
    metodo,
    url,
    corpo,
    new Date(),
    corpo ? { 'content-type': 'application/json' } : {},
  )

  try {
    const r = await fetch(url, {
      method: metodo,
      headers: assinado.headers,
      body: corpo || undefined,
    })
    const texto = await r.text()
    let json: unknown = null
    try {
      json = JSON.parse(texto)
    } catch {
      /* não-JSON: a amostra conta a história */
    }
    return {
      alvo: `${metodo} ${caminho} @${region}`,
      status: r.status,
      chaves: json ? chavesDe(json) : undefined,
      amostra: resumo(texto),
    }
  } catch (e) {
    return {
      alvo: `${metodo} ${caminho} @${region}`,
      status: null,
      erro: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * Lê a documentação pública da Pagaleve pela função, não pelo meu ambiente.
 *
 * `docs.pagaleve.com.br` é inalcançável de onde este código é escrito, mas a
 * função no Netlify tem saída livre. Em vez de adivinhar o caminho de
 * autenticação por tentativa — o que custaria um deploy por hipótese — ela
 * busca a referência e extrai os caminhos que a própria Pagaleve documenta.
 *
 * É leitura de página pública, e o que sai daqui são só rotas.
 */
async function caminhosDocumentados(): Promise<{ achados: string[]; erro?: string }> {
  const paginas = [
    'https://docs.pagaleve.com.br/reference/authenticationcontroller_doauthentication',
    'https://docs.pagaleve.com.br/reference/pagaleve-api',
  ]
  const achados = new Set<string>()
  const erros: string[] = []

  for (const pagina of paginas) {
    try {
      const r = await fetch(pagina, { headers: { 'user-agent': 'FRENESI-ERP/1.0' } })
      if (!r.ok) {
        erros.push(`${pagina} → ${r.status}`)
        continue
      }
      const html = await r.text()
      // URLs completas de API e caminhos citados junto de um verbo HTTP: as
      // duas formas em que uma referência escreve endpoint.
      for (const m of html.matchAll(/https?:\/\/[a-z0-9.-]*pagaleve[a-z0-9.-]*\/[a-z0-9/_{}-]+/gi)) {
        achados.add(m[0])
      }
      for (const m of html.matchAll(/"(POST|GET|PUT)"[^"]{0,40}"(\/[a-z0-9/_{}-]{2,60})"/gi)) {
        achados.add(`${m[1]} ${m[2]}`)
      }
    } catch (e) {
      erros.push(`${pagina} → ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { achados: [...achados].slice(0, 60), erro: erros.length ? erros.join(' · ') : undefined }
}

/**
 * Tenta o formato de chave de API do próprio API Gateway.
 *
 * O SigV4 foi descartado pelo dado: `us-east-1` respondeu "The security token
 * included in the request is invalid", que é o erro para Access Key ID
 * inexistente no IAM — a chave da Pagaleve não é credencial AWS. Sobra a outra
 * porta do gateway, o cabeçalho `x-api-key`, provavelmente trocando a chave
 * por um Bearer de 60 minutos, como a referência descreve.
 */
async function comChaveDeApi(caminho: string, metodo: string, corpo: string): Promise<Tentativa> {
  const c = credenciais()
  if (!c) return { alvo: caminho, status: null, erro: 'sem credencial' }
  try {
    const r = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers: {
        'x-api-key': c.chave,
        'content-type': 'application/json',
        // A senha viaja nos dois lugares plausíveis: há API que a espera como
        // cabeçalho irmão da chave, e há API que a espera no corpo.
        'x-api-secret': c.senha,
      },
      body: corpo || undefined,
    })
    const texto = await r.text()
    let json: unknown = null
    try {
      json = JSON.parse(texto)
    } catch {
      /* não-JSON */
    }
    return {
      alvo: `${metodo} ${caminho} [x-api-key]`,
      status: r.status,
      chaves: json ? chavesDe(json) : undefined,
      amostra: resumo(texto),
    }
  } catch (e) {
    return {
      alvo: `${metodo} ${caminho} [x-api-key]`,
      status: null,
      erro: e instanceof Error ? e.message : String(e),
    }
  }
}

export interface Sondagem {
  base: string
  credencial: string
  regiaoDescoberta: string | null
  regioes: Tentativa[]
  caminhos: Tentativa[]
  documentacao: { achados: string[]; erro?: string }
  chaveDeApi: Tentativa[]
}

/**
 * Descobre região e caminhos numa varredura só.
 *
 * Primeiro a região: uma requisição por candidata, e a resposta separa as
 * três hipóteses sem ambiguidade. "Credential should be scoped to a valid
 * region" diz que a região está errada; qualquer coisa que NÃO seja essa
 * mensagem diz que a assinatura foi aceita — inclusive um 404, que é ótima
 * notícia, porque significa que só o caminho falta.
 */
export type Fase = 'tudo' | 'docs' | 'chaves' | 'assinatura'

export async function sondar(fase: Fase = 'tudo'): Promise<Sondagem> {
  const saida: Sondagem = {
    base: BASE,
    credencial: comoEstaConfigurada(),
    regiaoDescoberta: null,
    regioes: [],
    caminhos: [],
    documentacao: { achados: [] },
    chaveDeApi: [],
  }
  if (!pagaleveConfigurada()) return saida

  // Fatiado por fase, e não por gosto: a rodada anterior juntou vinte
  // requisições com três páginas de documentação numa execução só e a função
  // estourou o tempo, devolvendo 502 — que não é resultado nenhum. Cada fase
  // agora cabe folgada no limite, e uma fase que falha não leva as outras.
  if (fase === 'tudo' || fase === 'docs') {
    saida.documentacao = await caminhosDocumentados()
  }

  if (fase === 'tudo' || fase === 'assinatura') {
    // O SigV4 já foi descartado pelo dado, mas a checagem fica disponível: é
    // ela que prova que a conclusão continua valendo, em vez de eu confiar na
    // memória de um diagnóstico antigo.
    const t = await pedir('/', 'us-east-1')
    saida.regioes.push(t)
    if (!/scoped to a valid region/i.test(t.amostra ?? '')) saida.regiaoDescoberta = 'us-east-1'
  }

  if (fase === 'tudo' || fase === 'chaves') {
    const corpo = JSON.stringify({
      api_key: process.env.PAGALEVE_CHAVE,
      api_secret: process.env.PAGALEVE_SENHA,
    })
    for (const caminho of CAMINHOS_DE_AUTENTICACAO) {
      saida.chaveDeApi.push(await comChaveDeApi(caminho, 'POST', corpo))
    }
    for (const caminho of CAMINHOS) {
      saida.chaveDeApi.push(await comChaveDeApi(caminho, 'GET', ''))
    }
  }
  return saida
}
