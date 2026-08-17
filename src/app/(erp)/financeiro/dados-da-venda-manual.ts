import 'server-only'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { repositorio } from '@/data/repository'
import { disponivelDe } from '@/domain'

import type { BaseParaVenda } from './VendaManual'

/**
 * O que o formulário de venda manual precisa saber DEPOIS de abrir.
 *
 * Bases com o disponível de verdade e os tamanhos que o catálogo realmente
 * pratica. Uma lista chumbada ofereceria um tamanho que ninguém envasa no dia
 * em que o catálogo mudasse, e o preço praticado — que já existe por variante
 * — é o mesmo número que o operador digitaria à mão.
 *
 * O "depois de abrir" é a correção. Esta função morava no `Promise.all` do
 * render da lista de Lançamentos (page.tsx:175), então rodava a CADA mudança
 * de filtro daquela tela: 412 perfumes (160.667 bytes), 2.054 derivados
 * (242.944 bytes, três páginas do `tudoDe`) e mais uma leitura de contas — 403
 * KB e 6 requisições para alimentar um botão que abre um modal. Pior: como
 * `VendaManual` é 'use client', 95 KB desse catálogo ainda atravessavam para o
 * navegador no payload RSC de toda navegação, com o modal fechado. Era o único
 * custo da tela que NÃO encolhia quando o filtro devolvia uma linha — e é por
 * isso que `?q=Icaro` continuava travando mesmo mostrando "1 de 1268".
 *
 * As contas saíram daqui de propósito: a tela que chama já as tem carregadas,
 * e buscá-las de novo era a segunda leitura da view `saldos_das_contas` no
 * mesmo render — uma view que custa 3,7 ms e quatro subplans agregando
 * `lancamentos` por conta.
 */
export async function dadosDaVendaManual(): Promise<{
  bases: BaseParaVenda[]
  tamanhos: number[]
}> {
  if (!supabaseConfigurado()) return { bases: [], tamanhos: [] }

  const sb = supabaseServer()
  const [perfumes, precos, tamanhos] = await Promise.all([
    repositorio().perfumesBase(),
    // Agregado no banco: as mesmas informações saíam de 2.054 linhas em três
    // requisições, e o código só usava o preço por variante. Ver a migration
    // 20260817122339_catalogo_da_venda_manual_ja_vem_agregado.sql.
    sb.from('precos_da_venda_manual').select('base_id, precos'),
    sb.from('tamanhos_da_venda_manual').select('variante'),
  ])

  const precosPorBase = new Map<string, Record<string, number>>()
  for (const p of (precos.data ?? []) as { base_id: string; precos: Record<string, number> }[]) {
    precosPorBase.set(p.base_id, p.precos ?? {})
  }

  return {
    bases: perfumes.map((b) => ({
      id: b.id,
      nome: b.nome,
      marca: b.marca,
      // Disponível, não físico: reserva é pedido pago à espera de envase, e
      // vendê-la de novo no balcão deixaria o cliente da loja sem o dele.
      disponivelMl: disponivelDe(b),
      precos: precosPorBase.get(b.id) ?? {},
    })),
    tamanhos: ((tamanhos.data ?? []) as { variante: number }[]).map((t) => Number(t.variante)),
  }
}
