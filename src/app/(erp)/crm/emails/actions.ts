'use server'

import { revalidatePath } from 'next/cache'

import { emailConfigurado, entregar } from '@/data/email'
import { gravarModeloEmail, type ChaveModelo } from '@/data/modelo-email'
import { aplicarSite, emailGiftback, emailRecuperacao } from '@/domain'
import type { ModeloEmailRecuperacao } from '@/domain'

/**
 * Dados de exemplo com produtos REAIS do catálogo da loja, fotos incluídas
 * (CDN da própria loja) — o teste tem que parecer um envio de verdade, não
 * um mostruário de casos.
 */
const ITENS_EXEMPLO = [
  '1× 1 Million Elixir Masculino Eau de Parfum (Decant) · 5 ml',
  '1× Sauvage Elixir Eau de Parfum (Decant) · 10 ml',
]
const FOTOS_EXEMPLO = [
  'https://cdn.shopify.com/s/files/1/0998/2889/1957/files/1-million-elixir-masculino-eau-de-parfum-decant-7330761.png?v=1780590250',
  'https://cdn.shopify.com/s/files/1/0998/2889/1957/files/sauvage-elixir-eau-de-parfum-decant-7141591.png?v=1780590669',
]

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
              itens: ITENS_EXEMPLO,
              imagens: FOTOS_EXEMPLO,
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
