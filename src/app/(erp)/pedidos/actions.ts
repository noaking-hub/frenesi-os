'use server'

import { revalidatePath } from 'next/cache'

import {
  derivarConsumoDiario,
  escoposDoToken,
  esquecerToken,
  importarPedidosShopify,
  mensagemDe,
} from '@/data/shopify'
import type { ResultadoPedidos } from '@/data/shopify'

export type RespostaPedidos =
  | { ok: true; resultado: ResultadoPedidos & { basesComConsumo: number } }
  | { ok: false; erro: string }

/**
 * Importa os pedidos da Shopify e, na sequência, deriva o consumo diário de
 * cada base das vendas pagas.
 *
 * As duas coisas andam juntas de propósito: o consumo é o que sustenta a
 * cobertura ("acaba em X dias") em Estoque e a fila de reposição. Importar
 * venda sem recalcular consumo deixaria a cobertura apontando para um número
 * digitado à mão, agora desatualizado.
 */
export async function importarPedidos(dias = 60): Promise<RespostaPedidos> {
  try {
    const resultado = await importarPedidosShopify(dias)
    const { bases } = await derivarConsumoDiario(30)
    revalidatePath('/', 'layout')
    return { ok: true, resultado: { ...resultado, basesComConsumo: bases } }
  } catch (e) {
    console.error('[shopify] importação de pedidos falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

export type RespostaDiagnostico =
  | { ok: true; loja: string; escopos: string[]; faltando: string[] }
  | { ok: false; erro: string }

/** O que cada operação do ERP exige da Shopify. */
const EXIGIDOS = [
  'read_products',
  'read_inventory',
  'write_inventory',
  'read_locations',
  'read_orders',
]

/**
 * Pergunta à Shopify quais escopos o token REALMENTE tem.
 *
 * É a única fonte que encerra a dúvida entre "o app declara" e "o token tem":
 * lançar versão no dev dashboard não atualiza sozinho a instalação na loja, e
 * as duas telas mostram listas diferentes sem avisar.
 */
export async function diagnosticarShopify(): Promise<RespostaDiagnostico> {
  try {
    // Descarta o token guardado antes de perguntar: diagnosticar com um token
    // de 20 horas atrás responderia sobre o passado.
    esquecerToken()
    const { loja, escopos } = await escoposDoToken()
    return {
      ok: true,
      loja,
      escopos,
      faltando: EXIGIDOS.filter((e) => !escopos.includes(e)),
    }
  } catch (e) {
    console.error('[shopify] diagnóstico falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}
