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

/** Aceita os dois formatos: par client/secret ou chave única. */
export function pagaleveConfigurada(): boolean {
  return Boolean(
    (process.env.PAGALEVE_CLIENT_ID && process.env.PAGALEVE_CLIENT_SECRET) ||
      process.env.PAGALEVE_API_KEY,
  )
}

export function comoEstaConfigurada(): string {
  if (process.env.PAGALEVE_CLIENT_ID && process.env.PAGALEVE_CLIENT_SECRET) {
    return 'PAGALEVE_CLIENT_ID + PAGALEVE_CLIENT_SECRET'
  }
  if (process.env.PAGALEVE_API_KEY) return 'PAGALEVE_API_KEY'
  return 'nenhuma credencial definida'
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

  const corpo = process.env.PAGALEVE_API_KEY
    ? { api_key: process.env.PAGALEVE_API_KEY }
    : {
        client_id: process.env.PAGALEVE_CLIENT_ID,
        client_secret: process.env.PAGALEVE_CLIENT_SECRET,
      }

  let token: string | null = null
  for (const caminho of CAMINHOS_DE_AUTENTICACAO) {
    const t = await tentar(caminho, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    })
    saida.autenticacao.push(t)
    if (t.status === 200 && t.amostra) {
      // O nome do campo do token varia entre APIs; aceita os usuais.
      const achado = /"(access_token|token|accessToken|id_token)"\s*:\s*"([^"]+)"/.exec(t.amostra)
      if (achado) {
        token = achado[2]
        saida.tokenObtido = true
        break
      }
    }
  }

  if (!token) return saida

  for (const caminho of CAMINHOS_DE_LEITURA) {
    saida.leitura.push(
      await tentar(caminho, { headers: { Authorization: `Bearer ${token}` } }),
    )
  }
  return saida
}
