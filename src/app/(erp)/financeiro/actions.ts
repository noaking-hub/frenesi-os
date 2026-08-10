'use server'

import { revalidatePath } from 'next/cache'

import { OPERADOR } from '@/data/operador'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

export type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

function falha(e: { message?: string; details?: string }, padrao: string) {
  return { ok: false as const, erro: e.message || e.details || padrao }
}

function exigeSupabase(acao: string) {
  return supabaseConfigurado()
    ? null
    : { ok: false as const, erro: `O Supabase precisa estar configurado para ${acao}.` }
}

export interface NovoLancamento {
  descricao: string
  categoria: string
  contaId: string
  tipo: 'entrada' | 'saida'
  valor: number
  ocorridoEm: string
  venceEm: string
  baixado: boolean
  recorrente: boolean
}

/**
 * Cria um lançamento.
 *
 * `baixado` decide o que a tela mostra depois: com baixa é realizado e entra
 * no saldo da conta; sem baixa é previsão e fica na fila.
 */
export async function criarLancamento(dados: NovoLancamento): Promise<Resposta<{ id: string }>> {
  const bloqueio = exigeSupabase('criar lançamentos')
  if (bloqueio) return bloqueio
  if (!dados.descricao.trim()) return { ok: false, erro: 'Informe a descrição.' }
  if (!(dados.valor > 0)) return { ok: false, erro: 'O valor deve ser maior que zero.' }

  const { data, error } = await supabaseServer().rpc('registrar_lancamento', {
    p_descricao: dados.descricao,
    p_categoria: dados.categoria,
    p_conta_id: dados.contaId,
    p_tipo: dados.tipo,
    p_valor: dados.valor,
    p_ocorrido_em: dados.ocorridoEm || null,
    p_vence_em: dados.venceEm || null,
    p_baixado: dados.baixado,
    p_recorrente: dados.recorrente,
    p_origem: 'Manual',
    p_operador: OPERADOR,
  })
  if (error) {
    console.error('[financeiro] registrar_lancamento falhou:', error)
    return falha(error, 'Falha ao criar o lançamento.')
  }

  revalidatePath('/', 'layout')
  return { ok: true, id: String(data) }
}

/** Dar baixa é reconhecer que o dinheiro entrou ou saiu de fato. */
export async function darBaixa(id: string): Promise<Resposta> {
  const bloqueio = exigeSupabase('dar baixa')
  if (bloqueio) return bloqueio

  const { error } = await supabaseServer().rpc('baixar_lancamento', {
    p_id: id,
    p_quando: null,
    p_operador: OPERADOR,
  })
  if (error) {
    console.error('[financeiro] baixar_lancamento falhou:', error)
    return falha(error, 'Falha ao dar baixa.')
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Cria uma conta do caixa. O saldo não é informado: ele vem dos lançamentos. */
export async function criarConta(dados: {
  nome: string
  tipo: string
  banco: string
  uso: string
  principal: boolean
}): Promise<Resposta> {
  const bloqueio = exigeSupabase('criar contas')
  if (bloqueio) return bloqueio
  if (!dados.nome.trim()) return { ok: false, erro: 'Informe o nome da conta.' }
  if (!dados.banco.trim()) return { ok: false, erro: 'Informe o banco.' }

  const id = dados.nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  if (!id) return { ok: false, erro: 'O nome não forma um identificador válido.' }

  const sb = supabaseServer()
  // Só pode haver uma conta principal: duas fariam o Dashboard escolher uma
  // ao acaso para mostrar como padrão.
  if (dados.principal) {
    const { error } = await sb
      .from('contas_bancarias')
      .update({ principal: false })
      .eq('principal', true)
    if (error) return falha(error, 'Falha ao trocar a conta principal.')
  }

  const { error } = await sb.from('contas_bancarias').insert({
    id,
    nome: dados.nome.trim(),
    tipo: dados.tipo.trim() || 'Conta corrente',
    banco: dados.banco.trim(),
    uso: dados.uso.trim(),
    principal: dados.principal,
  })
  if (error) {
    console.error('[financeiro] criar conta falhou:', error)
    if (error.code === '23505') return { ok: false, erro: 'Já existe uma conta com esse nome.' }
    return falha(error, 'Falha ao criar a conta.')
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Edita a conta: nome, banco, tipo, uso, principal e o saldo informado.
 *
 * O saldo informado é o campo que faltava. Nem toda conta entrega saldo por
 * API — a do Mercado Pago responde 403 nesse caminho —, e sem um lugar para
 * digitar o saldo real o ERP fica preso ao que conseguiu somar do extrato,
 * que é sempre uma aproximação do dia em que se leu. Digitar o número que
 * está no app é mais honesto que exibir a soma como se fosse o saldo.
 */
export async function editarConta(
  id: string,
  dados: {
    nome: string
    tipo: string
    banco: string
    uso: string
    principal: boolean
    /** Null apaga o saldo informado e devolve o comando ao extrato. */
    saldoInformado: number | null
  },
): Promise<Resposta> {
  const bloqueio = exigeSupabase('editar contas')
  if (bloqueio) return bloqueio
  if (!dados.nome.trim()) return { ok: false, erro: 'Informe o nome da conta.' }

  const sb = supabaseServer()
  if (dados.principal) {
    const { error } = await sb
      .from('contas_bancarias')
      .update({ principal: false })
      .eq('principal', true)
      .neq('id', id)
    if (error) return falha(error, 'Falha ao trocar a conta principal.')
  }

  const { error } = await sb
    .from('contas_bancarias')
    .update({
      nome: dados.nome.trim(),
      tipo: dados.tipo.trim() || 'Conta corrente',
      banco: dados.banco.trim(),
      uso: dados.uso.trim(),
      principal: dados.principal,
      saldo_informado: dados.saldoInformado,
      // Sem a data, um saldo digitado em julho tem a mesma cara de um digitado
      // hoje — e o de julho está errado hoje.
      saldo_informado_em: dados.saldoInformado === null ? null : new Date().toISOString(),
    })
    .eq('id', id)
  if (error) {
    console.error('[financeiro] editar conta falhou:', error)
    return falha(error, 'Falha ao salvar a conta.')
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Remove a conta, desde que ela esteja vazia.
 *
 * Apagar uma conta com extrato ou lançamento levaria junto o histórico que
 * sustenta o DRE, e nada disso seria reconstruível. Por isso a recusa é
 * explícita e diz quantos registros existem: quem quer mesmo remover sabe o
 * que precisa mover antes.
 */
export async function removerConta(id: string): Promise<Resposta> {
  const bloqueio = exigeSupabase('remover contas')
  if (bloqueio) return bloqueio

  const sb = supabaseServer()
  const [extrato, lancamentos] = await Promise.all([
    sb.from('extrato_linhas').select('chave', { count: 'exact', head: true }).eq('conta_id', id),
    sb.from('lancamentos').select('id', { count: 'exact', head: true }).eq('conta_id', id),
  ])

  const presos = (extrato.count ?? 0) + (lancamentos.count ?? 0)
  if (presos > 0) {
    return {
      ok: false,
      erro: `Esta conta tem ${extrato.count ?? 0} linha(s) de extrato e ${lancamentos.count ?? 0} lançamento(s). Apagá-la levaria esse histórico junto — mova ou apague esses registros antes.`,
    }
  }

  const { error } = await sb.from('contas_bancarias').delete().eq('id', id)
  if (error) {
    console.error('[financeiro] remover conta falhou:', error)
    return falha(error, 'Falha ao remover a conta.')
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Cria uma categoria. A natureza é o que separa custo variável de estrutura. */
export async function criarCategoria(dados: {
  nome: string
  natureza: 'Custo variável' | 'Despesa fixa' | 'Despesa'
}): Promise<Resposta> {
  const bloqueio = exigeSupabase('criar categorias')
  if (bloqueio) return bloqueio
  if (!dados.nome.trim()) return { ok: false, erro: 'Informe o nome da categoria.' }

  const { error } = await supabaseServer()
    .from('categorias_financeiras')
    .insert({ nome: dados.nome.trim(), natureza: dados.natureza })
  if (error) {
    console.error('[financeiro] criar categoria falhou:', error)
    if (error.code === '23505') return { ok: false, erro: 'Já existe uma categoria com esse nome.' }
    return falha(error, 'Falha ao criar a categoria.')
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Informa quanto a plataforma creditou de um pedido. */
export async function conciliarRepasse(pedidoId: string, recebido: number): Promise<Resposta> {
  const bloqueio = exigeSupabase('conciliar repasses')
  if (bloqueio) return bloqueio
  if (!Number.isFinite(recebido) || recebido < 0) {
    return { ok: false, erro: 'O valor recebido não pode ser negativo.' }
  }

  const { error } = await supabaseServer().rpc('conciliar_repasse', {
    p_pedido_id: pedidoId,
    p_recebido: recebido,
    p_quando: null,
    p_operador: OPERADOR,
  })
  if (error) {
    console.error('[financeiro] conciliar_repasse falhou:', error)
    return falha(error, 'Falha ao conciliar o repasse.')
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Gera a previsão de repasse dos pedidos que ainda não têm linha.
 *
 * Fica separado da importação de pedidos porque a taxa vigente pode mudar
 * entre uma coisa e outra, e a taxa fica congelada na linha do repasse.
 */
export async function preverRepasses(): Promise<Resposta<{ novos: number }>> {
  const bloqueio = exigeSupabase('prever repasses')
  if (bloqueio) return bloqueio

  const { data, error } = await supabaseServer().rpc('prever_repasses')
  if (error) {
    console.error('[financeiro] prever_repasses falhou:', error)
    return falha(error, 'Falha ao prever os repasses.')
  }

  revalidatePath('/', 'layout')
  return { ok: true, novos: Number(data) }
}
