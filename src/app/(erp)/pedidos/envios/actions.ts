'use server'

import { revalidatePath } from 'next/cache'

import {
  eventosDoPedido,
  frenetConfigurada,
  gravarEventosRastreio,
  rastrearNaFrenet,
} from '@/data/frenet'
import { enviarAvisosDePedido } from '@/data/notificacoes'
import { mensagemDe, shopifyConfigurada, sincronizarEnviosShopify, vincularPedidosShopify } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import type { EnvioParaShopify } from '@/data/shopify'
import type { EventoTransportadora } from '@/domain'

export type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

/**
 * A linha do tempo da transportadora para UM pedido.
 *
 * Lê do banco, não da Frenet: os eventos chegam por webhook e por varredura, e
 * consultar a transportadora a cada abertura de modal gastaria cota para
 * mostrar o que já está gravado.
 */
export async function rastreioDoPedido(
  pedidoId: string,
): Promise<Resposta<{ eventos: EventoTransportadora[]; url: string | null }>> {
  try {
    const eventos = await eventosDoPedido(pedidoId)
    let url: string | null = null
    if (supabaseConfigurado()) {
      const { data } = await supabaseServer()
        .from('pedidos')
        .select('rastreio_url')
        .eq('id', pedidoId)
        .maybeSingle()
      url = ((data as { rastreio_url: string | null } | null)?.rastreio_url ?? null) || null
    }
    return { ok: true, eventos, url }
  } catch (e) {
    return { ok: false, erro: mensagemDe(e) }
  }
}

/**
 * Consulta a transportadora AGORA para um pedido — o botão de quem está com o
 * cliente na linha e não pode esperar a próxima rodada.
 */
export async function atualizarRastreioAgora(
  pedidoId: string,
): Promise<Resposta<{ eventos: EventoTransportadora[]; novos: number; url: string | null }>> {
  if (!frenetConfigurada()) {
    return {
      ok: false,
      erro: 'A Frenet não está configurada — defina FRENET_TOKEN no ambiente para consultar o rastreio ao vivo.',
    }
  }
  if (!supabaseConfigurado()) return { ok: false, erro: 'O Supabase precisa estar configurado.' }

  try {
    const sb = supabaseServer()
    const { data, error } = await sb
      .from('pedidos')
      .select('id, rastreio, servico_frete, rastreio_servico, rastreio_url')
      .eq('id', pedidoId)
      .maybeSingle()
    if (error) return { ok: false, erro: mensagemDe(error) }

    const pedido = data as {
      rastreio: string | null
      servico_frete: string | null
      rastreio_servico: string | null
      rastreio_url: string | null
    } | null
    if (!pedido?.rastreio) {
      return { ok: false, erro: 'Este pedido ainda não tem código de rastreio.' }
    }

    const leitura = await rastrearNaFrenet(
      pedido.rastreio,
      pedido.rastreio_servico ?? pedido.servico_frete,
    )
    const r = await gravarEventosRastreio(leitura.eventos)

    if (leitura.url || leitura.servico) {
      await sb
        .from('pedidos')
        .update({
          ...(leitura.url ? { rastreio_url: leitura.url } : {}),
          ...(leitura.servico ? { rastreio_servico: leitura.servico } : {}),
        })
        .eq('id', pedidoId)
    }

    revalidatePath('/pedidos/envios')
    return {
      ok: true,
      eventos: await eventosDoPedido(pedidoId),
      novos: r.gravados,
      url: leitura.url ?? pedido.rastreio_url,
    }
  } catch (e) {
    return { ok: false, erro: mensagemDe(e) }
  }
}

export interface ResultadoBaixa {
  enviados: number
  entregues: number
  fechados: number
  ignorados: { pedido: string; motivo: string }[]
  semEspelho: string[]
  /** Já enviados na Shopify por outro caminho — saíram da fila como feitos. */
  jaEnviados: string[]
  /** O orçamento de tempo acabou antes deles — continuam na fila. */
  restantes: string[]
  /** Pedidos que ganharam o número da Shopify nesta rodada, antes da baixa. */
  vinculados: number
  /** O vínculo automático falhou (a baixa dos já vinculados seguiu normal). */
  erroVinculo: string | null
  /**
   * Por que o vínculo achou o que achou.
   *
   * Zero vínculos tem duas causas opostas e a tela mostrava a mesma coisa nas
   * duas: a Shopify não devolveu pedido nenhum, ou devolveu e nenhum trazia a
   * referência da Yampi. São problemas diferentes, com soluções diferentes.
   */
  vinculoExaminados: number
  vinculoComReferencia: number
}

/**
 * Espelha na Shopify o que a Yampi já sabe.
 *
 * É a razão de existir da integração: a Yampi recebe o rastreio e confirma a
 * entrega, mas não devolve nada para a Shopify. O cliente entra na conta, vê
 * "confirmado" e abre chamado perguntando do pedido que chegou há três dias.
 *
 * Rodar de novo é seguro. A Shopify recusa criar um fulfillment onde já não há
 * fulfillment order aberto, e esse pedido volta em `ignorados` com o motivo —
 * não como erro que derruba a rodada inteira.
 *
 * Sem `pedidoIds`, processa a fila toda: entregue na Yampi e ainda sem baixa.
 * `prazoMs` corta a rodada antes do limite de tempo da Netlify — o que não
 * couber volta em `restantes` e fica na fila para a próxima chamada.
 */
export async function baixarNaShopify(
  pedidoIds?: string[],
  opcoes: { prazoMs?: number } = {},
): Promise<Resposta<{ resultado: ResultadoBaixa }>> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para ler a fila de baixa.' }
  }
  if (!shopifyConfigurada()) {
    return {
      ok: false,
      erro: 'Faltam as credenciais da Shopify. Sem elas o ERP não consegue marcar o pedido como entregue na loja.',
    }
  }

  try {
    const sb = supabaseServer()
    const lerFila = async () => {
      let consulta = sb
        .from('pedidos')
        .select('id, shopify_numero, rastreio, envio, entrega_shopify_em')
        .eq('envio', 'entregue')
        .is('entrega_shopify_em', null)
        .limit(200)
      if (pedidoIds?.length) consulta = consulta.in('id', pedidoIds)
      return consulta
    }

    const { data, error } = await lerFila()
    if (error) return { ok: false, erro: mensagemDe(error) }

    let linhas = (data ?? []) as unknown as {
      id: string
      shopify_numero: string | null
      rastreio: string | null
    }[]

    // Pedido sem número da Shopify não é beco sem saída: a importação da
    // Yampi não trouxe o vínculo nesta loja, então ele é descoberto aqui,
    // lendo os pedidos da própria Shopify e casando com os da Yampi. Só
    // depois do vínculo é que "sem espelho" vira um veredito.
    let vinculados = 0
    let vinculoExaminados = 0
    let vinculoComReferencia = 0
    let erroVinculo: string | null = null
    if (linhas.some((p) => !p.shopify_numero)) {
      try {
        const v = await vincularPedidosShopify()
        vinculados = v.vinculados
        vinculoExaminados = v.examinados
        vinculoComReferencia = v.comReferencia
      } catch (e) {
        erroVinculo = mensagemDe(e)
      }
      if (vinculados > 0) {
        const { data: relidos, error: erroReler } = await lerFila()
        if (erroReler) return { ok: false, erro: mensagemDe(erroReler) }
        linhas = (relidos ?? []) as typeof linhas
      }
    }

    // Pedido que nasceu na Yampi e nunca foi espelhado na Shopify não tem o
    // que baixar lá. Devolver a lista é melhor que somar como "ignorado
    // genérico": o motivo é outro e a ação também.
    const semEspelho = linhas.filter((p) => !p.shopify_numero).map((p) => p.id)
    const alvos: EnvioParaShopify[] = linhas
      .filter((p) => p.shopify_numero)
      .map((p) => ({
        pedidoId: p.id,
        shopifyNumero: p.shopify_numero as string,
        rastreio: p.rastreio,
        transportadora: null,
        entregue: true,
      }))

    if (alvos.length === 0) {
      return {
        ok: true,
        resultado: {
          enviados: 0,
          entregues: 0,
          fechados: 0,
          ignorados: [],
          jaEnviados: [],
          restantes: [],
          semEspelho,
          vinculados,
          erroVinculo,
          vinculoExaminados,
          vinculoComReferencia,
        },
      }
    }

    const r = await sincronizarEnviosShopify(alvos, opcoes)

    // Só marca no ERP o que a Shopify de fato aceitou — ou já tinha aceitado
    // por outro caminho. Gravar os que falharam esconderia o pedido da próxima
    // rodada; gravar os que o tempo não alcançou, idem.
    const falhou = new Set([...r.ignorados.map((i) => i.pedido), ...r.restantes])
    const baixados = alvos.map((a) => a.pedidoId).filter((id) => !falhou.has(id))
    if (baixados.length) {
      const agora = new Date().toISOString()
      const { error: erroUpdate } = await sb
        .from('pedidos')
        .update({ entrega_shopify_em: agora, baixado_shopify: true })
        .in('id', baixados)
      if (erroUpdate) return { ok: false, erro: mensagemDe(erroUpdate) }
    }

    revalidatePath('/', 'layout')
    return {
      ok: true,
      resultado: { ...r, semEspelho, vinculados, erroVinculo, vinculoExaminados, vinculoComReferencia },
    }
  } catch (e) {
    console.error('[envios] baixar na Shopify falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

/**
 * Dispara o aviso de envio para um endereço de teste.
 *
 * Existe porque ninguém deveria ligar um remetente automático sem ter visto o
 * que ele manda. O ensaio vai com `[TESTE]` no assunto, usa pedidos reais para
 * o texto sair como sairá de verdade, e NÃO grava no log — senão consumiria o
 * direito daquele cliente de receber o aviso quando o módulo for ligado.
 */
export async function testarAvisoDeEnvio(
  email: string,
): Promise<Resposta<{ enviados: number; falhas: string[] }>> {
  const destino = email.trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destino)) {
    return { ok: false, erro: 'Informe um e-mail válido para receber o teste.' }
  }

  try {
    const r = await enviarAvisosDePedido({ destinoDeTeste: destino, limite: 2 })
    if (r.candidatos === 0) {
      return {
        ok: false,
        erro:
          'Nenhum pedido enviado nos últimos 15 dias para servir de exemplo. ' +
          'O teste usa pedidos reais para o texto sair como sairá de verdade.',
      }
    }
    return { ok: true, enviados: r.enviados, falhas: r.falhas.map((f) => `${f.pedido}: ${f.erro}`) }
  } catch (e) {
    return { ok: false, erro: mensagemDe(e) }
  }
}
