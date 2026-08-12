import { NextResponse } from 'next/server'

import { eventoDaFrenet, gravarEventosRastreio } from '@/data/frenet'
import type { EventoTransportadora } from '@/domain'

/**
 * Webhook de tracking da Frenet.
 *
 * A Frenet chama esta URL a cada nova ocorrência dos objetos da conta — é o
 * que faz o cliente ver "saiu para entrega" em minutos, e não na próxima
 * varredura. O corpo traz o código do objeto e a ocorrência; o formato varia
 * conforme a transportadora, então o leitor procura os campos por candidatos,
 * igual ao da consulta.
 *
 * A autenticação é o par nome/valor de token que se cadastra junto da URL no
 * painel da Frenet. Sem ela, esta rota seria um endereço público capaz de
 * escrever na linha do tempo dos pedidos.
 *
 *     POST /api/frenet/tracking
 *     <FRENET_WEBHOOK_TOKEN_NOME>: <FRENET_WEBHOOK_TOKEN_VALOR>
 *
 * Responder rápido é parte do contrato: a Frenet espera 2xx em até 10
 * segundos, e desiste depois disso.
 */

export const dynamic = 'force-dynamic'

function autorizado(req: Request): boolean {
  const nome = process.env.FRENET_WEBHOOK_TOKEN_NOME?.trim() || 'token'
  const esperado = process.env.FRENET_WEBHOOK_TOKEN_VALOR?.trim()
  // Sem segredo configurado a rota fica FECHADA. O contrário — aceitar tudo
  // enquanto ninguém configura — é o tipo de brecha que ninguém lembra de
  // fechar depois.
  if (!esperado) return false
  return req.headers.get(nome)?.trim() === esperado
}

/** Os objetos rastreados que vierem no corpo, em qualquer formato. */
function objetosDe(corpo: unknown): { codigo: string; ocorrencias: Record<string, unknown>[] }[] {
  if (!corpo || typeof corpo !== 'object') return []
  const raiz = corpo as Record<string, unknown>

  const codigo =
    (typeof raiz.TrackingNumber === 'string' && raiz.TrackingNumber) ||
    (typeof raiz.trackingNumber === 'string' && raiz.trackingNumber) ||
    (typeof raiz.ShippingNumber === 'string' && raiz.ShippingNumber) ||
    null

  if (codigo) {
    const ocorrencias = [
      ...(Array.isArray(raiz.TrackingEvents) ? (raiz.TrackingEvents as Record<string, unknown>[]) : []),
      ...(Array.isArray(raiz.trackingEvents) ? (raiz.trackingEvents as Record<string, unknown>[]) : []),
    ]
    // Notificação de um evento só: a própria raiz é a ocorrência.
    return [{ codigo, ocorrencias: ocorrencias.length ? ocorrencias : [raiz] }]
  }

  // Lote: uma lista de objetos rastreados.
  for (const nome of ['Trackings', 'trackings', 'Orders', 'orders', 'data']) {
    const lista = raiz[nome]
    if (Array.isArray(lista)) return lista.flatMap((item) => objetosDe(item))
  }
  return []
}

export async function POST(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 })
  }

  let corpo: unknown
  try {
    corpo = await req.json()
  } catch {
    return NextResponse.json({ erro: 'corpo_invalido' }, { status: 400 })
  }

  const eventos: EventoTransportadora[] = objetosDe(corpo).flatMap(({ codigo, ocorrencias }) =>
    ocorrencias
      .map((o) => eventoDaFrenet(o, codigo))
      .filter((e): e is EventoTransportadora => e !== null),
  )

  if (eventos.length === 0) {
    // 200 de propósito: repetir uma notificação que o ERP não soube ler não
    // conserta nada, e um 4xx aqui faria a Frenet desativar o webhook.
    console.warn('[frenet] webhook sem evento reconhecido:', JSON.stringify(corpo).slice(0, 500))
    return NextResponse.json({ ok: true, gravados: 0 })
  }

  try {
    const r = await gravarEventosRastreio(eventos)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    console.error('[frenet] webhook falhou ao gravar:', e)
    // 500 aqui é correto: a Frenet reenvia, e o evento não se perde.
    return NextResponse.json({ erro: 'falha_ao_gravar' }, { status: 500 })
  }
}
