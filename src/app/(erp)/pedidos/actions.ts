'use server'

import { revalidatePath } from 'next/cache'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

import {
  derivarConsumoDiario,
  escoposDoToken,
  esquecerToken,
  importarPedidosShopify,
  mensagemDe,
  sincronizarEnviosShopify,
} from '@/data/shopify'
import type { ResultadoPedidos } from '@/data/shopify'
import {
  diagnosticarYampi,
  importarPedidosYampi,
  limparPedidosShopify,
  yampiConfigurada,
} from '@/data/yampi'
import type { DiagnosticoYampi, ResultadoYampi } from '@/data/yampi'

export type RespostaPedidos =
  | { ok: true; resultado: ResultadoPedidos & { basesComConsumo: number } }
  | { ok: false; erro: string }

/**
 * Importa os pedidos da Shopify e, na sequência, deriva o consumo diário de
 * cada base das vendas pagas.
 *
 * As duas coisas andam juntas de propósito: o consumo é o que sustenta a
 * cobertura ("acaba em X dias") em Estoque e a fila de reposição. Importar
 * venda sem recalcular consumo deixaria a cobertura apontando para um número
 * digitado à mão, agora desatualizado.
 */
export async function importarPedidos(dias = 60): Promise<RespostaPedidos> {
  try {
    const resultado = await importarPedidosShopify(dias)
    const { bases } = await derivarConsumoDiario(30)
    revalidatePath('/', 'layout')
    return { ok: true, resultado: { ...resultado, basesComConsumo: bases } }
  } catch (e) {
    console.error('[shopify] importação de pedidos falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

export type RespostaDiagnostico =
  | { ok: true; loja: string; escopos: string[]; faltando: string[] }
  | { ok: false; erro: string }

/** O que cada operação do ERP exige da Shopify. */
const EXIGIDOS = [
  'read_products',
  'read_inventory',
  'write_inventory',
  'read_locations',
  'read_orders',
]

/**
 * Pergunta à Shopify quais escopos o token REALMENTE tem.
 *
 * É a única fonte que encerra a dúvida entre "o app declara" e "o token tem":
 * lançar versão no dev dashboard não atualiza sozinho a instalação na loja, e
 * as duas telas mostram listas diferentes sem avisar.
 */
export async function diagnosticarShopify(): Promise<RespostaDiagnostico> {
  try {
    // Descarta o token guardado antes de perguntar: diagnosticar com um token
    // de 20 horas atrás responderia sobre o passado.
    esquecerToken()
    const { loja, escopos } = await escoposDoToken()
    return {
      ok: true,
      loja,
      escopos,
      faltando: EXIGIDOS.filter((e) => !escopos.includes(e)),
    }
  } catch (e) {
    console.error('[shopify] diagnóstico falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

export type RespostaYampi = ({ ok: true } & DiagnosticoYampi) | { ok: false; erro: string }

/**
 * Confere as credenciais da Yampi e relata o formato de um pedido real.
 *
 * O que trava uma importação é nome de campo divergente, não conexão. Ver a
 * resposta da SUA loja vale mais que a documentação, que descreve o caso
 * geral — e é isso que permite mapear sem chutar.
 */
export async function conferirYampi(): Promise<RespostaYampi> {
  if (!yampiConfigurada()) {
    return {
      ok: false,
      erro:
        'Faltam as credenciais da Yampi no .env.local: YAMPI_ALIAS, YAMPI_USER_TOKEN e YAMPI_SECRET_KEY.',
    }
  }
  try {
    return { ok: true, ...(await diagnosticarYampi()) }
  } catch (e) {
    console.error('[yampi] diagnóstico falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

export type RespostaImportYampi =
  | { ok: true; resultado: ResultadoYampi & { basesComConsumo: number; removidosShopify: number } }
  | { ok: false; erro: string }

/**
 * Importa os pedidos da Yampi e, na sequência, deriva o consumo diário.
 *
 * O espelho da Shopify é removido DEPOIS de a importação dar certo — os dois
 * conjuntos descrevem as mesmas vendas com ids diferentes e somariam o
 * faturamento duas vezes, mas apagar antes deixaria o ERP sem pedido nenhum
 * se a carga falhasse no meio. Foi exatamente o que aconteceu na primeira
 * tentativa.
 */
export async function importarDaYampi(dias = 90): Promise<RespostaImportYampi> {
  if (!yampiConfigurada()) {
    return {
      ok: false,
      erro: 'Faltam as credenciais da Yampi no .env.local: YAMPI_ALIAS, YAMPI_USER_TOKEN e YAMPI_SECRET_KEY.',
    }
  }
  try {
    const resultado = await importarPedidosYampi(dias)
    const { removidos } = await limparPedidosShopify()
    const { bases } = await derivarConsumoDiario(30)
    revalidatePath('/', 'layout')
    return {
      ok: true,
      resultado: { ...resultado, basesComConsumo: bases, removidosShopify: removidos },
    }
  } catch (e) {
    console.error('[yampi] importação falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

export type RespostaEnvios =
  | { ok: true; enviados: number; entregues: number; ignorados: { pedido: string; motivo: string }[] }
  | { ok: false; erro: string }

/**
 * Leva o rastreio da Yampi até a conta do cliente na Shopify.
 *
 * É o buraco da operação hoje: a Yampi posta a etiqueta e sabe do rastreio,
 * mas não devolve o envio para a Shopify. O cliente entra na conta, vê
 * "confirmado" e abre chamado perguntando onde está o pedido — com a
 * encomenda já a caminho há dias.
 *
 * Criar o fulfillment marca o pedido como enviado, dispara o e-mail de
 * confirmação com o código e faz o rastreio aparecer no histórico da conta.
 */
export async function sincronizarEnvios(): Promise<RespostaEnvios> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado.' }
  }
  try {
    const sb = supabaseServer()

    // Só o que já saiu e ainda não foi espelhado. Repetir criaria um segundo
    // e-mail de envio para o mesmo pedido.
    const { data, error } = await sb
      .from('pedidos')
      .select('id, shopify_numero, rastreio, entregue_em')
      .not('shopify_numero', 'is', null)
      .not('rastreio', 'is', null)
      .is('enviado_shopify_em', null)
      .limit(200)
    if (error) throw error

    const envios = (data ?? []).map((p) => ({
      pedidoId: p.id as string,
      shopifyNumero: p.shopify_numero as string,
      rastreio: p.rastreio as string | null,
      transportadora: null,
      entregue: Boolean(p.entregue_em),
    }))

    const r = await sincronizarEnviosShopify(envios)

    // Marca só os que a Shopify aceitou: gravar os recusados esconderia o
    // pedido da próxima rodada e ele nunca mais seria tentado.
    const recusados = new Set(r.ignorados.map((i) => i.pedido))
    const gravados = envios.filter((e) => !recusados.has(e.pedidoId)).map((e) => e.pedidoId)
    if (gravados.length) {
      const agora = new Date().toISOString()
      const { error: erroMarca } = await sb
        .from('pedidos')
        .update({ enviado_shopify_em: agora })
        .in('id', gravados)
      if (erroMarca) throw erroMarca
    }

    revalidatePath('/', 'layout')
    return { ok: true, ...r }
  } catch (e) {
    console.error('[shopify] sincronia de envios falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}
