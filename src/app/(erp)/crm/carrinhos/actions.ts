'use server'

import { revalidatePath } from 'next/cache'

import { emailConfigurado, entregar } from '@/data/email'
import { gravarModeloEmail, lerModeloEmail } from '@/data/modelo-email'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { lerCarrinhosYampi } from '@/data/yampi-crm'
import { emailRecuperacao, type ModeloEmailRecuperacao } from '@/domain'

export interface ResultadoRecuperacao {
  /** E-mails que saíram, pelo nome (ou e-mail) de quem recebeu. */
  enviados: string[]
  /** Carrinhos pulados por já terem recebido e-mail nos últimos 7 dias. */
  jaContatados: number
  semEmail: number
  falhas: { quem: string; erro: string }[]
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))
const SETE_DIAS = 7 * 24 * 60 * 60 * 1000

/**
 * Envia o e-mail de recuperação da MARCA para os carrinhos escolhidos.
 *
 * Quem já recebeu nos últimos 7 dias é pulado — recuperação vira spam na
 * segunda mensagem em cima da primeira, e spam queima o remetente inteiro.
 * `forcar` existe para o reenvio deliberado de UM carrinho.
 */
export async function enviarEmailsCarrinho(
  ids: string[],
  cupom: { codigo: string; pct: number } | null,
  forcar = false,
): Promise<{ ok: true; resultado: ResultadoRecuperacao } | { ok: false; erro: string }> {
  if (!emailConfigurado()) {
    return {
      ok: false,
      erro:
        'O envio de e-mail ainda não está configurado. Crie uma conta gratuita em resend.com, ' +
        'verifique o domínio da loja lá, e adicione no .env.local e na Netlify: RESEND_API_KEY ' +
        'e EMAIL_REMETENTE (ex.: "FRENESI <oi@seudominio.com.br>"). Opcional: EMAIL_RESPONDER_PARA ' +
        'para onde vão as respostas, e LOJA_URL para o botão do e-mail quando o carrinho não ' +
        'traz link próprio.',
    }
  }
  const unicos = [...new Set(ids)].filter(Boolean)
  if (unicos.length === 0) return { ok: false, erro: 'Nenhum carrinho para contatar.' }
  if (unicos.length > 200) {
    return { ok: false, erro: 'Mais de 200 envios de uma vez — reduza o recorte.' }
  }

  let carrinhos
  try {
    carrinhos = (await lerCarrinhosYampi()).carrinhos
  } catch (e) {
    return { ok: false, erro: `A Yampi não respondeu a leitura de carrinhos: ${e instanceof Error ? e.message : String(e)}` }
  }

  // O que já foi contatado, para não insistir.
  const recentes = new Map<string, number>()
  const sb = supabaseConfigurado() ? supabaseServer() : null
  if (sb) {
    const { data } = await sb
      .from('recuperacoes_carrinho')
      .select('carrinho_id, enviado_em')
      .in('carrinho_id', unicos)
    for (const r of data ?? []) {
      const quando = new Date(r.enviado_em as string).getTime()
      recentes.set(r.carrinho_id as string, Math.max(recentes.get(r.carrinho_id as string) ?? 0, quando))
    }
  }

  const resultado: ResultadoRecuperacao = { enviados: [], jaContatados: 0, semEmail: 0, falhas: [] }
  const agora = Date.now()
  const modelo = await lerModeloEmail()

  for (const id of unicos) {
    const carrinho = carrinhos.find((c) => c.id === id)
    if (!carrinho) continue
    if (!carrinho.email) {
      resultado.semEmail++
      continue
    }
    const ultimo = recentes.get(id)
    if (!forcar && ultimo && agora - ultimo < SETE_DIAS) {
      resultado.jaContatados++
      continue
    }

    const { assunto, html } = emailRecuperacao(
      {
        nome: carrinho.cliente,
        itens: carrinho.itens,
        valor: carrinho.valor,
        linkCheckout: carrinho.link ?? process.env.LOJA_URL ?? null,
        cupom,
      },
      modelo,
    )

    try {
      await entregar({ para: carrinho.email, assunto, html })
      resultado.enviados.push(carrinho.cliente ?? carrinho.email)
      if (sb) {
        await sb.from('recuperacoes_carrinho').insert({
          carrinho_id: id,
          email: carrinho.email,
          assunto,
          cupom: cupom?.codigo ?? null,
        })
      }
    } catch (e) {
      resultado.falhas.push({
        quem: carrinho.cliente ?? carrinho.email,
        erro: e instanceof Error ? e.message : String(e),
      })
    }
    // Meio segundo entre envios: o limite do Resend é por segundo, e a
    // recuperação não tem pressa que justifique estourar.
    await pausa(600)
  }

  revalidatePath('/crm/carrinhos')
  return { ok: true, resultado }
}

/** Salva os textos do modelo — a próxima leva de e-mails já sai com eles. */
export async function salvarModeloEmail(
  m: ModeloEmailRecuperacao,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const campos = [m.assunto, m.titulo, m.mensagem, m.textoBotao]
  if (campos.some((c) => !c || !c.trim())) {
    return { ok: false, erro: 'Assunto, título, mensagem e texto do botão não podem ficar vazios.' }
  }
  try {
    await gravarModeloEmail({
      assunto: m.assunto.trim(),
      titulo: m.titulo.trim(),
      mensagem: m.mensagem.trim(),
      textoBotao: m.textoBotao.trim(),
    })
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
  revalidatePath('/crm/carrinhos')
  return { ok: true }
}
