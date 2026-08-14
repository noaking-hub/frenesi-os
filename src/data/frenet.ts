import 'server-only'

import {
  dataDaTransportadora,
  idDoEvento,
  ocorrenciaDeEntrega,
  servicoFrenetDe,
  servicosPeloFormato,
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

async function chamarFrenet<T>(caminho: string, corpo?: unknown): Promise<T> {
  const token = process.env.FRENET_TOKEN?.trim()
  if (!token) {
    throw new Error(
      'Falta FRENET_TOKEN no ambiente — o token único da conta, em Configurações → API no painel da Frenet.',
    )
  }

  const resposta = await fetch(`${BASE}${caminho}`, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      token,
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
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

export interface ServicoFrenet {
  codigo: string
  descricao: string
  transportadora: string
}

/**
 * Os serviços contratados nesta conta da Frenet.
 *
 * É a tabela que traduz o rótulo da Yampi (`FRENET_SEDEX_03220`) no código que
 * a consulta de rastreio exige (`03220`). Ela mora na conta, não no código:
 * contratar a J&T amanhã acrescenta um serviço, e uma lista fixa aqui deixaria
 * esses envios sem histórico até alguém lembrar de editar o arquivo.
 *
 * O cache é de processo e vale a vida da instância — o catálogo muda em
 * semanas, e reler a cada código consultado gastaria uma chamada por pedido.
 */
let catalogo: { quando: number; servicos: ServicoFrenet[] } | null = null
const VALIDADE_CATALOGO_MS = 6 * 60 * 60 * 1000

export async function servicosDaFrenet(): Promise<ServicoFrenet[]> {
  if (catalogo && Date.now() - catalogo.quando < VALIDADE_CATALOGO_MS) return catalogo.servicos

  const resposta = await chamarFrenet<Record<string, unknown>>('/shipping/info')
  const lista = Array.isArray(resposta?.ShippingSeviceAvailableArray)
    ? (resposta.ShippingSeviceAvailableArray as Record<string, unknown>[])
    : []

  const servicos = lista
    .map((s) => ({
      codigo: texto(campo(s, ['serviceCode'])) ?? '',
      descricao: texto(campo(s, ['serviceDescription'])) ?? '',
      transportadora: texto(campo(s, ['carrier'])) ?? '',
    }))
    .filter((s) => s.codigo)

  if (servicos.length) catalogo = { quando: Date.now(), servicos }
  return servicos
}

/**
 * Quais serviços tentar para um código.
 *
 * Primeiro o que o rótulo da Yampi indica; depois o que o formato do código
 * denuncia, para os pedidos anteriores ao ERP e para as etiquetas emitidas
 * fora da Frenet. A lista sai sem repetição e limitada aos serviços que a
 * conta realmente tem — pedir um serviço não contratado só devolve erro.
 */
async function servicosParaTentar(
  codigo: string,
  servicoFrete: string | null | undefined,
): Promise<string[]> {
  const disponiveis = await servicosDaFrenet()
  const codigos = disponiveis.map((s) => s.codigo)
  const doRotulo = servicoFrenetDe(servicoFrete, codigos)
  const doFormato = servicosPeloFormato(codigo).filter((c) => codigos.includes(c))
  return [...new Set([doRotulo, ...doFormato].filter((c): c is string => Boolean(c)))]
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

export interface LeituraRastreio {
  eventos: EventoTransportadora[]
  /** Página pública da Frenet para este objeto — o que sobra quando não há evento. */
  url: string | null
  /** O código de serviço que respondeu; vale guardar para não redescobrir. */
  servico: string | null
}

/**
 * Consulta o rastreio de UM código.
 *
 * `POST /tracking/trackinginfo` sempre responde 200 — inclusive quando recusa.
 * Serviço desconhecido volta como `{"ErrorMessage": "...", ...}` com zero
 * ocorrências, indistinguível de "o objeto ainda não foi escaneado" para quem
 * só conta o tamanho da lista. Era exatamente isso que estava acontecendo: o
 * ERP mandava o rótulo da Yampi no lugar do código, a Frenet recusava, e o
 * pedido era marcado como lido sem nunca ter sido consultado de verdade.
 *
 * Quando o serviço não é conhecido de antemão, os candidatos são tentados em
 * ordem e o primeiro que responder com ocorrência encerra a busca.
 */
export async function rastrearNaFrenet(
  codigo: string,
  servicoFrete?: string | null,
): Promise<LeituraRastreio> {
  const alvo = codigo.trim()
  if (!alvo) return { eventos: [], url: null, servico: null }

  const candidatos = await servicosParaTentar(alvo, servicoFrete)
  if (candidatos.length === 0) {
    throw new Error(
      `A Frenet não tem serviço para o código ${alvo}` +
        (servicoFrete ? ` (${servicoFrete})` : '') +
        '. Provavelmente a etiqueta saiu por outro emissor.',
    )
  }

  let recusa: string | null = null
  let ultima: LeituraRastreio = { eventos: [], url: null, servico: null }

  for (const servico of candidatos) {
    const resposta = await chamarFrenet<Record<string, unknown>>('/tracking/trackinginfo', {
      ShippingServiceCode: servico,
      TrackingNumber: alvo,
    })

    const erro = texto(campo(resposta ?? {}, ['errorMessage', 'message']))
    if (erro) {
      recusa = erro
      continue
    }

    const eventos = ocorrenciasDe(resposta)
      .map((o) => eventoDaFrenet(o, alvo))
      .filter((e): e is EventoTransportadora => e !== null)

    ultima = {
      eventos,
      url: texto(campo(resposta ?? {}, ['trackingUrl'])),
      servico,
    }
    // Serviço aceito e com histórico: não há por que perguntar aos outros.
    if (eventos.length) return ultima
  }

  // Todos os candidatos foram recusados: isso é falha, não silêncio. Deixar
  // passar como "sem ocorrência" é o que escondeu o problema por semanas.
  if (recusa && !ultima.servico) throw new Error(`A Frenet recusou a consulta de ${alvo}: ${recusa}`)
  return ultima
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
  // Duas filas, nesta ordem: primeiro os envios VIVOS (ainda não entregues),
  // que precisam de leitura fresca; depois o mutirão de reposição — pedidos
  // já entregues cuja data real de entrega ainda não veio da transportadora
  // (a importação gravava a PREVISÃO da Yampi no lugar, e o reparo zerou).
  // Sem a divisão, centenas de códigos antigos passariam na frente do que
  // está na rua agora.
  const { data: vivos, error } = await sb
    .from('pedidos')
    .select('id, rastreio, servico_frete, rastreio_servico, rastreio_lido_em')
    .not('rastreio', 'is', null)
    .is('entregue_em', null)
    .neq('situacao', 'entregue')
    .order('rastreio_lido_em', { ascending: true, nullsFirst: true })
    .limit(limite)
  if (error) throw error

  const alvos = (vivos ?? []) as AlvoRastreio[]
  const vagas = limite - alvos.length
  if (vagas > 0) {
    const { data: reposicao, error: erroReposicao } = await sb
      .from('pedidos')
      .select('id, rastreio, servico_frete, rastreio_servico, rastreio_lido_em')
      .not('rastreio', 'is', null)
      .is('entregue_em', null)
      .eq('situacao', 'entregue')
      .order('rastreio_lido_em', { ascending: true, nullsFirst: true })
      .limit(vagas)
    if (erroReposicao) throw erroReposicao
    alvos.push(...((reposicao ?? []) as AlvoRastreio[]))
  }

  // Nada é descartado por rótulo aqui: etiqueta emitida no Melhor Envio pode
  // ter saído por uma transportadora que a Frenet consulta igual (a J&T
  // responde por código público). Quem decide é `rastrearNaFrenet`, que sabe
  // quais serviços esta conta tem — e avisa quando não tem nenhum.
  return consultarAlvos(alvos)
}

interface AlvoRastreio {
  id: string
  rastreio: string
  servico_frete: string | null
  rastreio_servico: string | null
}

/**
 * Releitura sob demanda dos pedidos que o operador escolheu na tela.
 *
 * Diferente da varredura em dois pontos que importam: ignora a fila de "mais
 * antigo primeiro" — quem está atendendo um cliente quer AQUELE código agora —
 * e não pula pedido já entregue, porque a dúvida sobre o que a transportadora
 * registrou continua valendo depois da entrega.
 */
export async function rastrearPedidos(ids: string[]): Promise<RodadaRastreio> {
  if (!frenetConfigurada()) throw new Error('A Frenet não está configurada.')
  if (!supabaseConfigurado()) throw new Error('O Supabase precisa estar configurado.')
  if (ids.length === 0) return { consultados: 0, eventos: 0, entregues: 0, falhas: [] }

  const { data, error } = await supabaseServer()
    .from('pedidos')
    .select('id, rastreio, servico_frete, rastreio_servico')
    .in('id', ids.slice(0, 40))
    .not('rastreio', 'is', null)
  if (error) throw error

  return consultarAlvos((data ?? []) as AlvoRastreio[])
}

async function consultarAlvos(alvos: AlvoRastreio[]): Promise<RodadaRastreio> {
  const sb = supabaseServer()
  const resultado: RodadaRastreio = { consultados: 0, eventos: 0, entregues: 0, falhas: [] }
  const agora = new Date().toISOString()

  for (const p of alvos) {
    try {
      // O serviço já descoberto tem prioridade sobre o rótulo da Yampi: ele é
      // o que a Frenet aceitou de fato, e evita repetir a tentativa e erro.
      const leitura = await rastrearNaFrenet(p.rastreio, p.rastreio_servico ?? p.servico_frete)
      resultado.consultados++
      if (leitura.eventos.length) {
        const r = await gravarEventosRastreio(leitura.eventos)
        resultado.eventos += r.gravados
        resultado.entregues += r.entregues
      }
      // A leitura é marcada mesmo sem ocorrência: senão o mesmo código volta
      // primeiro na fila em todas as rodadas e os outros nunca chegam a ser
      // consultados. O link público entra aqui — para a Jadlog, é a única
      // coisa que a Frenet devolve.
      await sb
        .from('pedidos')
        .update({
          rastreio_lido_em: agora,
          ...(leitura.url ? { rastreio_url: leitura.url } : {}),
          ...(leitura.servico ? { rastreio_servico: leitura.servico } : {}),
        })
        .eq('id', p.id)
    } catch (e) {
      resultado.falhas.push({
        codigo: p.rastreio,
        erro: e instanceof Error ? e.message : String(e),
      })
      // Falha também marca leitura: sem isso o código recusado monopoliza o
      // topo da fila e a varredura gira em falso sobre os mesmos dez pedidos.
      await sb.from('pedidos').update({ rastreio_lido_em: agora }).eq('id', p.id)
    }
    // Espaçamento entre consultas: o limite da Frenet é por minuto. 150 ms
    // bastam para 15 códigos — e cada segundo aqui disputa com o teto de
    // tempo que a Netlify impõe à rodada inteira.
    await new Promise((r) => setTimeout(r, 150))
  }

  return resultado
}

export interface RodadaCotacao {
  consultados: number
  cotados: number
  falhas: { pedido: string; erro: string }[]
  /** Sem o CEP de origem não há cotação — a rodada inteira é pulada. */
  pulado?: string
}

/**
 * Cota na Frenet o prazo de entrega dos pedidos que ainda não têm um.
 *
 * A régua do pedido tem duas metades: 72 h de expedição (regra da operação) e
 * o prazo da transportadora depois do despacho. A Yampi não devolve esse
 * número — quem o conhece é a cotação da Frenet, que responde `DeliveryTime`
 * por serviço. O prazo é gravado UMA vez por pedido: cotar de novo a cada
 * tela daria um prazo diferente por dia, contado do dia errado.
 *
 * Só entra o prazo do serviço que o pedido realmente usou. Sem match de
 * serviço, o pedido fica sem prazo e a tela diz "sem previsão" — o escopo
 * proíbe inventar data, e o prazo do SEDEX no pedido que foi de PAC seria
 * exatamente isso.
 */
export async function cotarPrazosDeEntrega(limite = 15): Promise<RodadaCotacao> {
  if (!frenetConfigurada()) throw new Error('A Frenet não está configurada.')
  if (!supabaseConfigurado()) throw new Error('O Supabase precisa estar configurado.')

  const origem = (process.env.FRETE_CEP_ORIGEM ?? '').replace(/\D/g, '')
  if (origem.length !== 8) {
    return {
      consultados: 0,
      cotados: 0,
      falhas: [],
      pulado:
        'FRETE_CEP_ORIGEM não está definido no ambiente — é o CEP de onde os pacotes saem, e sem ele não há cotação.',
    }
  }

  const sb = supabaseServer()
  const { data, error } = await sb
    .from('pedidos')
    .select('id, cep, valor, rastreio, servico_frete, rastreio_servico')
    .not('rastreio', 'is', null)
    .is('entregue_em', null)
    // Entregue sem data real ainda é entregue: cotar prazo para ele seria
    // gastar a cota da Frenet com uma pergunta que já foi respondida.
    .neq('situacao', 'entregue')
    .is('prazo_entrega_dias', null)
    // Quem tem a promessa do checkout não precisa de cotação: a régua usa a
    // promessa primeiro, e a cota da Frenet vai para quem está sem nada.
    .is('entrega_prevista_em', null)
    .eq('entrega_local', false)
    .not('cep', 'is', null)
    .order('comprado_em', { ascending: false })
    .limit(limite)
  if (error) throw error

  const alvos = (data ?? []) as {
    id: string
    cep: string
    valor: number
    rastreio: string
    servico_frete: string | null
    rastreio_servico: string | null
  }[]
  const resultado: RodadaCotacao = { consultados: 0, cotados: 0, falhas: [] }

  const catalogoServicos = await servicosDaFrenet()
  const codigosConhecidos = catalogoServicos.map((s) => s.codigo)

  for (const p of alvos) {
    const destino = p.cep.replace(/\D/g, '')
    if (destino.length !== 8) continue

    // Qual serviço este pedido usou — mesmo desempate da varredura de rastreio.
    const doServico =
      p.rastreio_servico ??
      servicoFrenetDe(p.servico_frete, codigosConhecidos) ??
      servicosPeloFormato(p.rastreio).find((c) => codigosConhecidos.includes(c)) ??
      null
    if (!doServico) continue

    try {
      const cotacao = await chamarFrenet<Record<string, unknown>>('/shipping/quote', {
        SellerCEP: origem,
        RecipientCEP: destino,
        ShipmentInvoiceValue: Number(p.valor) || 100,
        RecipientCountry: 'BR',
        ShippingItemArray: [
          // A caixa padrão dos decants. O prazo quase não varia com o peso —
          // varia com a rota — e é o prazo que interessa aqui, não o preço.
          { Weight: 0.3, Length: 16, Height: 6, Width: 11, Quantity: 1 },
        ],
      })
      resultado.consultados++

      const servicos = Array.isArray(cotacao?.ShippingSevicesArray)
        ? (cotacao.ShippingSevicesArray as Record<string, unknown>[])
        : []
      const doPedido = servicos.find(
        (s) => String(s.ServiceCode ?? s.serviceCode ?? '') === doServico,
      )
      const dias = Number(doPedido?.DeliveryTime ?? doPedido?.deliveryTime)

      if (Number.isFinite(dias) && dias > 0) {
        const { error: erroGrava } = await sb
          .from('pedidos')
          .update({ prazo_entrega_dias: Math.round(dias) })
          .eq('id', p.id)
        if (erroGrava) throw erroGrava
        resultado.cotados++
      }
    } catch (e) {
      resultado.falhas.push({
        pedido: p.id,
        erro: e instanceof Error ? e.message : String(e),
      })
    }
    await new Promise((r) => setTimeout(r, 150))
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
