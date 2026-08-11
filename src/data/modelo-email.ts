import 'server-only'

import { MODELO_PADRAO, type ModeloEmailRecuperacao } from '@/domain'

import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * O modelo do e-mail de recuperação vive numa linha do banco: texto editável
 * pela tela não pode exigir deploy. Sem linha gravada, vale o padrão do
 * domínio — a tela nunca abre vazia.
 */

export async function lerModeloEmail(): Promise<ModeloEmailRecuperacao> {
  if (!supabaseConfigurado()) return MODELO_PADRAO
  const { data } = await supabaseServer()
    .from('modelo_email_recuperacao')
    .select('assunto, titulo, mensagem, texto_botao, html')
    .maybeSingle()
  if (!data) return MODELO_PADRAO
  return {
    assunto: data.assunto,
    titulo: data.titulo,
    mensagem: data.mensagem,
    textoBotao: data.texto_botao,
    html: data.html ?? null,
  }
}

export async function gravarModeloEmail(m: ModeloEmailRecuperacao): Promise<void> {
  if (!supabaseConfigurado()) {
    throw new Error('O Supabase precisa estar configurado para salvar o modelo.')
  }
  const { error } = await supabaseServer().from('modelo_email_recuperacao').upsert({
    id: true,
    assunto: m.assunto,
    titulo: m.titulo,
    mensagem: m.mensagem,
    texto_botao: m.textoBotao,
    html: m.html?.trim() ? m.html : null,
    atualizado_em: new Date().toISOString(),
  })
  if (error) throw error
}
