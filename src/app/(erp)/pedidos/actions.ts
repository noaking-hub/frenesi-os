'use server'

import { confirmarEntregaLocal } from '@/data/baixa-estoque'
import { eventosDoPedido, frenetConfigurada, rastrearPedidos } from '@/data/frenet'
import { OPERADOR } from '@/data/operador'
import type { EventoTransportadora } from '@/domain'

import { revalidatePath } from 'next/cache'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

import { baixarNaShopify } from './envios/actions'

import {
  derivarConsumoDiario,
  escoposDoToken,
  esquecerToken,
  importarPedidosShopify,
  marcarAnuladosDaShopify,
  mensagemDe,
  shopifyConfigurada,
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
  'read_merchant_managed_fulfillment_orders',
  'write_merchant_managed_fulfillment_orders',
  'write_orders',
  // Marcar a ENTREGA (fulfillmentEventCreate) exige este escopo próprio —
  // criar o envio não basta: sem ele a loja fica em "em andamento" para
  // sempre, mesmo com o pedido entregue no ERP.
  'write_fulfillments',
  // Publicar preço pela Precificação escreve na variante do produto.
  'write_products',
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
    // Venda anulada pela Shopify sai da receita na mesma rodada — o estorno
    // pelo Mercado Pago também marca, mas chega com horas de atraso.
    if (shopifyConfigurada()) {
      try {
        await marcarAnuladosDaShopify(Math.min(dias, 60))
      } catch (e) {
        console.error('[shopify] leitura de anulados falhou:', e)
      }
    }
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
  | {
      ok: true
      enviados: number
      entregues: number
      fechados: number
      ignorados: { pedido: string; motivo: string }[]
      /** Envios que existem na loja mas ficaram sem o evento de entrega. */
      semEvento: number
      /** Quantos ainda esperam na fila — o chamador decide se roda de novo. */
      naFila: number
    }
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
 *
 * `prazoMs` corta a rodada antes de a Netlify cortar a função: o que não
 * couber fica na fila e o retorno diz quantos sobraram, para o chamador
 * continuar na requisição seguinte em vez de morrer sem resposta.
 */
export async function sincronizarEnvios(opcoes: { prazoMs?: number } = {}): Promise<RespostaEnvios> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado.' }
  }
  try {
    const sb = supabaseServer()

    // Só o que já saiu e ainda não foi espelhado. Repetir criaria um segundo
    // e-mail de envio para o mesmo pedido.
    const { data, error } = await sb
      .from('pedidos')
      .select('id, shopify_numero, rastreio, situacao, envio')
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
      // Pela SITUAÇÃO, não pela data: a separação entre data prometida e
      // entrega real deixou entregues antigos com entregue_em vazio à espera
      // da varredura, e eles sairiam daqui como "só enviados" — a Shopify
      // nunca saberia da entrega, porque marcado o espelho ninguém volta.
      entregue: p.situacao === 'entregue' || p.envio === 'entregue',
    }))

    const r = await sincronizarEnviosShopify(envios, opcoes)

    // Sai da fila quem teve o envio criado E quem já estava enviado por outro
    // caminho — os dois são trabalho concluído. Só fica quem falhou de
    // verdade (para tentar de novo) e quem o orçamento de tempo não alcançou.
    const recusados = new Set(r.ignorados.map((i) => i.pedido))
    const semVez = new Set(r.restantes)
    const gravados = envios
      .map((e) => e.pedidoId)
      .filter((id) => !recusados.has(id) && !semVez.has(id))
    if (gravados.length) {
      const agora = new Date().toISOString()
      const { error: erroMarca } = await sb
        .from('pedidos')
        .update({ enviado_shopify_em: agora })
        .in('id', gravados)
      if (erroMarca) throw erroMarca

      // Para os entregues, o espelho incluiu o evento de entrega — fechar
      // também a fila de baixa evita que "Baixar na Shopify" refaça o mesmo
      // pedido pelo outro caminho. EXCETO quem ficou sem o evento (escopo
      // write_fulfillments negado): a loja ainda mostra o envio em trânsito,
      // e dar baixa aqui esconderia o pedido da fila que vai consertar isso.
      const eventoNegado = new Set(r.semEvento)
      const entreguesGravados = envios
        .filter((e) => e.entregue && gravados.includes(e.pedidoId) && !eventoNegado.has(e.pedidoId))
        .map((e) => e.pedidoId)
      if (entreguesGravados.length) {
        const { error: erroBaixa } = await sb
          .from('pedidos')
          .update({ entrega_shopify_em: agora, baixado_shopify: true })
          .in('id', entreguesGravados)
          .is('entrega_shopify_em', null)
        if (erroBaixa) throw erroBaixa
      }
    }

    // O tamanho real da fila depois da rodada — é ele que diz ao botão da
    // tela se vale disparar outra requisição.
    const { count } = await sb
      .from('pedidos')
      .select('id', { count: 'exact', head: true })
      .not('shopify_numero', 'is', null)
      .not('rastreio', 'is', null)
      .is('enviado_shopify_em', null)

    revalidatePath('/', 'layout')
    return {
      ok: true,
      enviados: r.enviados,
      entregues: r.entregues,
      fechados: r.fechados,
      ignorados: r.ignorados,
      semEvento: r.semEvento.length,
      naFila: count ?? 0,
    }
  } catch (e) {
    console.error('[shopify] sincronia de envios falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

/**
 * Confirma a entrega em mãos de um pedido local.
 *
 * É a única forma de um pedido de motoboy fechar o ciclo: ele não é faturado
 * e nenhuma transportadora vai confirmar o que a própria operação entregou.
 * A mesma ação baixa o estoque, na mesma transação do banco.
 *
 * A Shopify é avisada na sequência, não na mesma transação: a loja fora do ar
 * não pode impedir a operação de registrar o que já aconteceu no balcão. Se o
 * espelho falhar, o pedido continua na fila "Aguardando baixa" de Rastreamento
 * e entregas — e o retorno diz isso a quem clicou.
 */
export async function confirmarEntregaEmMaos(
  pedidoId: string,
): Promise<{ ok: true; mlConsumido: number; shopify: string | null } | { ok: false; erro: string }> {
  const r = await confirmarEntregaLocal(pedidoId, OPERADOR)
  if (!r.ok) return r

  let shopify: string | null = null
  if (shopifyConfigurada()) {
    try {
      const b = await baixarNaShopify([pedidoId])
      if (!b.ok) shopify = `a baixa na Shopify falhou (${b.erro}) — o pedido segue na fila de Rastreamento e entregas.`
      else if (b.resultado.enviados || b.resultado.entregues) shopify = 'entrega marcada na Shopify.'
      else if (b.resultado.semEspelho.length) {
        shopify = 'sem pedido correspondente na Shopify — a entrega ficou só no ERP.'
      } else if (b.resultado.ignorados.length) {
        shopify = `a Shopify recusou a baixa: ${b.resultado.ignorados[0].motivo}. O pedido segue na fila de Rastreamento e entregas.`
      }
    } catch (e) {
      shopify = `a baixa na Shopify falhou (${mensagemDe(e)}) — o pedido segue na fila de Rastreamento e entregas.`
    }
  }

  revalidatePath('/pedidos')
  return { ok: true, mlConsumido: r.mlConsumido, shopify }
}

/**
 * A linha do tempo de um pedido, buscada quando a gaveta abre.
 *
 * Sob demanda e não junto da lista: a tela carrega 612 pedidos, e mandar a
 * linha do tempo de todos eles para preencher uma que o operador talvez abra
 * seria pagar o transporte de tudo para usar um.
 */
export async function linhaDoTempoDoPedido(pedidoId: string): Promise<EventoTransportadora[]> {
  try {
    return await eventosDoPedido(pedidoId)
  } catch (e) {
    console.error('[rastreio] leitura da linha do tempo falhou:', e)
    return []
  }
}

export type RespostaProducao =
  | { ok: true; marcados: number; recusados: { pedido: string; motivo: string }[] }
  | { ok: false; erro: string }

/**
 * Marca os pedidos selecionados como "em produção".
 *
 * É o único degrau do ciclo que é NOSSO — pago, faturado e enviado vêm da
 * Yampi. A validação é individual, como o escopo exige das ações em massa:
 * pedido que já passou de pago não regride, e o retorno diz exatamente quais
 * ficaram de fora e por quê.
 */
export async function marcarEmProducao(ids: string[]): Promise<RespostaProducao> {
  if (ids.length === 0) return { ok: false, erro: 'Selecione ao menos um pedido.' }
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado.' }
  }
  try {
    const sb = supabaseServer()
    // Em lotes de 100: um `.in()` com 600 ids estoura o tamanho da URL do
    // PostgREST — e truncar a seleção em silêncio seria mentir para quem
    // clicou "selecionar todos".
    const porId = new Map<string, string>()
    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100)
      const { data, error } = await sb.from('pedidos').select('id, situacao').in('id', lote)
      if (error) throw error
      for (const p of data ?? []) porId.set(p.id as string, (p.situacao as string) ?? 'pago')
    }
    const elegiveis: string[] = []
    const recusados: { pedido: string; motivo: string }[] = []
    for (const id of ids) {
      const situacao = porId.get(id)
      if (situacao === undefined) recusados.push({ pedido: id, motivo: 'não encontrado' })
      else if (situacao !== 'pago') {
        recusados.push({ pedido: id, motivo: `já está ${situacao.replace('_', ' ')}` })
      } else elegiveis.push(id)
    }

    const agora = new Date().toISOString()
    for (let i = 0; i < elegiveis.length; i += 100) {
      const { error: erroMarca } = await sb
        .from('pedidos')
        .update({ situacao: 'em_producao', producao_em: agora })
        .in('id', elegiveis.slice(i, i + 100))
      if (erroMarca) throw erroMarca
    }

    revalidatePath('/pedidos')
    return { ok: true, marcados: elegiveis.length, recusados }
  } catch (e) {
    console.error('[pedidos] marcar em produção falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

export type RespostaRastreio =
  | { ok: true; consultados: number; eventos: number; falhas: number; aviso?: string }
  | { ok: false; erro: string }

/**
 * Relê o rastreio dos pedidos selecionados, agora.
 *
 * A rotina de hora em hora já faz isso sozinha; esta ação existe para o
 * momento em que alguém está com o cliente na linha e a resposta "atualiza
 * daqui a 40 minutos" não serve.
 */
export async function atualizarRastreamento(ids: string[]): Promise<RespostaRastreio> {
  if (ids.length === 0) return { ok: false, erro: 'Selecione ao menos um pedido.' }
  if (!frenetConfigurada()) {
    return { ok: false, erro: 'A Frenet não está configurada — FRENET_TOKEN não está definido.' }
  }
  try {
    const r = await rastrearPedidos(ids)
    revalidatePath('/pedidos')
    return {
      ok: true,
      consultados: r.consultados,
      eventos: r.eventos,
      falhas: r.falhas.length,
      // A Frenet não enxerga os códigos emitidos pelo Melhor Envio. Dizer
      // isso é melhor que devolver "0 ocorrências" e deixar parecer que o
      // objeto não andou.
      aviso: r.falhas.length
        ? `${r.falhas.length} código(s) que a Frenet não reconhece — provavelmente Melhor Envio, que ainda não foi conectado.`
        : undefined,
    }
  } catch (e) {
    console.error('[rastreio] atualização manual falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}
