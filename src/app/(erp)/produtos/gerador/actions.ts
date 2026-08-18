'use server'

import { revalidatePath } from 'next/cache'

import {
  excluirPresetDoGerador,
  salvarPresetDoGerador,
} from '@/data/gerador-presets'

export async function salvarPreset(nome: string, valores: Record<string, unknown>) {
  const r = await salvarPresetDoGerador(nome, valores)
  if (r.ok) revalidatePath('/produtos/gerador')
  return r
}

export async function excluirPreset(id: string) {
  const r = await excluirPresetDoGerador(id)
  if (r.ok) revalidatePath('/produtos/gerador')
  return r
}
