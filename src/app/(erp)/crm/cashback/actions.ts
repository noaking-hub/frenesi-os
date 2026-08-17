'use server'

import { revalidatePath } from 'next/cache'

import {
  extratoCashbackYampi,
  metricasDoPeriodo,
  registrarAvisoCashback,
  type MovimentoCashback,
} from '@/data/cashback'
import { conjuntoDescadastrado, linkDeDescadastro } from '@/data/descadastro'
import { emailConfigurado, entregar } from '@/data/email'
import { lerModeloEmail } from '@/data/modelo-email'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { aplicarSite, emailCashback, type MetricasCashback, type Periodo } from '@/domain'

export type RespostaExtrato =
  | { ok: true; movimentos: MovimentoCashback[]; saldo: number; camposCrus: string[] }
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

/** As métricas do período escolhido nos filtros do topo. */
export async function metricasCashbackDoPeriodo(
  periodo: Periodo,
): Promise<{ ok: true; metricas: MetricasCashback } | { ok: false; erro: string }> {
  try {
    return { ok: true, metricas: await metricasDoPeriodo(periodo) }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

export interface ResultadoAviso {
  enviados: number
  semEmail: number
  /** Pulados por terem cancelado a inscrição. */
  descadastrados: number
  falhas: { quem: string; erro: string }[]
}

/**
 * Avisa os clientes escolhidos de que o cashback deles vai vencer.
 *
 * O saldo e a validade saem do espelho, não do que a tela mandou: o e-mail
 * promete dinheiro, e prometer um valor que a tela tinha em cache seria pior
 * que não avisar.
 */
export async function enviarAvisoCashback(
  customerIds: string[],
): Promise<{ ok: true; resultado: ResultadoAviso } | { ok: false; erro: string }> {
  const ids = [...new Set(customerIds)].filter(Boolean)
  if (ids.length === 0) return { ok: false, erro: 'Nenhum cliente selecionado.' }
  if (!emailConfigurado()) {
    return {
      ok: false,
      erro: 'O envio de e-mail não está configurado. Defina RESEND_API_KEY e EMAIL_REMETENTE.',
    }
  }
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para ler os saldos.' }
  }

  const { data, error } = await supabaseServer()
    .from('cashback_yampi')
    .select('customer_id, nome, email, saldo, expira_em')
    .in('customer_id', ids)
  if (error) return { ok: false, erro: error.message }

  const modelo = await lerModeloEmail('cashback')
  const site = process.env.URL ?? process.env.LOJA_URL ?? ''
  const loja = process.env.LOJA_URL ?? 'https://frenesiperfumes.com.br'
  const resultado: ResultadoAviso = { enviados: 0, semEmail: 0, descadastrados: 0, falhas: [] }
  const avisados: string[] = []
  // Uma leitura só da lista de descadastro: consulta por destinatário seriam
  // centenas de idas ao banco no meio de um envio em massa.
  const fora = await conjuntoDescadastrado()

  for (const c of (data ?? []) as {
    customer_id: string
    nome: string | null
    email: string | null
    saldo: number | string
    expira_em: string | null
  }[]) {
    if (!c.email) {
      resultado.semEmail++
      continue
    }
    if (fora.has(c.email.trim().toLowerCase())) {
      resultado.descadastrados++
      continue
    }
    const { assunto, html } = emailCashback(
      {
        nome: c.nome,
        saldo: Number(c.saldo),
        validade: c.expira_em ? c.expira_em.split('-').reverse().join('/') : null,
        lojaUrl: loja,
      },
      modelo,
    )
    const saida = linkDeDescadastro(c.email, site)
    try {
      await entregar({
        para: c.email,
        assunto,
        html: aplicarSite(html, site).split('{descadastrar}').join(saida),
        descadastrar: saida,
      })
      resultado.enviados++
      avisados.push(c.customer_id)
    } catch (e) {
      resultado.falhas.push({
        quem: c.nome ?? c.email,
        erro: e instanceof Error ? e.message : String(e),
      })
    }
    // Meio segundo entre envios: o limite do Resend é por segundo.
    await new Promise((r) => setTimeout(r, 600))
  }

  if (avisados.length) await registrarAvisoCashback(avisados)
  revalidatePath('/crm/cashback')
  return { ok: true, resultado }
}
