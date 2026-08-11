'use server'

import { revalidatePath } from 'next/cache'

import { aplicarEstoqueCalculado, importarCatalogoShopify, mensagemDe } from '@/data/shopify'
import type { ResultadoAplicacao, ResultadoImportacao } from '@/data/shopify'

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
 * O trabalho mora em `aplicarEstoqueCalculado`, na camada de dados — a mesma
 * função que a rotina de hora em hora chama. Aqui só o embrulho da tela.
 */
export async function aplicarNaShopify(): Promise<RespostaAplicacao> {
  try {
    const resultado = await aplicarEstoqueCalculado()
    revalidatePath('/', 'layout')
    return { ok: true, resultado }
  } catch (e) {
    console.error('[shopify] aplicação de estoque falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}
