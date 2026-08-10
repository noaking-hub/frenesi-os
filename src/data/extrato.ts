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
  }
}

export interface FiltroExtrato {
  /** 'pendentes' esconde o que já virou lançamento ou foi dispensado. */
  situacao?: 'pendentes' | 'todas'
  contaId?: string
  limite?: number
}

export async function lerExtrato(filtro: FiltroExtrato = {}): Promise<LinhaExtrato[]> {
  if (!supabaseConfigurado()) return []
  const sb = supabaseServer()
  const limite = filtro.limite ?? 300

  let consulta = sb
    .from('extrato_linhas')
    .select(
      'origem, chave, conta_id, ocorrido_em, descricao, contraparte, documento, tipo, valor, ' +
        'pedido_id, lancamento_id, ignorado, motivo_ignorado, contas_bancarias(nome)',
    )
    .order('ocorrido_em', { ascending: false })
    .limit(limite)

  if (filtro.situacao !== 'todas') {
    consulta = consulta.is('lancamento_id', null).eq('ignorado', false)
  }
  if (filtro.contaId) consulta = consulta.eq('conta_id', filtro.contaId)

  const { data, error } = await consulta
  if (error) throw new Error(mensagemDe(error))
  return ((data ?? []) as unknown as LinhaCrua[]).map(traduzir)
}

export interface ConferenciaConta {
  id: string
  nome: string
  banco: string
  /** Saldo que o ERP conhece: soma dos lançamentos baixados. */
  saldo: number
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
    saldoExtrato: Number(c.saldo_extrato),
    aClassificar: Number(c.a_classificar),
    linhasLidas: Number(c.linhas_lidas),
    ultimaLeitura: (c.ultima_leitura as string) ?? null,
  }))
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
