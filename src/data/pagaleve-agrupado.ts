import 'server-only'

import { parcelasQueFechamODeposito, type ParcelaAberta } from '@/domain'

import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * Os depósitos agrupados da Pagaleve que a regra "mesmo dia, valor exato" não
 * casa: para cada "Crédito a classificar" recente, procura o subconjunto de
 * parcelas em aberto que fecha o valor no centavo (domínio decide) e aplica
 * pelo RPC atômico — que confere a soma de novo antes de gravar.
 */

export interface RodadaDeDepositosAgrupados {
  examinados: number
  casados: { chave: string; parcelas: number; valor: number }[]
  erros: string[]
}

export async function casarDepositosAgrupadosPagaleve(): Promise<RodadaDeDepositosAgrupados> {
  const rodada: RodadaDeDepositosAgrupados = { examinados: 0, casados: [], erros: [] }
  if (!supabaseConfigurado()) return rodada
  const sb = supabaseServer()
  const corte = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10)

  const [{ data: creditos }, { data: abertas }] = await Promise.all([
    sb
      .from('lancamentos')
      .select('chave_externa, ocorrido_em, valor')
      .is('categoria_id', null)
      .is('cancelado_em', null)
      .is('pedido_id', null)
      .eq('tipo', 'entrada')
      .like('origem', 'Extrato %')
      .ilike('descricao', 'Crédito a classificar%')
      .gte('ocorrido_em', corte)
      .order('ocorrido_em'),
    sb
      .from('pagaleve_parcelas')
      .select('checkout_id, numero, prevista_para, liquido')
      .is('liquidada_em', null)
      .neq('liquido', 0),
  ])

  let parcelas: ParcelaAberta[] = (
    (abertas ?? []) as { checkout_id: string; numero: number; prevista_para: string; liquido: string }[]
  ).map((p) => ({
    checkoutId: p.checkout_id,
    numero: p.numero,
    previstaPara: p.prevista_para,
    liquido: Number(p.liquido),
  }))

  for (const c of (creditos ?? []) as { chave_externa: string; ocorrido_em: string; valor: string }[]) {
    if (!c.chave_externa) continue
    rodada.examinados++
    const conjunto = parcelasQueFechamODeposito(Number(c.valor), c.ocorrido_em, parcelas)
    if (!conjunto) continue

    const { data, error } = await sb.rpc('casar_repasse_pagaleve_exato', {
      p_chave: c.chave_externa,
      p_parcelas: conjunto.map((p) => ({ checkout_id: p.checkoutId, numero: p.numero })),
    })
    if (error) {
      rodada.erros.push(`${c.chave_externa}: ${error.message}`)
      continue
    }
    if ((data as { ok?: boolean } | null)?.ok) {
      rodada.casados.push({ chave: c.chave_externa, parcelas: conjunto.length, valor: Number(c.valor) })
      const usadas = new Set(conjunto.map((p) => `${p.checkoutId}:${p.numero}`))
      parcelas = parcelas.filter((p) => !usadas.has(`${p.checkoutId}:${p.numero}`))
    }
  }
  return rodada
}
