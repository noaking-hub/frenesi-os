'use server'

import { revalidatePath } from 'next/cache'

import { emailConfigurado, entregar } from '@/data/email'
import { gravarModeloEmail, type ChaveModelo } from '@/data/modelo-email'
import { aplicarSite, emailGiftback, emailRecuperacao } from '@/domain'
import type { ModeloEmailRecuperacao } from '@/domain'

/**
 * Foto real do catálogo para o teste mostrar a linha de item COM imagem —
 * ao lado de uma sem, que mostra o comportamento quando a Yampi não manda.
 */
const FOTO_EXEMPLO =
  'https://www.frenesiperfumes.com.br/cdn/shop/files/088_eros-masculino-eau-de-parfum-decant-_eros-eau-de-parfum-2790tu7i1c-personalizado-padrao-luxo.png?v=1778676473&width=120'

/** Salva um modelo da Central de E-mails — o próximo envio já sai com ele. */
export async function salvarModelo(
  chave: ChaveModelo,
  m: ModeloEmailRecuperacao,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!m.assunto?.trim()) return { ok: false, erro: 'O assunto não pode ficar vazio.' }
  const html = m.html?.trim() ?? ''
  if (!html && [m.titulo, m.mensagem, m.textoBotao].some((c) => !c || !c.trim())) {
    return { ok: false, erro: 'Título, mensagem e texto do botão não podem ficar vazios na moldura da marca.' }
  }
  if (chave === 'carrinho' && html && !/\{itens\}/.test(html)) {
    return {
      ok: false,
      erro: 'O HTML precisa conter {itens} — sem ele o cliente recebe um e-mail de carrinho sem os produtos.',
    }
  }
  try {
    await gravarModeloEmail(chave, {
      assunto: m.assunto.trim(),
      titulo: m.titulo.trim(),
      mensagem: m.mensagem.trim(),
      textoBotao: m.textoBotao.trim(),
      html: html || null,
    })
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
  revalidatePath('/crm/emails')
  revalidatePath('/crm/carrinhos')
  return { ok: true }
}

/**
 * Envia o modelo COMO ESTÁ NO EDITOR (mesmo sem salvar) para um e-mail de
 * teste, com os dados de exemplo da prévia. É a validação final: a prévia
 * mostra o HTML, o teste mostra como Gmail e Outlook o tratam de verdade.
 */
export async function enviarTeste(
  chave: ChaveModelo,
  m: ModeloEmailRecuperacao,
  para: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!/.+@.+\..+/.test(para.trim())) return { ok: false, erro: 'Informe um e-mail válido.' }
  if (!emailConfigurado()) {
    return { ok: false, erro: 'Configure RESEND_API_KEY e EMAIL_REMETENTE para enviar testes.' }
  }
  try {
    const r =
      chave === 'giftback'
        ? emailGiftback(
            { nome: 'Marina Fontes', cupom: { codigo: 'NIVER15-TESTE1', pct: 15 }, validadeDias: 7, lojaUrl: process.env.LOJA_URL ?? 'https://frenesiperfumes.com.br' },
            m,
          )
        : emailRecuperacao(
            {
              nome: 'Marina Fontes',
              itens: ['1× Baccarat Rouge 540 (Decant) · 5 ml', '1× Sauvage Elixir (Decant) · 10 ml'],
              imagens: [FOTO_EXEMPLO, null],
              valor: 189.8,
              linkCheckout: process.env.LOJA_URL ?? 'https://frenesiperfumes.com.br',
              cupom: { codigo: 'VOLTA10-TESTE1', pct: 10 },
            },
            m,
          )
    await entregar({
      para: para.trim(),
      assunto: `[TESTE] ${r.assunto}`,
      html: aplicarSite(r.html, process.env.URL ?? process.env.LOJA_URL ?? ''),
    })
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
  return { ok: true }
}
