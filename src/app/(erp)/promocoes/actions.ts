'use server'

import { revalidatePath } from 'next/cache'

import { criarCupomYampi, type NovoCupom } from '@/data/yampi-crm'

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
