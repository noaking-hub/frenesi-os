import 'server-only'

import {
  hojeEmSaoPaulo,
  problemasDaCompra,
  type CompraACaminho,
  type ItemDaCompra,
} from '@/domain'

import { operadorAtual } from './operador'
import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * Leitura e escrita das compras que ainda não chegaram.
 *
 * A validação do domínio roda AQUI de novo, e não só na tela. A tela é
 * conveniência; o servidor é a garantia. Quem chamar a ação por outro caminho
 * — e um dia alguém chama — encontra a mesma regra.
 */

interface LinhaItem {
  id: string
  base_id: string | null
  descricao: string
  volume_ml: number | string | null
  quantidade: number
  custo_unitario: number | string | null
  quantidade_recebida: number
  recebido_em: string | null
  ocorrencia: string | null
  lote_id: string | null
}

interface LinhaCompra {
  id: string
  fornecedor: string
  referencia: string | null
  comprada_em: string
  prevista_para: string | null
  rastreio: string | null
  transportadora: string | null
  valor_total: number | string | null
  frete: number | string | null
  observacao: string | null
  cancelada_em: string | null
  compras_a_caminho_itens: LinhaItem[] | null
}

const numeroOuNulo = (v: number | string | null): number | null =>
  v === null || v === '' ? null : Number(v)

function daLinha(c: LinhaCompra): CompraACaminho {
  const itens: ItemDaCompra[] = (c.compras_a_caminho_itens ?? []).map((i) => ({
    id: i.id,
    baseId: i.base_id,
    descricao: i.descricao,
    volumeMl: numeroOuNulo(i.volume_ml),
    quantidade: Number(i.quantidade),
    custoUnitario: numeroOuNulo(i.custo_unitario),
    quantidadeRecebida: Number(i.quantidade_recebida),
    recebidoEm: i.recebido_em,
    ocorrencia: i.ocorrencia,
    loteId: i.lote_id,
  }))
  // Ordem estável: o que ainda falta primeiro, e o resto por nome. Sem isto a
  // lista dança a cada gravação, e conferir caixa aberta vira caça ao item.
  itens.sort((a, b) => {
    const faltaA = a.quantidadeRecebida < a.quantidade ? 0 : 1
    const faltaB = b.quantidadeRecebida < b.quantidade ? 0 : 1
    return faltaA - faltaB || a.descricao.localeCompare(b.descricao, 'pt-BR')
  })

  return {
    id: c.id,
    fornecedor: c.fornecedor,
    referencia: c.referencia,
    compradaEm: c.comprada_em,
    previstaPara: c.prevista_para,
    rastreio: c.rastreio,
    transportadora: c.transportadora,
    valorTotal: numeroOuNulo(c.valor_total),
    frete: Number(c.frete ?? 0),
    observacao: c.observacao,
    canceladaEm: c.cancelada_em,
    itens,
  }
}

const SELECAO =
  'id, fornecedor, referencia, comprada_em, prevista_para, rastreio, transportadora, ' +
  'valor_total, frete, observacao, cancelada_em, ' +
  'compras_a_caminho_itens(id, base_id, descricao, volume_ml, quantidade, custo_unitario, ' +
  'quantidade_recebida, recebido_em, ocorrencia, lote_id)'

export async function lerComprasACaminho(): Promise<CompraACaminho[]> {
  if (!supabaseConfigurado()) return []
  const { data, error } = await supabaseServer()
    .from('compras_a_caminho')
    .select(SELECAO)
    .order('comprada_em', { ascending: false })
    .limit(500)
  if (error) throw error
  return ((data ?? []) as unknown as LinhaCompra[]).map(daLinha)
}

export interface CompraParaGravar {
  id?: string
  fornecedor: string
  referencia: string | null
  compradaEm: string
  previstaPara: string | null
  rastreio: string | null
  transportadora: string | null
  valorTotal: number | null
  frete: number
  observacao: string | null
  itens: {
    id?: string
    baseId: string | null
    descricao: string
    volumeMl: number | null
    quantidade: number
    custoUnitario: number | null
  }[]
}

/**
 * Grava a compra e seus itens.
 *
 * Os itens são reescritos por compra, e o que já foi RECEBIDO sobrevive: a
 * edição do cadastro não pode apagar a conferência de quem já abriu a caixa.
 * O casamento é pelo id do item; item novo nasce zerado.
 */
export async function salvarCompraACaminho(
  c: CompraParaGravar,
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  if (!supabaseConfigurado()) return { ok: false, erro: 'O Supabase precisa estar configurado.' }

  const problemas = problemasDaCompra({
    fornecedor: c.fornecedor,
    compradaEm: c.compradaEm,
    previstaPara: c.previstaPara,
    itens: c.itens,
  })
  if (problemas.length) return { ok: false, erro: problemas.join(' ') }

  const sb = supabaseServer()
  const cabecalho = {
    fornecedor: c.fornecedor.trim(),
    referencia: c.referencia?.trim() || null,
    comprada_em: c.compradaEm,
    prevista_para: c.previstaPara || null,
    rastreio: c.rastreio?.trim() || null,
    transportadora: c.transportadora?.trim() || null,
    valor_total: c.valorTotal,
    frete: c.frete,
    observacao: c.observacao?.trim() || null,
    atualizada_em: new Date().toISOString(),
  }

  let id = c.id
  if (id) {
    const { error } = await sb.from('compras_a_caminho').update(cabecalho).eq('id', id)
    if (error) return { ok: false, erro: error.message }
  } else {
    const { data, error } = await sb
      .from('compras_a_caminho')
      .insert({ ...cabecalho, criada_por: await operadorAtual() })
      .select('id')
      .single()
    if (error || !data) return { ok: false, erro: error?.message ?? 'não consegui criar a compra' }
    id = (data as { id: string }).id
  }

  // Itens que sumiram da tela saem do banco — menos os que já têm recebimento
  // ou lote, que são fato consumado e não podem evaporar numa edição.
  const mantidos = c.itens.map((i) => i.id).filter(Boolean) as string[]
  const { error: erroApagar } = await sb
    .from('compras_a_caminho_itens')
    .delete()
    .eq('compra_id', id)
    .eq('quantidade_recebida', 0)
    .is('lote_id', null)
    .not('id', 'in', `(${mantidos.length ? mantidos.join(',') : '00000000-0000-0000-0000-000000000000'})`)
  if (erroApagar) return { ok: false, erro: erroApagar.message }

  // Existentes e novos vão em chamadas SEPARADAS de propósito: num lote só, o
  // PostgREST uniformiza as chaves de todas as linhas, e o item novo iria com
  // `id: null` explícito — que atropela o default do banco e estoura o NOT
  // NULL. Foi exatamente assim que a Yampi apagou 24 vínculos.
  const corpoDoItem = (i: CompraParaGravar['itens'][number]) => ({
    compra_id: id,
    base_id: i.baseId || null,
    descricao: i.descricao.trim(),
    volume_ml: i.volumeMl,
    quantidade: i.quantidade,
    custo_unitario: i.custoUnitario,
  })
  const existentes = c.itens.filter((i) => i.id).map((i) => ({ id: i.id!, ...corpoDoItem(i) }))
  const novos = c.itens.filter((i) => !i.id).map(corpoDoItem)
  if (existentes.length) {
    const { error: erroItens } = await sb.from('compras_a_caminho_itens').upsert(existentes)
    if (erroItens) return { ok: false, erro: erroItens.message }
  }
  if (novos.length) {
    const { error: erroItens } = await sb.from('compras_a_caminho_itens').insert(novos)
    if (erroItens) return { ok: false, erro: erroItens.message }
  }

  return { ok: true, id: id! }
}

/**
 * Marca o que chegou.
 *
 * `quantidade` é o TOTAL recebido do item, não um incremento: a tela mostra o
 * número atual e a pessoa corrige. Incremento obrigaria a lembrar quanto já
 * havia sido marcado, e o erro apareceria como estoque a mais.
 */
export async function receberItem(
  itemId: string,
  quantidade: number,
  ocorrencia?: string | null,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!supabaseConfigurado()) return { ok: false, erro: 'O Supabase precisa estar configurado.' }
  if (!Number.isFinite(quantidade) || quantidade < 0) {
    return { ok: false, erro: 'A quantidade recebida não pode ser negativa.' }
  }

  const { error } = await supabaseServer()
    .from('compras_a_caminho_itens')
    .update({
      quantidade_recebida: Math.floor(quantidade),
      // Zerar a marcação devolve o item ao estado de espera, data inclusive:
      // deixar a data de um recebimento desfeito é guardar a lembrança de um
      // fato que a pessoa acabou de dizer que não aconteceu.
      recebido_em: quantidade > 0 ? hojeEmSaoPaulo() : null,
      ocorrencia: ocorrencia?.trim() || null,
    })
    .eq('id', itemId)
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}

/** Liga o item ao lote criado pela compra de frasco — a ponte com o estoque. */
export async function ligarItemAoLote(
  itemId: string,
  loteId: string | null,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!supabaseConfigurado()) return { ok: false, erro: 'O Supabase precisa estar configurado.' }
  const { error } = await supabaseServer()
    .from('compras_a_caminho_itens')
    .update({ lote_id: loteId })
    .eq('id', itemId)
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}

/**
 * Cancela a compra sem apagar o histórico.
 *
 * Apagar seria mais simples e destruiria a única memória de que aquilo foi
 * comprado um dia — inclusive o dinheiro que saiu.
 */
export async function cancelarCompraACaminho(
  id: string,
  motivo: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!supabaseConfigurado()) return { ok: false, erro: 'O Supabase precisa estar configurado.' }
  if (!motivo.trim()) return { ok: false, erro: 'Diga por que a compra foi cancelada.' }
  const { error } = await supabaseServer()
    .from('compras_a_caminho')
    .update({
      cancelada_em: new Date().toISOString(),
      cancelada_motivo: motivo.trim().slice(0, 300),
      atualizada_em: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}

export type RespostaLoteDoItem =
  | { ok: true; loteId: string; frascos: number }
  | { ok: false; erro: string }

/**
 * Cria o(s) lote(s) de um item RECEBIDO com os dados que a compra já tem.
 *
 * A pendência "falta registrar a compra do frasco" mandava o operador para a
 * tela de lotes redigitar perfume, volume, custo e fornecedor — quatro campos
 * que este item já conhece. Redigitar não é só trabalho: é a chance de o
 * custo por ml divergir entre a compra e o lote sem ninguém notar.
 *
 * Um lote POR FRASCO recebido, cada um com o custo unitário da compra — é o
 * modelo do estoque, um frasco físico por lote. O primeiro lote é vinculado
 * ao item na hora, fechando a pendência; os demais ficam à mão no seletor
 * "virou o lote" dos outros itens da mesma compra.
 */
export async function criarLoteDoItemRecebido(itemId: string): Promise<RespostaLoteDoItem> {
  if (!supabaseConfigurado()) return { ok: false, erro: 'O Supabase precisa estar configurado.' }

  const sb = supabaseServer()
  const { data: item, error } = await sb
    .from('compras_a_caminho_itens')
    .select(
      'id, base_id, volume_ml, quantidade, quantidade_recebida, custo_unitario, lote_id, ' +
        'compras_a_caminho(fornecedor)',
    )
    .eq('id', itemId)
    .maybeSingle()
  if (error) return { ok: false, erro: error.message }
  if (!item) return { ok: false, erro: 'Item não encontrado.' }

  const i = item as unknown as {
    base_id: string | null
    volume_ml: number | string | null
    quantidade: number | null
    quantidade_recebida: number | null
    custo_unitario: number | string | null
    lote_id: string | null
    compras_a_caminho: { fornecedor: string | null } | null
  }

  if (i.lote_id) return { ok: false, erro: 'Este item já virou lote.' }
  if (!i.base_id) {
    return { ok: false, erro: 'Cadastre o perfume no catálogo primeiro — sem ele não há onde pendurar o lote.' }
  }
  const volumeMl = Number(i.volume_ml)
  const custoUnitario = Number(i.custo_unitario)
  if (!(volumeMl > 0)) return { ok: false, erro: 'A compra não diz o volume do frasco — edite a compra e informe.' }
  if (!(custoUnitario > 0)) return { ok: false, erro: 'A compra não diz o custo do frasco — edite a compra e informe.' }

  const frascos = Math.max(1, Number(i.quantidade_recebida ?? i.quantidade ?? 1))
  const fornecedor = i.compras_a_caminho?.fornecedor?.trim() || 'Compra a caminho'
  const operador = await operadorAtual()

  const lotes: string[] = []
  for (let n = 0; n < frascos; n++) {
    const { data: loteId, error: erroLote } = await sb.rpc('registrar_compra', {
      p_base_id: i.base_id,
      p_volume_ml: volumeMl,
      p_custo_total: custoUnitario,
      p_fornecedor: fornecedor,
      p_operador: operador,
    })
    if (erroLote) {
      // Falha no meio do laço não desfaz o que já entrou: lote registrado é
      // estoque de verdade; o erro diz quantos ficaram e o vínculo ajuda a
      // conferir.
      return {
        ok: false,
        erro: `${erroLote.message || 'Falha ao registrar o lote.'}${lotes.length ? ` (${lotes.length} de ${frascos} lote(s) já registrados)` : ''}`,
      }
    }
    lotes.push(String(loteId))
  }

  const vinculo = await ligarItemAoLote(itemId, lotes[0])
  if (!vinculo.ok) return { ok: false, erro: `Lote criado (${lotes[0]}), mas o vínculo falhou: ${vinculo.erro}` }

  return { ok: true, loteId: lotes[0], frascos }
}
