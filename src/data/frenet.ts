import 'server-only'

import {
  dataDaTransportadora,
  idDoEvento,
  ocorrenciaDeEntrega,
  type EventoTransportadora,
  type OrigemRastreio,
} from '@/domain'

import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * Rastreio pela Frenet — os escaneamentos que a Yampi não devolve.
 *
 * A Yampi entrega o código e a confirmação de entrega; o caminho do objeto
 * ("postado", "saiu para entrega") só existe em quem emitiu a etiqueta. A
 * Frenet cobre Correios e Jadlog, que somam 78% dos envios desta operação.
 *
 * Os eventos entram por dois caminhos que se cobrem: o webhook, que empurra
 * assim que a ocorrência acontece, e a varredura de reforço, que relê os
 * códigos vivos de tempos em tempos. Webhook se perde — por queda, por deploy,
 * por 500 momentâneo — e um rastreio que congela sem ninguém notar é pior que
 * não ter rastreio, porque a tela continua parecendo atualizada.
 */

const BASE = 'https://api.frenet.com.br'

export function frenetConfigurada(): boolean {
  return Boolean(process.env.FRENET_TOKEN?.trim())
}

async function chamarFrenet<T>(caminho: string, corpo: unknown): Promise<T> {
  const token = process.env.FRENET_TOKEN?.trim()
  if (!token) {
    throw new Error(
      'Falta FRENET_TOKEN no ambiente — o token único da conta, em Configurações → API no painel da Frenet.',
    )
  }

  const resposta = await fetch(`${BASE}${caminho}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      token,
    },
    body: JSON.stringify(corpo),
    cache: 'no-store',
  })

  if (resposta.status === 401 || resposta.status === 403) {
    throw new Error(
      `A Frenet recusou o token (${resposta.status}). Confira FRENET_TOKEN — ele é da conta inteira e é gerado no painel.`,
    )
  }
  if (!resposta.ok) {
    const detalhe = (await resposta.text()).slice(0, 300)
    throw new Error(`A Frenet respondeu ${resposta.status} em ${caminho}: ${detalhe}`)
  }

  const cru = await resposta.text()
  if (!cru.trim()) return undefined as T
  return JSON.parse(cru) as T
}

/** Desembrulha valores em qualquer capitalização — a Frenet mistura as duas. */
function campo(registro: Record<string, unknown>, nomes: string[]): unknown {
  for (const nome of nomes) {
    for (const chave of [nome, nome.charAt(0).toUpperCase() + nome.slice(1)]) {
      const valor = registro[chave]
      if (valor !== undefined && valor !== null && valor !== '') return valor
    }
  }
  return undefined
}

function texto(valor: unknown): string | null {
  if (typeof valor === 'string' && valor.trim()) return valor.trim()
  if (typeof valor === 'number') return String(valor)
  return null
}

/** A lista de ocorrências, em qualquer um dos nomes que a Frenet usa. */
function ocorrenciasDe(resposta: unknown): Record<string, unknown>[] {
  if (Array.isArray(resposta)) return resposta as Record<string, unknown>[]
  if (resposta && typeof resposta === 'object') {
    const o = resposta as Record<string, unknown>
    for (const nome of [
      'TrackingEvents',
      'trackingEvents',
      'Events',
      'events',
      'Occurrences',
      'occurrences',
      'TrackingInfo',
      'trackingInfo',
    ]) {
      const dentro = o[nome]
      if (Array.isArray(dentro)) return dentro as Record<string, unknown>[]
      // Um nível a mais: { TrackingInfo: { Events: [...] } }
      if (dentro && typeof dentro === 'object') {
        const achado = ocorrenciasDe(dentro)
        if (achado.length) return achado
      }
    }
  }
  return []
}

/**
 * Converte uma ocorrência crua em evento do ERP.
 *
 * Os nomes de campo variam conforme a transportadora que a Frenet consultou —
 * por isso cada dado é procurado numa lista de candidatos em vez de um nome
 * fixo. Ocorrência sem descrição é descartada: uma linha vazia na timeline do
 * cliente não informa nada e ainda ocupa o lugar da que informa.
 */
export function eventoDaFrenet(
  cru: Record<string, unknown>,
  codigo: string,
): EventoTransportadora | null {
  const descricao =
    texto(campo(cru, ['eventDescription', 'description', 'status', 'occurrence', 'situacao'])) ??
    texto(campo(cru, ['eventType', 'type']))
  if (!descricao) return null

  const quando = dataDaTransportadora(
    texto(campo(cru, ['eventDateTime', 'eventDate', 'date', 'dateTime', 'data'])),
  )
  const cidade = texto(campo(cru, ['eventLocation', 'location', 'city', 'cidade', 'unidade']))
  const uf = texto(campo(cru, ['eventStateAbbr', 'state', 'uf']))
  const local = [cidade, uf].filter(Boolean).join(' · ') || null

  return {
    id: idDoEvento(codigo, quando, descricao, local),
    codigo: codigo.trim().toUpperCase(),
    quando,
    descricao,
    local,
    origem: 'frenet',
    entregue: ocorrenciaDeEntrega(descricao),
  }
}

/**
 * Consulta o rastreio de UM código.
 *
 * `POST /tracking/trackinginfo` é o endpoint documentado; o corpo pede o
 * número do objeto e, quando conhecido, a transportadora.
 */
export async function rastrearNaFrenet(
  codigo: string,
  transportadora?: string | null,
): Promise<EventoTransportadora[]> {
  const alvo = codigo.trim()
  if (!alvo) return []

  const resposta = await chamarFrenet<unknown>('/tracking/trackinginfo', {
    ShippingServiceCode: transportadora ?? '',
    TrackingNumber: alvo,
  })

  return ocorrenciasDe(resposta)
    .map((o) => eventoDaFrenet(o, alvo))
    .filter((e): e is EventoTransportadora => e !== null)
}

/**
 * Grava os eventos e devolve quantos eram novos.
 *
 * O upsert é por id de conteúdo (§ domínio): o mesmo escaneamento chegando
 * pelo webhook e pela varredura não vira duas linhas. Quando a ocorrência é a
 * entrega, o pedido é marcado — é a informação que o Portal de Devoluções usa
 * para contar o prazo, e ela chegava só quando a Yampi resolvia informar.
 */
export async function gravarEventosRastreio(
  eventos: EventoTransportadora[],
  origem: OrigemRastreio = 'frenet',
): Promise<{ gravados: number; entregues: number }> {
  if (!supabaseConfigurado() || eventos.length === 0) return { gravados: 0, entregues: 0 }
  const sb = supabaseServer()

  const codigos = [...new Set(eventos.map((e) => e.codigo))]
  const { data: pedidos, error: erroPedidos } = await sb
    .from('pedidos')
    .select('id, rastreio, entregue_em')
    .in('rastreio', codigos)
  if (erroPedidos) throw erroPedidos

  const pedidoDoCodigo = new Map(
    ((pedidos ?? []) as { id: string; rastreio: string | null; entregue_em: string | null }[]).map(
      (p) => [(p.rastreio ?? '').trim().toUpperCase(), p],
    ),
  )

  const linhas = eventos.map((e) => ({
    id: e.id,
    codigo: e.codigo,
    pedido_id: pedidoDoCodigo.get(e.codigo)?.id ?? null,
    quando: e.quando,
    descricao: e.descricao,
    local: e.local,
    origem,
    entregue: e.entregue,
  }))

  const { error } = await sb.from('rastreio_eventos').upsert(linhas, { onConflict: 'id' })
  if (error) throw error

  // Entrega confirmada pela transportadora vale como entrega no pedido: é o
  // dado mais próximo do fato, e chega antes do da Yampi.
  let entregues = 0
  for (const e of eventos.filter((x) => x.entregue && x.quando)) {
    const pedido = pedidoDoCodigo.get(e.codigo)
    if (!pedido || pedido.entregue_em) continue
    const { error: erroEntrega } = await sb
      .from('pedidos')
      .update({ envio: 'entregue', entregue_em: e.quando })
      .eq('id', pedido.id)
    if (erroEntrega) throw erroEntrega
    pedido.entregue_em = e.quando
    entregues++
  }

  const agora = new Date().toISOString()
  const ids = [...new Set(linhas.map((l) => l.pedido_id).filter(Boolean))] as string[]
  if (ids.length) {
    await sb.from('pedidos').update({ rastreio_lido_em: agora }).in('id', ids)
  }

  return { gravados: linhas.length, entregues }
}

export interface RodadaRastreio {
  consultados: number
  eventos: number
  entregues: number
  falhas: { codigo: string; erro: string }[]
}

/**
 * Varredura de reforço: relê os códigos vivos que estão há mais tempo sem
 * leitura.
 *
 * "Vivo" é pedido com código e sem entrega confirmada — depois da entrega não
 * há mais o que acontecer, e insistir gastaria a cota da Frenet com objetos
 * parados. O limite por rodada existe porque são centenas de códigos e a
 * rotina divide o tempo com a importação de pedidos e o financeiro.
 */
export async function varrerRastreiosFrenet(limite = 60): Promise<RodadaRastreio> {
  if (!frenetConfigurada()) throw new Error('A Frenet não está configurada.')
  if (!supabaseConfigurado()) throw new Error('O Supabase precisa estar configurado.')

  const sb = supabaseServer()
  const { data, error } = await sb
    .from('pedidos')
    .select('id, rastreio, servico_frete, rastreio_lido_em')
    .not('rastreio', 'is', null)
    .is('entregue_em', null)
    .order('rastreio_lido_em', { ascending: true, nullsFirst: true })
    .limit(limite)
  if (error) throw error

  const alvos = ((data ?? []) as { id: string; rastreio: string; servico_frete: string | null }[])
    // Códigos do Melhor Envio não são consulta da Frenet — ela responderia
    // vazio, e o pedido voltaria para o fim da fila sem nada ter acontecido.
    .filter((p) => !/^ME[_ ]/i.test(p.servico_frete ?? ''))

  const resultado: RodadaRastreio = { consultados: 0, eventos: 0, entregues: 0, falhas: [] }
  const agora = new Date().toISOString()

  for (const p of alvos) {
    try {
      const eventos = await rastrearNaFrenet(p.rastreio, p.servico_frete)
      resultado.consultados++
      if (eventos.length) {
        const r = await gravarEventosRastreio(eventos)
        resultado.eventos += r.gravados
        resultado.entregues += r.entregues
      } else {
        // Sem ocorrência ainda: marca a leitura assim mesmo, senão o mesmo
        // código volta primeiro na fila em todas as rodadas.
        await sb.from('pedidos').update({ rastreio_lido_em: agora }).eq('id', p.id)
      }
    } catch (e) {
      resultado.falhas.push({
        codigo: p.rastreio,
        erro: e instanceof Error ? e.message : String(e),
      })
    }
    // Espaçamento entre consultas: são dezenas por rodada e o limite da
    // Frenet é por minuto.
    await new Promise((r) => setTimeout(r, 250))
  }

  return resultado
}

/** A linha do tempo de um pedido, já gravada — para a tela e para o site. */
export async function eventosDoPedido(pedidoId: string): Promise<EventoTransportadora[]> {
  if (!supabaseConfigurado()) return []
  const { data, error } = await supabaseServer()
    .from('rastreio_eventos')
    .select('id, codigo, quando, descricao, local, origem, entregue')
    .eq('pedido_id', pedidoId)
    .order('quando', { ascending: false })
    .limit(200)
  if (error) throw error

  return ((data ?? []) as Record<string, unknown>[]).map((e) => ({
    id: String(e.id),
    codigo: String(e.codigo),
    quando: (e.quando as string | null) ?? null,
    descricao: String(e.descricao),
    local: (e.local as string | null) ?? null,
    origem: e.origem as OrigemRastreio,
    entregue: Boolean(e.entregue),
  }))
}
