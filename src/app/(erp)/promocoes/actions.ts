'use server'

import { revalidatePath } from 'next/cache'

import {
  atualizarCupomYampi,
  criarCupomYampi,
  excluirCupomYampi,
  lerCuponsYampi,
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
  /** Códigos que a Yampi já tinha — pulados sem gastar requisição. */
  jaExistiam: string[]
  falhas: { codigo: string; erro: string }[]
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Cadastra uma leva de cupons de uma vez — a coluna da planilha, colada.
 *
 * O limite de requisições da Yampi mandou no desenho: um lote de 98 parou
 * no 27º com 429. Então (1) os códigos que já existem são pulados antes de
 * gastar qualquer POST — rodar o MESMO lote de novo só publica o que
 * falta; (2) há meio segundo entre publicações; (3) um 429 espera 30 s e
 * tenta o mesmo código de novo, duas vezes, antes de virar falha.
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

  const resultado: ResultadoLote = { criados: [], jaExistiam: [], falhas: [] }

  // O que a loja já tem não se publica de novo.
  let existentes = new Set<string>()
  try {
    existentes = new Set((await lerCuponsYampi()).cupons.map((c) => c.codigo.toUpperCase()))
  } catch {
    /* sem a lista, o duplicado vira 422 individual — mais lento, não errado */
  }

  for (const codigo of unicos) {
    if (existentes.has(codigo)) {
      resultado.jaExistiam.push(codigo)
      continue
    }
    let tentativas = 0
    for (;;) {
      try {
        await criarCupomYampi({ ...regra, codigo })
        resultado.criados.push(codigo)
        break
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (/429|Too Many/i.test(msg) && tentativas < 2) {
          tentativas++
          await pausa(30_000)
          continue
        }
        resultado.falhas.push({ codigo, erro: msg })
        break
      }
    }
    // Meio segundo entre POSTs mantém o lote abaixo do limite da API.
    await pausa(500)
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
