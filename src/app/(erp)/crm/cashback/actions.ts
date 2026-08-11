'use server'

import { extratoCashbackYampi, type MovimentoCashback } from '@/data/cashback'

export type RespostaExtrato =
  | { ok: true; movimentos: MovimentoCashback[]; camposCrus: string[] }
  | { ok: false; erro: string }

/** Extrato de uma carteira, ao vivo da Yampi — chamado ao abrir o cliente. */
export async function extratoDoCliente(customerId: string): Promise<RespostaExtrato> {
  try {
    const r = await extratoCashbackYampi(customerId)
    return { ok: true, ...r }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}
