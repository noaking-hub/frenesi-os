'use server'

import { repositorio } from '@/data/repository'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { MOTIVOS, ehDanificado } from '@/domain'
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

/**
 * Abre a devolução de verdade.
 *
 * Até aqui o portal terminava mostrando um protocolo escrito no código — o
 * mesmo "DEV-1042" para todo cliente. Quem chegava ao fim saía achando que
 * tinha aberto uma devolução, e do outro lado não havia nada. O protocolo
 * agora vem do banco, e é por ele que a operação encontra o caso.
 */
export async function abrirDevolucao(dados: {
  pedidoId: string
  motivo: MotivoDevolucao | ''
  itens: string[]
  comentario: string
  fotos: { nivel: boolean; lacre: boolean }
}): Promise<{ ok: true; protocolo: string } | { ok: false; erro: string }> {
  if (!supabaseConfigurado()) {
    return {
      ok: false,
      erro: 'Não foi possível registrar a solicitação agora. Tente novamente em alguns minutos.',
    }
  }
  if (!dados.itens.length) return { ok: false, erro: 'Escolha ao menos um item.' }
  if (!dados.motivo) return { ok: false, erro: 'Informe o motivo da devolução.' }

  const rotulo = MOTIVOS.find((m) => m.id === dados.motivo)
  const tipo: TipoSolicitacao = ehDanificado(dados.motivo)
    ? 'Defeito'
    : dados.motivo === 'm3'
      ? 'Erro de envio'
      : 'Arrependimento'

  const { data, error } = await supabaseServer().rpc('abrir_solicitacao_devolucao', {
    p_pedido_id: dados.pedidoId,
    p_tipo: tipo,
    p_motivo: rotulo?.label ?? '',
    p_comentario: dados.comentario,
    p_itens: dados.itens,
    p_fotos: dados.fotos,
  })

  if (error) {
    console.error('[portal] abrir_solicitacao_devolucao falhou:', error)
    // A mensagem crua do banco é interna; o cliente recebe o que dá para agir.
    return {
      ok: false,
      erro: 'Não foi possível registrar a solicitação. Fale com a gente pelo e-mail de contato.',
    }
  }

  return { ok: true, protocolo: String(data) }
}
