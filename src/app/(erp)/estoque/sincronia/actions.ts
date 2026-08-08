'use server'

import { revalidatePath } from 'next/cache'

import { importarCatalogoShopify } from '@/data/shopify'
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
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro inesperado na importação' }
  }
}
