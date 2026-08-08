'use server'

import { revalidatePath } from 'next/cache'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import type { PerfumeBase } from '@/domain'

export interface EdicaoPerfume {
  id: string
  genero: PerfumeBase['genero'] | null
  custoPorMl: number
  consumoDiarioMl: number
  ativo: boolean
}

export type RespostaEdicao = { ok: true } | { ok: false; erro: string }

/**
 * Edita os campos que pertencem ao ERP. Nome, marca e imagem NÃO entram:
 * são da Shopify e a próxima importação os traria de volta — editá-los aqui
 * seria uma alteração que se desfaz sozinha.
 *
 * Volume também fica de fora: ele muda por compra, produção ou inventário —
 * cada uma com seu lançamento. Um campo de texto aqui furaria a trilha.
 */
export async function salvarPerfumeBase(dados: EdicaoPerfume): Promise<RespostaEdicao> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para salvar.' }
  }
  if (!dados.id) return { ok: false, erro: 'Perfume não identificado.' }
  if (!Number.isFinite(dados.custoPorMl) || dados.custoPorMl < 0) {
    return { ok: false, erro: 'O custo por ml não pode ser negativo.' }
  }
  if (!Number.isFinite(dados.consumoDiarioMl) || dados.consumoDiarioMl < 0) {
    return { ok: false, erro: 'O consumo diário não pode ser negativo.' }
  }

  const { error } = await supabaseServer()
    .from('perfumes_base')
    .update({
      genero: dados.genero,
      // Marca a escolha como manual para a importação não sobrescrever.
      genero_manual: dados.genero !== null,
      custo_por_ml: dados.custoPorMl,
      consumo_diario_ml: dados.consumoDiarioMl,
      ativo: dados.ativo,
    })
    .eq('id', dados.id)

  if (error) {
    console.error('[catalogo] salvar perfume falhou:', error)
    return { ok: false, erro: error.message || 'Falha ao salvar o perfume.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
