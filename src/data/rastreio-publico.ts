import {
  chaveDoPedido,
  documentoConfere,
  identificarFrete,
  ordenarEventos,
  resumirDescricao,
  rotuloPublico,
  urlDaTransportadora,
  type EventoPublico,
  type MarcoPublico,
  type RastreioPublico,
  type StatusRastreio,
} from '@/domain'

import { supabaseServer } from './supabase'

/**
 * A consulta que o site da loja faz para mostrar o rastreio ao cliente.
 *
 * Roda no servidor do ERP e lê o espelho no banco — nunca a Yampi ou a
 * transportadora ao vivo. Não é economia de chamada: é que esta rota responde
 * a visitante anônimo, e uma rota anônima que dispara consulta externa a cada
 * acesso é um amplificador de tráfego apontado para a nossa própria cota.
 */

/** Teto de pedidos devolvidos na busca só por documento. */
const MAXIMO_NA_LISTA = 10

/** Dias de compra sem entrega a partir dos quais o pedido vira exceção. */
const DIAS_PARA_EXCECAO = 15

interface LinhaPedido {
  id: string
  shopify_numero: string | null
  pagamento: string
  envio: string
  rastreio: string | null
  servico_frete: string | null
  rastreio_url: string | null
  comprado_em: string
  entregue_em: string | null
  destino: string | null
  enviado_shopify_em: string | null
  cliente_id: string | null
}

const COLUNAS =
  'id, shopify_numero, pagamento, envio, rastreio, servico_frete, rastreio_url, ' +
  'comprado_em, entregue_em, destino, enviado_shopify_em, cliente_id'

/** Entrega feita pela equipe, na cidade da operação — nunca terá código. */
function ehEntregaLocal(servico: string | null, rastreio: string | null): boolean {
  if (rastreio) return false
  return /motoboy|local/i.test(servico ?? '')
}

function statusDe(p: LinhaPedido, agora: Date): StatusRastreio {
  if (p.pagamento !== 'pago') return 'pagamento-pendente'
  if (p.envio === 'entregue') return 'entregue'
  if (p.envio === 'retido') return 'entrega-nao-efetuada'

  const dias = Math.floor((agora.getTime() - Date.parse(p.comprado_em)) / 86_400_000)
  if (Number.isFinite(dias) && dias > DIAS_PARA_EXCECAO) return 'sem-movimentacao'
  return p.envio === 'enviado' ? 'em-transito' : 'aguardando-postagem'
}

/**
 * Os fatos que o ERP conhece pela Yampi.
 *
 * Sempre preenchidos, mesmo quando a transportadora não devolveu nada — é o
 * que impede a página do cliente de ficar em branco para um pedido que está
 * perfeitamente normal, só ainda não escaneado.
 */
function marcosDe(p: LinhaPedido, transportadora: string | null): MarcoPublico[] {
  const marcos: MarcoPublico[] = [
    {
      quando: p.comprado_em,
      titulo: p.pagamento === 'pago' ? 'Pagamento confirmado' : 'Pedido criado',
      onde: 'Yampi',
    },
  ]
  if (p.rastreio) {
    // A Yampi não diz QUANDO a etiqueta saiu — só que o código existe.
    marcos.push({ quando: null, titulo: 'Código de rastreio emitido', onde: transportadora ?? 'Transportadora' })
  }
  if (p.enviado_shopify_em) {
    marcos.push({ quando: p.enviado_shopify_em, titulo: 'Envio registrado na loja', onde: 'Loja' })
  }
  if (p.entregue_em) {
    marcos.push({ quando: p.entregue_em, titulo: 'Entrega confirmada', onde: 'Yampi' })
  }
  return marcos
}

async function eventosDe(pedidoIds: string[]): Promise<Map<string, EventoPublico[]>> {
  const porPedido = new Map<string, EventoPublico[]>()
  if (pedidoIds.length === 0) return porPedido

  const { data, error } = await supabaseServer()
    .from('rastreio_eventos')
    .select('id, pedido_id, codigo, quando, descricao, local, origem, entregue')
    .in('pedido_id', pedidoIds)
  if (error) throw error

  for (const linha of (data ?? []) as unknown as {
    id: string
    pedido_id: string
    codigo: string
    quando: string | null
    descricao: string
    local: string | null
    origem: string
    entregue: boolean
  }[]) {
    const lista = porPedido.get(linha.pedido_id) ?? []
    lista.push({
      quando: linha.quando,
      descricao: linha.descricao,
      descricaoResumida: resumirDescricao(linha.descricao),
      local: linha.local,
      entregue: linha.entregue,
    })
    porPedido.set(linha.pedido_id, lista)
  }

  // A mesma ordenação da tela interna: mais recente primeiro, sem data no fim.
  for (const [id, lista] of porPedido) {
    const ordenada = ordenarEventos(
      lista.map((e, i) => ({
        id: String(i),
        codigo: '',
        quando: e.quando,
        descricao: e.descricao,
        local: e.local,
        origem: 'frenet' as const,
        entregue: e.entregue,
      })),
    )
    porPedido.set(
      id,
      ordenada.map((o) => ({
        quando: o.quando,
        descricao: o.descricao,
        descricaoResumida: resumirDescricao(o.descricao),
        local: o.local,
        entregue: o.entregue,
      })),
    )
  }
  return porPedido
}

function montar(
  p: LinhaPedido,
  eventos: EventoPublico[],
  agora: Date,
): RastreioPublico {
  const { transportadora } = identificarFrete(p.servico_frete, p.rastreio)
  const local = ehEntregaLocal(p.servico_frete, p.rastreio)
  const status = statusDe(p, agora)
  const nome = local ? null : transportadora === 'Não informada' ? null : transportadora

  return {
    pedido: {
      referencia: p.id,
      numeroYampi: p.id.replace(/^YP-/, ''),
      numeroLoja: p.shopify_numero,
      compradoEm: p.comprado_em,
    },
    entrega: {
      status,
      rotulo: rotuloPublico(status, p.entregue_em),
      transportadora: nome,
      servico: p.servico_frete,
      codigo: p.rastreio,
      url: urlDaTransportadora(nome, p.rastreio),
      rastreioUrl: p.rastreio_url,
      destino: p.destino,
      entregueEm: p.entregue_em,
      entregaLocal: local,
    },
    marcos: marcosDe(p, nome),
    eventos,
    atualizadoEm: agora.toISOString(),
  }
}

export type ResultadoPublico =
  | { ok: true; pedidos: RastreioPublico[] }
  /** Pedido inexistente OU documento que não confere — deliberadamente o mesmo. */
  | { ok: false; motivo: 'nao_encontrado' }

/**
 * Busca por documento, com número de pedido opcional.
 *
 * O documento é obrigatório sempre, inclusive quando o número vem junto: sem
 * ele, quem descobrisse a sequência dos números leria destino e status dos
 * pedidos da loja inteira. É a mesma regra do Portal de Devoluções.
 *
 * "Não encontrado" cobre os dois casos — pedido que não existe e documento
 * que não bate. Separar os dois transformaria a rota num verificador de quais
 * números de pedido existem, que é exatamente o que a exigência do documento
 * está evitando.
 */
export async function rastreioPublico(
  documento: string,
  pedido?: string | null,
): Promise<ResultadoPublico> {
  const doc = documento.trim()
  if (!doc) return { ok: false, motivo: 'nao_encontrado' }

  const sb = supabaseServer()

  // O dono vem primeiro: é ele que limita tudo o que será lido a seguir.
  const ehEmail = doc.includes('@')
  const consultaDono = ehEmail
    ? sb.from('clientes').select('id, email, cpf').ilike('email', doc)
    : sb.from('clientes').select('id, email, cpf').eq('cpf', doc.replace(/\D/g, ''))
  const { data: donos, error: erroDono } = await consultaDono
  if (erroDono) throw erroDono

  const clientes = ((donos ?? []) as unknown as { id: string; email: string | null; cpf: string | null }[])
    .filter((c) => documentoConfere(doc, c))
  if (clientes.length === 0) return { ok: false, motivo: 'nao_encontrado' }

  const ids = clientes.map((c) => c.id)
  let consulta = sb
    .from('pedidos')
    .select(COLUNAS)
    .in('cliente_id', ids)
    .order('comprado_em', { ascending: false })
    .limit(MAXIMO_NA_LISTA)

  if (pedido?.trim()) {
    const chave = chaveDoPedido(pedido)
    if (!chave.yampi && !chave.loja) return { ok: false, motivo: 'nao_encontrado' }
    consulta = chave.yampi
      ? consulta.eq('id', chave.yampi)
      : consulta.eq('shopify_numero', chave.loja as string)
  }

  const { data, error } = await consulta
  if (error) throw error

  const linhas = (data ?? []) as unknown as LinhaPedido[]
  if (linhas.length === 0) return { ok: false, motivo: 'nao_encontrado' }

  const eventos = await eventosDe(linhas.map((p) => p.id))
  const agora = new Date()
  return { ok: true, pedidos: linhas.map((p) => montar(p, eventos.get(p.id) ?? [], agora)) }
}
