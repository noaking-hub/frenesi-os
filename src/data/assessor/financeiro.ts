import 'server-only'

import { supabaseConfigurado, supabaseServer, tudoDe } from '@/data/supabase'
import {
  chaveDoMovimento,
  resumirLote,
  sugerirEmLote,
  type Ator,
  type CanalDoGerente,
  type ClassificacaoAnterior,
  type MovimentoParaClassificar,
  type RegraDeClassificacao,
  type Sugestao,
} from '@/domain'

import { lerConfiguracaoDoGerente } from './politica'

/**
 * A camada de dados da categorização assistida — Fase 3.
 *
 * Ela LÊ e ENTREGA; quem decide é `src/domain/classificacao.ts`. A separação
 * não é gosto: é o que permite provar por teste que conflito de regra
 * interrompe, sem precisar de banco — e é o que garante que a regra vale igual
 * no chat, na tela e no WhatsApp, porque os três chamam a mesma função pura.
 *
 * A escrita não passa por aqui em SQL solto: ela chama a função do banco, que
 * grava o dado e a auditoria na mesma transação. Um update daqui deixaria a
 * janela em que o lançamento mudou e a mutação não foi registrada.
 */

interface LinhaDeLancamento {
  id: string
  descricao: string
  favorecido: string | null
  tipo: 'entrada' | 'saida'
  valor: number | string
  categoria_id: string | null
  categoria: string | null
  transferencia_id: string | null
  pedido_id: string | null
  competencia: string
  conta_id: string | null
  ocorrido_em: string | null
}

export async function lerRegrasDeClassificacao(): Promise<RegraDeClassificacao[]> {
  if (!supabaseConfigurado()) return []
  const { data, error } = await supabaseServer()
    .from('regras_categoria')
    .select('id, padrao, categoria, categoria_id, ativa, prioridade, tipo')
    .order('prioridade', { ascending: false })
  if (error) throw new Error(error.message)

  // Regra sem `categoria_id` fica FORA: ela existe no banco mas não sabe para
  // onde apontar. Deixá-la participar significaria classificar para um id
  // inventado, que é pior do que não classificar.
  return (data ?? [])
    .filter((r) => r.categoria_id)
    .map((r) => ({
      id: String(r.id),
      padrao: String(r.padrao),
      categoriaId: String(r.categoria_id),
      categoria: String(r.categoria),
      ativa: r.ativa !== false,
      prioridade: Number(r.prioridade ?? 0),
      tipo: (r.tipo ?? null) as 'entrada' | 'saida' | null,
    }))
}

/**
 * O histórico que ensina.
 *
 * Só lançamentos JÁ classificados, e só os campos que formam a chave. Trazer o
 * resto seria carregar o financeiro inteiro em memória para responder uma
 * pergunta sobre contraparte.
 */
export async function lerHistoricoDeClassificacao(): Promise<ClassificacaoAnterior[]> {
  if (!supabaseConfigurado()) return []
  const linhas = await tudoDe<{
    descricao: string
    favorecido: string | null
    tipo: 'entrada' | 'saida'
    categoria_id: string
    categoria: string
  }>('lancamentos', (de, ate) =>
    supabaseServer()
      .from('lancamentos')
      .select('descricao, favorecido, tipo, categoria_id, categoria')
      .not('categoria_id', 'is', null)
      .is('cancelado_em', null)
      .is('transferencia_id', null)
      .range(de, ate) as unknown as PromiseLike<{ data: never[] | null; error: unknown }>,
  )

  return linhas.map((l) => ({
    chave: chaveDoMovimento({
      descricao: l.descricao,
      favorecido: l.favorecido,
      tipo: l.tipo,
    }),
    categoriaId: String(l.categoria_id),
    categoria: String(l.categoria),
  }))
}

export type MovimentoDaFila = MovimentoParaClassificar & {
  ocorridoEm: string | null
  contaId: string | null
}

export async function lerMovimentosSemCategoria(limite = 200): Promise<MovimentoDaFila[]> {
  if (!supabaseConfigurado()) return []
  const { data, error } = await supabaseServer()
    .from('lancamentos')
    .select(
      'id, descricao, favorecido, tipo, valor, categoria_id, categoria, transferencia_id, pedido_id, competencia, conta_id, ocorrido_em',
    )
    .is('categoria_id', null)
    .is('cancelado_em', null)
    .order('competencia', { ascending: false })
    .limit(Math.min(500, Math.max(1, limite)))
  if (error) throw new Error(error.message)

  return (data ?? []).map((l: LinhaDeLancamento) => ({
    id: String(l.id),
    descricao: String(l.descricao),
    favorecido: l.favorecido ? String(l.favorecido) : null,
    tipo: l.tipo,
    valor: Number(l.valor),
    transferenciaId: l.transferencia_id ? String(l.transferencia_id) : null,
    pedidoId: l.pedido_id ? String(l.pedido_id) : null,
    // Contexto para a fila: sem data e conta, a linha é uma frase solta —
    // ninguém classifica "Compra paga pela conta" sem saber quando e por onde.
    ocorridoEm: l.ocorrido_em ? String(l.ocorrido_em) : null,
    contaId: l.conta_id ? String(l.conta_id) : null,
  }))
}

export interface AnaliseDeClassificacao {
  sugestoes: (Sugestao & {
    descricao: string
    valor: number
    tipo: 'entrada' | 'saida'
    quando: string | null
    conta: string | null
    favorecido: string | null
    /**
     * Falso só para transferência entre contas próprias e crédito de venda —
     * classificá-los contaria o mesmo dinheiro duas vezes. "Sem sugestão" NÃO
     * é o mesmo que isso: movimento sem histórico se classifica à mão.
     */
    classificavel: boolean
  })[]
  resumo: ReturnType<typeof resumirLote>
  politica: { modo: string; limiar: number; tetoValor: number; escritaLiberada: boolean }
}

/**
 * Analisa a fila de movimentos sem categoria e devolve o que fazer com cada um.
 *
 * Nada aqui grava. É a prévia do §8.1 — quantidade, dinheiro, categorias
 * afetadas e o motivo de cada sugestão — e existe justamente para o "aprovar
 * tudo" deixar de ser um clique no escuro.
 */
export async function analisarLancamentos(limite = 200): Promise<AnaliseDeClassificacao> {
  const [movimentos, regras, historico, config] = await Promise.all([
    lerMovimentosSemCategoria(limite),
    lerRegrasDeClassificacao(),
    lerHistoricoDeClassificacao(),
    lerConfiguracaoDoGerente(),
  ])

  const brutas = sugerirEmLote(movimentos, regras, historico)
  const porId = new Map(movimentos.map((m) => [m.id, m]))

  // O teto de valor é aplicado AQUI e não no domínio porque é política, não
  // regra de negócio: movimento grande vai para revisão mesmo com confiança
  // máxima, porque errar nele custa mais para descobrir e mais para desfazer.
  const sugestoes = brutas.map((s) => {
    const m = porId.get(s.movimentoId)
    const acimaDoTeto = (m?.valor ?? 0) > config.tetoValorAutomatico
    return {
      ...s,
      exigeRevisao: s.exigeRevisao || acimaDoTeto,
      motivo: acimaDoTeto
        ? `${s.motivo} Valor acima do teto de automação (R$ ${config.tetoValorAutomatico.toFixed(2)}): exige confirmação.`
        : s.motivo,
      descricao: m?.descricao ?? '',
      valor: m?.valor ?? 0,
      tipo: m?.tipo ?? ('saida' as const),
      quando: m?.ocorridoEm ?? null,
      conta: m?.contaId ?? null,
      favorecido: m?.favorecido ?? null,
      classificavel: !m?.transferenciaId && !m?.pedidoId,
    }
  })

  const valores = new Map(movimentos.map((m) => [m.id, m.valor]))
  return {
    sugestoes,
    resumo: resumirLote(sugestoes, valores, {
      modo: config.modoAutonomia,
      limiar: config.limiarConfianca,
    }),
    politica: {
      modo: config.modoAutonomia,
      limiar: config.limiarConfianca,
      tetoValor: config.tetoValorAutomatico,
      escritaLiberada: config.escritaLiberada,
    },
  }
}

export interface ResultadoDaClassificacao {
  aplicados: number
  ignorados: number
  batchId: string
  categoria: string
}

/**
 * Grava a classificação — pela função do banco, nunca por update solto.
 *
 * `chaveBase` é a idempotência: derivada do ator, da ferramenta e dos
 * parâmetros exatos, ela faz o retry colidir em vez de classificar duas vezes.
 */
export async function classificarLancamentos(dados: {
  ids: string[]
  categoriaId: string
  ator: Ator
  canal: CanalDoGerente
  traceId: string
  conversaId: string | null
  confirmacao: 'explicita' | 'reforcada' | 'autonomia'
  chaveBase: string
  regra?: string | null
  confianca?: number | null
}): Promise<ResultadoDaClassificacao> {
  if (!supabaseConfigurado()) throw new Error('Supabase não configurado.')
  const { data, error } = await supabaseServer().rpc('classificar_lancamentos_do_gerente', {
    p_ids: dados.ids,
    p_categoria_id: dados.categoriaId,
    p_ator: dados.ator,
    p_canal: dados.canal,
    p_trace_id: dados.traceId,
    p_conversa_id: dados.conversaId,
    p_confirmacao: dados.confirmacao,
    p_chave_base: dados.chaveBase,
    p_regra: dados.regra ?? null,
    p_confianca: dados.confianca ?? null,
  })
  if (error) throw new Error(error.message)
  const linha = Array.isArray(data) ? data[0] : data
  return {
    aplicados: Number(linha?.aplicados ?? 0),
    ignorados: Number(linha?.ignorados ?? 0),
    batchId: String(linha?.batch_id ?? ''),
    categoria: String(linha?.categoria ?? ''),
  }
}

export async function desfazerClassificacao(dados: {
  batchId: string
  ator: Ator
  canal: CanalDoGerente
  traceId: string
}): Promise<number> {
  if (!supabaseConfigurado()) throw new Error('Supabase não configurado.')
  const { data, error } = await supabaseServer().rpc('desfazer_classificacao_do_gerente', {
    p_batch_id: dados.batchId,
    p_ator: dados.ator,
    p_canal: dados.canal,
    p_trace_id: dados.traceId,
  })
  if (error) throw new Error(error.message)
  const linha = Array.isArray(data) ? data[0] : data
  return Number(linha?.revertidos ?? 0)
}

export async function criarRegraDeClassificacao(dados: {
  padrao: string
  categoriaId: string
  tipo: 'entrada' | 'saida' | null
  prioridade: number
  ator: Ator
  traceId: string
  observacao?: string
}): Promise<{ id: string; categoria: string; casariam: number }> {
  if (!supabaseConfigurado()) throw new Error('Supabase não configurado.')
  const sb = supabaseServer()

  const { data: cat, error: erroCat } = await sb
    .from('categorias_financeiras')
    .select('id, nome')
    .eq('id', dados.categoriaId)
    .eq('ativa', true)
    .maybeSingle()
  if (erroCat) throw new Error(erroCat.message)
  if (!cat) throw new Error(`Categoria "${dados.categoriaId}" não existe ou está inativa.`)

  const { data, error } = await sb
    .from('regras_categoria')
    .insert({
      padrao: dados.padrao.trim(),
      categoria: cat.nome,
      categoria_id: cat.id,
      tipo: dados.tipo,
      prioridade: dados.prioridade,
      ativa: true,
      criada_por: dados.ator.usuarioId,
      trace_id: dados.traceId,
      observacao: dados.observacao ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  // Quantos movimentos em aberto a regra pegaria HOJE. É a informação que
  // transforma "criar regra" numa decisão informada: uma regra que casa com
  // trezentos lançamentos é outra conversa, e quem aprova precisa saber antes.
  const movimentos = await lerMovimentosSemCategoria(500)
  const alvo = dados.padrao.trim().toLowerCase()
  const casariam = movimentos.filter(
    (m) =>
      (!dados.tipo || dados.tipo === m.tipo) &&
      `${m.descricao} ${m.favorecido ?? ''}`.toLowerCase().includes(alvo),
  ).length

  return { id: String(data.id), categoria: String(cat.nome), casariam }
}

export async function lerCategoriasAtivas(): Promise<{ id: string; nome: string; natureza: string }[]> {
  if (!supabaseConfigurado()) return []
  const { data, error } = await supabaseServer()
    .from('categorias_financeiras')
    .select('id, nome, natureza_gerencial')
    .eq('ativa', true)
    .order('nome')
  if (error) throw new Error(error.message)
  return (data ?? []).map((c) => ({
    id: String(c.id),
    nome: String(c.nome),
    natureza: String(c.natureza_gerencial),
  }))
}
