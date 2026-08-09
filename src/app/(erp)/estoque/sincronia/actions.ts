'use server'

import { revalidatePath } from 'next/cache'

import { carregarSincronia } from '@/data/consultas'
import { aplicarEstoqueShopify, importarCatalogoShopify, mensagemDe } from '@/data/shopify'
import type { ResultadoAplicacao, ResultadoImportacao } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

export type RespostaImportacao =
  | { ok: true; resultado: ResultadoImportacao }
  | { ok: false; erro: string }

/** Importa o catálogo da Shopify e revalida as telas que derivam dele. */
export async function importarCatalogo(): Promise<RespostaImportacao> {
  try {
    const resultado = await importarCatalogoShopify()
    revalidatePath('/', 'layout')
    return { ok: true, resultado }
  } catch (e) {
    // O erro completo fica no terminal do servidor; a tela recebe a mensagem.
    console.error('[shopify] importação falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

export type RespostaAplicacao =
  | { ok: true; resultado: ResultadoAplicacao & { pulados: number } }
  | { ok: false; erro: string }

/**
 * Publica na Shopify o estoque que o ERP calculou.
 *
 * Só manda o que está fora de sincronia: reenviar o valor que já está lá
 * gastaria chamada e sujaria o histórico da loja sem mudar nada.
 */
export async function aplicarNaShopify(): Promise<RespostaAplicacao> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para aplicar na Shopify.' }
  }

  try {
    const sync = await carregarSincronia()
    const sb = supabaseServer()

    // O id da variante na loja mora em produtos_derivados; sem ele não há o
    // que gravar — a base foi criada à mão ou nunca veio da importação.
    const { data: derivados, error } = await sb
      .from('produtos_derivados')
      .select('base_id, variante, shopify_variant_id')
    if (error) throw error
    const idPorChave = new Map(
      (derivados ?? [])
        .filter((d) => d.shopify_variant_id)
        .map((d) => [`${d.base_id}|${d.variante}`, d.shopify_variant_id as string]),
    )

    const alvos: { shopifyVariantId: string; rotulo: string; novoValor: number }[] = []
    const gravar: { base_id: string; variante: number; publicado: number }[] = []
    let pulados = 0

    for (const b of sync.bases) {
      for (const v of b.variantes) {
        // `sem_carga` é a trava que impede a loja de ir a zero: base que nunca
        // recebeu carga inicial não tem volume porque ninguém contou, não
        // porque acabou. Gravar zero aí tiraria o produto do ar.
        if (v.acao === 'ok' || v.acao === 'sem_carga') continue
        const id = idPorChave.get(`${b.base.id}|${v.variante}`)
        if (!id) {
          pulados++
          continue
        }
        alvos.push({
          shopifyVariantId: id,
          rotulo: `${b.base.nome} · ${v.variante} ml`,
          novoValor: v.novoValor,
        })
        gravar.push({ base_id: b.base.id, variante: v.variante, publicado: v.novoValor })
      }
    }

    const resultado = await aplicarEstoqueShopify(alvos)

    // O que a loja recusou não pode entrar como publicado — senão a tela diria
    // "em dia" para uma variante que continua vendendo o número antigo.
    const recusadas = new Set(resultado.ignoradas.map((i) => i.variante))
    const confirmadas = gravar.filter((g, i) => !recusadas.has(alvos[i].rotulo))

    if (confirmadas.length) {
      const agora = new Date().toISOString()
      const { error: erroGravar } = await sb
        .from('shopify_publicado')
        .upsert(
          confirmadas.map((c) => ({ ...c, lido_em: agora })),
          { onConflict: 'base_id,variante' },
        )
      if (erroGravar) throw erroGravar
    }

    const { error: erroLog } = await sb.from('sincronizacoes').insert({
      origem: 'shopify',
      tipo: 'estoque',
      perfumes: new Set(confirmadas.map((c) => c.base_id)).size,
      variantes: resultado.aplicadas,
      ignorados: resultado.ignoradas.length + pulados,
      detalhes: resultado.ignoradas,
    })
    if (erroLog) throw erroLog

    revalidatePath('/', 'layout')
    return { ok: true, resultado: { ...resultado, pulados } }
  } catch (e) {
    console.error('[shopify] aplicação de estoque falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}
