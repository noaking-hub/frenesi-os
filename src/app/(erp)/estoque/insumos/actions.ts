'use server'

import { revalidatePath } from 'next/cache'

import { OPERADOR } from '@/data/operador'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { brl } from '@/domain'

import { TIPO_TRILHA, arredondar4, recalcularRazao } from './recalculo'

export type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

function exige(acao: string) {
  return supabaseConfigurado()
    ? null
    : { ok: false as const, erro: `O Supabase precisa estar configurado para ${acao}.` }
}

/** Entrada de insumo. O custo médio se refaz no banco, como nos lotes. */
export async function comprarInsumo(
  insumoId: string,
  unidades: number,
  custoTotal: number,
  fornecedor: string,
): Promise<Resposta<{ saldo: number }>> {
  const bloqueio = exige('registrar compras de insumo')
  if (bloqueio) return bloqueio
  if (!(unidades > 0)) return { ok: false, erro: 'Informe quantas unidades entraram.' }
  if (!(custoTotal >= 0)) return { ok: false, erro: 'Informe o custo total da compra.' }

  const { data, error } = await supabaseServer().rpc('registrar_compra_insumo', {
    p_insumo_id: insumoId,
    p_unidades: Math.round(unidades),
    p_custo_total: custoTotal,
    p_fornecedor: fornecedor.trim() || null,
    p_operador: OPERADOR,
  })
  if (error) return { ok: false, erro: error.message }

  revalidatePath('/', 'layout')
  return { ok: true, saldo: Number(data ?? 0) }
}

/** Contagem física: o saldo passa a ser o contado, com motivo obrigatório. */
export async function ajustarInsumo(
  insumoId: string,
  unidades: number,
  motivo: string,
): Promise<Resposta<{ saldo: number }>> {
  const bloqueio = exige('ajustar insumos')
  if (bloqueio) return bloqueio
  if (!(unidades >= 0)) return { ok: false, erro: 'O saldo contado não pode ser negativo.' }
  if (!motivo.trim()) return { ok: false, erro: 'Diga o motivo do ajuste — ele fica no histórico.' }

  const { data, error } = await supabaseServer().rpc('ajustar_insumo', {
    p_insumo_id: insumoId,
    p_unidades: Math.round(unidades),
    p_motivo: motivo.trim(),
    p_operador: OPERADOR,
  })
  if (error) return { ok: false, erro: error.message }

  revalidatePath('/', 'layout')
  return { ok: true, saldo: Number(data ?? 0) }
}

/** Quanto comprar antes de faltar: o mínimo que dispara o alerta. */
export async function definirMinimo(insumoId: string, minimo: number): Promise<Resposta> {
  const bloqueio = exige('definir o mínimo')
  if (bloqueio) return bloqueio
  if (!(minimo >= 0)) return { ok: false, erro: 'O mínimo não pode ser negativo.' }

  const { error } = await supabaseServer()
    .from('insumos')
    .update({ minimo: Math.round(minimo) })
    .eq('id', insumoId)
  if (error) return { ok: false, erro: error.message }

  revalidatePath('/', 'layout')
  return { ok: true }
}

// ── Correção do que já foi lançado ─────────────────────────────────────────

/** A linha crua de `insumo_movimentacoes`, para reescrever sem perder coluna. */
interface LinhaBanco {
  id: string
  insumo_id: string
  tipo: string
  unidades: number
  saldo_anterior: number | null
  saldo: number | null
  ref: string | null
  pedido_id: string | null
  descricao: string
  responsavel: string | null
  custo_unitario: number | string | null
  ocorrida_em: string
}

interface CadastroInsumo {
  nome: string
  minimo: number
  custo_unitario: number | string
  unidades: number
}

/**
 * O que trava a edição de um movimento.
 *
 * A baixa de faturamento é intocável aqui de propósito: ela nasceu de um
 * pedido, e mexer nela por dentro faria estoque e venda pararem de bater sem
 * que nada na tela do pedido mudasse.
 */
function porQueNaoEditavel(l: LinhaBanco): string | null {
  if (l.tipo === TIPO_TRILHA) return 'Esta linha é o registro de uma correção — ela não se edita.'
  if (l.pedido_id)
    return `Saída do faturamento do pedido ${l.pedido_id}. Corrija pelo pedido, senão estoque e venda param de bater.`
  if (l.tipo !== 'entrada' && l.tipo !== 'ajuste')
    return 'Só entrada e contagem lançadas à mão podem ser corrigidas aqui.'
  return null
}

/**
 * Fornecedor da compra ou motivo do ajuste.
 *
 * `ref` é a coluna canônica, mas os lançamentos antigos guardavam o motivo
 * só dentro da frase — puxamos de lá para o formulário não obrigar a
 * redigitar o que já estava escrito.
 */
function observacaoDe(l: LinhaBanco): string {
  if (l.ref) return l.ref
  const doAjuste = /^Ajuste de contagem · (.+)$/.exec(l.descricao)
  return doAjuste ? doAjuste[1] : ''
}

/** A quantidade que o formulário edita: contagem mexe no saldo, entrada no passo. */
function quantidadeDe(l: LinhaBanco): number {
  return l.tipo === 'ajuste' ? (l.saldo ?? l.unidades) : l.unidades
}

function custoDe(l: LinhaBanco): number | null {
  return l.custo_unitario === null ? null : Number(l.custo_unitario)
}

/** Resumo curto de uma linha, para a trilha dizer o que virou o quê. */
function resumoDaLinha(l: LinhaBanco): string {
  const custo = custoDe(l)
  return `${quantidadeDe(l)} un a ${custo && custo > 0 ? brl(custo) : 'custo não informado'}`
}

/** A frase do histórico, refeita com os números novos — senão ela mente. */
function descricaoDoMovimento(
  tipo: string,
  quantidade: number,
  custo: number | null,
  observacao: string,
): string {
  const valor = custo && custo > 0 ? ` · ${brl(custo)} a unidade` : ' · sem custo informado'
  if (tipo === 'ajuste') return `Ajuste de contagem · ${observacao}${valor}`
  return `Compra de ${quantidade} un${observacao ? ` · ${observacao}` : ''}${valor}`
}

async function lerRazao(insumoId: string): Promise<{ linhas: LinhaBanco[]; erro: string | null }> {
  const { data, error } = await supabaseServer()
    .from('insumo_movimentacoes')
    .select('*')
    .eq('insumo_id', insumoId)
    // Empate de horário existe (o faturamento grava três linhas no mesmo
    // instante); o id desempata para o replay ser sempre o mesmo.
    .order('ocorrida_em')
    .order('id')
  return { linhas: (data ?? []) as unknown as LinhaBanco[], erro: error?.message ?? null }
}

async function lerCadastro(insumoId: string): Promise<{ insumo: CadastroInsumo | null; erro: string | null }> {
  const { data, error } = await supabaseServer()
    .from('insumos')
    .select('nome, minimo, custo_unitario, unidades')
    .eq('id', insumoId)
    .maybeSingle()
  return { insumo: (data as unknown as CadastroInsumo | null) ?? null, erro: error?.message ?? null }
}

/**
 * Grava o razão corrigido: valida, reescreve as linhas afetadas, refaz saldo
 * e custo médio do insumo e deixa a trilha de quem mexeu.
 *
 * Nada é gravado se o recálculo furar o zero. É a única forma de impedir que
 * uma correção de compra antiga deixe o estoque negativo por causa das
 * saídas que já aconteceram depois dela.
 */
async function regravarRazao(
  insumoId: string,
  razao: LinhaBanco[],
  opcoes: { alteradas?: string[]; excluidas?: string[]; trilha: string },
): Promise<Resposta<{ saldo: number; custoUnitario: number }>> {
  const sb = supabaseServer()

  const { insumo, erro: erroCadastro } = await lerCadastro(insumoId)
  if (erroCadastro) return { ok: false, erro: erroCadastro }
  if (!insumo) return { ok: false, erro: 'Insumo não encontrado.' }

  const recalculo = recalcularRazao(
    razao.map((l) => ({
      id: l.id,
      tipo: l.tipo,
      unidades: l.unidades,
      saldoAnterior: l.saldo_anterior,
      saldo: l.saldo,
      custoUnitario: custoDe(l),
    })),
    Number(insumo.custo_unitario),
  )

  const negativa = recalculo.negativa
  if (negativa) {
    const culpada = razao.find((l) => l.id === negativa.id)
    return {
      ok: false,
      erro:
        `Essa correção deixaria o estoque em ${negativa.saldo} un no movimento "${culpada?.descricao ?? 'seguinte'}". ` +
        'Corrija ou exclua as saídas posteriores antes — o saldo não pode ficar negativo.',
    }
  }

  const excluidas = opcoes.excluidas ?? []

  // Só reenvia o que mudou de fato: numa lista com meses de faturamento não
  // faz sentido reescrever linha idêntica.
  const recalculadaPorId = new Map(recalculo.linhas.map((l) => [l.id, l]))
  const alteradas = new Set(opcoes.alteradas ?? [])
  const paraGravar: LinhaBanco[] = []
  for (const linha of razao) {
    const nova = recalculadaPorId.get(linha.id)
    if (!nova) continue
    const mexeuNoSaldo =
      linha.unidades !== nova.unidades ||
      linha.saldo_anterior !== nova.saldoAnterior ||
      linha.saldo !== nova.saldo
    if (!mexeuNoSaldo && !alteradas.has(linha.id)) continue
    paraGravar.push({
      ...linha,
      unidades: nova.unidades,
      saldo_anterior: nova.saldoAnterior,
      saldo: nova.saldo,
    })
  }

  // Exclusão, regravação das linhas, saldo do cadastro e trilha vão juntos
  // numa transação com trava no insumo. Em chamadas soltas cabe um
  // faturamento no meio da reescrita, e o estoque terminaria com um saldo
  // que nunca existiu. O RECÁLCULO continua aqui, onde está testado; o banco
  // só aplica o resultado.
  const { error: erroAplicar } = await sb.rpc('aplicar_razao_insumo', {
    p_insumo_id: insumoId,
    p_linhas: paraGravar.map((l) => ({
      id: l.id,
      unidades: l.unidades,
      saldo_anterior: l.saldo_anterior,
      saldo: l.saldo,
      custo_unitario: l.custo_unitario,
      descricao: l.descricao,
      ref: l.ref,
      responsavel: l.responsavel,
    })),
    p_excluidas: excluidas,
    p_saldo: recalculo.saldo,
    p_custo: recalculo.custoUnitario,
    p_trilha: opcoes.trilha,
    p_operador: OPERADOR,
    p_tipo_trilha: TIPO_TRILHA,
  })
  if (erroAplicar) return { ok: false, erro: erroAplicar.message }

  revalidatePath('/', 'layout')
  return { ok: true, saldo: recalculo.saldo, custoUnitario: recalculo.custoUnitario }
}

export interface EdicaoMovimento {
  /** Unidades da entrada, ou o saldo apurado quando a linha é uma contagem. */
  quantidade: number
  /** Zero significa "sem custo informado" — a linha sai do custo médio. */
  custoUnitario: number
  /** Fornecedor da compra ou motivo da contagem. */
  observacao: string
}

/**
 * Corrige um movimento já lançado.
 *
 * É a resposta ao caso que originou tudo: o saldo inicial de tampas entrou
 * sem valor, e informar o custo aqui faz a linha valer como entrada
 * valorizada — o custo médio nasce dela, sem precisar de compra fictícia.
 */
export async function editarMovimentoInsumo(
  movimentoId: string,
  edicao: EdicaoMovimento,
): Promise<Resposta<{ saldo: number; custoUnitario: number }>> {
  const bloqueio = exige('corrigir movimentos de insumo')
  if (bloqueio) return bloqueio

  const { data, error } = await supabaseServer()
    .from('insumo_movimentacoes')
    .select('*')
    .eq('id', movimentoId)
    .maybeSingle()
  if (error) return { ok: false, erro: error.message }
  const original = (data as unknown as LinhaBanco | null) ?? null
  if (!original) return { ok: false, erro: 'Movimento não encontrado — talvez já tenha sido excluído.' }

  const travado = porQueNaoEditavel(original)
  if (travado) return { ok: false, erro: travado }

  if (!Number.isFinite(edicao.quantidade) || !(edicao.quantidade >= 0))
    return { ok: false, erro: 'A quantidade precisa ser um número maior ou igual a zero.' }
  if (!Number.isFinite(edicao.custoUnitario) || !(edicao.custoUnitario >= 0))
    return { ok: false, erro: 'O custo unitário não pode ser negativo.' }
  if (original.tipo === 'entrada' && !(edicao.quantidade > 0))
    return {
      ok: false,
      erro: 'A entrada precisa de pelo menos uma unidade. Para desfazê-la por inteiro, exclua o movimento.',
    }
  // Contagem pode dar zero — "contei e não tinha nenhuma" é um resultado
  // legítimo, e é por isso que a regra de quantidade > 0 vale só para entrada.
  if (original.tipo === 'ajuste' && !edicao.observacao.trim())
    return { ok: false, erro: 'Diga o motivo do ajuste — ele fica no histórico.' }

  const quantidade = Math.round(edicao.quantidade)
  const custo = edicao.custoUnitario > 0 ? arredondar4(edicao.custoUnitario) : null
  const observacao = edicao.observacao.trim()

  const { linhas: razao, erro: erroRazao } = await lerRazao(original.insumo_id)
  if (erroRazao) return { ok: false, erro: erroRazao }

  const corrigida: LinhaBanco = {
    ...original,
    // Na contagem o número digitado é o SALDO apurado; o passo (`unidades`)
    // quem calcula é o replay, contra o que sobrou das linhas anteriores.
    unidades: original.tipo === 'ajuste' ? original.unidades : quantidade,
    saldo: original.tipo === 'ajuste' ? quantidade : original.saldo,
    ref: observacao || null,
    custo_unitario: custo,
    descricao: descricaoDoMovimento(original.tipo, quantidade, custo, observacao),
    responsavel: OPERADOR,
  }

  return regravarRazao(
    original.insumo_id,
    razao.map((l) => (l.id === movimentoId ? corrigida : l)),
    {
      alteradas: [movimentoId],
      trilha: `Lançamento corrigido · ${resumoDaLinha(original)} → ${resumoDaLinha(corrigida)} · por ${OPERADOR}`,
    },
  )
}

/** Estorna um movimento lançado errado: ele sai do razão e o saldo se refaz. */
export async function excluirMovimentoInsumo(
  movimentoId: string,
): Promise<Resposta<{ saldo: number; custoUnitario: number }>> {
  const bloqueio = exige('excluir movimentos de insumo')
  if (bloqueio) return bloqueio

  const { data, error } = await supabaseServer()
    .from('insumo_movimentacoes')
    .select('*')
    .eq('id', movimentoId)
    .maybeSingle()
  if (error) return { ok: false, erro: error.message }
  const original = (data as unknown as LinhaBanco | null) ?? null
  if (!original) return { ok: false, erro: 'Movimento não encontrado — talvez já tenha sido excluído.' }

  const travado = porQueNaoEditavel(original)
  if (travado) return { ok: false, erro: travado }

  const { linhas: razao, erro: erroRazao } = await lerRazao(original.insumo_id)
  if (erroRazao) return { ok: false, erro: erroRazao }

  return regravarRazao(
    original.insumo_id,
    razao.filter((l) => l.id !== movimentoId),
    {
      excluidas: [movimentoId],
      trilha: `Lançamento excluído · "${original.descricao}" (${resumoDaLinha(original)}) · por ${OPERADOR}`,
    },
  )
}

/**
 * Cadastro do insumo: nome, mínimo e custo unitário de referência.
 *
 * O custo aqui é a saída para quem lançou saldo sem nota: ele vale enquanto
 * nenhuma entrada do razão tiver valor. Assim que houver uma, o custo médio
 * calculado manda — dois números divergentes seriam pior que um só.
 */
export async function editarInsumo(
  insumoId: string,
  dados: { nome: string; minimo: number; custoUnitario: number },
): Promise<Resposta> {
  const bloqueio = exige('editar o cadastro do insumo')
  if (bloqueio) return bloqueio

  const nome = dados.nome.trim()
  if (!nome) return { ok: false, erro: 'O insumo precisa de um nome.' }
  if (!Number.isFinite(dados.minimo) || !(dados.minimo >= 0))
    return { ok: false, erro: 'O mínimo não pode ser negativo.' }
  if (!Number.isFinite(dados.custoUnitario) || !(dados.custoUnitario >= 0))
    return { ok: false, erro: 'O custo unitário não pode ser negativo.' }

  const sb = supabaseServer()
  const { insumo, erro } = await lerCadastro(insumoId)
  if (erro) return { ok: false, erro }
  if (!insumo) return { ok: false, erro: 'Insumo não encontrado.' }

  const minimo = Math.round(dados.minimo)
  const custo = arredondar4(dados.custoUnitario)
  const custoAtual = Number(insumo.custo_unitario)

  const mudancas: string[] = []
  if (insumo.nome !== nome) mudancas.push(`nome "${insumo.nome}" → "${nome}"`)
  if (insumo.minimo !== minimo) mudancas.push(`mínimo ${insumo.minimo} → ${minimo}`)
  if (custoAtual !== custo)
    mudancas.push(
      `custo unitário ${custoAtual > 0 ? brl(custoAtual) : 'não informado'} → ${custo > 0 ? brl(custo) : 'não informado'}`,
    )
  // Sem mudança não há trilha: histórico cheio de linha sem alteração vira
  // ruído e esconde a correção que importa.
  if (mudancas.length === 0) return { ok: true }

  const { error: erroUpdate } = await sb
    .from('insumos')
    .update({ nome, minimo, custo_unitario: custo })
    .eq('id', insumoId)
  if (erroUpdate) return { ok: false, erro: erroUpdate.message }

  const { error: erroTrilha } = await sb.from('insumo_movimentacoes').insert({
    insumo_id: insumoId,
    tipo: TIPO_TRILHA,
    unidades: 0,
    saldo_anterior: insumo.unidades,
    saldo: insumo.unidades,
    descricao: `Cadastro corrigido · ${mudancas.join(' · ')} · por ${OPERADOR}`,
    responsavel: OPERADOR,
  })
  if (erroTrilha) return { ok: false, erro: erroTrilha.message }

  revalidatePath('/', 'layout')
  return { ok: true }
}

export interface MovimentoInsumo {
  id: string
  quando: string
  tipo: string
  /** Passo no saldo: positivo entra, negativo sai, zero nas linhas de trilha. */
  unidades: number
  saldo: number | null
  descricao: string
  responsavel: string | null
  custoUnitario: number | null
  /** O número que o formulário edita — saldo na contagem, passo na entrada. */
  quantidade: number
  /** Fornecedor ou motivo já isolados, para não redigitar a frase inteira. */
  observacao: string
  editavel: boolean
  /** Por que não dá para mexer — vira a dica na interface. */
  travadoPor: string | null
}

/** Histórico do item — é o que prova de onde veio cada unidade. */
export async function historicoDoInsumo(insumoId: string): Promise<MovimentoInsumo[]> {
  if (!supabaseConfigurado()) return []
  const { data } = await supabaseServer()
    .from('insumo_movimentacoes')
    .select('*')
    .eq('insumo_id', insumoId)
    .order('ocorrida_em', { ascending: false })
    .limit(60)

  return ((data ?? []) as unknown as LinhaBanco[]).map((m) => {
    const travadoPor = porQueNaoEditavel(m)
    return {
      id: m.id,
      quando: new Date(m.ocorrida_em).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      }),
      tipo: m.tipo,
      unidades: m.unidades,
      saldo: m.saldo,
      descricao: m.descricao,
      responsavel: m.responsavel,
      custoUnitario: custoDe(m),
      quantidade: quantidadeDe(m),
      observacao: observacaoDe(m),
      editavel: travadoPor === null,
      travadoPor,
    }
  })
}
