'use server'

import { revalidatePath } from 'next/cache'

import {
  gerarCreditosCashback,
  gravarRegraCashback,
  lancarMovimentoCashback,
  type RegraCashback,
} from '@/data/cashback'

type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

export async function salvarRegra(r: RegraCashback): Promise<Resposta> {
  if (!(r.pct > 0) || r.pct >= 100) return { ok: false, erro: 'O percentual precisa estar entre 0 e 100.' }
  if (!(r.validadeDias > 0)) return { ok: false, erro: 'A validade precisa ser de pelo menos 1 dia.' }
  try {
    await gravarRegraCashback(r)
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
  revalidatePath('/crm/cashback')
  return { ok: true }
}

export async function gerarCreditos(): Promise<Resposta<{ gerados: number; valor: number }>> {
  try {
    const r = await gerarCreditosCashback()
    revalidatePath('/crm/cashback')
    return { ok: true, ...r }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

export async function lancarMovimento(dados: {
  email: string
  nome: string
  valor: number
  descricao: string
}): Promise<Resposta> {
  try {
    await lancarMovimentoCashback(dados)
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
  revalidatePath('/crm/cashback')
  return { ok: true }
}
