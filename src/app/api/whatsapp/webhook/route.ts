import { randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'

import { cancelarAcao, confirmarAcao, lerAcoesPendentes } from '@/data/assessor/acoes'
import { escritaLiberada, executarInteracao } from '@/data/assessor/motor'
import {
  atorDoWhatsapp,
  marcarRespondida,
  registrarMensagem,
  resolverIdentidade,
  responderNoWhatsapp,
} from '@/data/assessor/whatsapp'
import { interpretarComando, paraTextoDeWhatsapp, type ComandoDoWhatsapp } from '@/domain'

/**
 * O canal WhatsApp — §24 e §25 do escopo.
 *
 * Esta rota é um ADAPTADOR e nada mais. Ela traduz o formato do provedor,
 * resolve identidade, e chama `executarInteracao` — o MESMO motor do ERP, com o
 * mesmo Policy Engine, os mesmos limites e a mesma auditoria. O escopo é
 * explícito: "não criar um segundo motor". Se as decisões divergirem entre
 * canais um dia, será porque alguém quebrou isto.
 *
 * A ordem das checagens é a segurança: idempotência antes de identidade (uma
 * reentrega não pode custar uma segunda consulta), identidade antes de
 * qualquer leitura (número desconhecido não vê saldo nenhum), e a política de
 * escrita relida no momento da confirmação.
 */

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/** Verificação do webhook da Meta: ela chama com GET e espera o desafio de volta. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const modo = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const desafio = url.searchParams.get('hub.challenge')

  if (modo === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(desafio ?? '', { status: 200 })
  }
  return NextResponse.json({ erro: 'Verificação recusada.' }, { status: 403 })
}

interface MensagemRecebida {
  id: string
  from: string
  text?: { body?: string }
  type?: string
}

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as {
    entry?: { changes?: { value?: { messages?: MensagemRecebida[] } }[] }[]
  }

  const mensagens =
    corpo.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? []

  // Sem mensagem é notificação de status (entregue, lido). Responder 200 rápido
  // é o que impede o provedor de reentregar o lote inteiro.
  if (mensagens.length === 0) return NextResponse.json({ ok: true })

  for (const m of mensagens) {
    // Processa em série de propósito: duas mensagens do mesmo remetente em
    // paralelo poderiam aprovar a mesma ação duas vezes por caminhos distintos.
    await atender(m).catch((e) => {
      console.error('[whatsapp] falha ao atender:', e instanceof Error ? e.message : String(e))
    })
  }

  return NextResponse.json({ ok: true })
}

async function atender(m: MensagemRecebida) {
  const texto = (m.text?.body ?? '').trim()
  if (!texto) return

  // 1. Idempotência ANTES de tudo. Reentrega não custa consulta nem execução.
  const { nova, respostaAnterior } = await registrarMensagem({
    id: m.id,
    telefone: m.from,
    texto,
  })
  if (!nova) {
    if (respostaAnterior) {
      const reenvio = await responderNoWhatsapp(m.from, respostaAnterior)
      if (!reenvio.ok) console.error('[whatsapp] reentrega não saiu:', reenvio.erro)
    }
    return
  }

  // 2. Identidade. Número desconhecido não vê nada — nem que existe um ERP.
  const autorizado = await resolverIdentidade(m.from)
  if (!autorizado) {
    const recusa =
      'Não reconheço este número. O acesso ao Gerente da FRENESI é liberado individualmente.'
    const envio = await responderNoWhatsapp(m.from, recusa)
    await marcarRespondida(
      m.id,
      recusa,
      randomUUID(),
      envio.ok ? 'numero nao autorizado' : `numero nao autorizado; ${envio.erro}`,
    )
    return
  }

  const ator = atorDoWhatsapp(autorizado)
  const traceId = randomUUID()

  try {
    const comando = interpretarComando(texto)

    if (comando) {
      const resposta = await executarComando(comando, ator, traceId)
      const envio = await responderNoWhatsapp(m.from, resposta)
      await marcarRespondida(m.id, resposta, traceId, envio.erro)
      return
    }

    const r = await executarInteracao({
      pergunta: texto,
      ator,
      canal: 'whatsapp',
      traceId,
      conversaId: null,
      // Teto menor que o do ERP: no celular, uma resposta de trinta segundos
      // já parece travada, e o provedor tem prazo próprio de entrega.
      limites: { maxRodadas: 4, maxToolCalls: 8, maxDuracaoTotalMs: 60_000 },
    })

    const pendentes = await lerAcoesPendentes(null)
    const minhas = pendentes.filter((a) => a.ator?.usuarioId === ator.usuarioId)

    const resposta =
      paraTextoDeWhatsapp(r.texto) +
      (minhas.length > 0
        ? `\n\n─────\n*Aguardando sua decisão:*\n` +
          minhas
            .slice(0, 3)
            .map(
              (a) =>
                `• ${a.previa?.titulo ?? a.ferramenta}\n  Responda *aprovar ${a.id.slice(0, 8)}* ou *cancelar ${a.id.slice(0, 8)}*`,
            )
            .join('\n')
        : '')

    // O envio é conferido: sem isto, uma entrega recusada pela Meta ficaria
    // gravada como respondida e o sintoma visível seria um assistente mudo,
    // com o banco jurando que tinha respondido.
    const envio = await responderNoWhatsapp(m.from, resposta)
    await marcarRespondida(m.id, resposta, traceId, envio.erro)
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    // Falha vira mensagem clara, nunca silêncio. Do outro lado tem alguém
    // esperando, e "não respondeu" é indistinguível de "está pensando".
    const resposta = `Não consegui responder agora: ${erro}`
    const envio = await responderNoWhatsapp(m.from, resposta)
    await marcarRespondida(m.id, resposta, traceId, envio.ok ? erro : `${erro}; ${envio.erro}`)
  }
}

async function executarComando(
  comando: ComandoDoWhatsapp,
  ator: ReturnType<typeof atorDoWhatsapp>,
  traceId: string,
): Promise<string> {
  const pendentes = await lerAcoesPendentes(null)
  const minhas = pendentes.filter((a) => a.ator?.usuarioId === ator.usuarioId)
  const alvo = minhas.filter((a) => a.id.startsWith(comando.prefixo))

  if (alvo.length === 0) {
    return 'Não achei nenhuma ação pendente sua com esse código. Ela pode ter expirado — peça a análise de novo.'
  }
  // Prefixo ambíguo não escolhe uma: pede o código inteiro. Adivinhar qual das
  // duas o usuário quis aprovar é exatamente o tipo de suposição que não cabe
  // numa confirmação financeira.
  if (alvo.length > 1) {
    return `Esse código bate com ${alvo.length} ações. Responda com o código completo:\n${alvo
      .map((a) => `• ${a.id}`)
      .join('\n')}`
  }

  const acao = alvo[0]
  if (comando.verbo === 'cancelar') {
    await cancelarAcao(acao.id, ator)
    return `Cancelado. Nada foi gravado.\n_${acao.previa?.titulo ?? acao.ferramenta}_`
  }

  const r = await confirmarAcao({
    id: acao.id,
    ator,
    canal: 'whatsapp',
    escritaLiberada: await escritaLiberada(),
    traceId,
  })
  return `✅ ${r.recibo}${r.undoId ? `\n\nPara reverter: *desfaça o lote ${r.undoId}*` : ''}`
}
