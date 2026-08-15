import 'server-only'

/**
 * Conector da Pagaleve — o intermediário de Pix parcelado.
 *
 * A Pagaleve é o terceiro caminho de dinheiro da operação, e o único que o ERP
 * não enxergava. O cliente parcela o Pix em até 4x com 15 dias entre parcelas,
 * então uma venda só fecha em 45 dias, e o dinheiro chega em depósitos da
 * Pagaleve para o Mercado Pago que não correspondem a um pedido específico.
 * Foi isso que encheu a conciliação de pendências que nunca foram pendência.
 *
 * ESTE ARQUIVO COMEÇA PELA SONDAGEM, DE PROPÓSITO.
 *
 * A documentação da Pagaleve não é alcançável do ambiente onde este código foi
 * escrito, e escrever um importador contra um schema imaginado é a forma mais
 * cara de errar: ele "funciona", grava número errado, e ninguém descobre até a
 * conciliação não fechar. Então a primeira coisa que existe aqui é uma função
 * que PERGUNTA à API como ela é — autentica, tenta os caminhos prováveis, e
 * reporta o que cada um respondeu. Com a resposta real em mãos, o importador
 * se escreve em minutos e contra fatos.
 */

const BASE = process.env.PAGALEVE_BASE ?? 'https://api.pagaleve.com.br'

/**
 * As variáveis levam o nome que o painel da Pagaleve usa — "Chave de API" e
 * "Senha da Chave de API" — e não `CLIENT_ID`/`CLIENT_SECRET`. Quem cadastra
 * está olhando para o painel, e duas credenciais parecidas com nomes
 * diferentes dos que ele vê é um convite a inverter as duas. Credencial
 * invertida falha com 401, que é indistinguível de credencial errada.
 */
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
  caminho: string
  metodo: string
  status: number | null
  erro?: string
  /** Só a FORMA da resposta, nunca o conteúdo: isto vai para log. */
  chaves?: string[]
  amostra?: string
}

/**
 * Corpo cortado e sem PII, para o diagnóstico poder ser lido em log.
 *
 * A sondagem existe para descobrir NOMES DE CAMPO, não para transportar dados
 * de cliente. Trezentos caracteres bastam para reconhecer um schema.
 */
function resumo(texto: string): string {
  return texto.replace(/\s+/g, ' ').slice(0, 300)
}

function chavesDe(json: unknown): string[] {
  if (Array.isArray(json)) return json.length > 0 ? chavesDe(json[0]) : []
  if (json && typeof json === 'object') return Object.keys(json as Record<string, unknown>)
  return []
}

async function tentar(
  caminho: string,
  init: RequestInit & { metodo?: string } = {},
): Promise<Tentativa> {
  const metodo = init.method ?? 'GET'
  try {
    const r = await fetch(`${BASE}${caminho}`, { ...init, method: metodo })
    const texto = await r.text()
    let json: unknown = null
    try {
      json = JSON.parse(texto)
    } catch {
      /* resposta não-JSON: a amostra já conta a história */
    }
    return {
      caminho,
      metodo,
      status: r.status,
      chaves: json ? chavesDe(json) : undefined,
      amostra: resumo(texto),
    }
  } catch (e) {
    return {
      caminho,
      metodo,
      status: null,
      erro: e instanceof Error ? e.message : String(e),
    }
  }
}

/** Caminhos prováveis de autenticação, na ordem em que a doc os sugere. */
const CAMINHOS_DE_AUTENTICACAO = ['/auth', '/authentication', '/v1/auth', '/oauth/token']

/** Onde as vendas e os repasses costumam morar numa API de intermediário. */
const CAMINHOS_DE_LEITURA = [
  '/checkouts',
  '/orders',
  '/v1/orders',
  '/payments',
  '/settlements',
  '/transfers',
  '/merchant/orders',
  '/financial/statement',
]

export interface Sondagem {
  base: string
  credencial: string
  autenticacao: Tentativa[]
  tokenObtido: boolean
  /** Qual combinação de caminho e formato autenticou — o achado da sondagem. */
  formaQueFuncionou?: string
  leitura: Tentativa[]
}

/**
 * Descobre a API sem chutar: autentica, e se conseguir, lê.
 *
 * Devolve o que CADA caminho respondeu — inclusive os 404, que são informação:
 * eles eliminam hipótese. O que importa aqui não é ter sucesso, é ter certeza.
 */
export async function sondar(): Promise<Sondagem> {
  const credencial = comoEstaConfigurada()
  const saida: Sondagem = {
    base: BASE,
    credencial,
    autenticacao: [],
    tokenObtido: false,
    leitura: [],
  }
  if (!pagaleveConfigurada()) return saida

  const { chave, senha } = credenciais()!
  const basic = Buffer.from(`${chave}:${senha}`).toString('base64')

  // Um par "chave + senha" pode viajar de três formas, e nenhuma delas é a
  // óbvia em todas as APIs. Tentar as três numa rodada custa três requisições
  // e evita um deploy inteiro só para descobrir qual era — e cada deploy aqui
  // é pago.
  const formas: { nome: string; init: RequestInit }[] = [
    {
      nome: 'basic',
      init: {
        method: 'POST',
        headers: { authorization: `Basic ${basic}`, 'content-type': 'application/json' },
        body: '{}',
      },
    },
    {
      nome: 'corpo-client',
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: chave, client_secret: senha }),
      },
    },
    {
      nome: 'corpo-api-key',
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ api_key: chave, api_secret: senha }),
      },
    },
  ]

  let token: string | null = null
  for (const caminho of CAMINHOS_DE_AUTENTICACAO) {
    for (const forma of formas) {
      const t = await tentar(caminho, forma.init)
      saida.autenticacao.push({ ...t, caminho: `${caminho} [${forma.nome}]` })
      if (t.status === 200 && t.amostra) {
        // O nome do campo do token varia entre APIs; aceita os usuais.
        const achado = /"(access_token|token|accessToken|id_token)"\s*:\s*"([^"]+)"/.exec(
          t.amostra,
        )
        if (achado) {
          token = achado[2]
          saida.tokenObtido = true
          saida.formaQueFuncionou = `${caminho} [${forma.nome}]`
          break
        }
      }
    }
    if (token) break
  }

  // Sem token, ainda vale tentar ler com a chave direto no header: há API que
  // dispensa a troca por token e aceita a credencial em toda requisição.
  if (!token) {
    saida.leitura.push(
      await tentar(CAMINHOS_DE_LEITURA[0], { headers: { authorization: `Basic ${basic}` } }),
    )
    return saida
  }

  for (const caminho of CAMINHOS_DE_LEITURA) {
    saida.leitura.push(
      await tentar(caminho, { headers: { Authorization: `Bearer ${token}` } }),
    )
  }
  return saida
}
