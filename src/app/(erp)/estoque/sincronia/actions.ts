'use server'

import { revalidatePath } from 'next/cache'

import { importarCatalogoShopify, mensagemDe } from '@/data/shopify'
import type { ResultadoImportacao } from '@/data/shopify'

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
