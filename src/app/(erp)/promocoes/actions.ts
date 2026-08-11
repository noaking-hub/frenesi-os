'use server'

import { revalidatePath } from 'next/cache'

import {
  atualizarCupomYampi,
  criarCupomYampi,
  excluirCupomYampi,
  type NovoCupom,
} from '@/data/yampi-crm'

export type RespostaCupom = { ok: true } | { ok: false; erro: string }

export async function criarCupom(cupom: NovoCupom): Promise<RespostaCupom> {
  try {
    await criarCupomYampi(cupom)
    revalidatePath('/promocoes')
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

export interface ResultadoLote {
  criados: string[]
  falhas: { codigo: string; erro: string }[]
}

/**
 * Cadastra uma leva de cupons de uma vez — a coluna da planilha, colada.
 *
 * Um por chamada, em sequência: a Yampi não tem criação em lote, e disparar
 * cinquenta POSTs em paralelo é convite para limite de requisição. Cada
 * falha é individual — os outros códigos seguem sendo criados.
 */
export async function criarCuponsEmLote(
  codigos: string[],
  regra: Omit<NovoCupom, 'codigo'>,
): Promise<{ ok: true; resultado: ResultadoLote } | { ok: false; erro: string }> {
  const unicos = [...new Set(codigos.map((c) => c.trim().toUpperCase()).filter(Boolean))]
  if (unicos.length === 0) return { ok: false, erro: 'Nenhum código para cadastrar.' }
  if (unicos.length > 300) {
    return { ok: false, erro: 'Mais de 300 códigos de uma vez — divida a planilha.' }
  }

  const resultado: ResultadoLote = { criados: [], falhas: [] }
  for (const codigo of unicos) {
    try {
      await criarCupomYampi({ ...regra, codigo })
      resultado.criados.push(codigo)
    } catch (e) {
      resultado.falhas.push({
        codigo,
        erro: e instanceof Error ? e.message : String(e),
      })
    }
  }
  revalidatePath('/promocoes')
  return { ok: true, resultado }
}

export async function atualizarCupom(
  id: string,
  mudancas: Parameters<typeof atualizarCupomYampi>[1],
): Promise<RespostaCupom> {
  try {
    await atualizarCupomYampi(id, mudancas)
    revalidatePath('/promocoes')
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

export async function excluirCupom(id: string): Promise<RespostaCupom> {
  try {
    await excluirCupomYampi(id)
    revalidatePath('/promocoes')
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}
