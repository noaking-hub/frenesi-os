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

/**
 * Informar à mão o código de rastreio de um pedido.
 *
 * Existe porque a etiqueta dos Correios e da Jadlog é emitida no PAINEL da
 * Frenet — lá o frete é mais barato —, e nenhuma API lista as etiquetas de uma
 * conta da Frenet. O ERP não tem como descobrir sozinho que aquele envio
 * existe: a Frenet rastreia um código que já se conhece, e o código nasce na
 * hora em que a etiqueta é impressa, num painel que não conversa com ninguém.
 * Até hoje o único lugar do mundo onde esse código podia ser digitado era a
 * Yampi, e o ERP ficava esperando ela.
 *
 * Com o código gravado, tudo o mais que já existe volta a funcionar sozinho: a
 * varredura da Frenet passa a incluir o pedido (ela filtra por
 * `rastreio is not null`), os eventos casam pelo próprio código, o aviso de
 * envio sai no pulso seguinte e a baixa na Shopify entra na fila.
 *
 * O pedido vira `enviado` no mesmo movimento, e não em dois passos: quem
 * digita o código está dizendo que a etiqueta foi emitida. Manter "aguardando
 * envio" com código impresso seria guardar uma contradição.
 *
 * A consulta à Frenet logo depois de gravar NÃO é enfeite: é a única
 * conferência possível contra o dígito trocado. Código inventado volta sem
 * evento nenhum, e a tela avisa em vez de deixar o cliente esperando um
 * rastreio que não existe. Falha na consulta não desfaz a gravação — a
 * transportadora estar fora do ar não torna a etiqueta menos real.
 */
export async function registrarRastreioManual(
  pedidoId: string,
  codigo: string,
  servico?: string | null,
): Promise<Resposta<{ eventos: EventoTransportadora[]; url: string | null; aviso: string | null }>> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para gravar o rastreio.' }
  }
  if (!pedidoId) return { ok: false, erro: 'Pedido não informado.' }

  // Espaço no meio some junto: o código copiado do painel vem quebrado em
  // blocos ("AA 1234 5678 BR") e a transportadora não reconhece com espaço.
  const limpo = codigo.replace(/\s+/g, '').toUpperCase()
  if (limpo.length < 6) {
    return { ok: false, erro: 'Código de rastreio curto demais — confira o que veio da etiqueta.' }
  }
  if (limpo.length > 60) {
    return { ok: false, erro: 'Código de rastreio longo demais — parece que veio outra coisa colada junto.' }
  }

  try {
    const sb = supabaseServer()
    const { data, error: erroLeitura } = await sb
      .from('pedidos')
      // `situacao` e não `cancelado_em`: em `pedidos` o cancelamento é um
      // ESTADO do pedido, não uma data à parte — quem tem `cancelado_em` é
      // `lancamentos`, tabela diferente. A coluna inventada aqui derrubava a
      // gravação com "column pedidos.cancelado_em does not exist".
      .select('id, rastreio, servico_frete, rastreio_servico, entregue_em, situacao, entrega_local')
      .eq('id', pedidoId)
      .maybeSingle()
    if (erroLeitura) return { ok: false, erro: mensagemDe(erroLeitura) }

    const pedido = data as {
      rastreio: string | null
      servico_frete: string | null
      rastreio_servico: string | null
      entregue_em: string | null
      situacao: string | null
      entrega_local: boolean | null
    } | null
    if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }
    if (pedido.situacao === 'cancelado') {
      return { ok: false, erro: 'Este pedido está cancelado — não há envio a registrar.' }
    }

    // Já entregue não volta para "enviado": o código pode ser corrigido, o
    // desfecho não. Reabrir a entrega faria o pedido sumir dos indicadores de
    // prazo e reaparecer na fila de baixa da Shopify.
    const jaEntregue = Boolean(pedido.entregue_em)
    const outroCodigo = pedido.rastreio && pedido.rastreio !== limpo

    const { error } = await sb
      .from('pedidos')
      .update({
        rastreio: limpo,
        ...(servico?.trim() ? { rastreio_servico: servico.trim() } : {}),
        ...(jaEntregue ? {} : { envio: 'enviado', situacao: 'enviado' }),
        // Zera a marca da última leitura para a varredura pegar este pedido na
        // primeira rodada, em vez de na vez dele na fila por antiguidade.
        rastreio_lido_em: null,
        envio_visto_em: new Date().toISOString(),
      })
      .eq('id', pedidoId)
    if (error) return { ok: false, erro: mensagemDe(error) }

    revalidatePath('/pedidos')
    revalidatePath('/pedidos/envios')

    // A partir daqui nada mais pode derrubar a operação: o código está
    // gravado, e é isso que o operador pediu.
    let aviso: string | null = outroCodigo
      ? 'Este pedido já tinha outro código, que foi substituído.'
      : null
    let url: string | null = null

    if (!frenetConfigurada()) {
      return { ok: true, eventos: await eventosDoPedido(pedidoId), url, aviso }
    }

    try {
      const leitura = await rastrearNaFrenet(limpo, servico?.trim() || pedido.rastreio_servico || pedido.servico_frete)
      await gravarEventosRastreio(leitura.eventos)
      url = leitura.url
      if (leitura.url || leitura.servico) {
        await sb
          .from('pedidos')
          .update({
            ...(leitura.url ? { rastreio_url: leitura.url } : {}),
            ...(leitura.servico ? { rastreio_servico: leitura.servico } : {}),
          })
          .eq('id', pedidoId)
      }
      if (leitura.eventos.length === 0) {
        aviso = [
          aviso,
          'A transportadora ainda não devolveu nenhum evento para este código. É normal nas primeiras horas depois da postagem — mas se continuar assim amanhã, confira se o código está certo.',
        ]
          .filter(Boolean)
          .join(' ')
      }
    } catch (e) {
      aviso = [aviso, `Gravado, mas a consulta à transportadora falhou: ${mensagemDe(e)}`]
        .filter(Boolean)
        .join(' ')
    }

    revalidatePath('/pedidos/envios')
    return { ok: true, eventos: await eventosDoPedido(pedidoId), url, aviso }
  } catch (e) {
    return { ok: false, erro: mensagemDe(e) }
  }
}

/**
 * Os pedidos esperando alguém digitar o código da etiqueta.
 *
 * A mesma pergunta que `sondarEnviosDaFrenet` faz para o relatório da rotina,
 * só que devolvendo o que a TELA precisa para resolver: o cliente, para o
 * operador conferir contra a etiqueta na mão, e o serviço cotado, para ele
 * saber qual transportadora procurar no painel.
 */
export interface PendenteDeRastreio {
  id: string
  codigo: string
  cliente: string
  servicoFrete: string | null
  compradoEm: string | null
}

export async function pedidosAguardandoRastreio(): Promise<PendenteDeRastreio[]> {
  if (!supabaseConfigurado()) return []
  const { data } = await supabaseServer()
    .from('pedidos')
    .select('id, shopify_numero, comprado_em, servico_frete, clientes(nome)')
    .eq('pagamento', 'pago')
    // 'pago' e 'faturado' já EXCLUEM cancelado e entregue — em `pedidos` o
    // cancelamento é um estado de `situacao`, não uma data à parte.
    .in('situacao', ['pago', 'faturado'])
    .is('rastreio', null)
    .eq('entrega_local', false)
    .order('comprado_em', { ascending: true })
    .limit(50)

  return ((data ?? []) as unknown as {
    id: string
    shopify_numero: string | null
    comprado_em: string | null
    servico_frete: string | null
    clientes: { nome: string } | null
  }[]).map((p) => ({
    id: p.id,
    codigo: p.shopify_numero ?? p.id,
    cliente: p.clientes?.nome ?? '—',
    servicoFrete: p.servico_frete,
    compradoEm: p.comprado_em,
  }))
}

export interface ResultadoBaixa {
  enviados: number
  entregues: number
  fechados: number
  ignorados: { pedido: string; motivo: string }[]
  semEspelho: string[]
  /** Já enviados na Shopify por outro caminho — saíram da fila como feitos. */
  jaEnviados: string[]
  /** O envio existe mas a loja negou o evento de entrega (falta o escopo
   * write_fulfillments) — continuam na fila de baixa até o escopo chegar. */
  semEvento: string[]
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
          semEvento: [],
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
    // rodada; gravar os que o tempo não alcançou, idem. E quem ficou sem o
    // evento de entrega (escopo negado) fica na fila: a baixa dele é
    // exatamente o que esta fila existe para consertar.
    const falhou = new Set([...r.ignorados.map((i) => i.pedido), ...r.restantes, ...r.semEvento])
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
