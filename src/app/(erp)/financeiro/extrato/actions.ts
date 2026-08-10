'use server'

import { revalidatePath } from 'next/cache'

import {
  CONTA_MP,
  diagnosticarMercadoPago,
  importarLiberacoes,
  pedirRelatorio,
  relatoriosDisponiveis,
  sincronizarMercadoPago,
  sondarRelatorios,
} from '@/data/mercadopago'
import type { RelatorioDisponivel } from '@/data/mercadopago'
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
 * Descobre por onde esta conta entrega saldo e extrato completo.
 *
 * A busca de pagamentos não vê saque nem transferência, e o endpoint de saldo
 * da carteira respondeu 403 — ele não é liberado para aplicação. Em vez de
 * escrever o próximo leitor em cima de um palpite, esta ação bate em todos os
 * caminhos possíveis e mostra o que cada um respondeu, cru.
 *
 * Não grava nada. É medição.
 */
export async function sondarExtratoCompleto(): Promise<Resposta<{ linhas: string[] }>> {
  try {
    const respostas = await sondarRelatorios()
    const linhas: string[] = []
    for (const r of respostas) {
      const rotulo = r.status === 200 ? 'OK' : r.status === 0 ? 'sem token' : `HTTP ${r.status}`
      linhas.push(`${r.metodo} ${r.caminho} → ${rotulo}`)
      linhas.push(`   ${r.corpo.replace(/\s+/g, ' ').slice(0, 400)}`)
      linhas.push('')
    }
    const abertos = respostas.filter((r) => r.status === 200).map((r) => r.caminho)
    linhas.push(
      abertos.length
        ? `Caminhos que esta conta abre: ${abertos.join(', ')}`
        : 'Nenhum caminho respondeu 200 — nenhum relatório está habilitado nesta aplicação.',
    )
    return { ok: true, linhas }
  } catch (e) {
    console.error('[extrato] sondar relatórios falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

/**
 * Pede ao Mercado Pago que gere o relatório do período.
 *
 * Volta na hora. A geração é assíncrona do lado deles e leva de segundos a
 * alguns minutos — esperar dentro da requisição foi desenho errado meu:
 * estourava em 60 segundos e mostrava erro onde estava tudo certo, só que
 * ainda processando.
 */
export async function pedirExtratoCompleto(
  de: string,
  ate: string,
): Promise<Resposta<{ linhas: string[] }>> {
  try {
    const id = await pedirRelatorio(de, ate)
    return {
      ok: true,
      linhas: [
        `Relatório pedido para ${de} a ${ate}${id ? ` (nº ${id})` : ''}.`,
        'O Mercado Pago leva de alguns segundos a poucos minutos para montar.',
        'Clique em "Ver relatórios prontos" daqui a pouco e importe o que aparecer.',
      ],
    }
  } catch (e) {
    console.error('[extrato] pedir relatório falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

/** O que o Mercado Pago já tem pronto, com período e se já foi importado. */
export async function listarRelatoriosProntos(): Promise<
  Resposta<{ relatorios: RelatorioDisponivel[] }>
> {
  try {
    return { ok: true, relatorios: await relatoriosDisponiveis() }
  } catch (e) {
    return { ok: false, erro: mensagemDe(e) }
  }
}

/** Baixa um relatório pronto e importa como extrato. */
export async function importarExtratoCompleto(
  arquivo: string,
): Promise<Resposta<{ linhas: string[] }>> {
  const bloqueio = exigeSupabase('importar o extrato')
  if (bloqueio) return bloqueio

  try {
    const r = await importarLiberacoes(arquivo)
    revalidatePath('/', 'layout')
    return {
      ok: true,
      linhas: [
        `${r.arquivo} · movimento de ${r.periodo.de} a ${r.periodo.ate}.`,
        `${r.linhasLidas} linha(s) lidas · ${r.novas} nova(s) · ${r.repetidas} já conhecida(s).`,
        `Colunas: ${r.cabecalhos.join(', ')}`,
        ...r.avisos.map((a) => `Atenção: ${a}`),
      ],
    }
  } catch (e) {
    console.error('[extrato] importar liberações falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

/** Apaga o extrato e o que nasceu dele, para recomeçar da fonte certa. */
export async function zerarFinanceiro(): Promise<Resposta<{ linhas: string[] }>> {
  const bloqueio = exigeSupabase('zerar o financeiro')
  if (bloqueio) return bloqueio

  const { data, error } = await supabaseServer().rpc('zerar_financeiro', {
    p_confirmacao: 'ZERAR',
  })
  if (error) {
    console.error('[extrato] zerar_financeiro falhou:', error)
    return { ok: false, erro: mensagemDe(error) }
  }

  const r = (data ?? {}) as { extrato?: number; lancamentos?: number; repasses?: number }
  revalidatePath('/', 'layout')
  return {
    ok: true,
    linhas: [
      `${r.extrato ?? 0} linha(s) de extrato apagadas.`,
      `${r.lancamentos ?? 0} lançamento(s) que vieram do extrato apagados.`,
      `${r.repasses ?? 0} repasse(s) voltaram a ficar sem conciliação.`,
      'Pedidos e lançamentos digitados à mão continuam intactos.',
    ],
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
