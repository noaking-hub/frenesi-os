import 'server-only'

import {
  ASSUNTO,
  avisosDe,
  conteudoDoAviso,
  identificarFrete,
  type AvisoPendente,
  type EventoNotificacao,
} from '@/domain'

import { emailConfigurado, entregar, montarHtml } from './email'
import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * Avisos de pedido ao cliente.
 *
 * Existe porque as notificações da Yampi não são editáveis e não têm a cara da
 * marca. O ERP passa a ser o remetente do aviso de ENVIO e do de ENTREGA, com
 * o código de rastreio e o link da transportadora.
 *
 * Três travas, e nenhuma é excesso de zelo:
 *
 *  1. **Um fato, um e-mail, para sempre.** A chave em `notificacoes_enviadas`
 *     deriva do fato (`YP-123|pedido_enviado`), não do instante da rodada.
 *  2. **A vaga é reservada ANTES do envio.** A linha entra como `enviando`, e
 *     quem perde a corrida pela chave primária não manda nada. Sem isso, a
 *     rotina de hora em hora e um clique na tela ao mesmo tempo mandariam o
 *     mesmo aviso duas vezes.
 *  3. **Desligado por padrão.** Sem `AVISOS_DE_PEDIDO=1` nada sai. Uma rotina
 *     que começa a escrever para clientes reais no primeiro deploy é o tipo de
 *     coisa que não dá para desfazer depois de acontecer.
 */

/** Quais eventos o módulo cobre hoje. Os outros ficam para quando houver fonte. */
const EVENTOS_ATIVOS: EventoNotificacao[] = ['pedido_enviado', 'pedido_entregue']

export function avisosDePedidoLigados(): boolean {
  return process.env.AVISOS_DE_PEDIDO?.trim() === '1'
}

interface LinhaPedidoAviso {
  id: string
  pagamento: string
  envio: string
  rastreio: string | null
  servico_frete: string | null
  rastreio_url: string | null
  clientes: { nome: string | null; email: string | null } | null
}

export interface ResultadoAvisos {
  /** Fatos sem aviso registrado, antes de qualquer envio. */
  candidatos: number
  enviados: number
  falhas: { pedido: string; erro: string }[]
  /** O módulo está desligado; nada foi enviado. */
  desligado: boolean
}

/**
 * Manda o que ainda não foi mandado.
 *
 * A janela é curta de propósito: o que interessa é o fato NOVO. Pedido antigo
 * que nunca foi avisado já entrou no log como `dispensado` na carga inicial —
 * ressuscitá-lo agora seria escrever para quem recebeu o perfume semanas
 * atrás, que é exatamente o que aquela carga evitou.
 *
 * `destinoDeTeste` desvia tudo para um endereço só e NÃO grava no log: é para
 * conferir texto e visual antes de ligar de verdade.
 */
export async function enviarAvisosDePedido(opcoes?: {
  limite?: number
  diasDeJanela?: number
  destinoDeTeste?: string
}): Promise<ResultadoAvisos> {
  const vazio: ResultadoAvisos = { candidatos: 0, enviados: 0, falhas: [], desligado: false }

  const teste = opcoes?.destinoDeTeste?.trim()
  if (!teste && !avisosDePedidoLigados()) return { ...vazio, desligado: true }
  if (!supabaseConfigurado()) throw new Error('O Supabase precisa estar configurado.')
  if (!emailConfigurado()) {
    throw new Error('Configure RESEND_API_KEY e EMAIL_REMETENTE para enviar avisos ao cliente.')
  }

  const limite = opcoes?.limite ?? 40
  const dias = opcoes?.diasDeJanela ?? 15
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()

  const sb = supabaseServer()
  const { data, error } = await sb
    .from('pedidos')
    .select('id, pagamento, envio, rastreio, servico_frete, rastreio_url, clientes(nome, email)')
    .gte('comprado_em', desde)
    .in('envio', ['enviado', 'entregue'])
    .order('comprado_em', { ascending: false })
    .limit(300)
  if (error) throw error

  const pendentes: { aviso: AvisoPendente; pedido: LinhaPedidoAviso }[] = []
  for (const p of (data ?? []) as unknown as LinhaPedidoAviso[]) {
    const email = p.clientes?.email?.trim()
    if (!email) continue
    for (const aviso of avisosDe({
      id: p.id,
      email,
      cliente: p.clientes?.nome ?? '',
      pagamento: p.pagamento as 'pago' | 'pendente' | 'divergente',
      envio: p.envio as 'enviado' | 'entregue',
      rastreio: p.rastreio,
      notaFiscal: null,
    })) {
      if (EVENTOS_ATIVOS.includes(aviso.evento)) pendentes.push({ aviso, pedido: p })
    }
  }
  if (pendentes.length === 0) return vazio

  // No teste nada é reservado: o ensaio não pode consumir o direito do cliente
  // de receber o aviso de verdade depois.
  if (teste) {
    const amostra = pendentes.slice(0, Math.min(limite, 3))
    const r: ResultadoAvisos = { ...vazio, candidatos: amostra.length }
    for (const { aviso, pedido } of amostra) {
      try {
        await entregar(mensagemDoAviso(aviso, pedido, teste))
        r.enviados++
      } catch (e) {
        r.falhas.push({ pedido: aviso.pedidoId, erro: e instanceof Error ? e.message : String(e) })
      }
    }
    return r
  }

  // Reserva em lote: a chave primária decide quem manda. `ignoreDuplicates`
  // devolve só as linhas que ESTA rodada conseguiu inserir — as demais já
  // estavam no log, seja como enviadas, dispensadas ou em curso.
  const reserva = pendentes.slice(0, limite)
  const { data: ganhas, error: erroReserva } = await sb
    .from('notificacoes_enviadas')
    .upsert(
      reserva.map(({ aviso }) => ({
        chave: aviso.chave,
        pedido_id: aviso.pedidoId,
        evento: aviso.evento,
        destinatario: aviso.email,
        assunto: ASSUNTO[aviso.evento].replace('{pedido}', aviso.pedidoId),
        estado: 'enviando',
      })),
      { onConflict: 'chave', ignoreDuplicates: true },
    )
    .select('chave')
  if (erroReserva) throw erroReserva

  const minhas = new Set((ganhas ?? []).map((l) => (l as { chave: string }).chave))
  const fila = reserva.filter(({ aviso }) => minhas.has(aviso.chave))
  const resultado: ResultadoAvisos = { ...vazio, candidatos: fila.length }

  for (const { aviso, pedido } of fila) {
    try {
      const r = await entregar(mensagemDoAviso(aviso, pedido, null))
      await sb
        .from('notificacoes_enviadas')
        .update({ estado: 'enviado', provedor_id: r.id, concluido_em: new Date().toISOString() })
        .eq('chave', aviso.chave)
      resultado.enviados++
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e)
      resultado.falhas.push({ pedido: aviso.pedidoId, erro })
      // A linha vira `falhou` em vez de sumir: assim a falha aparece no log em
      // vez de virar uma tentativa infinita a cada hora. Reenviar é decisão de
      // quem olha, não da rotina.
      await sb
        .from('notificacoes_enviadas')
        .update({ estado: 'falhou', motivo: erro.slice(0, 300), concluido_em: new Date().toISOString() })
        .eq('chave', aviso.chave)
    }
  }

  return resultado
}

function mensagemDoAviso(
  aviso: AvisoPendente,
  pedido: LinhaPedidoAviso,
  destinoDeTeste: string | null,
) {
  const { transportadora } = identificarFrete(pedido.servico_frete, pedido.rastreio)
  const conteudo = conteudoDoAviso({
    evento: aviso.evento,
    pedidoId: aviso.pedidoId,
    cliente: aviso.cliente,
    rastreio: pedido.rastreio,
    transportadora: transportadora === 'Não informada' ? null : transportadora,
    urlRastreio: pedido.rastreio_url,
  })
  return {
    para: destinoDeTeste || aviso.email,
    assunto: destinoDeTeste ? `[TESTE] ${conteudo.assunto}` : conteudo.assunto,
    html: montarHtml(conteudo),
  }
}
