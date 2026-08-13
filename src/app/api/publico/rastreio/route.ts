import { NextResponse } from 'next/server'

import { rastreioPublico } from '@/data/rastreio-publico'
import { supabaseConfigurado } from '@/data/supabase'

/**
 * Rastreio para o site da loja.
 *
 *     GET /api/publico/rastreio?documento={cpf|email}[&pedido={numero}]
 *     X-API-Key: $RASTREIO_API_KEY
 *
 * A única rota do ERP que responde a quem não fez login. Três guardas, e cada
 * uma cobre o que a outra não cobre:
 *
 *  - A CHAVE identifica o site, e só ele. Ela vive no navegador do visitante,
 *    então é semi-pública por natureza — não é ela que protege o dado.
 *  - O DOCUMENTO é o que protege: só responde a quem já sabe o e-mail ou o CPF
 *    do titular. É a mesma regra do Portal de Devoluções.
 *  - O TETO POR IP existe porque documento é adivinhável em massa e chave
 *    vazada não se percebe sozinha. Sem ele, as duas primeiras guardas viram
 *    convite para varredura.
 *
 * Contrato completo em docs/rastreamento-integracao.md §7.
 */

export const dynamic = 'force-dynamic'

/** Consultas por minuto, por IP. */
const TETO_POR_MINUTO = 60
const JANELA_MS = 60_000

/**
 * Contagem por IP na memória da instância.
 *
 * Não é rate limit distribuído: cada instância serverless conta a sua parte, e
 * um atacante distribuído passa por várias. Dito isso, ele resolve o caso que
 * importa — script único varrendo documentos — e não custa infraestrutura
 * nova. Se a rota virar alvo de verdade, a conta migra para o banco.
 */
const acessos = new Map<string, { inicio: number; contagem: number }>()

function excedeu(ip: string): boolean {
  const agora = Date.now()
  const atual = acessos.get(ip)
  if (!atual || agora - atual.inicio > JANELA_MS) {
    acessos.set(ip, { inicio: agora, contagem: 1 })
    // A limpeza é aqui, e não num timer: o processo pode morrer a qualquer
    // momento, e um Map que só cresce é vazamento em rota pública.
    if (acessos.size > 5_000) {
      for (const [chave, valor] of acessos) {
        if (agora - valor.inicio > JANELA_MS) acessos.delete(chave)
      }
    }
    return false
  }
  atual.contagem++
  return atual.contagem > TETO_POR_MINUTO
}

function ipDe(req: Request): string {
  const encaminhado = req.headers.get('x-nf-client-connection-ip') ?? req.headers.get('x-forwarded-for')
  return (encaminhado ?? '').split(',')[0].trim() || 'desconhecido'
}

/**
 * Origens autorizadas, em `RASTREIO_ORIGENS` separadas por vírgula.
 *
 * Sem a variável definida, NENHUMA origem recebe cabeçalho de CORS — a rota
 * continua respondendo a servidor, mas o navegador de terceiro não lê. Abrir
 * para `*` por padrão faria de qualquer site uma fachada para consultar
 * pedidos da FRENESI.
 */
function origemLiberada(req: Request): string | null {
  const origem = req.headers.get('origin')
  if (!origem) return null
  const permitidas = (process.env.RASTREIO_ORIGENS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  return permitidas.includes(origem) ? origem : null
}

function comCabecalhos(resposta: NextResponse, origem: string | null): NextResponse {
  if (origem) {
    resposta.headers.set('Access-Control-Allow-Origin', origem)
    resposta.headers.set('Vary', 'Origin')
  }
  return resposta
}

export async function OPTIONS(req: Request) {
  const origem = origemLiberada(req)
  const resposta = new NextResponse(null, { status: origem ? 204 : 403 })
  if (origem) {
    resposta.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
    resposta.headers.set('Access-Control-Allow-Headers', 'X-API-Key, Content-Type')
    resposta.headers.set('Access-Control-Max-Age', '86400')
  }
  return comCabecalhos(resposta, origem)
}

export async function GET(req: Request) {
  const origem = origemLiberada(req)
  const responder = (corpo: unknown, status: number) =>
    comCabecalhos(NextResponse.json(corpo, { status }), origem)

  const esperada = process.env.RASTREIO_API_KEY?.trim()
  // Sem chave configurada a rota fica FECHADA, nunca aberta: uma rota pública
  // que responde tudo porque alguém esqueceu de definir a variável é pior que
  // uma rota que não existe.
  if (!esperada || req.headers.get('x-api-key')?.trim() !== esperada) {
    return responder({ erro: 'nao_autorizado' }, 401)
  }

  if (excedeu(ipDe(req))) return responder({ erro: 'muitas_consultas' }, 429)
  if (!supabaseConfigurado()) return responder({ erro: 'indisponivel' }, 503)

  const url = new URL(req.url)
  const documento = url.searchParams.get('documento') ?? ''
  const pedido = url.searchParams.get('pedido')

  try {
    const r = await rastreioPublico(documento, pedido)
    if (!r.ok) return responder({ erro: r.motivo }, 404)

    const resposta = responder({ pedidos: r.pedidos }, 200)
    // Privado e curto: o dado é de UMA pessoa, então cache compartilhado está
    // fora de questão; e cinco minutos bastam para segurar o cliente que
    // recarrega a página três vezes esperando o objeto andar.
    resposta.headers.set('Cache-Control', 'private, max-age=300')
    return resposta
  } catch (e) {
    console.error('[rastreio publico] falhou:', e)
    return responder({ erro: 'indisponivel' }, 503)
  }
}
