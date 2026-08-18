import 'server-only'

import {
  dataDaTransportadora,
  idDoEvento,
  ocorrenciaDeEntrega,
  type EventoTransportadora,
} from '@/domain'

import { gravarEventosRastreio } from './frenet'
import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * Rastreio pelo Melhor Envio — os 22% de envios que a Frenet não vê.
 *
 * Diferente da Frenet em duas coisas que mudam o desenho:
 *
 * 1. Autenticação é OAuth2, não token fixo. O access token vale ~30 dias e o
 *    refresh é rotacionado a cada renovação, então os dois vivem no banco
 *    (`integracao_tokens`) e não em variável de ambiente: env exigiria deploy
 *    a cada renovação.
 * 2. O que o endpoint devolve é o ESTADO da etiqueta (postado, entregue) mais
 *    o código — não o histórico de escaneamentos da transportadora. A
 *    documentação deles é explícita: a timeline detalhada vive no Melhor
 *    Rastreio, produto à parte. Então destes envios o ERP consegue marcos,
 *    não a linha do tempo completa da Frenet.
 */

const BASE = 'https://melhorenvio.com.br'
const CHAVE = 'melhorenvio'
// O nome vai no User-Agent porque a API do Melhor Envio recusa requisição sem
// identificação de quem chama.
const AGENTE = 'FRENESI ERP (contato@frenesiperfumes.com.br)'

export function melhorEnvioConfigurado(): boolean {
  return Boolean(
    process.env.MELHORENVIO_CLIENT_ID?.trim() && process.env.MELHORENVIO_CLIENT_SECRET?.trim(),
  )
}

function redirecionamento(): string {
  return (
    process.env.MELHORENVIO_REDIRECT_URL?.trim() ||
    'https://erp.frenesiperfumes.com.br/api/melhorenvio/callback'
  )
}

/**
 * Para onde mandar quem clicou em "Conectar".
 *
 * Só leitura: `shipping-tracking` e `orders-read`. O ERP não compra frete nem
 * gera etiqueta, e escopo a mais é risco a mais — se o token vazar, ele não
 * pode gastar saldo da conta.
 */
export function urlDeAutorizacao(estado: string): string {
  const url = new URL(`${BASE}/oauth/authorize`)
  url.searchParams.set('client_id', process.env.MELHORENVIO_CLIENT_ID ?? '')
  url.searchParams.set('redirect_uri', redirecionamento())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', estado)
  url.searchParams.set('scope', 'shipping-tracking orders-read')
  return url.toString()
}

interface RespostaToken {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  message?: string
}

async function guardarToken(r: RespostaToken): Promise<void> {
  if (!r.access_token) {
    throw new Error(
      `O Melhor Envio não devolveu token: ${r.error ?? r.message ?? 'resposta sem access_token'}`,
    )
  }
  if (!supabaseConfigurado()) throw new Error('O Supabase precisa estar configurado.')

  await supabaseServer()
    .from('integracao_tokens')
    .upsert({
      chave: CHAVE,
      access_token: r.access_token,
      refresh_token: r.refresh_token ?? null,
      expira_em: r.expires_in
        ? new Date(Date.now() + r.expires_in * 1000).toISOString()
        : null,
      atualizado_em: new Date().toISOString(),
    })
}

/** Troca o código da autorização pelo primeiro par de tokens. */
export async function trocarCodigoPorToken(codigo: string): Promise<void> {
  const resposta = await fetch(`${BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': AGENTE },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.MELHORENVIO_CLIENT_ID,
      client_secret: process.env.MELHORENVIO_CLIENT_SECRET,
      redirect_uri: redirecionamento(),
      code: codigo,
    }),
    cache: 'no-store',
  })
  await guardarToken((await resposta.json()) as RespostaToken)
}

/**
 * Token válido, renovando quando falta pouco.
 *
 * A folga de um dia existe porque a renovação também pode falhar: descobrir
 * isso com o token ainda vivo dá tempo de avisar, em vez de a integração
 * parar de madrugada sem ninguém saber.
 */
export async function tokenMelhorEnvio(): Promise<string> {
  if (!supabaseConfigurado()) throw new Error('O Supabase precisa estar configurado.')

  const { data } = await supabaseServer()
    .from('integracao_tokens')
    .select('access_token, refresh_token, expira_em')
    .eq('chave', CHAVE)
    .maybeSingle()

  const guardado = data as
    | { access_token: string; refresh_token: string | null; expira_em: string | null }
    | null

  if (!guardado) {
    throw new Error(
      'O Melhor Envio ainda não foi conectado. Abra Configurações → Integrações e clique em Conectar.',
    )
  }

  const UM_DIA = 24 * 60 * 60 * 1000
  const vencendo =
    guardado.expira_em && new Date(guardado.expira_em).getTime() - Date.now() < UM_DIA

  if (vencendo && guardado.refresh_token) {
    const resposta = await fetch(`${BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': AGENTE },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: process.env.MELHORENVIO_CLIENT_ID,
        client_secret: process.env.MELHORENVIO_CLIENT_SECRET,
        refresh_token: guardado.refresh_token,
      }),
      cache: 'no-store',
    })
    const nova = (await resposta.json()) as RespostaToken
    if (nova.access_token) {
      await guardarToken(nova)
      return nova.access_token
    }
    console.error('[melhorenvio] renovação falhou; seguindo com o token atual:', nova.error ?? nova.message)
  }

  return guardado.access_token
}

export async function melhorEnvioConectado(): Promise<boolean> {
  if (!supabaseConfigurado()) return false
  const { data } = await supabaseServer()
    .from('integracao_tokens')
    .select('chave')
    .eq('chave', CHAVE)
    .maybeSingle()
  return Boolean(data)
}

async function chamar<T>(caminho: string, corpo?: unknown): Promise<T> {
  const token = await tokenMelhorEnvio()
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': AGENTE,
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    cache: 'no-store',
  })

  if (resposta.status === 401 || resposta.status === 403) {
    throw new Error(
      'O Melhor Envio recusou o acesso — a autorização pode ter sido revogada. Reconecte em Configurações → Integrações.',
    )
  }
  const cru = await resposta.text()
  if (!resposta.ok) {
    throw new Error(`O Melhor Envio respondeu ${resposta.status} em ${caminho}: ${cru.slice(0, 300)}`)
  }
  return (cru.trim() ? JSON.parse(cru) : {}) as T
}

/** Um valor de qualquer nível do objeto, pelo primeiro nome que existir. */
function campo(o: Record<string, unknown>, nomes: string[]): unknown {
  for (const nome of nomes) {
    if (o[nome] !== undefined && o[nome] !== null && o[nome] !== '') return o[nome]
  }
  return undefined
}

function texto(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number') return String(v)
  return null
}

/**
 * Traduz o retorno do rastreio em eventos.
 *
 * Se a resposta trouxer uma lista de ocorrências (`tracking`/`events`), cada
 * uma vira evento. Se trouxer só o estado da etiqueta, vira UM evento com
 * esse estado — que é o que a API deles entrega hoje, e é melhor que nada:
 * confirma a postagem e a entrega, que são os dois momentos que o cliente
 * pergunta.
 */
export function eventosDoMelhorEnvio(
  bruto: Record<string, unknown>,
  codigo: string,
): EventoTransportadora[] {
  const ocorrencias = campo(bruto, ['tracking', 'events', 'occurrences', 'historico'])

  if (Array.isArray(ocorrencias) && ocorrencias.length) {
    return (ocorrencias as Record<string, unknown>[]).flatMap((o) => {
      const descricao =
        texto(campo(o, ['description', 'descricao', 'status', 'message', 'title'])) ?? null
      if (!descricao) return []
      const quando = dataDaTransportadora(
        texto(campo(o, ['created_at', 'date', 'datetime', 'occurred_at', 'data'])),
      )
      const local = texto(campo(o, ['location', 'local', 'city', 'cidade']))
      return [
        {
          id: idDoEvento(codigo, quando, descricao, local),
          codigo: codigo.trim().toUpperCase(),
          quando,
          descricao,
          local,
          origem: 'melhorenvio' as const,
          entregue: ocorrenciaDeEntrega(descricao),
        },
      ]
    })
  }

  // Só o estado da etiqueta.
  const estado = texto(campo(bruto, ['status', 'tracking_status', 'situacao']))
  if (!estado) return []
  const quando = dataDaTransportadora(
    texto(campo(bruto, ['updated_at', 'delivered_at', 'posted_at', 'created_at'])),
  )
  const descricao = ROTULO_ESTADO[estado.toLowerCase()] ?? estado
  return [
    {
      id: idDoEvento(codigo, quando, descricao, null),
      codigo: codigo.trim().toUpperCase(),
      quando,
      descricao,
      local: null,
      origem: 'melhorenvio',
      entregue: ocorrenciaDeEntrega(descricao) || estado.toLowerCase() === 'delivered',
    },
  ]
}

/** O vocabulário deles em português — é o que o cliente lê. */
const ROTULO_ESTADO: Record<string, string> = {
  pending: 'Etiqueta gerada, aguardando pagamento',
  paid: 'Etiqueta paga',
  generated: 'Etiqueta emitida',
  posted: 'Objeto postado na transportadora',
  delivered: 'Entrega realizada',
  canceled: 'Etiqueta cancelada',
  undelivered: 'Entrega não efetuada',
  returned: 'Objeto devolvido ao remetente',
}

export interface RodadaMelhorEnvio {
  consultados: number
  eventos: number
  entregues: number
  /** A resposta crua do primeiro código, para acertar o mapeamento sobre fato. */
  amostra: string | null
}

/**
 * Consulta o rastreio dos códigos do Melhor Envio e grava o que vier.
 *
 * O corpo manda os códigos em `orders`, que é como a API deles nomeia a lista
 * de envios. Se a conta responder com outro formato, a amostra crua da
 * primeira resposta volta para a tela de integrações — foi assim que o
 * cashback da Yampi se resolveu, em cima do que a API mandou de verdade e não
 * do que a documentação prometia.
 */
export async function rastrearNoMelhorEnvio(codigos: string[]): Promise<RodadaMelhorEnvio> {
  const alvos = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))].slice(0, 100)
  if (alvos.length === 0) return { consultados: 0, eventos: 0, entregues: 0, amostra: null }

  const resposta = await chamar<Record<string, unknown>>('/api/v2/me/shipment/tracking', {
    orders: alvos,
  })

  let amostra: string | null = null
  try {
    amostra = JSON.stringify(resposta).slice(0, 400)
  } catch {
    /* amostra é diagnóstico; não pode derrubar a leitura */
  }

  // A resposta é um mapa `{ [id ou código]: { ... } }` — cada valor é um envio.
  const eventos: EventoTransportadora[] = []
  for (const [chave, valor] of Object.entries(resposta)) {
    if (!valor || typeof valor !== 'object') continue
    const envio = valor as Record<string, unknown>
    // O código pode vir dentro do objeto; se não vier, a chave do mapa é ele.
    const codigo =
      texto(campo(envio, ['tracking', 'tracking_code', 'codigo'])) ??
      (alvos.includes(chave) ? chave : null)
    if (!codigo) continue
    eventos.push(...eventosDoMelhorEnvio(envio, codigo))
  }

  const r = eventos.length ? await gravarEventosRastreio(eventos, 'melhorenvio') : { gravados: 0, entregues: 0 }
  return { consultados: alvos.length, eventos: r.gravados, entregues: r.entregues, amostra }
}

/** Os códigos vivos do Melhor Envio — os que a varredura deve consultar. */
export async function codigosDoMelhorEnvio(limite = 80): Promise<string[]> {
  if (!supabaseConfigurado()) return []
  const { data, error } = await supabaseServer()
    .from('pedidos')
    .select('rastreio, servico_frete, rastreio_servico, rastreio_lido_em')
    .not('rastreio', 'is', null)
    .is('entregue_em', null)
    // O rótulo ME% pega o que foi COTADO no Melhor Envio. A segunda metade
    // pega o que foi POSTADO lá apesar de cotado em outro lugar — a descoberta
    // grava a transportadora real em rastreio_servico (J&T/Total Express,
    // Buslog), e é por ela que estes envios entram na varredura.
    // "jet" é como a companhia vem nomeada na conta real ("JeT"), sem o "&".
    .or('servico_frete.ilike.ME*,rastreio_servico.ilike.*express*,rastreio_servico.ilike.*buslog*,rastreio_servico.ilike.*jet*')
    .order('rastreio_lido_em', { ascending: true, nullsFirst: true })
    .limit(limite)
  if (error) throw error
  return ((data ?? []) as { rastreio: string }[]).map((p) => p.rastreio)
}

export interface DescobertaMelhorEnvio {
  /** Etiquetas com código examinadas nas listas de postadas/entregues. */
  examinadas: number
  casados: { pedido: string; codigo: string; transportadora: string | null }[]
  /** Cliente com MAIS de um pedido aberto: adivinhar arriscaria o código errado. */
  ambiguas: number
}

/**
 * Descobre postagens feitas no Melhor Envio que a Yampi ainda não conhece.
 *
 * O caso real que motivou isto: o frete grátis sai COTADO como Jadlog no
 * checkout, mas o dono contrata a transportadora que estiver melhor no dia
 * (J&T, Total Express...) e compra a etiqueta direto no Melhor Envio. A Yampi
 * fica em "faturado" para sempre — sem track_code, o ERP nunca marcava o
 * pedido como enviado e o e-mail de rastreio nunca saía. Aqui a etiqueta
 * postada é casada com o pedido aberto pelo e-mail/CPF do destinatário, e o
 * pedido avança sozinho, com a transportadora REAL e não a do rótulo.
 */
export async function descobrirEnviosDoMelhorEnvio(): Promise<DescobertaMelhorEnvio> {
  const resultado: DescobertaMelhorEnvio = { examinadas: 0, casados: [], ambiguas: 0 }
  if (!supabaseConfigurado()) return resultado

  // Postadas E entregues: uma entrega rápida pode acontecer antes de a
  // descoberta rodar, e a etiqueta some da lista de postadas.
  const paginas = await Promise.all([
    chamar<{ data?: unknown }>('/api/v2/me/orders?status=posted'),
    chamar<{ data?: unknown }>('/api/v2/me/orders?status=delivered'),
  ])
  const etiquetas = paginas.flatMap((p) =>
    Array.isArray(p.data) ? (p.data as Record<string, unknown>[]) : [],
  )
  if (!etiquetas.length) return resultado

  const sb = supabaseServer()
  const JANELA_MS = 60 * 86_400_000
  const desde = new Date(Date.now() - JANELA_MS).toISOString()
  const { data, error } = await sb
    .from('pedidos')
    .select('id, comprado_em, entrega_local, clientes(email, cpf)')
    .is('rastreio', null)
    .in('envio', ['nao_iniciado', 'aguardando_envio'])
    .gte('comprado_em', desde)
  if (error) throw error
  const abertos = (
    (data ?? []) as unknown as {
      id: string
      comprado_em: string
      entrega_local: boolean | null
      clientes: { email: string | null; cpf: string | null } | null
    }[]
  ).filter((p) => !p.entrega_local)
  if (!abertos.length) return resultado

  const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

  for (const e of etiquetas) {
    const codigo = texto(campo(e, ['tracking']))
    if (!codigo) continue
    // Etiqueta sem data ou de outra época não casa: a lista de entregues traz
    // histórico antigo, e o e-mail do cliente casaria a etiqueta de junho com
    // o pedido novo de agosto.
    const compradaEm = texto(campo(e, ['paid_at', 'generated_at', 'created_at']))
    const quando = compradaEm ? new Date(compradaEm).getTime() : Number.NaN
    if (!Number.isFinite(quando) || Date.now() - quando > JANELA_MS) continue
    resultado.examinadas++

    const destino = (e.to ?? {}) as Record<string, unknown>
    const emailDestino = texto(campo(destino, ['email']))?.toLowerCase() ?? null
    const cpfDestino = digitos(texto(campo(destino, ['document'])))
    if (!emailDestino && !cpfDestino) continue

    const candidatos = abertos.filter((p) => {
      // A etiqueta é comprada DEPOIS do pedido; uma hora de folga cobre relógio.
      if (new Date(p.comprado_em).getTime() - 3_600_000 > quando) return false
      const c = p.clientes
      if (!c) return false
      const casaEmail = Boolean(emailDestino && c.email && c.email.trim().toLowerCase() === emailDestino)
      const casaCpf = Boolean(cpfDestino && c.cpf && digitos(c.cpf) === cpfDestino)
      return casaEmail || casaCpf
    })
    if (candidatos.length === 0) continue
    if (candidatos.length > 1) {
      resultado.ambiguas++
      continue
    }

    const alvo = candidatos[0]
    const servico = (e.service ?? null) as Record<string, unknown> | null
    const companhia = servico ? ((campo(servico, ['company']) ?? null) as Record<string, unknown> | null) : null
    const transportadora =
      (companhia ? texto(campo(companhia, ['name'])) : null) ??
      (servico ? texto(campo(servico, ['name'])) : null)

    const { error: erroGravacao } = await sb
      .from('pedidos')
      .update({
        rastreio: codigo,
        ...(transportadora ? { rastreio_servico: transportadora } : {}),
        envio: 'enviado',
        situacao: 'enviado',
      })
      .eq('id', alvo.id)
      // O guarda repete o filtro da leitura: se outra rotina preencheu o
      // rastreio neste meio-tempo, esta descoberta não sobrescreve.
      .is('rastreio', null)
    if (!erroGravacao) {
      resultado.casados.push({ pedido: alvo.id, codigo, transportadora })
      abertos.splice(abertos.indexOf(alvo), 1)
    }
  }
  return resultado
}
