'use server'

import { revalidatePath } from 'next/cache'

import { conjuntoDescadastrado, linkDeDescadastro } from '@/data/descadastro'
import { emailConfigurado, entregar } from '@/data/email'
import { lerModeloEmail } from '@/data/modelo-email'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { criarCupomYampi, lerCarrinhosYampi } from '@/data/yampi-crm'
import { aplicarSite, emailRecuperacao } from '@/domain'

/**
 * Como o cupom entra no envio: um código fixo já publicado, ou um código
 * ÚNICO por cliente, criado na Yampi na hora do envio — uso único, uma vez
 * por CPF, sem acumular, com validade curta. O único é o que faz o desconto
 * ser rastreável (o código diz de qual carrinho veio) e não vazar para
 * grupos de promoção.
 */
export type CupomEnvio =
  | { tipo: 'fixo'; codigo: string; pct: number }
  | { tipo: 'unico'; pct: number; validadeDias: number }

export interface ResultadoRecuperacao {
  /** E-mails que saíram, pelo nome (ou e-mail) de quem recebeu. */
  enviados: string[]
  /** Pulados por terem cancelado a inscrição — o pedido deles vale. */
  descadastrados: number
  /** Carrinhos pulados por já terem recebido e-mail nos últimos 7 dias. */
  jaContatados: number
  semEmail: number
  falhas: { quem: string; erro: string }[]
  /**
   * Carrinhos que o prazo desta rodada não alcançou. Um lote de centenas
   * não cabe numa execução só no servidor — a tela chama de novo com esta
   * lista até ela vir vazia, mostrando o progresso.
   */
  naoProcessados: string[]
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
/** Sufixo legível para o cupom único: sem 0/O/1/I/L, que se confundem. */
function sufixoCupom(): string {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += alfabeto[Math.floor(Math.random() * alfabeto.length)]
  return s
}

export async function enviarEmailsCarrinho(
  ids: string[],
  cupom: CupomEnvio | null,
  forcar = false,
  /** Tempo máximo de processamento desta chamada; o resto volta em naoProcessados. */
  prazoMs?: number,
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
  if (unicos.length > 1000) {
    return { ok: false, erro: 'Mais de 1.000 envios de uma vez — reduza o recorte.' }
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

  const resultado: ResultadoRecuperacao = {
    enviados: [],
    descadastrados: 0,
    jaContatados: 0,
    semEmail: 0,
    falhas: [],
    naoProcessados: [],
  }
  const agora = Date.now()
  const inicio = Date.now()
  const modelo = await lerModeloEmail('carrinho')
  // A lista de descadastro é lida UMA vez: uma consulta por destinatário
  // seriam mil idas ao banco, e é justamente o envio em massa que não pode
  // escapar do filtro.
  const fora = await conjuntoDescadastrado()

  for (let i = 0; i < unicos.length; i++) {
    // O prazo desta rodada acabou: devolve o resto para a tela continuar.
    if (prazoMs && Date.now() - inicio > prazoMs) {
      resultado.naoProcessados = unicos.slice(i)
      break
    }
    const id = unicos[i]
    const carrinho = carrinhos.find((c) => c.id === id)
    if (!carrinho) continue
    if (!carrinho.email) {
      resultado.semEmail++
      continue
    }
    if (fora.has(carrinho.email.trim().toLowerCase())) {
      // Quem pediu para sair não recebe nem com "forçar reenvio": o botão
      // existe para reenviar a quem não recebeu, não para furar o pedido de
      // alguém que cancelou a inscrição.
      resultado.descadastrados++
      continue
    }
    const ultimo = recentes.get(id)
    if (!forcar && ultimo && agora - ultimo < SETE_DIAS) {
      resultado.jaContatados++
      continue
    }

    // O cupom deste e-mail: o fixo vai como está; o único nasce na Yampi
    // AGORA — e se a Yampi recusar, o e-mail não sai, porque prometer um
    // código que não existe é pior que não enviar.
    let cupomDoEmail: { codigo: string; pct: number } | null = null
    if (cupom?.tipo === 'fixo') {
      cupomDoEmail = { codigo: cupom.codigo, pct: cupom.pct }
    } else if (cupom?.tipo === 'unico') {
      const codigo = `VOLTA${Math.round(cupom.pct)}-${sufixoCupom()}`
      const expiraEm = new Date(agora + cupom.validadeDias * 86_400_000).toLocaleDateString('sv', {
        timeZone: 'America/Sao_Paulo',
      })
      let tentativas = 0
      for (;;) {
        try {
          await criarCupomYampi({
            codigo,
            valor: cupom.pct,
            percentual: true,
            limite: 1,
            usoUnicoPorCliente: true,
            naoAcumula: true,
            expiraEm,
          })
          cupomDoEmail = { codigo, pct: cupom.pct }
          break
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          if (/429|Too Many/i.test(msg) && tentativas < 2) {
            tentativas++
            await pausa(30_000)
            continue
          }
          resultado.falhas.push({
            quem: carrinho.cliente ?? carrinho.email,
            erro: `cupom único não criado na Yampi (${msg}) — e-mail não enviado`,
          })
          break
        }
      }
      if (!cupomDoEmail) {
        await pausa(600)
        continue
      }
    }

    const { assunto, html } = emailRecuperacao(
      {
        nome: carrinho.cliente,
        itens: carrinho.itens,
        imagens: carrinho.imagens,
        valor: carrinho.valor,
        linkCheckout: carrinho.link ?? process.env.LOJA_URL ?? null,
        cupom: cupomDoEmail,
      },
      modelo,
    )
    // {site} é a URL deste ERP no ar — é dela que saem os ícones de /marca.
    const site = process.env.URL ?? process.env.LOJA_URL ?? ''
    const saida = linkDeDescadastro(carrinho.email, site)
    const htmlFinal = aplicarSite(html, site).split('{descadastrar}').join(saida)

    try {
      await entregar({ para: carrinho.email, assunto, html: htmlFinal, descadastrar: saida })
      resultado.enviados.push(carrinho.cliente ?? carrinho.email)
      if (sb) {
        await sb.from('recuperacoes_carrinho').insert({
          carrinho_id: id,
          email: carrinho.email,
          assunto,
          cupom: cupomDoEmail?.codigo ?? null,
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

