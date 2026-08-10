import 'server-only'

import { request as requestHttps } from 'node:https'

import type { LinhaExtratoBruta } from '@/domain'

import { mensagemDe } from './shopify'
import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * Sicoob: extrato da conta corrente pela API Bancária.
 *
 * ── O que isto exige, sem rodeios ──────────────────────────────────────────
 *
 * Diferente da Shopify, da Yampi e do Mercado Pago, aqui NÃO basta gerar uma
 * chave num painel. A API Bancária do Sicoob usa mTLS: além do `client_id` da
 * aplicação, cada requisição precisa apresentar um CERTIFICADO DIGITAL da
 * cooperativa, e o escopo `cco_extrato` precisa estar liberado para a conta.
 * O certificado sai depois de um cadastro em developers.sicoob.com.br e de
 * aprovação da cooperativa — dias, não minutos.
 *
 * Enquanto isso não existe, o caminho que funciona HOJE é importar o arquivo
 * OFX que o internet banking exporta. Não é um plano B envergonhado: o OFX
 * traz os mesmos lançamentos, com identificador próprio, e cai na mesma
 * tabela pela mesma função. O que muda é quem clica — uma vez por semana,
 * em vez de um agendador.
 *
 * Este arquivo existe para o dia em que o certificado sair. Ele não finge
 * funcionar antes disso: sem credencial, `diagnosticarSicoob` diz exatamente
 * o que falta, e a tela oferece o OFX.
 */

const AUTH = 'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token'
const API = 'https://api.sicoob.com.br'
/** O sandbox responde sem certificado e com um token fixo — serve para provar o formato. */
const API_SANDBOX = 'https://sandbox.sicoob.com.br/sicoob/sandbox'
const TOKEN_SANDBOX = '1301865f-c6bc-38f3-9f49-666dbcfc59c3'

const ESCOPOS = 'cco_extrato cco_consulta'

export const CONTA_SICOOB = 'sicoob'

export class ErroSicoob extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ErroSicoob'
  }
}

interface Credenciais {
  clientId: string
  conta: string
  /** PEM do certificado e da chave, em base64 no ambiente. */
  cert: Buffer | null
  chave: Buffer | null
  /** Alternativa: o .pfx inteiro, também em base64. */
  pfx: Buffer | null
  senhaPfx: string
  sandbox: boolean
}

function limpa(v: string | undefined): string {
  return (v ?? '').trim().replace(/^["']|["']$/g, '')
}

function deBase64(v: string | undefined): Buffer | null {
  const t = limpa(v)
  if (!t) return null
  // Aceita tanto o base64 quanto o PEM colado direto no .env.
  if (t.includes('-----BEGIN')) return Buffer.from(t, 'utf8')
  try {
    return Buffer.from(t, 'base64')
  } catch {
    return null
  }
}

function credenciais(): Credenciais {
  return {
    clientId: limpa(process.env.SICOOB_CLIENT_ID),
    conta: limpa(process.env.SICOOB_CONTA_CORRENTE),
    cert: deBase64(process.env.SICOOB_CERT_BASE64),
    chave: deBase64(process.env.SICOOB_CHAVE_BASE64),
    pfx: deBase64(process.env.SICOOB_PFX_BASE64),
    senhaPfx: limpa(process.env.SICOOB_PFX_SENHA),
    sandbox: limpa(process.env.SICOOB_SANDBOX) === 'true',
  }
}

export function sicoobConfigurado(): boolean {
  const c = credenciais()
  if (c.sandbox) return true
  return Boolean(c.clientId && c.conta && (c.pfx || (c.cert && c.chave)))
}

/**
 * O que ainda falta para a API responder. Uma lista, não um booleano: quem
 * está montando a integração precisa saber qual dos cinco itens é o que falta.
 */
export function faltaParaSicoob(): string[] {
  const c = credenciais()
  if (c.sandbox) return []
  const falta: string[] = []
  if (!c.clientId) falta.push('SICOOB_CLIENT_ID — o identificador da aplicação em developers.sicoob.com.br')
  if (!c.conta) falta.push('SICOOB_CONTA_CORRENTE — o número da conta, só dígitos')
  if (!c.pfx && !(c.cert && c.chave)) {
    falta.push(
      'o certificado digital: SICOOB_PFX_BASE64 + SICOOB_PFX_SENHA, ou SICOOB_CERT_BASE64 + SICOOB_CHAVE_BASE64',
    )
  }
  return falta
}

/**
 * Requisição com certificado de cliente.
 *
 * O `fetch` do Node não aceita certificado por requisição — não existe opção
 * para isso na API padrão. Por isso o `node:https` cru: é a única forma de
 * apresentar o certificado sem trazer uma dependência nova só para isto.
 */
function requisitar(
  url: string,
  opcoes: { metodo: string; cabecalhos: Record<string, string>; corpo?: string },
  c: Credenciais,
): Promise<{ status: number; texto: string }> {
  return new Promise((resolve, reject) => {
    const alvo = new URL(url)
    const req = requestHttps(
      {
        hostname: alvo.hostname,
        port: 443,
        path: `${alvo.pathname}${alvo.search}`,
        method: opcoes.metodo,
        headers: opcoes.cabecalhos,
        ...(c.pfx ? { pfx: c.pfx, passphrase: c.senhaPfx || undefined } : {}),
        ...(c.cert && c.chave ? { cert: c.cert, key: c.chave } : {}),
      },
      (res) => {
        let dados = ''
        res.setEncoding('utf8')
        res.on('data', (parte) => (dados += parte))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, texto: dados }))
      },
    )
    req.on('error', (e) => reject(new ErroSicoob(`Falha de conexão com o Sicoob: ${e.message}`)))
    req.setTimeout(30_000, () => {
      req.destroy()
      reject(new ErroSicoob('O Sicoob não respondeu em 30 segundos.'))
    })
    if (opcoes.corpo) req.write(opcoes.corpo)
    req.end()
  })
}

/** Troca client_id + certificado por um token de acesso. */
async function autenticar(c: Credenciais): Promise<string> {
  if (c.sandbox) return TOKEN_SANDBOX

  const corpo = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: c.clientId,
    scope: ESCOPOS,
  }).toString()

  const r = await requisitar(
    AUTH,
    {
      metodo: 'POST',
      cabecalhos: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': String(Buffer.byteLength(corpo)),
      },
      corpo,
    },
    c,
  )

  if (r.status !== 200) {
    throw new ErroSicoob(
      `O Sicoob recusou a autenticação (${r.status}): ${r.texto.slice(0, 300)}. ` +
        'Confira se o certificado é o da conta e se os escopos cco_extrato e cco_consulta estão liberados para a aplicação.',
      r.status,
    )
  }

  const dados = JSON.parse(r.texto) as { access_token?: string }
  if (!dados.access_token) throw new ErroSicoob('O Sicoob autenticou sem devolver access_token.')
  return dados.access_token
}

/** Uma transação do extrato, já traduzida. */
interface TransacaoSicoob {
  data: string
  descricao: string
  valor: number
  tipo: 'entrada' | 'saida'
  documento: string
  contraparte: string
  bruto: Record<string, unknown>
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v)
}

function numero(v: unknown): number {
  const x = typeof v === 'string' ? Number(v.replace(',', '.')) : v
  return typeof x === 'number' && Number.isFinite(x) ? x : 0
}

/**
 * Traduz uma transação crua.
 *
 * Os nomes de campo são aceitos em mais de uma grafia de propósito: a v4 da
 * API já mudou nome de campo entre versões, e uma leitura que devolve zero
 * porque o campo virou `valorTransacao` seria pior que um erro — pareceria um
 * mês sem movimento.
 */
function normalizarTransacao(cru: Record<string, unknown>): TransacaoSicoob | null {
  const dataBruta = texto(cru.data || cru.dataLancamento || cru.dataMovimento)
  const data = dataBruta.includes('/')
    ? dataBruta.split('/').reverse().join('-')
    : dataBruta.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null

  const valor = Math.abs(numero(cru.valor ?? cru.valorTransacao ?? cru.valorLancamento))
  if (!valor) return null

  const tipoBruto = texto(cru.tipo || cru.tipoTransacao || cru.natureza).toUpperCase()
  const tipo: 'entrada' | 'saida' = tipoBruto.startsWith('D') ? 'saida' : 'entrada'

  return {
    data,
    descricao:
      texto(cru.descricao || cru.historico || cru.descricaoHistorico) || 'Movimento sem descrição',
    valor,
    tipo,
    documento: texto(cru.numeroDocumento || cru.documento || cru.nuDocumento),
    contraparte: texto(cru.nomeContraparte || cru.nome || cru.cpfCnpjContraparte),
    bruto: cru,
  }
}

/**
 * Chave estável para a transação.
 *
 * O Sicoob não devolve um identificador único por lançamento como o FITID do
 * OFX. A chave é montada do que identifica o fato — conta, data, documento e
 * valor — mais a posição dentro do dia, que separa duas tarifas idênticas no
 * mesmo dia sem inventar diferença entre elas. Reler o mesmo mês devolve as
 * mesmas chaves, que é o que a idempotência precisa.
 */
function chaveDe(conta: string, t: TransacaoSicoob, posicaoNoDia: number): string {
  return [conta, t.data, t.documento || 's', t.valor.toFixed(2), posicaoNoDia].join(':')
}

/** Lê um mês inteiro do extrato. */
export async function extratoDoMes(mes: number, ano: number): Promise<LinhaExtratoBruta[]> {
  const c = credenciais()
  const falta = faltaParaSicoob()
  if (falta.length) {
    throw new ErroSicoob(`Falta configurar: ${falta.join('; ')}.`)
  }

  const token = await autenticar(c)
  const base = c.sandbox ? API_SANDBOX : API
  const params = new URLSearchParams({
    diaInicial: '1',
    diaFinal: String(new Date(ano, mes, 0).getDate()),
    agruparCNPJ: 'false',
    numeroContaCorrente: c.conta,
  })

  const r = await requisitar(
    `${base}/conta-corrente/v4/extrato/${mes}/${ano}?${params}`,
    {
      metodo: 'GET',
      cabecalhos: {
        Authorization: `Bearer ${token}`,
        client_id: c.clientId || TOKEN_SANDBOX,
        Accept: 'application/json',
      },
    },
    c,
  )

  if (r.status !== 200) {
    throw new ErroSicoob(`O Sicoob devolveu ${r.status}: ${r.texto.slice(0, 400)}`, r.status)
  }

  const corpo = JSON.parse(r.texto) as Record<string, unknown>
  const resultado = (corpo.resultado ?? corpo) as Record<string, unknown>
  const cruas = Array.isArray(resultado.transacoes)
    ? (resultado.transacoes as Record<string, unknown>[])
    : []

  const porDia = new Map<string, number>()
  const linhas: LinhaExtratoBruta[] = []
  for (const cru of cruas) {
    const t = normalizarTransacao(cru)
    if (!t) continue
    const posicao = (porDia.get(t.data) ?? 0) + 1
    porDia.set(t.data, posicao)
    linhas.push({
      chave: chaveDe(c.conta, t, posicao),
      ocorrido_em: t.data,
      descricao: t.descricao,
      contraparte: t.contraparte,
      documento: t.documento,
      tipo: t.tipo,
      valor: t.valor,
      pedido_id: null,
      bruto: t.bruto,
    })
  }

  return linhas
}

export interface ResultadoSincroniaSicoob {
  mes: number
  ano: number
  lidas: number
  novas: number
  repetidas: number
}

export async function sincronizarSicoob(mes: number, ano: number): Promise<ResultadoSincroniaSicoob> {
  if (!supabaseConfigurado()) {
    throw new ErroSicoob('O Supabase precisa estar configurado para guardar o extrato.')
  }

  const linhas = await extratoDoMes(mes, ano)
  const sb = supabaseServer()

  await sb.rpc('garantir_conta', {
    p_id: CONTA_SICOOB,
    p_nome: 'Sicoob',
    p_tipo: 'Conta corrente',
    p_banco: 'Sicoob',
    p_uso: 'Conta operacional da empresa',
  })

  const { data, error } = await sb.rpc('importar_extrato', {
    p_origem: 'sicoob',
    p_conta_id: CONTA_SICOOB,
    p_linhas: linhas,
  })
  if (error) throw new ErroSicoob(mensagemDe(error))

  const r = (data ?? {}) as { novas?: number; repetidas?: number }
  return { mes, ano, lidas: linhas.length, novas: Number(r.novas ?? 0), repetidas: Number(r.repetidas ?? 0) }
}

/**
 * Conta o que existe e o que falta, com os nomes de campo que o Sicoob
 * realmente devolveu — não os que a documentação promete.
 */
export async function diagnosticarSicoob(mes: number, ano: number): Promise<{
  ok: boolean
  passos: string[]
  amostra: string[]
}> {
  const c = credenciais()
  const passos: string[] = []
  const amostra: string[] = []

  const falta = faltaParaSicoob()
  if (falta.length) {
    passos.push('A API do Sicoob ainda não pode ser chamada. Falta:')
    passos.push(...falta.map((f) => `  · ${f}`))
    passos.push(
      'Enquanto o certificado não sai, use "Importar OFX": o arquivo do internet banking traz os mesmos lançamentos e cai na mesma tabela.',
    )
    return { ok: false, passos, amostra }
  }

  passos.push(c.sandbox ? 'Modo sandbox ligado (dados fictícios do Sicoob).' : 'Credenciais de produção presentes.')

  try {
    await autenticar(c)
    passos.push('Autenticação aceita — o certificado é válido e os escopos estão liberados.')
  } catch (e) {
    passos.push(`Autenticação recusada: ${mensagemDe(e)}`)
    return { ok: false, passos, amostra }
  }

  try {
    const linhas = await extratoDoMes(mes, ano)
    passos.push(`Extrato de ${mes}/${ano}: ${linhas.length} lançamento(s).`)
    for (const l of linhas.slice(0, 5)) {
      amostra.push(`${l.ocorrido_em} · ${l.tipo} · ${l.valor} · ${l.descricao} · doc ${l.documento || '—'}`)
    }
    if (linhas.length === 0) {
      amostra.push(
        'A conta respondeu sem lançamentos. Se houve movimento no mês, os nomes de campo mudaram — o JSON cru está no console do servidor.',
      )
    }
    return { ok: true, passos, amostra }
  } catch (e) {
    passos.push(`Leitura do extrato falhou: ${mensagemDe(e)}`)
    return { ok: false, passos, amostra }
  }
}
