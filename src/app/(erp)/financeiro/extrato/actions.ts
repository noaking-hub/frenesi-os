'use server'

import { revalidatePath } from 'next/cache'

import {
  CONTA_MP,
  diagnosticarMercadoPago,
  saldoMercadoPago,
  sincronizarMercadoPago,
} from '@/data/mercadopago'
import { OPERADOR } from '@/data/operador'
import { mensagemDe } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { casarObservacao, indexarPedidos } from '@/domain'
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

/**
 * Lê o saldo da conta no Mercado Pago e grava.
 *
 * Botão próprio, separado da sincronia, porque é a única coisa nesta tela
 * que responde "quanto tem na conta AGORA". Escondido dentro de uma
 * sincronia de meses, o erro dele viraria mais uma linha num relatório
 * comprido — e é justamente o número que precisa bater com o app do banco.
 */
export async function lerSaldo(): Promise<Resposta<{ disponivel: number; aLiberar: number }>> {
  const bloqueio = exigeSupabase('gravar o saldo')
  if (bloqueio) return bloqueio

  try {
    const s = await saldoMercadoPago()
    const { error } = await supabaseServer().rpc('registrar_saldo_conta', {
      p_conta_id: CONTA_MP,
      p_disponivel: s.disponivel,
      p_a_liberar: s.aLiberar,
    })
    if (error) return { ok: false, erro: mensagemDe(error) }

    revalidatePath('/', 'layout')
    return { ok: true, disponivel: s.disponivel, aLiberar: s.aLiberar }
  } catch (e) {
    console.error('[extrato] ler saldo falhou:', e)
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

/**
 * Classifica em lote os créditos de venda já casados com pedido.
 *
 * O que sobra na fila é o que precisa de decisão humana: entrada sem pedido
 * casado — dinheiro que entrou sem venda registrada — e as saídas, que têm
 * categoria e sustentam o DRE.
 */
export async function classificarRecebimentos(contaId: string): Promise<Resposta<{ feitas: number }>> {
  const bloqueio = exigeSupabase('classificar o extrato')
  if (bloqueio) return bloqueio

  const { data, error } = await supabaseServer().rpc('classificar_recebimentos', {
    p_origem: 'mercadopago',
    p_conta_id: contaId,
    p_operador: OPERADOR,
  })
  if (error) {
    console.error('[extrato] classificar_recebimentos falhou:', error)
    return { ok: false, erro: mensagemDe(error) }
  }

  revalidatePath('/', 'layout')
  return { ok: true, feitas: Number(data) }
}

/**
 * Apaga a leitura do gateway e lê de novo.
 *
 * A importação é idempotente pela chave do pagamento — o que é certo quando
 * o fato não muda. Quando a LEITURA estava errada, porém, ressincronizar não
 * conserta: a linha já existe e é preservada. Este é o caminho para desfazer
 * uma leitura ruim, e ele só alcança o que ninguém classificou ainda.
 */
export async function relerGateway(
  de: string,
  ate: string,
): Promise<Resposta<{ apagadas: number; resultado: ResultadoSincroniaMp }>> {
  const bloqueio = exigeSupabase('reler o Mercado Pago')
  if (bloqueio) return bloqueio

  try {
    const { data, error } = await supabaseServer().rpc('descartar_leitura', {
      p_origem: 'mercadopago',
      p_conta_id: CONTA_MP,
    })
    if (error) return { ok: false, erro: mensagemDe(error) }

    const resultado = await sincronizarMercadoPago(de, ate)
    revalidatePath('/', 'layout')
    return { ok: true, apagadas: Number(data), resultado }
  } catch (e) {
    console.error('[extrato] reler gateway falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

/**
 * Tenta de novo casar com pedido as linhas que ficaram órfãs.
 *
 * Serve para depois de importar mais histórico de pedidos: a linha do extrato
 * de fevereiro não achou pedido porque o pedido de fevereiro não existia no
 * ERP. Sem isto, a única saída seria apagar e reler o extrato inteiro.
 */
export async function recasarExtrato(): Promise<Resposta<{ religadas: number; restantes: number }>> {
  const bloqueio = exigeSupabase('recasar o extrato')
  if (bloqueio) return bloqueio

  try {
    const sb = supabaseServer()
    const [{ data: linhas, error: e1 }, { data: pedidos, error: e2 }] = await Promise.all([
      sb
        .from('extrato_linhas')
        .select('chave, ocorrido_em, documento, bruto')
        .eq('origem', 'mercadopago')
        .eq('tipo', 'entrada')
        .is('pedido_id', null)
        .limit(2000),
      sb.from('pedidos').select('id, valor, comprado_em').limit(10000),
    ])
    if (e1) return { ok: false, erro: mensagemDe(e1) }
    if (e2) return { ok: false, erro: mensagemDe(e2) }

    const indice = indexarPedidos(
      (pedidos ?? []).map((p) => ({
        id: p.id as string,
        valor: Number(p.valor),
        data: String(p.comprado_em).slice(0, 10),
      })),
    )

    let religadas = 0
    for (const l of (linhas ?? []) as unknown as {
      chave: string
      ocorrido_em: string
      documento: string
      bruto: { bruto?: number } | null
    }[]) {
      const achou = casarObservacao(
        { referencia: l.documento ?? '', valor: Number(l.bruto?.bruto ?? 0), data: l.ocorrido_em },
        indice,
      )
      if (!achou) continue
      const { error } = await sb.rpc('religar_extrato', {
        p_origem: 'mercadopago',
        p_chave: l.chave,
        p_pedido_id: achou.pedidoId,
      })
      if (!error) religadas += 1
    }

    revalidatePath('/', 'layout')
    return { ok: true, religadas, restantes: (linhas ?? []).length - religadas }
  } catch (e) {
    console.error('[extrato] recasar falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}
