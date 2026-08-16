import 'server-only'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

/**
 * Leitura da auditoria e das métricas do Gerente — §12 e §27.
 *
 * As agregações vivem em VIEW no banco, e não aqui, pelo mesmo motivo que
 * governa o resto do módulo: cálculo oficial pertence ao ERP. Se esta camada
 * somasse tokens por conta própria, existiriam dois custos possíveis para o
 * mesmo mês, e ninguém saberia qual olhar.
 */

export interface MetricaDoDia {
  dia: string
  canal: string
  interacoes: number
  comErro: number
  truncadas: number
  duracaoMediaMs: number | null
  duracaoMaximaMs: number | null
  tokensEntrada: number | null
  tokensSaida: number | null
  ferramentasPorInteracao: number | null
}

export interface UsoDaFerramenta {
  ferramenta: string
  modo: string
  chamadas: number
  falhas: number
  bloqueadas: number
  msMedio: number | null
  msMaximo: number | null
  ultimaVez: string | null
}

export interface InteracaoAuditada {
  id: number
  traceId: string | null
  criadaEm: string
  canal: string | null
  pergunta: string | null
  resposta: string | null
  ferramentas: { nome: string; modo?: string; ms?: number; erro?: string; bloqueio?: string }[]
  modelo: string | null
  parouPor: string | null
  escritaLiberada: boolean | null
  tokensEntrada: number | null
  tokensSaida: number | null
  duracaoMs: number | null
  erro: string | null
  ator: { usuarioId?: string; perfil?: string; permissoes?: string[]; empresaId?: string } | null
}

export interface PainelDeAuditoria {
  metricas: MetricaDoDia[]
  ferramentas: UsoDaFerramenta[]
  interacoes: InteracaoAuditada[]
  /** Somatórios do período mostrado, para os indicadores do topo. */
  resumo: {
    interacoes: number
    comErro: number
    truncadas: number
    tokensEntrada: number
    tokensSaida: number
    duracaoMediaMs: number | null
  }
  semBanco: boolean
}

const VAZIO: PainelDeAuditoria = {
  metricas: [],
  ferramentas: [],
  interacoes: [],
  resumo: { interacoes: 0, comErro: 0, truncadas: 0, tokensEntrada: 0, tokensSaida: 0, duracaoMediaMs: null },
  semBanco: true,
}

export async function carregarAuditoriaDoGerente(dias = 30): Promise<PainelDeAuditoria> {
  if (!supabaseConfigurado()) return VAZIO
  const sb = supabaseServer()
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()

  const [m, f, i] = await Promise.all([
    sb.from('gerente_metricas_por_dia').select('*').limit(120),
    sb.from('gerente_uso_das_ferramentas').select('*').limit(40),
    sb
      .from('assessor_auditoria')
      .select(
        'id, trace_id, criada_em, canal, pergunta, resposta, ferramentas, modelo, parou_por, escrita_liberada, tokens_entrada, tokens_saida, duracao_ms, erro, ator',
      )
      .gte('criada_em', desde)
      .order('criada_em', { ascending: false })
      .limit(40),
  ])

  const metricas: MetricaDoDia[] = (m.data ?? []).map((r) => ({
    dia: String(r.dia),
    canal: String(r.canal),
    interacoes: Number(r.interacoes ?? 0),
    comErro: Number(r.com_erro ?? 0),
    truncadas: Number(r.truncadas ?? 0),
    duracaoMediaMs: r.duracao_media_ms == null ? null : Number(r.duracao_media_ms),
    duracaoMaximaMs: r.duracao_maxima_ms == null ? null : Number(r.duracao_maxima_ms),
    tokensEntrada: r.tokens_entrada == null ? null : Number(r.tokens_entrada),
    tokensSaida: r.tokens_saida == null ? null : Number(r.tokens_saida),
    ferramentasPorInteracao:
      r.ferramentas_por_interacao == null ? null : Number(r.ferramentas_por_interacao),
  }))

  // O resumo é dos dias mostrados. A duração média é ponderada por interação,
  // e não a média das médias: um dia com uma pergunta pesaria igual a um dia
  // com cinquenta, e a leitura sairia errada justamente nos dias movimentados.
  const totalInteracoes = metricas.reduce((a, d) => a + d.interacoes, 0)
  const somaDuracao = metricas.reduce((a, d) => a + (d.duracaoMediaMs ?? 0) * d.interacoes, 0)

  return {
    metricas,
    ferramentas: (f.data ?? []).map((r) => ({
      ferramenta: String(r.ferramenta),
      modo: String(r.modo ?? '—'),
      chamadas: Number(r.chamadas ?? 0),
      falhas: Number(r.falhas ?? 0),
      bloqueadas: Number(r.bloqueadas ?? 0),
      msMedio: r.ms_medio == null ? null : Number(r.ms_medio),
      msMaximo: r.ms_maximo == null ? null : Number(r.ms_maximo),
      ultimaVez: r.ultima_vez ? String(r.ultima_vez) : null,
    })),
    interacoes: (i.data ?? []).map((r) => ({
      id: Number(r.id),
      traceId: r.trace_id ? String(r.trace_id) : null,
      criadaEm: String(r.criada_em),
      canal: r.canal ? String(r.canal) : null,
      pergunta: r.pergunta ? String(r.pergunta) : null,
      resposta: r.resposta ? String(r.resposta) : null,
      ferramentas: Array.isArray(r.ferramentas) ? r.ferramentas : [],
      modelo: r.modelo ? String(r.modelo) : null,
      parouPor: r.parou_por ? String(r.parou_por) : null,
      escritaLiberada: r.escrita_liberada == null ? null : Boolean(r.escrita_liberada),
      tokensEntrada: r.tokens_entrada == null ? null : Number(r.tokens_entrada),
      tokensSaida: r.tokens_saida == null ? null : Number(r.tokens_saida),
      duracaoMs: r.duracao_ms == null ? null : Number(r.duracao_ms),
      erro: r.erro ? String(r.erro) : null,
      ator: (r.ator as InteracaoAuditada['ator']) ?? null,
    })),
    resumo: {
      interacoes: totalInteracoes,
      comErro: metricas.reduce((a, d) => a + d.comErro, 0),
      truncadas: metricas.reduce((a, d) => a + d.truncadas, 0),
      tokensEntrada: metricas.reduce((a, d) => a + (d.tokensEntrada ?? 0), 0),
      tokensSaida: metricas.reduce((a, d) => a + (d.tokensSaida ?? 0), 0),
      duracaoMediaMs: totalInteracoes > 0 ? Math.round(somaDuracao / totalInteracoes) : null,
    },
    semBanco: false,
  }
}
