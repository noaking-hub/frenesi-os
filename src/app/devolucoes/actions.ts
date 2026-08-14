'use server'

import { repositorio } from '@/data/repository'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { MOTIVOS, ehDanificado, fotosCompletas, statusDevolucao } from '@/domain'
import type { MotivoDevolucao, Pedido, TipoSolicitacao } from '@/domain'

/**
 * Busca os pedidos do cliente pelo e-mail ou CPF informado no passo 1.
 *
 * A elegibilidade NÃO é decidida aqui: o portal aplica `statusDevolucao` sobre
 * os dias desde a entrega, a mesma função que o ERP usa. Assim o cliente e o
 * operador nunca veem prazos diferentes para o mesmo pedido.
 */
export async function buscarPedidos(
  metodo: 'email' | 'cpf',
  identificacao: string,
): Promise<Pedido[]> {
  const alvo =
    metodo === 'cpf'
      ? identificacao.replace(/\D/g, '')
      : identificacao.trim().toLowerCase()

  if (!alvo) return []

  const pedidos = await repositorio().pedidos()

  return pedidos
    .filter((p) => (metodo === 'cpf' ? p.cpf === alvo : p.email.toLowerCase() === alvo))
    .sort((a, b) => b.id.localeCompare(a.id))
}

const TIPOS_DE_IMAGEM = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])
const TAMANHO_MAXIMO = 8 * 1024 * 1024

function extensaoDe(arquivo: File): string {
  const daExtensao = arquivo.name.split('.').pop()?.toLowerCase()
  if (daExtensao && /^[a-z0-9]{2,5}$/.test(daExtensao)) return daExtensao
  return arquivo.type.split('/')[1] ?? 'jpg'
}

/**
 * Abre a devolução de verdade — protocolo do banco e fotos no bucket.
 *
 * Chega por FormData porque agora carrega ARQUIVOS: as fotos do nível e do
 * lacre sobem para um bucket privado e a triagem do ERP as vê por URL
 * assinada — acabou o "confirmo que tirei a foto" com o arquivo preso no
 * celular do cliente.
 *
 * A elegibilidade é reconferida AQUI, no servidor: o endpoint é público, e a
 * checagem do navegador é cortesia de interface, não segurança.
 */
export async function abrirDevolucao(
  form: FormData,
): Promise<{ ok: true; protocolo: string } | { ok: false; erro: string }> {
  if (!supabaseConfigurado()) {
    return {
      ok: false,
      erro: 'Não foi possível registrar a solicitação agora. Tente novamente em alguns minutos.',
    }
  }

  const pedidoId = String(form.get('pedidoId') ?? '')
  const motivo = String(form.get('motivo') ?? '') as MotivoDevolucao | ''
  const comentario = String(form.get('comentario') ?? '').slice(0, 2000)
  const itens = form.getAll('item').map(String).filter(Boolean)

  if (!pedidoId) return { ok: false, erro: 'Escolha o pedido.' }
  if (!itens.length) return { ok: false, erro: 'Escolha ao menos um item.' }
  if (!motivo || !MOTIVOS.some((m) => m.id === motivo)) {
    return { ok: false, erro: 'Informe o motivo da devolução.' }
  }

  // Fotos: nível sempre; lacre dispensado só quando o frasco chegou
  // danificado — a MESMA regra da tela (`fotosCompletas`).
  const arquivoNivel = form.get('fotoNivel')
  const arquivoLacre = form.get('fotoLacre')
  const fotos = {
    nivel: arquivoNivel instanceof File && arquivoNivel.size > 0,
    lacre: arquivoLacre instanceof File && arquivoLacre.size > 0,
  }
  if (!fotosCompletas(motivo, fotos)) {
    return { ok: false, erro: 'Envie as fotos obrigatórias antes de concluir.' }
  }
  for (const arquivo of [arquivoNivel, arquivoLacre]) {
    if (!(arquivo instanceof File) || arquivo.size === 0) continue
    if (!TIPOS_DE_IMAGEM.has(arquivo.type)) {
      return { ok: false, erro: 'As fotos precisam ser imagens (JPG, PNG, WEBP ou HEIC).' }
    }
    if (arquivo.size > TAMANHO_MAXIMO) {
      return { ok: false, erro: 'Cada foto pode ter no máximo 8 MB.' }
    }
  }

  const sb = supabaseServer()

  // Reconferência de prazo no servidor, com o mesmo relógio das telas:
  // entrega real e, na falta dela, a prometida no checkout.
  const { data: pedido, error: erroPedido } = await sb
    .from('pedidos')
    .select('id, situacao, entregue_em, entrega_prevista_em')
    .eq('id', pedidoId)
    .maybeSingle()
  if (erroPedido || !pedido) {
    return { ok: false, erro: 'Pedido não encontrado. Confira e tente de novo.' }
  }
  const base =
    (pedido.entregue_em as string | null) ??
    (pedido.situacao === 'entregue' ? (pedido.entrega_prevista_em as string | null) : null)
  const dias = base ? Math.floor((Date.now() - Date.parse(base)) / 86_400_000) : null
  if (!statusDevolucao(dias).elegivel) {
    return {
      ok: false,
      erro: 'Este pedido está fora do prazo de devolução. Fale com o atendimento.',
    }
  }

  const rotulo = MOTIVOS.find((m) => m.id === motivo)
  // O tipo decide a régua da triagem: em arrependimento, volume abaixo do
  // mínimo bloqueia; em defeito e erro de envio a perda é esperada. m2 é
  // "recebi produto diferente" (erro de envio) e m4 é "volume abaixo do que
  // comprei" (defeito de envase) — mapear qualquer um deles como
  // arrependimento faria a triagem recusar cliente com razão.
  const tipo: TipoSolicitacao = ehDanificado(motivo)
    ? 'Defeito'
    : motivo === 'm2'
      ? 'Erro de envio'
      : motivo === 'm4'
        ? 'Defeito'
        : 'Arrependimento'

  const { data, error } = await sb.rpc('abrir_solicitacao_devolucao', {
    p_pedido_id: pedidoId,
    p_tipo: tipo,
    p_motivo: rotulo?.label ?? '',
    p_comentario: comentario,
    p_itens: itens,
    p_fotos: fotos,
  })

  if (error) {
    console.error('[portal] abrir_solicitacao_devolucao falhou:', error)
    // A mensagem crua do banco é interna; o cliente recebe o que dá para agir.
    return {
      ok: false,
      erro: 'Não foi possível registrar a solicitação. Fale com a gente pelo e-mail de contato.',
    }
  }

  const protocolo = String(data)

  // Upload DEPOIS do protocolo existir: o caminho carrega o protocolo, e uma
  // falha aqui não desfaz a solicitação — a foto pode ser reapresentada na
  // análise, o registro não.
  const subir = async (arquivo: unknown, nome: 'nivel' | 'lacre') => {
    if (!(arquivo instanceof File) || arquivo.size === 0) return null
    const caminho = `${protocolo}/${nome}.${extensaoDe(arquivo)}`
    const { error: erroUpload } = await sb.storage
      .from('devolucoes')
      .upload(caminho, arquivo, { contentType: arquivo.type, upsert: true })
    if (erroUpload) {
      console.error(`[portal] upload da foto ${nome} de ${protocolo} falhou:`, erroUpload)
      return null
    }
    return caminho
  }
  const [caminhoNivel, caminhoLacre] = await Promise.all([
    subir(arquivoNivel, 'nivel'),
    subir(arquivoLacre, 'lacre'),
  ])
  if (caminhoNivel || caminhoLacre) {
    await sb
      .from('solicitacoes_devolucao')
      .update({ foto_nivel: caminhoNivel, foto_lacre: caminhoLacre })
      .eq('protocolo', protocolo)
  }

  return { ok: true, protocolo }
}
