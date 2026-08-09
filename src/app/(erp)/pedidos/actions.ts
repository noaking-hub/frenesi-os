'use server'

import { revalidatePath } from 'next/cache'

import {
  derivarConsumoDiario,
  escoposDoToken,
  esquecerToken,
  importarPedidosShopify,
  mensagemDe,
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
 * Remove antes o espelho da Shopify: os dois conjuntos descrevem as MESMAS
 * vendas com ids diferentes, e mantê-los somaria o faturamento duas vezes em
 * todo KPI do sistema.
 */
export async function importarDaYampi(dias = 90): Promise<RespostaImportYampi> {
  if (!yampiConfigurada()) {
    return {
      ok: false,
      erro: 'Faltam as credenciais da Yampi no .env.local: YAMPI_ALIAS, YAMPI_USER_TOKEN e YAMPI_SECRET_KEY.',
    }
  }
  try {
    const { removidos } = await limparPedidosShopify()
    const resultado = await importarPedidosYampi(dias)
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
