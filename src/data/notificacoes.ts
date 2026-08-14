import 'server-only'

import {
  ASSUNTO,
  avisosDe,
  emailDevolucaoAberta,
  emailDevolucaoAprovada,
  emailEntregue,
  emailEnvio,
  identificarFrete,
  paginaDeRastreio,
  type AvisoPendente,
  type EventoNotificacao,
} from '@/domain'

import { emailConfigurado, entregar } from './email'
import { lerModeloEmail } from './modelo-email'
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
 *
 * Desligado, a rotina ainda RODA — e registra cada fato como dispensado. Essa
 * parte é o que torna a trava reversível com segurança: sem ela, os envios que
 * acontecerem enquanto o módulo está desligado ficariam pendentes, e a
 * primeira rodada depois de ligar despejaria semanas de avisos atrasados sobre
 * pedidos que já chegaram.
 */

/**
 * Quais eventos o módulo cobre hoje. Os outros ficam para quando houver fonte.
 */
const EVENTOS_ATIVOS: EventoNotificacao[] = ['pedido_enviado', 'pedido_entregue']

type ModeloEnvio = Parameters<typeof emailEnvio>[1]

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
  const desligado = !teste && !avisosDePedidoLigados()
  if (!supabaseConfigurado()) throw new Error('O Supabase precisa estar configurado.')
  if (!desligado && !emailConfigurado()) {
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
  if (pendentes.length === 0) return { ...vazio, desligado }

  // ── Módulo desligado: o fato entra no log, o e-mail não sai ──────────────
  //
  // Sem isto, cada envio que acontecesse com o módulo desligado ficaria como
  // aviso PENDENTE. No dia em que a operação ligasse, a primeira rodada
  // despejaria semanas de avisos atrasados de uma vez — clientes recebendo
  // "seu pedido está a caminho" de pedidos que já chegaram.
  //
  // Registrar como dispensado mantém a promessa dos dois lados: nada sai
  // agora, e ligar depois avisa apenas o que acontecer daí para frente.
  if (desligado) {
    const { data: registradas } = await sb
      .from('notificacoes_enviadas')
      .upsert(
        pendentes.map(({ aviso }) => ({
          chave: aviso.chave,
          pedido_id: aviso.pedidoId,
          evento: aviso.evento,
          destinatario: aviso.email,
          assunto: '(não enviado)',
          estado: 'dispensado',
          motivo: 'módulo de avisos desligado quando o fato aconteceu',
          concluido_em: new Date().toISOString(),
        })),
        { onConflict: 'chave', ignoreDuplicates: true },
      )
      .select('chave')
    return { ...vazio, candidatos: (registradas ?? []).length, desligado: true }
  }

  // Uma leitura por rodada, não uma por e-mail: o modelo é o mesmo para todos.
  const modelo = (await lerModeloEmail('envio')) as ModeloEnvio

  // No teste nada é reservado: o ensaio não pode consumir o direito do cliente
  // de receber o aviso de verdade depois.
  if (teste) {
    const amostra = pendentes.slice(0, Math.min(limite, 3))
    const r: ResultadoAvisos = { ...vazio, candidatos: amostra.length }
    for (const { aviso, pedido } of amostra) {
      try {
        await entregar(mensagemDoAviso(aviso, pedido, modelo, teste))
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
      const r = await entregar(mensagemDoAviso(aviso, pedido, modelo, null))
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

/**
 * A mensagem pronta para um aviso.
 *
 * O link do botão sai de `paginaDeRastreio`, que escolhe a casa certa pela
 * transportadora: Frenet para Correios e Jadlog, Melhor Rastreio para J&T,
 * Total e Buslog — sempre com o código embutido, para o cliente não digitar
 * nada. Quando a Frenet já devolveu a URL do objeto, ela tem precedência: é o
 * endereço que a própria transportadora publicou.
 */
function mensagemDoAviso(
  aviso: AvisoPendente,
  pedido: LinhaPedidoAviso,
  modelo: ModeloEnvio,
  destinoDeTeste: string | null,
) {
  const { transportadora } = identificarFrete(pedido.servico_frete, pedido.rastreio)
  const nome = transportadora === 'Não informada' ? null : transportadora

  const conteudo =
    aviso.evento === 'pedido_entregue'
      ? emailEntregue({ nome: aviso.cliente, pedido: aviso.pedidoId, transportadora: nome })
      : emailEnvio(
          {
            nome: aviso.cliente,
            pedido: aviso.pedidoId,
            codigo: pedido.rastreio,
            transportadora: nome,
            link: pedido.rastreio_url ?? paginaDeRastreio(nome, pedido.rastreio),
          },
          modelo,
        )

  return {
    para: destinoDeTeste || aviso.email,
    assunto: destinoDeTeste ? `[TESTE] ${conteudo.assunto}` : conteudo.assunto,
    html: conteudo.html,
  }
}

// ── Avisos de devolução ─────────────────────────────────────────────────────

/**
 * Um aviso de devolução, com as três travas do módulo: chave derivada do fato
 * (`DEV-1042|devolucao_aberta`), vaga reservada antes do envio, e — com o
 * módulo desligado — o fato entra no log como dispensado, sem sair e-mail.
 * Ligar `AVISOS_DE_PEDIDO=1` depois só avisa o que acontecer daí em diante.
 *
 * Nunca lança: o aviso é coadjuvante. Falhar o registro da devolução porque o
 * provedor de e-mail espirrou inverteria a importância das coisas.
 */
async function avisarDevolucao(
  protocolo: string,
  evento: 'devolucao_aberta' | 'devolucao_aprovada',
  montar: (d: {
    nome: string | null
    email: string
    pedido: string
    reverso: string
  }) => { assunto: string; html: string } | null,
): Promise<void> {
  try {
    if (!supabaseConfigurado()) return
    const sb = supabaseServer()

    const { data } = await sb
      .from('solicitacoes_devolucao')
      .select('protocolo, pedido_id, motivo, reverso, pedidos(clientes(nome, email))')
      .eq('protocolo', protocolo)
      .maybeSingle()
    const s = data as unknown as {
      protocolo: string
      pedido_id: string
      motivo: string
      reverso: string
      pedidos: {
        clientes: { nome: string | null; email: string | null } | null
      } | null
    } | null
    const email = s?.pedidos?.clientes?.email?.trim()
    if (!s || !email) return

    const mensagem = montar({
      nome: s.pedidos?.clientes?.nome ?? null,
      email,
      pedido: s.pedido_id,
      reverso: s.reverso,
    })
    if (!mensagem) return

    const chave = `${protocolo}|${evento}`
    const desligado = !avisosDePedidoLigados() || !emailConfigurado()

    if (desligado) {
      await sb.from('notificacoes_enviadas').upsert(
        {
          chave,
          pedido_id: s.pedido_id,
          evento,
          destinatario: email,
          assunto: '(não enviado)',
          estado: 'dispensado',
          motivo: 'módulo de avisos desligado quando o fato aconteceu',
          concluido_em: new Date().toISOString(),
        },
        { onConflict: 'chave', ignoreDuplicates: true },
      )
      return
    }

    const { data: ganha } = await sb
      .from('notificacoes_enviadas')
      .upsert(
        {
          chave,
          pedido_id: s.pedido_id,
          evento,
          destinatario: email,
          assunto: mensagem.assunto,
          estado: 'enviando',
        },
        { onConflict: 'chave', ignoreDuplicates: true },
      )
      .select('chave')
    if (!(ganha ?? []).length) return

    try {
      const r = await entregar({ para: email, assunto: mensagem.assunto, html: mensagem.html })
      await sb
        .from('notificacoes_enviadas')
        .update({ estado: 'enviado', provedor_id: r.id, concluido_em: new Date().toISOString() })
        .eq('chave', chave)
    } catch (e) {
      await sb
        .from('notificacoes_enviadas')
        .update({
          estado: 'falhou',
          motivo: (e instanceof Error ? e.message : String(e)).slice(0, 300),
          concluido_em: new Date().toISOString(),
        })
        .eq('chave', chave)
    }
  } catch (e) {
    console.error(`[devolucoes] aviso ${evento} de ${protocolo} não registrado:`, e)
  }
}

/** Confirmação de solicitação aberta — chamado pelo portal. */
export async function avisarDevolucaoAberta(protocolo: string): Promise<void> {
  const modelo = await lerModeloEmail('devolucao-aberta').catch(() => undefined)
  await avisarDevolucao(protocolo, 'devolucao_aberta', (d) =>
    emailDevolucaoAberta({ nome: d.nome, pedido: d.pedido, protocolo }, modelo),
  )
}

/** Aprovação com o código reverso — chamado quando o ERP gera o reverso. */
export async function avisarDevolucaoAprovada(protocolo: string): Promise<void> {
  const modelo = await lerModeloEmail('devolucao-aprovada').catch(() => undefined)
  await avisarDevolucao(protocolo, 'devolucao_aprovada', (d) =>
    // Sem reverso não há o que apresentar na agência — o e-mail não sai.
    d.reverso
      ? emailDevolucaoAprovada({ nome: d.nome, protocolo, reverso: d.reverso }, modelo)
      : null,
  )
}
