import 'server-only'

import type { CustoPorMeio, LinhaExtrato, LinhaExtratoBruta, OrigemExtrato } from '@/domain'

import { mensagemDe } from './shopify'
import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * Leitura e gravação do extrato — a parte que fala com o banco de dados.
 *
 * O que decide o significado de cada linha está em `src/domain/extrato.ts`,
 * puro e testado. Aqui só se guarda e se lê.
 */

interface LinhaCrua {
  origem: string
  chave: string
  conta_id: string
  conta_nome?: string
  ocorrido_em: string
  descricao: string
  contraparte: string
  documento: string
  tipo: string
  valor: number | string
  pedido_id: string | null
  lancamento_id: string | null
  ignorado: boolean
  motivo_ignorado: string
  interno?: boolean
  contas_bancarias?: { nome: string } | null
}

function traduzir(l: LinhaCrua): LinhaExtrato {
  return {
    origem: l.origem as OrigemExtrato,
    chave: l.chave,
    contaId: l.conta_id,
    contaNome: l.conta_nome ?? l.contas_bancarias?.nome ?? l.conta_id,
    ocorridoEm: l.ocorrido_em,
    descricao: l.descricao,
    contraparte: l.contraparte,
    documento: l.documento,
    tipo: l.tipo === 'saida' ? 'saida' : 'entrada',
    valor: Number(l.valor),
    pedidoId: l.pedido_id,
    lancamentoId: l.lancamento_id,
    ignorado: l.ignorado,
    motivoIgnorado: l.motivo_ignorado,
    interno: Boolean(l.interno),
  }
}

export interface FiltroExtrato {
  /**
   * 'a-decidir' traz só o que exige alguém olhando: saída sem categoria e
   * entrada sem pedido casado. Crédito de venda já conciliado não entra —
   * ele não tem categoria a escolher nem saldo a mover.
   */
  situacao?: 'a-decidir' | 'todas'
  contaId?: string
  /** AAAA-MM-DD, inclusivos. */
  de?: string
  ate?: string
  tipo?: 'entrada' | 'saida'
  /** Texto livre: descrição, contraparte, documento ou pedido. */
  busca?: string
  limite?: number
}

/**
 * Texto seguro para o `or` do PostgREST.
 *
 * Vírgula e parêntese são sintaxe de filtro ali, não conteúdo: um cliente
 * chamado "Souza, Maria" quebraria a consulta inteira e a tela mostraria um
 * erro incompreensível em vez de resultado.
 */
function textoDeBusca(bruto: string): string {
  return bruto.trim().replace(/[,()*%]/g, ' ').replace(/\s+/g, ' ').slice(0, 60)
}

export interface PaginaExtrato {
  linhas: LinhaExtrato[]
  /** Quantas linhas o filtro encontrou ao todo, além das que couberam. */
  total: number
}

export async function lerExtrato(filtro: FiltroExtrato = {}): Promise<PaginaExtrato> {
  if (!supabaseConfigurado()) return { linhas: [], total: 0 }
  const sb = supabaseServer()
  const limite = filtro.limite ?? 300

  const aDecidir = filtro.situacao !== 'todas'

  let consulta = aDecidir
    ? sb
        .from('extrato_a_decidir')
        .select(
          'origem, chave, conta_id, conta_nome, ocorrido_em, descricao, contraparte, documento, ' +
            'tipo, valor, pedido_id, lancamento_id, ignorado, motivo_ignorado, interno',
          { count: 'exact' },
        )
        .limit(limite)
    : sb
        .from('extrato_linhas')
        .select(
          'origem, chave, conta_id, ocorrido_em, descricao, contraparte, documento, tipo, valor, ' +
            'pedido_id, lancamento_id, ignorado, motivo_ignorado, interno, contas_bancarias(nome)',
          { count: 'exact' },
        )
        .order('ocorrido_em', { ascending: false })
        .order('valor', { ascending: false })
        .limit(limite)

  if (filtro.contaId) consulta = consulta.eq('conta_id', filtro.contaId)
  if (filtro.de) consulta = consulta.gte('ocorrido_em', filtro.de)
  if (filtro.ate) consulta = consulta.lte('ocorrido_em', filtro.ate)
  if (filtro.tipo) consulta = consulta.eq('tipo', filtro.tipo)

  const busca = filtro.busca ? textoDeBusca(filtro.busca) : ''
  if (busca) {
    consulta = consulta.or(
      ['descricao', 'contraparte', 'documento', 'pedido_id']
        .map((c) => `${c}.ilike.%${busca}%`)
        .join(','),
    )
  }

  const { data, error, count } = await consulta
  if (error) throw new Error(mensagemDe(error))
  return {
    linhas: ((data ?? []) as unknown as LinhaCrua[]).map(traduzir),
    total: count ?? (data ?? []).length,
  }
}

export interface ResumoDoExtrato {
  linhas: number
  entradas: number
  saidas: number
  saldo: number
  /** Créditos de venda já ligados a um pedido — nada a decidir neles. */
  conciliadas: number
  aDecidir: number
}

/**
 * Números do extrato inteiro.
 *
 * A tela lista só o que precisa de decisão; os totais são de tudo. Trazer as
 * 349 linhas para somar duas colunas seria desperdício que só cresce, então a
 * soma acontece no banco.
 */
export async function resumoDoExtrato(): Promise<ResumoDoExtrato> {
  const vazio: ResumoDoExtrato = {
    linhas: 0,
    entradas: 0,
    saidas: 0,
    saldo: 0,
    conciliadas: 0,
    aDecidir: 0,
  }
  if (!supabaseConfigurado()) return vazio

  const { data, error } = await supabaseServer().from('extrato_resumo').select('*').single()
  if (error) throw new Error(mensagemDe(error))
  if (!data) return vazio

  const entradas = Number(data.entradas)
  const saidas = Number(data.saidas)
  return {
    linhas: Number(data.linhas),
    entradas,
    saidas,
    saldo: Math.round((entradas - saidas) * 100) / 100,
    conciliadas: Number(data.conciliadas),
    aDecidir: Number(data.a_decidir),
  }
}

export interface ConferenciaConta {
  id: string
  nome: string
  banco: string
  /** O saldo que vale: informado pelo gateway quando existe. */
  saldo: number
  /** Saldo que a própria conta informou. Null quando ela não informa. */
  saldoInformado: number | null
  /** O que a nossa leitura soma — parcial, falta o que sai sem ser pagamento. */
  movimentoLido: number
  /** Soma do que o extrato mostra, classificado ou não. */
  saldoExtrato: number
  aClassificar: number
  linhasLidas: number
  ultimaLeitura: string | null
}

/**
 * Saldo do ERP contra o movimento do extrato, por conta.
 *
 * A diferença entre as duas colunas é a fila de classificação. Mostrá-la lado
 * a lado é o que impede a descoberta tardia de que o ERP estava um mês atrás
 * do banco.
 */
export async function conferenciaDeContas(): Promise<ConferenciaConta[]> {
  if (!supabaseConfigurado()) return []
  const { data, error } = await supabaseServer()
    .from('contas_conferencia')
    .select('*')
    .order('nome')
  if (error) throw new Error(mensagemDe(error))

  return (data ?? []).map((c) => ({
    id: c.id as string,
    nome: c.nome as string,
    banco: (c.banco as string) ?? '',
    saldo: Number(c.saldo),
    saldoInformado: c.saldo_informado === null ? null : Number(c.saldo_informado),
    movimentoLido: Number(c.movimento_lido),
    saldoExtrato: Number(c.saldo_extrato),
    aClassificar: Number(c.a_classificar),
    linhasLidas: Number(c.linhas_lidas),
    ultimaLeitura: (c.ultima_leitura as string) ?? null,
  }))
}

/**
 * Quando o extrato foi lido pela última vez.
 *
 * Serve para a tela decidir sozinha se precisa atualizar ao abrir. É a
 * diferença entre um extrato que se mantém em dia e um que depende de alguém
 * lembrar de clicar — e quem esquece de clicar não descobre que esqueceu: a
 * tela mostra números plausíveis do jeito que estavam ontem.
 */
export async function ultimaAtualizacao(): Promise<string | null> {
  if (!supabaseConfigurado()) return null
  const { data } = await supabaseServer()
    .from('relatorios_importados')
    .select('importado_em')
    .order('importado_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.importado_em as string) ?? null
}

export interface ResultadoImportacao {
  novas: number
  repetidas: number
}

/** Grava linhas lidas de qualquer origem. Reimportar não duplica. */
export async function gravarLinhas(
  origem: OrigemExtrato,
  contaId: string,
  linhas: LinhaExtratoBruta[],
): Promise<ResultadoImportacao> {
  const sb = supabaseServer()
  let novas = 0
  let repetidas = 0

  for (let i = 0; i < linhas.length; i += 200) {
    const { data, error } = await sb.rpc('importar_extrato', {
      p_origem: origem,
      p_conta_id: contaId,
      p_linhas: linhas.slice(i, i + 200),
    })
    if (error) throw new Error(mensagemDe(error))
    const r = (data ?? {}) as { novas?: number; repetidas?: number }
    novas += Number(r.novas ?? 0)
    repetidas += Number(r.repetidas ?? 0)
  }

  return { novas, repetidas }
}

/**
 * Custo real de receber, por meio de pagamento.
 *
 * Sai da tarifa que o gateway informou em cada pagamento, nunca de tabela
 * digitada: quando a taxa mudar, este número muda junto, sem ninguém precisar
 * lembrar de atualizar nada.
 */
export async function custoPorMeio(): Promise<CustoPorMeio[]> {
  if (!supabaseConfigurado()) return []
  const { data, error } = await supabaseServer().from('custo_recebimento_por_meio').select('*')
  if (error) throw new Error(mensagemDe(error))

  return (data ?? []).map((m) => ({
    meio: m.meio as string,
    vendas: Number(m.vendas),
    bruto: Number(m.bruto),
    tarifa: Number(m.tarifa),
    pct: Number(m.pct),
    fatia: Number(m.fatia),
  }))
}

// ── Regras de categoria ────────────────────────────────────────────────────

export interface RegraCategoria {
  id: string
  padrao: string
  categoria: string
}

export async function lerRegrasCategoria(): Promise<RegraCategoria[]> {
  if (!supabaseConfigurado()) return []
  const { data, error } = await supabaseServer()
    .from('regras_categoria')
    .select('id, padrao, categoria')
    .order('criado_em')
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: String(r.id),
    padrao: String(r.padrao),
    categoria: String(r.categoria),
  }))
}
