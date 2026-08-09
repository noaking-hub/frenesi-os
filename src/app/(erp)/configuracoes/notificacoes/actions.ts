'use server'

import { revalidatePath } from 'next/cache'

import { emailConfigurado, entregar, montarHtml } from '@/data/email'
import { mensagemDe } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { ASSUNTO, apenasOAtual, avisosDe } from '@/domain'
import type { AvisoPendente, EventoNotificacao, PedidoNotificavel } from '@/domain'

export type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

/** Liga ou desliga um aviso, e diz quem passa a ser o remetente. */
export async function definirRemetente(
  evento: string,
  remetente: 'yampi' | 'erp' | 'ninguem',
): Promise<Resposta> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado.' }
  }
  const { error } = await supabaseServer()
    .from('notificacoes_regras')
    .update({ remetente, ativa: remetente === 'erp', atualizado_em: new Date().toISOString() })
    .eq('evento', evento)
  if (error) {
    console.error('[notificacoes] definir remetente falhou:', error)
    return { ok: false, erro: error.message }
  }
  revalidatePath('/', 'layout')
  return { ok: true }
}

function corpoDe(evento: EventoNotificacao, aviso: AvisoPendente, rastreio: string | null) {
  const primeiroNome = aviso.cliente.split(' ')[0] || 'Olá'
  const saudacao = `Oi, ${primeiroNome}.`

  switch (evento) {
    case 'pedido_pago':
      return montarHtml({
        titulo: 'Pagamento confirmado',
        saudacao,
        corpo: [
          `Recebemos o pagamento do pedido <strong>${aviso.pedidoId}</strong>.`,
          'Agora ele entra na fila de envase. Cada decant é fracionado na hora, por isso leva um pouco mais que um produto de prateleira — e chega com o volume exato.',
        ],
      })
    case 'pedido_faturado':
      return montarHtml({
        titulo: 'Nota fiscal emitida',
        saudacao,
        corpo: [
          `A nota fiscal do pedido <strong>${aviso.pedidoId}</strong> foi emitida.`,
          'O próximo aviso será quando ele sair para entrega.',
        ],
      })
    case 'pedido_enviado':
      return montarHtml({
        titulo: 'Seu pedido saiu para entrega',
        saudacao,
        corpo: [
          `O pedido <strong>${aviso.pedidoId}</strong> foi despachado.`,
          rastreio
            ? `Código de rastreio: <strong>${rastreio}</strong>.`
            : 'O código de rastreio chega assim que a transportadora registrar a coleta.',
        ],
      })
    case 'pedido_entregue':
      return montarHtml({
        titulo: 'Seu pedido chegou',
        saudacao,
        corpo: [
          `A entrega do pedido <strong>${aviso.pedidoId}</strong> foi confirmada.`,
          'Se algo não estiver como você esperava, responda este e-mail nos próximos 7 dias — é o prazo para trocar ou devolver.',
        ],
      })
    default:
      return montarHtml({
        titulo: ASSUNTO[evento].replace('{pedido}', aviso.pedidoId),
        saudacao,
        corpo: [`Atualização do pedido <strong>${aviso.pedidoId}</strong>.`],
      })
  }
}

export interface ResultadoDisparo {
  enviados: number
  dispensados: number
  falhas: { pedido: string; motivo: string }[]
  /** Eventos que o ERP ainda não assumiu — continuam com a Yampi. */
  aguardando: number
}

/**
 * Manda os avisos que faltam.
 *
 * Três travas, nesta ordem:
 *
 *  1. só eventos cujo remetente é o ERP — enquanto for `yampi`, mandar daqui
 *     daria dois e-mails do mesmo fato;
 *  2. a linha do log é criada ANTES de chamar o provedor, com a chave
 *     derivada do fato. Duas rodadas simultâneas, ou um reinício no meio, não
 *     conseguem gerar um segundo e-mail: a chave primária recusa;
 *  3. de um pedido que chegou já entregue, só o aviso ATUAL sai. Mandar
 *     "pagamento confirmado" para quem recebeu o perfume semana passada
 *     denuncia que o sistema acabou de ser ligado.
 */
export async function dispararAvisos(limite = 50): Promise<Resposta<ResultadoDisparo>> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado.' }
  }
  if (!emailConfigurado()) {
    return {
      ok: false,
      erro:
        'Falta o provedor de e-mail: RESEND_API_KEY e EMAIL_REMETENTE no .env.local. O remetente ' +
        'precisa estar num domínio verificado, com SPF e DKIM — sem isso o aviso cai em spam.',
    }
  }

  try {
    const sb = supabaseServer()

    const { data: regras, error: erroRegras } = await sb
      .from('notificacoes_regras')
      .select('evento, remetente, assunto')
    if (erroRegras) throw erroRegras
    const doErp = new Set(
      (regras ?? []).filter((r) => r.remetente === 'erp').map((r) => r.evento as EventoNotificacao),
    )
    if (doErp.size === 0) {
      return { ok: true, enviados: 0, dispensados: 0, falhas: [], aguardando: (regras ?? []).length }
    }

    const { data: pedidos, error: erroPedidos } = await sb
      .from('pedidos')
      .select('id, pagamento, envio, rastreio, clientes(nome, email)')
      .order('comprado_em', { ascending: false })
      .limit(limite)
    if (erroPedidos) throw erroPedidos

    const { data: jaFeitos, error: erroLog } = await sb
      .from('notificacoes_enviadas')
      .select('chave')
    if (erroLog) throw erroLog
    const feitas = new Set((jaFeitos ?? []).map((l) => l.chave as string))

    let enviados = 0
    let dispensados = 0
    const falhas: { pedido: string; motivo: string }[] = []

    for (const p of (pedidos ?? []) as unknown as {
      id: string
      pagamento: PedidoNotificavel['pagamento']
      envio: PedidoNotificavel['envio']
      rastreio: string | null
      clientes: { nome: string; email: string } | null
    }[]) {
      if (!p.clientes?.email) continue

      const todos = avisosDe({
        id: p.id,
        email: p.clientes.email,
        cliente: p.clientes.nome,
        pagamento: p.pagamento,
        envio: p.envio,
        rastreio: p.rastreio,
        notaFiscal: null,
      }).filter((a) => doErp.has(a.evento) && !feitas.has(a.chave))

      if (todos.length === 0) continue
      const { enviar, dispensar } = apenasOAtual(todos)

      for (const a of dispensar) {
        const { error } = await sb.from('notificacoes_enviadas').insert({
          chave: a.chave,
          pedido_id: a.pedidoId,
          evento: a.evento,
          destinatario: a.email,
          estado: 'dispensado',
          motivo: 'o fato já era antigo quando o ERP assumiu o aviso',
          concluido_em: new Date().toISOString(),
        })
        if (!error) dispensados++
      }

      for (const a of enviar) {
        const assunto = ASSUNTO[a.evento].replace('{pedido}', a.pedidoId)

        // A linha nasce ANTES do envio. Se o processo morrer no meio, ela
        // fica como testemunha em vez de sumir e o e-mail ser refeito.
        const { error: erroReserva } = await sb.from('notificacoes_enviadas').insert({
          chave: a.chave,
          pedido_id: a.pedidoId,
          evento: a.evento,
          destinatario: a.email,
          assunto,
          estado: 'enviando',
        })
        // 23505 = outra rodada já reservou esta chave. Não é erro: é a trava
        // fazendo o trabalho dela.
        if (erroReserva) {
          if (erroReserva.code !== '23505') falhas.push({ pedido: a.pedidoId, motivo: erroReserva.message })
          continue
        }

        try {
          const { id } = await entregar({
            para: a.email,
            assunto,
            html: corpoDe(a.evento, a, p.rastreio),
          })
          await sb
            .from('notificacoes_enviadas')
            .update({ estado: 'enviado', provedor_id: id, concluido_em: new Date().toISOString() })
            .eq('chave', a.chave)
          enviados++
        } catch (e) {
          await sb
            .from('notificacoes_enviadas')
            .update({
              estado: 'falhou',
              motivo: mensagemDe(e).slice(0, 300),
              concluido_em: new Date().toISOString(),
            })
            .eq('chave', a.chave)
          falhas.push({ pedido: a.pedidoId, motivo: mensagemDe(e) })
        }
      }
    }

    revalidatePath('/', 'layout')
    return {
      ok: true,
      enviados,
      dispensados,
      falhas,
      aguardando: (regras ?? []).filter((r) => r.remetente !== 'erp').length,
    }
  } catch (e) {
    console.error('[notificacoes] disparo falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

/** Reenfileira um aviso que falhou, apagando a marca da tentativa anterior. */
export async function tentarDeNovo(chave: string): Promise<Resposta> {
  if (!supabaseConfigurado()) return { ok: false, erro: 'O Supabase precisa estar configurado.' }
  const { error } = await supabaseServer()
    .from('notificacoes_enviadas')
    .delete()
    .eq('chave', chave)
    .eq('estado', 'falhou')
  if (error) return { ok: false, erro: error.message }
  revalidatePath('/', 'layout')
  return { ok: true }
}
