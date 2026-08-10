'use server'

import { revalidatePath } from 'next/cache'

import { gravarLinhas } from '@/data/extrato'
import { diagnosticarMercadoPago, sincronizarMercadoPago } from '@/data/mercadopago'
import { OPERADOR } from '@/data/operador'
import { mensagemDe } from '@/data/shopify'
import { CONTA_SICOOB, diagnosticarSicoob, sincronizarSicoob } from '@/data/sicoob'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { decodificarOfx, lerOfx } from '@/domain'
import type { ResultadoSincroniaMp } from '@/data/mercadopago'

export type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

function exigeSupabase(acao: string) {
  return supabaseConfigurado()
    ? null
    : { ok: false as const, erro: `O Supabase precisa estar configurado para ${acao}.` }
}

// ── Mercado Pago ───────────────────────────────────────────────────────────

export async function sincronizarGateway(
  de: string,
  ate: string,
): Promise<Resposta<{ resultado: ResultadoSincroniaMp }>> {
  const bloqueio = exigeSupabase('sincronizar o Mercado Pago')
  if (bloqueio) return bloqueio
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
    return { ok: false, erro: 'Informe o período no formato AAAA-MM-DD.' }
  }
  if (de > ate) return { ok: false, erro: 'A data inicial é posterior à final.' }

  try {
    const resultado = await sincronizarMercadoPago(de, ate)
    revalidatePath('/', 'layout')
    return { ok: true, resultado }
  } catch (e) {
    console.error('[extrato] sincronizar Mercado Pago falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

export async function diagnosticarGateway(
  de: string,
  ate: string,
): Promise<Resposta<{ passos: string[]; amostra: string[] }>> {
  try {
    const r = await diagnosticarMercadoPago(de, ate)
    return { ok: true, passos: r.passos, amostra: r.amostra }
  } catch (e) {
    return { ok: false, erro: mensagemDe(e) }
  }
}

// ── Sicoob ─────────────────────────────────────────────────────────────────

export async function sincronizarBanco(
  mes: number,
  ano: number,
): Promise<Resposta<{ lidas: number; novas: number; repetidas: number }>> {
  const bloqueio = exigeSupabase('sincronizar o Sicoob')
  if (bloqueio) return bloqueio

  try {
    const r = await sincronizarSicoob(mes, ano)
    revalidatePath('/', 'layout')
    return { ok: true, lidas: r.lidas, novas: r.novas, repetidas: r.repetidas }
  } catch (e) {
    console.error('[extrato] sincronizar Sicoob falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

export async function diagnosticarBanco(
  mes: number,
  ano: number,
): Promise<Resposta<{ passos: string[]; amostra: string[] }>> {
  try {
    const r = await diagnosticarSicoob(mes, ano)
    return { ok: true, passos: r.passos, amostra: r.amostra }
  } catch (e) {
    return { ok: false, erro: mensagemDe(e) }
  }
}

// ── OFX ────────────────────────────────────────────────────────────────────

export interface ResultadoOfx {
  banco: string
  conta: string
  lidas: number
  novas: number
  repetidas: number
  avisos: string[]
}

/**
 * Importa o OFX exportado do internet banking.
 *
 * A conta do ERP é escolhida por quem importa: o arquivo diz o número da
 * conta no banco, não qual das nossas contas cadastradas ela é. Adivinhar
 * pelo número jogaria o extrato do Sicoob na conta do Mercado Pago no dia em
 * que os números coincidissem.
 */
export async function importarOfx(formulario: FormData): Promise<Resposta<{ resultado: ResultadoOfx }>> {
  const bloqueio = exigeSupabase('importar o extrato')
  if (bloqueio) return bloqueio

  const arquivo = formulario.get('arquivo')
  const contaId = String(formulario.get('conta') ?? '').trim() || CONTA_SICOOB

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: 'Escolha o arquivo .ofx exportado do internet banking.' }
  }
  if (arquivo.size > 8 * 1024 * 1024) {
    return { ok: false, erro: 'O arquivo tem mais de 8 MB — exporte um período menor.' }
  }

  try {
    const texto = decodificarOfx(new Uint8Array(await arquivo.arrayBuffer()))
    const lido = lerOfx(texto)

    if (lido.linhas.length === 0) {
      // Falhar dizendo o motivo é melhor que gravar zero linhas e devolver
      // "importado com sucesso" — que é como se perde um mês de extrato.
      return {
        ok: false,
        erro: ['Nenhum lançamento foi lido do arquivo.', ...lido.avisos].join(' '),
      }
    }

    const sb = supabaseServer()
    await sb.rpc('garantir_conta', {
      p_id: contaId,
      p_nome: contaId === CONTA_SICOOB ? 'Sicoob' : contaId,
      p_tipo: 'Conta corrente',
      p_banco: lido.banco || 'Banco',
      p_uso: 'Conta operacional da empresa',
    })

    const r = await gravarLinhas('ofx', contaId, lido.linhas)
    revalidatePath('/', 'layout')

    return {
      ok: true,
      resultado: {
        banco: lido.banco,
        conta: lido.conta,
        lidas: lido.linhas.length,
        novas: r.novas,
        repetidas: r.repetidas,
        avisos: lido.avisos,
      },
    }
  } catch (e) {
    console.error('[extrato] importar OFX falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

// ── Classificação ──────────────────────────────────────────────────────────

export async function classificarLinha(
  origem: string,
  chave: string,
  categoria: string,
  descricao: string,
): Promise<Resposta<{ lancamentoId: string }>> {
  const bloqueio = exigeSupabase('classificar o extrato')
  if (bloqueio) return bloqueio

  const { data, error } = await supabaseServer().rpc('classificar_extrato', {
    p_origem: origem,
    p_chave: chave,
    p_categoria: categoria,
    p_descricao: descricao,
    p_operador: OPERADOR,
  })
  if (error) {
    console.error('[extrato] classificar_extrato falhou:', error)
    return { ok: false, erro: mensagemDe(error) }
  }

  revalidatePath('/', 'layout')
  return { ok: true, lancamentoId: String(data) }
}

export async function ignorarLinha(
  origem: string,
  chave: string,
  motivo: string,
): Promise<Resposta> {
  const bloqueio = exigeSupabase('dispensar linhas do extrato')
  if (bloqueio) return bloqueio
  if (!motivo.trim()) return { ok: false, erro: 'Diga por que esta linha não vira lançamento.' }

  const { error } = await supabaseServer().rpc('ignorar_extrato', {
    p_origem: origem,
    p_chave: chave,
    p_motivo: motivo,
  })
  if (error) {
    console.error('[extrato] ignorar_extrato falhou:', error)
    return { ok: false, erro: mensagemDe(error) }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
