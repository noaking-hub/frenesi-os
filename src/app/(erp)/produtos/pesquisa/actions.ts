'use server'

import {
  pesquisarMercado,
  pesquisasAnteriores,
  type PesquisaAnterior,
  type PesquisaDeMercado,
} from '@/data/pesquisa-de-mercado'

export async function pesquisar(
  termo: string,
): Promise<
  { ok: true; pesquisa: PesquisaDeMercado; historico: PesquisaAnterior[] } | { ok: false; erro: string }
> {
  try {
    const pesquisa = await pesquisarMercado(termo)
    return { ok: true, pesquisa, historico: await pesquisasAnteriores() }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}
