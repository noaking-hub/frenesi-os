import 'server-only'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { normalizarTelefone, type Ator } from '@/domain'

/**
 * O canal WhatsApp — §24 e §25.
 *
 * A regra que governa o arquivo está no escopo em uma frase: "nunca confiar
 * apenas no número de telefone". Número é identificador FRACO — chip clonado,
 * aparelho emprestado, número reciclado pela operadora. Por isso a autorização
 * é uma lista que alguém preencheu à mão, e não uma dedução a partir de quem
 * mandou mensagem.
 *
 * O adaptador não tem motor próprio. Ele traduz entrada e saída e chama
 * `executarInteracao`, o mesmo do ERP, com o mesmo Policy Engine. Se um dia as
 * decisões divergirem entre os canais, será porque alguém criou um segundo
 * motor — e é justamente isso que este desenho existe para impedir.
 */

export function whatsappConfigurado(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID)
}

export interface AutorizadoNoWhatsapp {
  telefone: string
  usuarioId: string | null
  nome: string
  perfil: string
  permissoes: string[]
}

/**
 * Resolve identidade — e devolve `null` quando não consegue.
 *
 * Null aqui significa "não atendo", não "atendo com menos". Um assistente que
 * responde o saldo do caixa para número desconhecido é um vazamento com
 * interface amigável.
 */
export async function resolverIdentidade(telefone: string): Promise<AutorizadoNoWhatsapp | null> {
  if (!supabaseConfigurado()) return null
  const numero = normalizarTelefone(telefone)
  const { data, error } = await supabaseServer()
    .from('gerente_whatsapp_autorizados')
    .select('*')
    .eq('telefone', numero)
    .eq('ativo', true)
    .maybeSingle()
  if (error || !data) return null

  await supabaseServer()
    .from('gerente_whatsapp_autorizados')
    .update({ ultimo_contato_em: new Date().toISOString() })
    .eq('telefone', numero)

  return {
    telefone: numero,
    usuarioId: data.usuario_id ? String(data.usuario_id) : null,
    nome: String(data.nome),
    perfil: String(data.perfil ?? 'operador'),
    permissoes: (data.permissoes ?? ['gerente.ler']) as string[],
  }
}

export function atorDoWhatsapp(a: AutorizadoNoWhatsapp): Ator {
  return {
    usuarioId: a.usuarioId ?? `wa:${a.telefone}`,
    perfil: a.perfil,
    // As permissões vêm da LISTA, não do canal. É o que permite dar leitura no
    // celular a quem tem escrita no ERP, sem inventar um segundo modelo de
    // permissão para manter em sincronia.
    permissoes: a.permissoes,
    empresaId: 'frenesi',
  }
}

/**
 * Registra a mensagem e diz se ela é NOVA.
 *
 * O WhatsApp reentrega quando não recebe o 200 a tempo, e o usuário reenvia
 * quando acha que não foi. As duas coisas produzem a mesma mensagem duas vezes;
 * a chave primária no id do provedor faz a segunda colidir em vez de virar uma
 * segunda solicitação de compra.
 */
export async function registrarMensagem(dados: {
  id: string
  telefone: string
  texto: string
}): Promise<{ nova: boolean; respostaAnterior: string | null }> {
  if (!supabaseConfigurado()) return { nova: true, respostaAnterior: null }

  const { error } = await supabaseServer().from('gerente_whatsapp_mensagens').insert({
    id: dados.id,
    telefone: normalizarTelefone(dados.telefone),
    texto: dados.texto,
  })

  if (!error) return { nova: true, respostaAnterior: null }

  // Já vista: devolve o que foi respondido antes, em vez de processar de novo.
  const { data } = await supabaseServer()
    .from('gerente_whatsapp_mensagens')
    .select('resposta')
    .eq('id', dados.id)
    .maybeSingle()
  return { nova: false, respostaAnterior: data?.resposta ? String(data.resposta) : null }
}

export async function marcarRespondida(id: string, resposta: string, traceId: string, erro?: string) {
  if (!supabaseConfigurado()) return
  await supabaseServer()
    .from('gerente_whatsapp_mensagens')
    .update({
      respondida_em: new Date().toISOString(),
      resposta: resposta.slice(0, 4000),
      trace_id: traceId,
      erro: erro ?? null,
    })
    .eq('id', id)
}

export interface EnvioNoWhatsapp {
  ok: boolean
  /** Por que não foi. Preenchido só na falha, e sempre acionável. */
  erro?: string
}

/**
 * Envia a resposta pela API do provedor.
 *
 * Escrita contra o formato da Cloud API da Meta, que é o padrão de fato.
 *
 * ELA DEVOLVE O MOTIVO DA FALHA, e isso não é preciosismo — é o conserto de um
 * defeito medido. A versão anterior devolvia um booleano e o comentário dizia
 * "quem chamou registra o erro"; nenhum dos cinco pontos de chamada olhava o
 * retorno. O efeito apareceu no primeiro teste real: a pergunta chegou, o
 * Gerente consultou o ERP, produziu a resposta certa, a entrega falhou — e a
 * mensagem foi gravada como RESPONDIDA, sem erro. Do lado de fora era um
 * assistente mudo; do lado de dentro, sucesso completo.
 *
 * Um contrato que só existe no comentário não é contrato. Agora o motivo volta
 * no tipo, e quem chama tem que decidir o que fazer com ele.
 */
export async function responderNoWhatsapp(
  telefone: string,
  texto: string,
): Promise<EnvioNoWhatsapp> {
  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_ID
  // A causa mais provável de silêncio, e a mais fácil de confundir com bug:
  // variável ausente no site. Dizer QUAL falta economiza a investigação.
  if (!token || !phoneId) {
    const faltando = [!token && 'WHATSAPP_TOKEN', !phoneId && 'WHATSAPP_PHONE_ID']
      .filter(Boolean)
      .join(' e ')
    console.error(`[whatsapp] não enviei: falta ${faltando} nas variáveis do site.`)
    return { ok: false, erro: `envio não configurado: falta ${faltando}` }
  }

  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizarTelefone(telefone),
        type: 'text',
        // O WhatsApp corta em 4096; cortar aqui com aviso é melhor que o
        // provedor cortar no meio de um número.
        text: {
          body: texto.length > 3900 ? `${texto.slice(0, 3900)}\n\n[resposta truncada]` : texto,
        },
      }),
    })
    if (!r.ok) {
      // O corpo da recusa da Meta é onde mora a resposta: token vencido,
      // destinatário fora da lista do número de teste, número não registrado.
      // Guardá-lo é a diferença entre corrigir em um minuto e adivinhar.
      const detalhe = (await r.text().catch(() => '')).slice(0, 400)
      console.error('[whatsapp] envio falhou:', r.status, detalhe)
      return { ok: false, erro: `provedor respondeu ${r.status}: ${detalhe}` }
    }
    return { ok: true }
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    console.error('[whatsapp] envio falhou na rede:', erro)
    return { ok: false, erro: `falha de rede no envio: ${erro}` }
  }
}
