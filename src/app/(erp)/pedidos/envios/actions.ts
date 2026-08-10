'use server'

import { revalidatePath } from 'next/cache'

import { mensagemDe, shopifyConfigurada, sincronizarEnviosShopify } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import type { EnvioParaShopify } from '@/data/shopify'

export type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

export interface ResultadoBaixa {
  enviados: number
  entregues: number
  fechados: number
  ignorados: { pedido: string; motivo: string }[]
  semEspelho: string[]
}

/**
 * Espelha na Shopify o que a Yampi já sabe.
 *
 * É a razão de existir da integração: a Yampi recebe o rastreio e confirma a
 * entrega, mas não devolve nada para a Shopify. O cliente entra na conta, vê
 * "confirmado" e abre chamado perguntando do pedido que chegou há três dias.
 *
 * Rodar de novo é seguro. A Shopify recusa criar um fulfillment onde já não há
 * fulfillment order aberto, e esse pedido volta em `ignorados` com o motivo —
 * não como erro que derruba a rodada inteira.
 *
 * Sem `pedidoIds`, processa a fila toda: entregue na Yampi e ainda sem baixa.
 */
export async function baixarNaShopify(pedidoIds?: string[]): Promise<Resposta<{ resultado: ResultadoBaixa }>> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para ler a fila de baixa.' }
  }
  if (!shopifyConfigurada()) {
    return {
      ok: false,
      erro: 'Faltam as credenciais da Shopify. Sem elas o ERP não consegue marcar o pedido como entregue na loja.',
    }
  }

  try {
    const sb = supabaseServer()
    let consulta = sb
      .from('pedidos')
      .select('id, shopify_numero, rastreio, envio, entrega_shopify_em')
      .eq('envio', 'entregue')
      .is('entrega_shopify_em', null)
      .limit(200)

    if (pedidoIds?.length) consulta = consulta.in('id', pedidoIds)

    const { data, error } = await consulta
    if (error) return { ok: false, erro: mensagemDe(error) }

    const linhas = (data ?? []) as unknown as {
      id: string
      shopify_numero: string | null
      rastreio: string | null
    }[]

    // Pedido que nasceu na Yampi e nunca foi espelhado na Shopify não tem o
    // que baixar lá. Devolver a lista é melhor que somar como "ignorado
    // genérico": o motivo é outro e a ação também.
    const semEspelho = linhas.filter((p) => !p.shopify_numero).map((p) => p.id)
    const alvos: EnvioParaShopify[] = linhas
      .filter((p) => p.shopify_numero)
      .map((p) => ({
        pedidoId: p.id,
        shopifyNumero: p.shopify_numero as string,
        rastreio: p.rastreio,
        transportadora: null,
        entregue: true,
      }))

    if (alvos.length === 0) {
      return {
        ok: true,
        resultado: { enviados: 0, entregues: 0, fechados: 0, ignorados: [], semEspelho },
      }
    }

    const r = await sincronizarEnviosShopify(alvos)

    // Só marca no ERP o que a Shopify de fato aceitou. Gravar a baixa antes da
    // confirmação faria o pedido sumir da fila sem ter sido baixado — e o
    // problema voltaria como chamado do cliente, não como linha na tela.
    const falhou = new Set(r.ignorados.map((i) => i.pedido))
    const baixados = alvos.map((a) => a.pedidoId).filter((id) => !falhou.has(id))
    if (baixados.length) {
      const agora = new Date().toISOString()
      const { error: erroUpdate } = await sb
        .from('pedidos')
        .update({ entrega_shopify_em: agora, baixado_shopify: true })
        .in('id', baixados)
      if (erroUpdate) return { ok: false, erro: mensagemDe(erroUpdate) }
    }

    revalidatePath('/', 'layout')
    return { ok: true, resultado: { ...r, semEspelho } }
  } catch (e) {
    console.error('[envios] baixar na Shopify falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}
