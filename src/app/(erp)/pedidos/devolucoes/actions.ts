'use server'

import { revalidatePath } from 'next/cache'

import { avisarDevolucaoAprovada, avisarDevolucaoConcluida } from '@/data/notificacoes'
import { mensagemDe } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import type { StatusSolicitacao, VarianteMl } from '@/domain'

export type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

function exigeSupabase(acao: string) {
  return supabaseConfigurado()
    ? null
    : { ok: false as const, erro: `O Supabase precisa estar configurado para ${acao}.` }
}

/** Move a devolução no fluxo. O reverso só é gravado quando informado. */
export async function moverSolicitacao(
  protocolo: string,
  status: StatusSolicitacao,
  nota = '',
  reverso = '',
): Promise<Resposta> {
  const bloqueio = exigeSupabase('mover devoluções')
  if (bloqueio) return bloqueio

  const { error } = await supabaseServer().rpc('mover_solicitacao_devolucao', {
    p_protocolo: protocolo,
    p_status: status,
    p_nota: nota,
    p_reverso: reverso,
  })
  if (error) {
    console.error('[devolucoes] mover_solicitacao_devolucao falhou:', error)
    return { ok: false, erro: mensagemDe(error) }
  }

  // Reverso recém-gerado dispara o e-mail de aprovação — pronto, mas atrás da
  // trava AVISOS_DE_PEDIDO; desligado, o fato só entra no log.
  if (status === 'Aguardando postagem' && reverso.trim()) {
    await avisarDevolucaoAprovada(protocolo)
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Registra o volume medido de cada item recebido.
 *
 * É a medição que decide se a devolução é aceita — não o que o cliente
 * declarou. Por isso ela entra só por aqui, com o pacote na bancada, e nunca
 * pelo portal.
 */
export async function conferirDevolucao(
  protocolo: string,
  itens: { perfume: string; variante: VarianteMl; medidoMl: number; observacao: string }[],
  lacre: string,
): Promise<Resposta> {
  const bloqueio = exigeSupabase('registrar a conferência')
  if (bloqueio) return bloqueio
  if (itens.length === 0) return { ok: false, erro: 'Informe ao menos um item medido.' }

  const { error } = await supabaseServer().rpc('conferir_devolucao', {
    p_protocolo: protocolo,
    p_itens: itens.map((i) => ({
      perfume: i.perfume,
      variante: i.variante,
      medido_ml: i.medidoMl,
      observacao: i.observacao,
    })),
    p_lacre: lacre,
  })
  if (error) {
    console.error('[devolucoes] conferir_devolucao falhou:', error)
    return { ok: false, erro: mensagemDe(error) }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

const TIPOS_DE_COMPROVANTE = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])
const TAMANHO_MAXIMO_COMPROVANTE = 8 * 1024 * 1024

/**
 * Conclui a devolução com PROVA.
 *
 * O reembolso é executado manualmente pela operação (no banco ou no gateway —
 * decisão do dono); aqui fica o registro: resolução, valor, forma, data e o
 * comprovante no bucket. É o que a ficha, o portal e o e-mail do cliente
 * mostram — "Concluída" deixa de ser um carimbo sem lastro.
 */
export async function concluirDevolucao(form: FormData): Promise<Resposta> {
  const bloqueio = exigeSupabase('concluir devoluções')
  if (bloqueio) return bloqueio

  const protocolo = String(form.get('protocolo') ?? '')
  const resolucao = String(form.get('resolucao') ?? '')
  const forma = String(form.get('forma') ?? '')
  const valorBruto = String(form.get('valor') ?? '').replace(/\./g, '').replace(',', '.')
  const trocaPedido = String(form.get('trocaPedido') ?? '').trim().slice(0, 40)
  const comprovante = form.get('comprovante')

  if (!protocolo) return { ok: false, erro: 'Protocolo ausente.' }
  if (!resolucao) return { ok: false, erro: 'Escolha a resolução.' }

  const ehReembolso = resolucao.toLowerCase().includes('reembolso')
  const ehTroca = resolucao.toLowerCase().includes('troca')

  let valor: number | null = null
  if (ehReembolso) {
    valor = Number(valorBruto)
    if (!valorBruto || !Number.isFinite(valor) || valor <= 0) {
      return { ok: false, erro: 'Informe o valor reembolsado.' }
    }
    if (forma !== 'pix' && forma !== 'estorno-cartao') {
      return { ok: false, erro: 'Informe a forma do reembolso (Pix ou estorno no cartão).' }
    }
  }
  if (ehTroca && !trocaPedido) {
    return { ok: false, erro: 'Informe o número do novo pedido da troca.' }
  }

  const sb = supabaseServer()

  // Comprovante primeiro: se o upload falhar, nada foi concluído ainda e o
  // operador tenta de novo — o contrário deixaria a conclusão sem a prova.
  let caminhoComprovante: string | null = null
  if (comprovante instanceof File && comprovante.size > 0) {
    if (!TIPOS_DE_COMPROVANTE.has(comprovante.type)) {
      return { ok: false, erro: 'O comprovante precisa ser PDF ou imagem.' }
    }
    if (comprovante.size > TAMANHO_MAXIMO_COMPROVANTE) {
      return { ok: false, erro: 'O comprovante pode ter no máximo 8 MB.' }
    }
    const extensao =
      comprovante.type === 'application/pdf'
        ? 'pdf'
        : (comprovante.name.split('.').pop()?.toLowerCase() ?? 'jpg')
    caminhoComprovante = `${protocolo}/comprovante.${extensao}`
    const { error: erroUpload } = await sb.storage
      .from('devolucoes')
      .upload(caminhoComprovante, comprovante, { contentType: comprovante.type, upsert: true })
    if (erroUpload) {
      console.error('[devolucoes] upload do comprovante falhou:', erroUpload)
      return { ok: false, erro: 'Não foi possível guardar o comprovante. Tente de novo.' }
    }
  }

  const { error } = await sb
    .from('solicitacoes_devolucao')
    .update({
      status: 'Concluída',
      resolucao,
      reembolso_valor: valor,
      reembolso_forma: ehReembolso ? forma : null,
      reembolso_em: ehReembolso ? new Date().toISOString() : null,
      comprovante_reembolso: caminhoComprovante,
      troca_pedido_id: ehTroca ? trocaPedido : null,
      atualizada_em: new Date().toISOString(),
    })
    .eq('protocolo', protocolo)
  if (error) {
    console.error('[devolucoes] conclusão falhou:', error)
    return { ok: false, erro: mensagemDe(error) }
  }

  // E-mail de conclusão (com o comprovante em anexo) — pronto, atrás da
  // trava AVISOS_DE_PEDIDO; desligado, o fato só entra no log.
  await avisarDevolucaoConcluida(protocolo)

  revalidatePath('/', 'layout')
  return { ok: true }
}
