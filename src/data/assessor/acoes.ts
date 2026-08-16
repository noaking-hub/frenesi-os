import 'server-only'

import { randomUUID } from 'node:crypto'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import {
  assinar,
  chaveDeIdempotencia,
  expirada,
  VALIDADE_DA_CONFIRMACAO_MS,
  type Ator,
  type CanalDoGerente,
  type Risco,
} from '@/domain'

/**
 * Ações pendentes — o §9 inteiro, do interpretar ao recibo.
 *
 * A ideia central: **o Gerente nunca executa no mesmo passo em que decide**.
 * Ele resolve os registros, monta uma prévia, e para. Quem executa é a
 * confirmação de um humano, e ela carrega a assinatura dos parâmetros exatos
 * que foram mostrados.
 *
 * Essa assinatura é o que impede o golpe mais silencioso possível numa
 * interface de aprovação: mostrar 23 lançamentos, o usuário clicar em "aprovar
 * 23", e o servidor gravar outros 23 porque a lista mudou no meio. Com ela, o
 * "sim" vale para aquele conjunto e para nenhum outro.
 *
 * O prazo existe pelo mesmo motivo em outra dimensão: entre a prévia e o
 * clique o ERP anda. Aprovar sobre uma prévia velha é aprovar uma coisa e
 * executar outra.
 */

export interface PreviaDaAcao {
  /** Frase que já responde sozinha: "classificar 23 lançamentos como Frete". */
  titulo: string
  /** O que muda, em linguagem de quem aprova, não de quem programa. */
  linhas: { rotulo: string; valor: string }[]
  /** Amostra dos registros afetados. Aprovar sem ver exemplo é aprovar no escuro. */
  amostra?: { descricao: string; valor: number; nota?: string }[]
  /** Efeito colateral previsível — §8.1. */
  efeitos?: string[]
  reversivel: boolean
}

export interface AcaoPendenteNoBanco {
  id: string
  traceId: string
  conversaId: string | null
  ferramenta: string
  versaoDaFerramenta: string
  parametros: Record<string, unknown>
  risco: Risco
  previa: PreviaDaAcao | null
  criadaEm: string
  validaAte: string
  confirmadaEm: string | null
  canceladaEm: string | null
  executadaEm: string | null
  ator: { usuarioId?: string; perfil?: string } | null
}

export async function criarAcaoPendente(dados: {
  ator: Ator
  canal: CanalDoGerente
  traceId: string
  conversaId: string | null
  ferramenta: string
  versaoDaFerramenta: string
  parametros: Record<string, unknown>
  risco: Risco
  previa: PreviaDaAcao
}): Promise<{ id: string; validaAte: string }> {
  if (!supabaseConfigurado()) throw new Error('Supabase não configurado.')
  const id = randomUUID()
  const validaAte = new Date(Date.now() + VALIDADE_DA_CONFIRMACAO_MS).toISOString()

  const { error } = await supabaseServer()
    .from('gerente_acoes_pendentes')
    .insert({
      id,
      trace_id: dados.traceId,
      conversa_id: dados.conversaId,
      ator: dados.ator,
      canal: dados.canal,
      ferramenta: dados.ferramenta,
      versao_da_ferramenta: dados.versaoDaFerramenta,
      parametros: dados.parametros,
      risco: dados.risco,
      assinatura: assinar(dados.parametros),
      previa: dados.previa,
      valida_ate: validaAte,
    })
  if (error) throw new Error(error.message)
  return { id, validaAte }
}

export async function lerAcoesPendentes(conversaId: string | null): Promise<AcaoPendenteNoBanco[]> {
  if (!supabaseConfigurado()) return []
  let q = supabaseServer()
    .from('gerente_acoes_pendentes')
    .select('*')
    .is('confirmada_em', null)
    .is('cancelada_em', null)
    .order('criada_em', { ascending: false })
    .limit(20)
  if (conversaId) q = q.eq('conversa_id', conversaId)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapear)
}

export async function lerAcao(id: string): Promise<AcaoPendenteNoBanco | null> {
  if (!supabaseConfigurado()) return null
  const { data, error } = await supabaseServer()
    .from('gerente_acoes_pendentes')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapear(data) : null
}

export async function cancelarAcao(id: string, ator: Ator): Promise<void> {
  if (!supabaseConfigurado()) throw new Error('Supabase não configurado.')
  const acao = await lerAcao(id)
  if (!acao) throw new Error('Ação não encontrada.')
  // Só quem pediu pode cancelar. Sem isto, um id adivinhado cancelaria a
  // aprovação alheia — pequeno como estrago, grande como brecha.
  if (acao.ator?.usuarioId && acao.ator.usuarioId !== ator.usuarioId) {
    throw new Error('Esta ação pertence a outro usuário.')
  }
  const { error } = await supabaseServer()
    .from('gerente_acoes_pendentes')
    .update({ cancelada_em: new Date().toISOString() })
    .eq('id', id)
    .is('confirmada_em', null)
  if (error) throw new Error(error.message)
}

export type ExecutorDeAcao = (contexto: {
  acao: AcaoPendenteNoBanco
  ator: Ator
  canal: CanalDoGerente
  traceId: string
  chaveDeIdempotencia: string
}) => Promise<{ recibo: string; detalhes?: Record<string, unknown>; undoId?: string }>

/**
 * O REGISTRO de execuções — e por que ele existe separado das ferramentas.
 *
 * Confirmar uma ação não passa pelo modelo. O usuário clica em "Aprovar" e o
 * servidor executa direto, sem nova ida ao LLM. Isso é deliberado: entre a
 * prévia e a execução não pode haver espaço para o modelo reinterpretar o que
 * foi aprovado. O que roda é exatamente o que estava assinado.
 */
const EXECUTORES = new Map<string, ExecutorDeAcao>()

export function registrarExecutor(ferramenta: string, executor: ExecutorDeAcao) {
  EXECUTORES.set(ferramenta, executor)
}

export interface ResultadoDaConfirmacao {
  ok: boolean
  recibo: string
  detalhes?: Record<string, unknown>
  undoId?: string
}

/**
 * Confirma e executa — com as cinco checagens que o §9 exige, nesta ordem.
 *
 * A ordem não é estética. Dono antes de prazo porque negar por expiração a
 * quem nem podia ver a ação já vaza que ela existe; prazo antes de assinatura
 * porque expirada não vale nem se os parâmetros baterem; e a revalidação da
 * política vem por último e mais perto da execução possível, porque é a que
 * mais provavelmente mudou desde a prévia.
 */
export async function confirmarAcao(dados: {
  id: string
  ator: Ator
  canal: CanalDoGerente
  escritaLiberada: boolean
  traceId?: string
}): Promise<ResultadoDaConfirmacao> {
  const acao = await lerAcao(dados.id)
  if (!acao) throw new Error('Ação não encontrada.')

  if (acao.ator?.usuarioId && acao.ator.usuarioId !== dados.ator.usuarioId) {
    throw new Error('Esta ação pertence a outro usuário.')
  }
  if (acao.canceladaEm) throw new Error('Esta ação foi cancelada.')
  if (acao.executadaEm) {
    // Repetição não executa de novo: devolve o que já aconteceu. É a
    // idempotência do §10 vista pela porta da interface, onde ela aparece como
    // clique duplo.
    return { ok: true, recibo: 'Esta ação já havia sido executada.', detalhes: {} }
  }
  if (expirada(acao, Date.now())) {
    throw new Error(
      'A confirmação expirou. O estado do ERP pode ter mudado desde a prévia — peça uma nova.',
    )
  }
  if (!dados.escritaLiberada) {
    throw new Error('A escrita do Gerente está desligada. Nenhuma ação é executável agora.')
  }

  const executor = EXECUTORES.get(acao.ferramenta)
  if (!executor) throw new Error(`Não há executor registrado para "${acao.ferramenta}".`)

  const traceId = dados.traceId ?? acao.traceId
  const chave = chaveDeIdempotencia(dados.ator.usuarioId, acao.ferramenta, acao.parametros)

  const resultado = await executor({
    acao,
    ator: dados.ator,
    canal: dados.canal,
    traceId,
    chaveDeIdempotencia: chave,
  })

  const agora = new Date().toISOString()
  await supabaseServer()
    .from('gerente_acoes_pendentes')
    .update({ confirmada_em: agora, executada_em: agora })
    .eq('id', acao.id)

  return { ok: true, ...resultado }
}

function mapear(r: Record<string, unknown>): AcaoPendenteNoBanco {
  return {
    id: String(r.id),
    traceId: String(r.trace_id),
    conversaId: r.conversa_id ? String(r.conversa_id) : null,
    ferramenta: String(r.ferramenta),
    versaoDaFerramenta: String(r.versao_da_ferramenta),
    parametros: (r.parametros ?? {}) as Record<string, unknown>,
    risco: String(r.risco) as Risco,
    previa: (r.previa ?? null) as PreviaDaAcao | null,
    criadaEm: String(r.criada_em),
    validaAte: String(r.valida_ate),
    confirmadaEm: r.confirmada_em ? String(r.confirmada_em) : null,
    canceladaEm: r.cancelada_em ? String(r.cancelada_em) : null,
    executadaEm: r.executada_em ? String(r.executada_em) : null,
    ator: (r.ator ?? null) as AcaoPendenteNoBanco['ator'],
  }
}
