import 'server-only'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import type { Severidade } from '@/domain'

/**
 * Os alertas persistidos pela vigília — §4.6.
 *
 * A diferença entre esta tabela e a fila calculada da Central é a memória. A
 * fila responde "o que está errado agora"; os alertas respondem "o que está
 * errado agora, desde quando, e o que você já disse que sabia". Sem a segunda,
 * o sistema não distingue problema novo de problema conhecido — e um aviso que
 * repete todo dia é um aviso que se aprende a ignorar.
 */

export interface Alerta {
  id: number
  chave: string
  severidade: Severidade
  titulo: string
  impactoFinanceiro: number | null
  impactoOperacional: string | null
  urgencia: string | null
  responsavel: string | null
  proximaAcao: { texto: string; href: string } | null
  confianca: { nivel: string; motivo: string } | null
  detectadoEm: string
  resolvidoEm: string | null
  silenciadoAte: string | null
  ocorrencias: number
  ultimaVez: string
}

export interface PainelDeAlertas {
  abertos: Alerta[]
  silenciados: Alerta[]
  resolvidos: Alerta[]
  ultimaVigilia: string | null
}

export async function carregarAlertas(): Promise<PainelDeAlertas> {
  if (!supabaseConfigurado()) {
    return { abertos: [], silenciados: [], resolvidos: [], ultimaVigilia: null }
  }

  const [{ data }, { data: rodadas }] = await Promise.all([
    supabaseServer()
      .from('gerente_alertas')
      .select('*')
      .order('detectado_em', { ascending: false })
      .limit(120),
    supabaseServer()
      .from('sincronizacoes')
      .select('executada_em')
      .eq('origem', 'gerente')
      .order('id', { ascending: false })
      .limit(1),
  ])

  const todos = (data ?? []).map(mapear)
  const agora = Date.now()
  const silenciado = (a: Alerta) => a.silenciadoAte !== null && new Date(a.silenciadoAte).getTime() > agora

  return {
    // Um alerta silenciado que ainda está aberto NÃO some da conta: ele sai da
    // lista principal e vai para a sua, com a data em que volta. Silenciar é
    // adiar, não resolver, e a tela precisa dizer a diferença.
    abertos: todos.filter((a) => !a.resolvidoEm && !silenciado(a)),
    silenciados: todos.filter((a) => !a.resolvidoEm && silenciado(a)),
    resolvidos: todos.filter((a) => a.resolvidoEm).slice(0, 25),
    ultimaVigilia: rodadas?.[0]?.executada_em ? String(rodadas[0].executada_em) : null,
  }
}

/**
 * Silencia por um prazo.
 *
 * Com prazo, e nunca "para sempre": um problema que ninguém quer ver nunca mais
 * é um problema que deveria ter sido resolvido ou desligado como regra — e as
 * duas coisas são decisões maiores que um clique em "não mostrar".
 */
export async function silenciarAlerta(chave: string, dias: number, por: string): Promise<void> {
  if (!supabaseConfigurado()) throw new Error('Supabase não configurado.')
  const ate = new Date(Date.now() + Math.min(90, Math.max(1, dias)) * 86_400_000).toISOString()
  const { error } = await supabaseServer()
    .from('gerente_alertas')
    .update({ silenciado_ate: ate, silenciado_por: por, visto_em: new Date().toISOString() })
    .eq('chave', chave)
  if (error) throw new Error(error.message)
}

export async function reativarAlerta(chave: string): Promise<void> {
  if (!supabaseConfigurado()) throw new Error('Supabase não configurado.')
  const { error } = await supabaseServer()
    .from('gerente_alertas')
    .update({ silenciado_ate: null, silenciado_por: null })
    .eq('chave', chave)
  if (error) throw new Error(error.message)
}

function mapear(r: Record<string, unknown>): Alerta {
  return {
    id: Number(r.id),
    chave: String(r.chave),
    severidade: String(r.severidade) as Severidade,
    titulo: String(r.titulo),
    impactoFinanceiro: r.impacto_financeiro == null ? null : Number(r.impacto_financeiro),
    impactoOperacional: r.impacto_operacional ? String(r.impacto_operacional) : null,
    urgencia: r.urgencia ? String(r.urgencia) : null,
    responsavel: r.responsavel ? String(r.responsavel) : null,
    proximaAcao: (r.proxima_acao ?? null) as Alerta['proximaAcao'],
    confianca: (r.confianca ?? null) as Alerta['confianca'],
    detectadoEm: String(r.detectado_em),
    resolvidoEm: r.resolvido_em ? String(r.resolvido_em) : null,
    silenciadoAte: r.silenciado_ate ? String(r.silenciado_ate) : null,
    ocorrencias: Number(r.ocorrencias ?? 1),
    ultimaVez: String(r.ultima_vez ?? r.detectado_em),
  }
}
