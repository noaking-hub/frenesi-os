import 'server-only'

import {
  MODELO_CASHBACK_PADRAO,
  MODELO_ENVIO_PADRAO,
  MODELO_GIFT_PADRAO,
  MODELO_PADRAO,
  type ModeloEmailRecuperacao,
} from '@/domain'

import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * Os modelos de e-mail da marca vivem numa tabela, um por chave: texto
 * editável pela tela não pode exigir deploy. Sem linha gravada, vale o
 * padrão do domínio — a tela nunca abre vazia.
 */

export type ChaveModelo = 'carrinho' | 'giftback' | 'cashback' | 'envio'

const PADROES: Record<ChaveModelo, ModeloEmailRecuperacao> = {
  carrinho: MODELO_PADRAO,
  giftback: MODELO_GIFT_PADRAO,
  cashback: MODELO_CASHBACK_PADRAO,
  envio: MODELO_ENVIO_PADRAO,
}

export async function lerModeloEmail(chave: ChaveModelo): Promise<ModeloEmailRecuperacao> {
  if (!supabaseConfigurado()) return PADROES[chave]
  const { data } = await supabaseServer()
    .from('modelos_email')
    .select('assunto, titulo, mensagem, texto_botao, html')
    .eq('chave', chave)
    .maybeSingle()
  if (!data) return PADROES[chave]
  return {
    assunto: data.assunto,
    titulo: data.titulo,
    mensagem: data.mensagem,
    textoBotao: data.texto_botao,
    html: data.html ?? null,
  }
}

export async function gravarModeloEmail(chave: ChaveModelo, m: ModeloEmailRecuperacao): Promise<void> {
  if (!supabaseConfigurado()) {
    throw new Error('O Supabase precisa estar configurado para salvar o modelo.')
  }
  const { error } = await supabaseServer().from('modelos_email').upsert({
    chave,
    assunto: m.assunto,
    titulo: m.titulo,
    mensagem: m.mensagem,
    texto_botao: m.textoBotao,
    html: m.html?.trim() ? m.html : null,
    atualizado_em: new Date().toISOString(),
  })
  if (error) throw error
}
