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

export interface Sondagem {
  base: string
  credencial: string
  regiaoDescoberta: string | null
  regioes: Tentativa[]
  caminhos: Tentativa[]
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
export async function sondar(): Promise<Sondagem> {
  const saida: Sondagem = {
    base: BASE,
    credencial: comoEstaConfigurada(),
    regiaoDescoberta: null,
    regioes: [],
    caminhos: [],
  }
  if (!pagaleveConfigurada()) return saida

  for (const region of REGIOES) {
    const t = await pedir('/', region)
    saida.regioes.push(t)
    const amostra = t.amostra ?? ''
    const regiaoErrada = /scoped to a valid region|Credential should be scoped/i.test(amostra)
    const assinaturaErrada = /SignatureDoesNotMatch|not match any credential/i.test(amostra)
    if (!regiaoErrada && !assinaturaErrada) {
      saida.regiaoDescoberta = region
      break
    }
  }

  // Sem região aceita não adianta varrer caminho: todo caminho responderia o
  // mesmo erro de assinatura, e a varredura só gastaria requisição.
  if (!saida.regiaoDescoberta) return saida

  for (const caminho of CAMINHOS) {
    saida.caminhos.push(await pedir(caminho, saida.regiaoDescoberta))
  }
  return saida
}
