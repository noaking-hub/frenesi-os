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

/** `Libre Intense (Decant)` → `libre-intense-decant`, como o handle da Shopify. */
function idDe(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * Cria um perfume base fora da Shopify — decant de frasco comprado avulso,
 * amostra, exclusivo que não está na loja.
 *
 * Nasce com volume e custo zerados de propósito: quem os define é a compra do
 * frasco, em Estoque → Lotes. Digitar volume aqui criaria estoque sem lote e
 * a conciliação apontaria divergência já no primeiro dia.
 */
export async function criarPerfumeBase(dados: {
  nome: string
  marca: string
  genero: PerfumeBase['genero'] | null
}): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para cadastrar perfumes.' }
  }
  const nome = dados.nome.trim()
  const marca = dados.marca.trim()
  if (!nome) return { ok: false, erro: 'Informe o nome do perfume.' }
  if (!marca) return { ok: false, erro: 'Informe a marca.' }

  const id = idDe(`${marca} ${nome}`)
  if (!id) return { ok: false, erro: 'Nome e marca não formam um identificador válido.' }

  const { error } = await supabaseServer()
    .from('perfumes_base')
    .insert({
      id,
      nome,
      marca,
      genero: dados.genero,
      genero_manual: dados.genero !== null,
      custo_por_ml: 0,
      volume_ml: 0,
      consumo_diario_ml: 0,
      ativo: true,
    })

  if (error) {
    console.error('[catalogo] criar perfume falhou:', error)
    // 23505 é violação de unicidade: já existe base com esse nome e marca.
    if (error.code === '23505') {
      return { ok: false, erro: `Já existe um perfume base com esse nome e marca (${id}).` }
    }
    return { ok: false, erro: error.message || 'Falha ao cadastrar o perfume.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, id }
}
