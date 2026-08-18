'use server'

import { CONCORRENTES, primeiraPalavra } from '@/domain'
import {
  pesquisasAnteriores,
  referenciaFrenesi,
  registrarPesquisa,
  vitrineDoConcorrente,
  type PesquisaAnterior,
  type ReferenciaFrenesi,
  type VitrineDaLoja,
} from '@/data/pesquisa-de-mercado'

/**
 * Uma loja por chamada: a rodada inteira numa action só encostava no teto da
 * função da Netlify, e o estouro chegava ao navegador como página de erro.
 * O cliente dispara as seis em paralelo e desenha cada vitrine ao chegar.
 */
export async function pesquisarLoja(
  chave: string,
  termo: string,
): Promise<{ ok: true; vitrine: VitrineDaLoja } | { ok: false; erro: string }> {
  const c = CONCORRENTES.find((x) => x.chave === chave)
  if (!c) return { ok: false, erro: 'Loja desconhecida.' }
  if (!primeiraPalavra(termo)) return { ok: false, erro: 'Diga o nome do perfume a pesquisar.' }
  try {
    // O termo INTEIRO segue adiante: a loja é buscada pela primeira palavra,
    // mas o filtro respeita tudo que foi digitado.
    return { ok: true, vitrine: await vitrineDoConcorrente(c, termo) }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

/** A régua da casa: os preços FRENESI do perfume pesquisado. */
export async function reguaDaCasa(
  termo: string,
): Promise<{ ok: true; palavra: string; frenesi: ReferenciaFrenesi[] } | { ok: false; erro: string }> {
  const palavra = primeiraPalavra(termo)
  if (!palavra) return { ok: false, erro: 'Diga o nome do perfume a pesquisar.' }
  try {
    return { ok: true, palavra, frenesi: await referenciaFrenesi(palavra) }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

/** Fecha a rodada: grava o histórico e devolve a lista atualizada. */
export async function registrarRodada(
  termo: string,
  palavra: string,
  vitrines: Pick<VitrineDaLoja, 'chave' | 'cartoes' | 'erro'>[],
): Promise<PesquisaAnterior[]> {
  await registrarPesquisa(termo, palavra, vitrines)
  return pesquisasAnteriores()
}
