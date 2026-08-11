'use server'

import { revalidatePath } from 'next/cache'

import { aplicarPrecosShopify, mensagemDe, type AlvoPreco } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import type { VarianteMl } from '@/domain'

import { buscarPrecos } from '../concorrentes/busca'

export type RespostaPrecos =
  | { ok: true; aplicadas: number; ignoradas: { variante: string; motivo: string }[] }
  | { ok: false; erro: string }

export interface PrecoAPublicar {
  baseId: string
  variante: number
  preco: number
}

/**
 * Publica na Shopify os preços que o ERP calculou.
 *
 * A ordem importa: só grava `preco_praticado` DEPOIS que a loja aceitou. Se
 * gravasse antes, a tela diria "publicado" para um preço que continua o
 * antigo na vitrine — e o erro só apareceria na próxima importação.
 *
 * O caminho até o checkout é indireto de propósito: a Shopify é dona do
 * catálogo e a Yampi espelha o catálogo dela. Escrever nas duas criaria duas
 * verdades de preço, e a próxima sincronia desfaria uma.
 */
export async function publicarPrecos(itens: PrecoAPublicar[]): Promise<RespostaPrecos> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para publicar preços.' }
  }
  if (itens.length === 0) return { ok: false, erro: 'Nenhum preço para publicar.' }
  const semPreco = itens.find((i) => !(i.preco > 0))
  if (semPreco) {
    return { ok: false, erro: 'Há preço zerado na seleção — confira o custo por ml da base.' }
  }

  try {
    const sb = supabaseServer()

    const baseIds = [...new Set(itens.map((i) => i.baseId))]
    const [{ data: derivados, error: erroDer }, { data: bases, error: erroBase }] =
      await Promise.all([
        sb
          .from('produtos_derivados')
          .select('base_id, variante, shopify_variant_id')
          .in('base_id', baseIds),
        sb.from('perfumes_base').select('id, nome, shopify_product_id').in('id', baseIds),
      ])
    if (erroDer) throw erroDer
    if (erroBase) throw erroBase

    const varianteDe = new Map(
      (derivados ?? []).map((d) => [`${d.base_id}|${d.variante}`, d.shopify_variant_id as string | null]),
    )
    const produtoDe = new Map(
      (bases ?? []).map((b) => [
        b.id,
        { nome: b.nome as string, produtoId: b.shopify_product_id as string | null },
      ]),
    )

    const alvos: AlvoPreco[] = itens.map((i) => {
      const base = produtoDe.get(i.baseId)
      return {
        shopifyProductId: base?.produtoId ?? '',
        shopifyVariantId: varianteDe.get(`${i.baseId}|${i.variante}`) ?? '',
        rotulo: `${base?.nome ?? i.baseId} · ${i.variante} ml`,
        preco: i.preco,
      }
    })

    const resultado = await aplicarPrecosShopify(alvos)

    const recusadas = new Set(resultado.ignoradas.map((g) => g.variante))
    const confirmados = itens.filter((_, i) => !recusadas.has(alvos[i].rotulo))

    if (confirmados.length) {
      const { error } = await sb.from('produtos_derivados').upsert(
        confirmados.map((i) => ({
          base_id: i.baseId,
          variante: i.variante,
          preco_praticado: i.preco,
        })),
        { onConflict: 'base_id,variante' },
      )
      if (error) throw error
    }

    const { error: erroLog } = await sb.from('sincronizacoes').insert({
      origem: 'shopify',
      tipo: 'preco',
      perfumes: baseIds.length,
      variantes: resultado.aplicadas,
      ignorados: resultado.ignoradas.length,
      detalhes: resultado.ignoradas,
    })
    if (erroLog) throw erroLog

    revalidatePath('/', 'layout')
    return { ok: true, aplicadas: resultado.aplicadas, ignoradas: resultado.ignoradas }
  } catch (e) {
    console.error('[shopify] publicação de preço falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

export interface PrecoDeMercado {
  variante: VarianteMl
  /** Menor preço encontrado entre os concorrentes. */
  menor: number
  fonte: string
  /** Quantas lojas têm esta variante deste perfume. */
  lojas: number
}

/**
 * O menor preço do mercado para este perfume, por variante.
 *
 * O caminho principal é o vínculo que a COLETA já gravou: `base_id` em cada
 * preço lido, casado por título ou ensinado à mão. A busca textual não serve
 * aqui — ela exige que TODA palavra do nosso nome apareça no título do
 * concorrente, e nomes como "Erba Pura Unissex Eau de Parfum" nunca casam
 * porque loja nenhuma escreve "unissex". Era isso que deixava a coluna
 * inteira em "sem leitura". O texto fica de reserva, para base que a coleta
 * ainda não casou.
 */
export async function mercadoDaBase(baseId: string): Promise<PrecoDeMercado[]> {
  if (!supabaseConfigurado()) return []
  const sb = supabaseServer()

  const { data: casados } = await sb
    .from('concorrente_precos')
    .select('variante, preco, concorrentes(nome)')
    .eq('base_id', baseId)
    .not('variante', 'is', null)

  const observados = ((casados ?? []) as unknown as {
    variante: number
    preco: number | string
    concorrentes: { nome: string } | null
  }[]).map((p) => ({
    variante: p.variante as VarianteMl,
    preco: Number(p.preco),
    fonte: p.concorrentes?.nome ?? '—',
  }))

  if (observados.length > 0) {
    const porVariante = new Map<VarianteMl, Map<string, number>>()
    for (const o of observados) {
      if (!(o.preco > 0)) continue
      const fontes = porVariante.get(o.variante) ?? new Map<string, number>()
      const atual = fontes.get(o.fonte)
      // Mesma loja com dois preços para o tamanho: vale o menor, que é o que
      // o cliente pagaria lá.
      if (atual === undefined || o.preco < atual) fontes.set(o.fonte, o.preco)
      porVariante.set(o.variante, fontes)
    }
    return [...porVariante.entries()]
      .map(([variante, fontes]) => {
        const [fonte, menor] = [...fontes.entries()].sort((a, b) => a[1] - b[1])[0]
        return { variante, menor, fonte, lojas: fontes.size }
      })
      .sort((a, b) => a.variante - b.variante)
  }

  // Nenhum preço casado com esta base: tenta pelo nome, do jeito da tela de
  // Concorrentes. Acha menos, mas acha algo para base recém-cadastrada.
  const { data: base } = await sb
    .from('perfumes_base')
    .select('nome')
    .eq('id', baseId)
    .maybeSingle()
  if (!base?.nome) return []

  const r = await buscarPrecos(String(base.nome))
  if (!r) return []

  return r.linhas
    .filter((l) => l.menor !== null)
    .map((l) => {
      const barata = Object.values(l.porFonte).sort((a, b) => a.preco - b.preco)[0]
      return {
        variante: l.variante,
        menor: l.menor as number,
        fonte: barata?.fonte ?? '—',
        lojas: Object.keys(l.porFonte).length,
      }
    })
}
