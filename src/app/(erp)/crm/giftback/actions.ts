'use server'

import { revalidatePath } from 'next/cache'

import { estaDescadastrado, linkDeDescadastro } from '@/data/descadastro'
import { emailConfigurado, entregar } from '@/data/email'
import { lerModeloEmail } from '@/data/modelo-email'
import { gravarAniversario, importarAniversariosYampi, registrarGiftback } from '@/data/giftback'
import { criarCupomYampi } from '@/data/yampi-crm'
import { aplicarSite, emailGiftback } from '@/domain'

type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

export async function salvarAniversario(email: string, aniversario: string): Promise<Resposta> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(aniversario)) {
    return { ok: false, erro: 'Data inválida.' }
  }
  try {
    await gravarAniversario(email, aniversario)
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
  revalidatePath('/crm/giftback')
  return { ok: true }
}

export async function importarDaYampi(): Promise<Resposta<{ atualizados: number; lidos: number }>> {
  try {
    const r = await importarAniversariosYampi()
    revalidatePath('/crm/giftback')
    return { ok: true, ...r }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

/** Marca como parabenizado sem e-mail — quando o parabéns foi no WhatsApp. */
export async function marcarParabenizado(email: string): Promise<Resposta> {
  try {
    await registrarGiftback({ email, cupom: null, canal: 'whatsapp' })
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
  revalidatePath('/crm/giftback')
  return { ok: true }
}

/**
 * O presente completo: cria o cupom ÚNICO na Yampi (NIVER{pct}-XXXXXX, uso
 * único, por CPF, sem acumular, com validade) e envia o e-mail de parabéns.
 * O registro por (email, ano) garante um presente por aniversário.
 */
export async function enviarPresente(dados: {
  email: string
  nome: string
  pct: number
  validadeDias: number
}): Promise<Resposta<{ cupom: string }>> {
  if (!emailConfigurado()) {
    return {
      ok: false,
      erro: 'Configure o envio de e-mail (RESEND_API_KEY e EMAIL_REMETENTE) — o mesmo da recuperação de carrinho.',
    }
  }
  const pct = Math.max(1, Math.min(90, Math.round(dados.pct)))
  const validade = Math.max(1, Math.round(dados.validadeDias))
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let sufixo = ''
  for (let i = 0; i < 6; i++) sufixo += alfabeto[Math.floor(Math.random() * alfabeto.length)]
  const codigo = `NIVER${pct}-${sufixo}`
  const expiraEm = new Date(Date.now() + validade * 86_400_000).toLocaleDateString('sv', {
    timeZone: 'America/Sao_Paulo',
  })

  try {
    await criarCupomYampi({
      codigo,
      valor: pct,
      percentual: true,
      limite: 1,
      usoUnicoPorCliente: true,
      naoAcumula: true,
      expiraEm,
    })
    // Aniversário é marketing: quem cancelou a inscrição não recebe. Aqui é
    // um envio por vez, então a consulta pontual basta.
    if (await estaDescadastrado(dados.email)) {
      return { ok: false, erro: 'Este cliente cancelou a inscrição nos e-mails da marca.' }
    }
    const modelo = await lerModeloEmail('giftback')
    const { assunto, html } = emailGiftback(
      {
        nome: dados.nome,
        cupom: { codigo, pct },
        validadeDias: validade,
        lojaUrl: process.env.LOJA_URL ?? null,
      },
      modelo,
    )
    const site = process.env.URL ?? process.env.LOJA_URL ?? ''
    const saida = linkDeDescadastro(dados.email, site)
    await entregar({
      para: dados.email,
      assunto,
      html: aplicarSite(html, site).split('{descadastrar}').join(saida),
      descadastrar: saida,
    })
    await registrarGiftback({ email: dados.email, cupom: codigo, canal: 'email' })
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
  revalidatePath('/crm/giftback')
  return { ok: true, cupom: codigo }
}
