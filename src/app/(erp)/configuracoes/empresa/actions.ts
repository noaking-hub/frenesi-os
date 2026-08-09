'use server'

import { revalidatePath } from 'next/cache'

import { OPERADOR } from '@/data/operador'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

export interface DadosEmpresa {
  razaoSocial: string
  nomeFantasia: string
  cnpj: string
  inscricao: string
  regime: string
  email: string
  telefone: string
  cep: string
  logradouro: string
  cidade: string
  uf: string
}

export type RespostaEmpresa = { ok: true } | { ok: false; erro: string }

/** CNPJ com 14 dígitos. Formatação é da tela; aqui só o que é dado. */
function somenteDigitos(v: string): string {
  return v.replace(/\D/g, '')
}

/**
 * Salva os dados da empresa.
 *
 * A tabela tem linha única por construção — CNPJ e endereço aparecem no
 * rótulo do decant e na cotação de frete, e duas linhas fariam o sistema
 * escolher uma ao acaso.
 */
export async function salvarEmpresa(dados: DadosEmpresa): Promise<RespostaEmpresa> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para salvar.' }
  }
  const cnpj = somenteDigitos(dados.cnpj)
  if (cnpj && cnpj.length !== 14) {
    return { ok: false, erro: 'O CNPJ precisa ter 14 dígitos.' }
  }
  const uf = dados.uf.trim().toUpperCase()
  if (uf && uf.length !== 2) {
    return { ok: false, erro: 'A UF precisa ter 2 letras.' }
  }

  const { error } = await supabaseServer()
    .from('empresa')
    .update({
      razao_social: dados.razaoSocial.trim(),
      nome_fantasia: dados.nomeFantasia.trim(),
      cnpj,
      inscricao: dados.inscricao.trim(),
      regime: dados.regime.trim(),
      email: dados.email.trim(),
      telefone: dados.telefone.trim(),
      cep: somenteDigitos(dados.cep),
      logradouro: dados.logradouro.trim(),
      cidade: dados.cidade.trim(),
      uf: uf || null,
      atualizado_em: new Date().toISOString(),
      atualizado_por: OPERADOR,
    })
    .eq('id', true)

  if (error) {
    console.error('[empresa] salvar falhou:', error)
    return { ok: false, erro: error.message || 'Falha ao salvar os dados da empresa.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
