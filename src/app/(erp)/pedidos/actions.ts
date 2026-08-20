'use server'

import { confirmarEntregaLocal } from '@/data/baixa-estoque'
import { eventosDoPedido, frenetConfigurada, rastrearPedidos } from '@/data/frenet'
import { operadorAtual } from '@/data/operador'
import type { EventoTransportadora } from '@/domain'
import { INTERVALO_PADRAO_DIAS, MAX_PARCELAS, MIN_PARCELAS } from '@/domain'

import { ROTAS_DO_FINANCEIRO } from '../financeiro/rotas'

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
  const r = await confirmarEntregaLocal(pedidoId, await operadorAtual())
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

export interface ItemVendaManual {
  baseId: string
  ml: number
  quantidade: number
  preco: number
  descricao: string
}

/** Uma parcela como o BANCO a gravou — não como a prévia a estimou. */
export interface ParcelaGravada {
  numero: number
  valor: number
  /** AAAA-MM-DD. */
  venceEm: string
  /** AAAA-MM-DD quando a parcela já nasceu baixada; null quando está em aberto. */
  recebidaEm: string | null
}

export type RespostaVendaManual =
  | {
      ok: true
      pedidoId: string
      /** Σ preço de tabela × quantidade, antes do abatimento. */
      bruto: number
      /** O abatimento que o banco gravou em `pedidos.desconto`. */
      desconto: number
      /** O LÍQUIDO (bruto − desconto) — é ele que vale como valor do pedido. */
      total: number
      /**
       * Quanto do total JÁ está na conta — lido do que o banco gravou.
       *
       * A tela de sucesso mostra fato, não dedução: com a venda em 2× e a
       * primeira parcela recebida no ato, "Entrou no caixa" é R$ 108,00 e não
       * o total nem zero. Deduzir isso do cronograma na tela seria recalcular
       * na mão o que o próprio banco acabou de decidir.
       */
      recebido: number
      mlBaixado: number
      /** Vazio quando a venda não foi repartida; o cronograma completo quando foi. */
      parcelas: ParcelaGravada[]
      /**
       * A conta escolhida tem extrato lido, então a venda NÃO criou lançamento
       * de caixa — quem responde pelo dinheiro dela é a linha do extrato.
       *
       * Quem decide isso é o banco, olhando `extrato_linhas`. A tela só conta
       * ao operador o que foi decidido: sem isso ele procuraria em Lançamentos
       * uma entrada que, de propósito, não existe.
       */
      caixaNoExtrato: boolean
      comprovanteAnexado: boolean
      /**
       * Preenchido só quando a venda gravou e o comprovante não — o único
       * caso em que `ok: true` esconderia uma perda se ficasse calado.
       */
      avisoComprovante?: string
    }
  | { ok: false; erro: string }

/**
 * Canais que uma venda fora da loja pode ter.
 *
 * O tipo `canal_venda` no banco recusa qualquer outro valor — e o erro que ele
 * levanta fala de enum, não de operação. Barrar aqui devolve uma frase que
 * quem está no balcão entende.
 */
const CANAIS_MANUAIS = new Set(['manual', 'whatsapp', 'instagram'])

/**
 * Bucket PRIVADO dos comprovantes de venda.
 *
 * Privado como o de devoluções: o repositório é público e um bucket aberto
 * publicaria o extrato do PIX de um cliente com nome e valor. A leitura é
 * sempre por URL assinada de 1 hora, gerada no servidor.
 */
const BUCKET_FINANCEIRO = 'financeiro'

/** Os mesmos tipos e o mesmo teto do comprovante de reembolso das devoluções. */
const TIPOS_DE_COMPROVANTE = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])
const TAMANHO_MAXIMO_COMPROVANTE = 8 * 1024 * 1024

/**
 * A frase que recusa o comprovante, ou `null` quando ele serve.
 *
 * As frases são LETRA POR LETRA as de `devolucoes/actions.ts`: é o mesmo dono
 * anexando o mesmo tipo de arquivo em duas telas do ERP, e duas redações para
 * a mesma recusa fariam parecer que são dois limites diferentes.
 */
function recusaDoComprovante(arquivo: File): string | null {
  if (!TIPOS_DE_COMPROVANTE.has(arquivo.type)) {
    return 'O comprovante precisa ser PDF ou imagem.'
  }
  if (arquivo.size > TAMANHO_MAXIMO_COMPROVANTE) {
    return 'O comprovante pode ter no máximo 8 MB.'
  }
  return null
}

/**
 * A extensão do arquivo, saneada.
 *
 * O nome vem do navegador e entra no caminho do Storage — "nota.2024/../x" ou
 * um nome sem ponto viraria chave torta no bucket. Como o tipo já passou por
 * `recusaDoComprovante`, o que não for extensão curta e alfanumérica cai em
 * `jpg` sem prejuízo: quem abre o arquivo é a URL assinada, não a extensão.
 */
function extensaoDoComprovante(arquivo: File): string {
  if (arquivo.type === 'application/pdf') return 'pdf'
  const bruta = arquivo.name.split('.').pop()?.toLowerCase() ?? ''
  return /^[a-z0-9]{2,5}$/.test(bruta) ? bruta : 'jpg'
}

/**
 * Registra uma venda que não nasceu na loja chamando `registrar_venda_manual()`.
 *
 * A função do banco faz tudo numa transação só: cria o pedido MAN-xxxx e seus
 * itens, baixa a base com a perda de envase, escreve a movimentação, libera a
 * reserva, consome frasco/válvula/tampa e grava a entrada JÁ BAIXADA na conta
 * escolhida. Por isso aqui não há nenhuma escrita solta — meia venda gravada
 * (estoque baixado sem dinheiro no caixa, ou o contrário) seria pior que venda
 * nenhuma, e é exatamente o que uma sequência de chamadas produziria se a
 * segunda falhasse.
 *
 * A validação abaixo repete a do banco de propósito: a mesma regra dita em
 * português, antes da viagem, é o que separa "Informe a quantidade do item 2"
 * de uma exceção de plpgsql na cara do operador.
 *
 * PARCELAMENTO: `parcelas >= 2` reparte o total em N lançamentos com
 * vencimentos espaçados, e `jaRecebidas` (K) diz quantos dos primeiros já
 * entraram na conta. NÃO é verdade que a venda parcelada nasça inteiramente a
 * receber — nesta operação o normal é o contrário: fecha-se em 2× e a primeira
 * parcela é paga no ato. K = 0 é a venda parcelada em que nada entrou ainda;
 * K = N é o cliente que pagou tudo adiantado; K = 1 é o caso de todo dia.
 *
 * Isso é decidido DENTRO da mesma função do banco, e não por uma segunda
 * chamada a `parcelarLancamento`, por dois motivos que o SQL da migração
 * detalha: duas RPCs são duas transações — meia venda gravada é pior que venda
 * nenhuma — e `parcelar_lancamento` cancela o lançamento original, o que
 * deixaria a venda com um lançamento nascido e morto no mesmo segundo.
 *
 * DESCONTO: os itens continuam valendo o preço de TABELA; o abatimento é um
 * número à parte, e o pedido vale o líquido. É a convenção que a loja já
 * pratica sem nunca ter registrado — 535 dos 663 pedidos pagos da Yampi valem
 * menos que a soma dos seus itens, e em nenhum deles dá para dizer quanto foi
 * desconto. `pedidos.desconto` existe para as telas conseguirem explicar essa
 * diferença; nenhuma view financeira o lê.
 *
 * CAIXA: quando a conta escolhida tem extrato lido, o banco NÃO cria
 * lançamento — a linha do extrato é que responde pelo dinheiro. Sem isso o
 * mesmo PIX entraria duas vezes no saldo da conta, porque `contas_saldo` soma
 * extrato E lançamento de origem própria. `p_transacao_id` é opcional e existe
 * para o casamento com a linha do extrato ser por igualdade exata, em vez de
 * por valor e data aproximados.
 */
export async function registrarVendaManual(dados: {
  itens: ItemVendaManual[]
  contaId: string
  canal: string
  /** Dia da venda, no formato AAAA-MM-DD que o campo de data devolve. */
  ocorridoEm: string
  clienteNome: string
  clienteEmail: string
  observacao: string
  /** 1 não reparte a venda. De 2 a 48, o total vira N parcelas. */
  parcelas: number
  /** Dias corridos entre um vencimento e o próximo. */
  intervaloDias: number
  /** K: quantas das PRIMEIRAS parcelas já entraram na conta. */
  jaRecebidas: number
  /** AAAA-MM-DD em que essas K entraram; null quando K = 0. */
  recebidasEm: string | null
  /**
   * O abatimento em REAIS, já convertido pela tela.
   *
   * Sempre em reais, nunca em porcentagem: "10% de R$ 189,90" arredonda
   * diferente aqui e no plpgsql, e a divergência apareceria como centavos
   * teimosos na conciliação. Quem faz a conta é a tela, uma vez só.
   */
  desconto: number
  /** Id do pagamento no gateway, para casar com a linha do extrato. */
  transacaoId?: string | null
  /** PDF ou imagem do pagamento. Vai para o PEDIDO, não para o lançamento. */
  comprovante?: File | null
}): Promise<RespostaVendaManual> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para registrar vendas.' }
  }

  const itens = dados.itens.filter((i) => i.baseId)
  if (itens.length === 0) return { ok: false, erro: 'Adicione ao menos um item à venda.' }

  for (const [i, item] of itens.entries()) {
    const posicao = `item ${i + 1}`
    if (!(item.ml > 0)) return { ok: false, erro: `Escolha o tamanho do decant no ${posicao}.` }
    if (!(item.quantidade > 0)) {
      return { ok: false, erro: `A quantidade do ${posicao} precisa ser maior que zero.` }
    }
    if (item.preco < 0) return { ok: false, erro: `O preço do ${posicao} não pode ser negativo.` }
  }

  const bruto = itens.reduce((a, i) => a + i.preco * i.quantidade, 0)
  if (!(bruto > 0)) {
    return { ok: false, erro: 'O total da venda precisa ser maior que zero — informe os preços.' }
  }

  // As duas frases são as MESMAS do plpgsql da migração irmã. O operador não
  // pode ver duas redações para a mesma recusa dependendo de qual trava pegou
  // primeiro — aqui e lá é a mesma regra, dita igual.
  // Arredondado aqui também, e não só na tela: a coluna é numeric(12,2) e
  // arredondaria sozinha na gravação, mas a validação abaixo compara o desconto
  // com o subtotal — partir de um número com três casas faria a recusa falar de
  // um valor diferente do que seria gravado.
  const desconto = Math.round((Number(dados.desconto) || 0) * 100) / 100
  if (desconto < 0) return { ok: false, erro: 'O desconto não pode ser negativo.' }
  // Cobre também o líquido: com desconto < bruto, bruto − desconto é sempre
  // maior que zero. Venda de graça é brinde, e brinde não passa por aqui.
  if (desconto >= bruto) {
    return { ok: false, erro: 'O desconto não pode ser igual ou maior que o total dos itens.' }
  }

  if (!dados.contaId) return { ok: false, erro: 'Escolha a conta que recebeu o dinheiro.' }
  if (!CANAIS_MANUAIS.has(dados.canal)) {
    return { ok: false, erro: 'Canal inválido — use balcão, WhatsApp ou Instagram.' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.ocorridoEm)) {
    return { ok: false, erro: 'Informe a data da venda.' }
  }

  // A faixa é a MESMA do diálogo Parcelar (2..48) porque as duas telas parcelam
  // o mesmo tipo de fato — se uma aceitasse 60 e a outra não, o dono descobriria
  // pela mensagem de erro do plpgsql.
  const parcelas = Math.round(dados.parcelas) || 1
  if (parcelas > 1) {
    if (parcelas < MIN_PARCELAS || parcelas > MAX_PARCELAS) {
      return { ok: false, erro: `O parcelamento vai de ${MIN_PARCELAS} a ${MAX_PARCELAS} vezes.` }
    }
    if (!(Math.round(dados.intervaloDias) >= 1)) {
      return { ok: false, erro: 'O intervalo entre as parcelas precisa ser de ao menos 1 dia.' }
    }
  }

  // K vive entre 0 e N. Acima disso, a venda marcaria como recebido mais do que
  // vale — e como esta função grava a baixa direto, sem passar pelo invariante
  // de `parcelar_lancamento`, aqui e no plpgsql são as duas únicas travas.
  const jaRecebidas = Math.round(dados.jaRecebidas)
  if (!(jaRecebidas >= 0) || jaRecebidas > parcelas) {
    return {
      ok: false,
      erro:
        parcelas > 1
          ? `Não dá para marcar ${jaRecebidas} parcelas já recebidas em uma venda de ${parcelas}.`
          : 'Sem parcelamento, a venda foi recebida (1) ou não foi (0).',
    }
  }
  // Sem o dia, a baixa não entra no fluxo de caixa: ele posiciona o dinheiro
  // por `baixado_em`. Assumir "hoje" jogaria no dia do cadastro um recebimento
  // que aconteceu na semana passada — que é justamente o caso que esta venda
  // precisa registrar.
  if (jaRecebidas > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(dados.recebidasEm ?? '')) {
    return { ok: false, erro: 'Informe a data em que as parcelas já recebidas entraram na conta.' }
  }

  const email = dados.clienteEmail.trim()
  // E-mail torto vira cliente novo e permanente no CRM — a função do banco
  // cadastra quem ela não encontra. Recusar antes é mais barato que limpar
  // depois.
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, erro: 'O e-mail do cliente não parece válido. Corrija ou deixe em branco.' }
  }

  // Arquivo de zero byte é o campo em branco, não um comprovante vazio.
  const comprovante =
    dados.comprovante instanceof File && dados.comprovante.size > 0 ? dados.comprovante : null
  if (comprovante) {
    const recusa = recusaDoComprovante(comprovante)
    if (recusa) return { ok: false, erro: recusa }
  }

  const sb = supabaseServer()

  // O arquivo sobe ANTES da venda, num rascunho: o pedido ainda não tem id
  // para dar nome à pasta, e um upload que falha aqui não deixou nada gravado
  // — o operador corrige o arquivo e reenvia o formulário inteiro. Na ordem
  // inversa, a venda existiria e o comprovante não, que é exatamente o estado
  // que este bloco existe para evitar.
  let rascunho: string | null = null
  const extensao = comprovante ? extensaoDoComprovante(comprovante) : ''
  if (comprovante) {
    rascunho = `rascunhos/${crypto.randomUUID()}.${extensao}`
    const { error: erroUpload } = await sb.storage
      .from(BUCKET_FINANCEIRO)
      .upload(rascunho, comprovante, { contentType: comprovante.type, upsert: false })
    if (erroUpload) {
      console.error('[venda manual] upload do comprovante falhou:', erroUpload)
      return { ok: false, erro: 'Não foi possível guardar o comprovante. Tente de novo.' }
    }
  }

  const { data, error } = await sb.rpc('registrar_venda_manual', {
    p_itens: itens.map((i) => ({
      base_id: i.baseId,
      ml: i.ml,
      quantidade: i.quantidade,
      preco: i.preco,
      descricao: i.descricao,
    })),
    p_conta_id: dados.contaId,
    p_canal: dados.canal,
    // Meio-dia UTC, não meia-noite: o banco converte `timestamptz` para a
    // data do lançamento com `::date`, e meia-noite em fuso negativo cai no
    // dia anterior. Ao meio-dia nenhum fuso praticado troca o dia da venda.
    p_ocorrido_em: `${dados.ocorridoEm}T12:00:00Z`,
    p_cliente_nome: dados.clienteNome.trim() || null,
    p_observacao: dados.observacao.trim() || null,
    p_operador: await operadorAtual(),
    p_cliente_email: email || null,
    p_parcelas: parcelas,
    p_intervalo_dias: Math.round(dados.intervaloDias) || INTERVALO_PADRAO_DIAS,
    p_ja_recebidas: jaRecebidas,
    // Nulo com K = 0 — o banco só usa a data para carimbar parcela recebida.
    p_recebidas_em: jaRecebidas > 0 ? dados.recebidasEm : null,
    p_desconto: desconto,
    p_transacao_id: (dados.transacaoId ?? '').trim().slice(0, 120) || null,
  })
  if (error) {
    console.error('[venda manual] registrar_venda_manual falhou:', error)
    // A venda não nasceu, então o rascunho não tem dono — some com ele agora,
    // senão o bucket junta um arquivo órfão a cada tentativa recusada.
    if (rascunho) await sb.storage.from(BUCKET_FINANCEIRO).remove([rascunho])
    return { ok: false, erro: error.message || error.details || 'Falha ao registrar a venda.' }
  }

  // `returns table (...)` chega como lista de uma linha só.
  const linha = (Array.isArray(data) ? data[0] : data) as
    | {
        pedido_id: string
        bruto: number | string
        desconto: number | string
        total: number | string
        total_recebido: number | string
        ml_baixado: number | string
        parcelas:
          | { numero: number; vence_em: string; valor: number | string; recebida_em: string | null }[]
          | null
        caixa_no_extrato: boolean
      }
    | undefined
  if (!linha) {
    return { ok: false, erro: 'A venda foi enviada, mas o banco não devolveu o pedido criado.' }
  }

  const pedidoId = String(linha.pedido_id)

  // Agora o pedido tem id, e o comprovante sai do rascunho para a pasta dele.
  // Daqui em diante a venda JÁ EXISTE: se o move ou o update falhar, a
  // resposta continua sendo `ok: true` com um aviso — dizer "falhou" mandaria
  // o operador registrar a mesma venda de novo, e aí seriam duas.
  let comprovanteAnexado = false
  let avisoComprovante: string | undefined
  if (rascunho) {
    const destino = `${pedidoId}/comprovante.${extensao}`
    const { error: erroMove } = await sb.storage
      .from(BUCKET_FINANCEIRO)
      .move(rascunho, destino)
    if (erroMove) {
      console.error(`[venda manual] mover comprovante de ${pedidoId} falhou:`, erroMove)
    } else {
      const { error: erroUpdate } = await sb
        .from('pedidos')
        .update({ comprovante: destino })
        .eq('id', pedidoId)
      if (erroUpdate) {
        console.error(`[venda manual] gravar comprovante de ${pedidoId} falhou:`, erroUpdate)
      } else comprovanteAnexado = true
    }
    if (!comprovanteAnexado) {
      // O arquivo que ficou pelo caminho sai do bucket agora. Nenhuma tela
      // lista o Storage, então o que não tem linha apontando para ele vira
      // lixo invisível — e a reanexação sobe o arquivo de novo, no lugar certo.
      await sb.storage
        .from(BUCKET_FINANCEIRO)
        .remove([erroMove ? rascunho : destino])
        .catch(() => {})
      avisoComprovante =
        'A venda foi registrada, mas o comprovante não subiu. Use o botão abaixo para anexar agora — a venda já está lançada e NÃO precisa ser refeita.'
    }
  }

  // Uma venda manual mexe em quatro telas ao mesmo tempo: o pedido nasce em
  // Pedidos, o ml sai de Estoque, o dinheiro entra em Financeiro e os dois
  // aparecem no Dashboard. Revalidar só Pedidos deixaria as outras três
  // mostrando o mundo de antes da venda.
  revalidatePath('/pedidos')
  revalidatePath('/estoque')
  revalidatePath('/')
  // E as sete do Financeiro, não só a raiz: o botão que dispara esta ação vive
  // em `/financeiro/lancamentos`, e a venda parcelada aparece também no fluxo
  // de caixa e no painel de próximos vencimentos.
  for (const rota of ROTAS_DO_FINANCEIRO) revalidatePath(rota)

  return {
    ok: true,
    pedidoId,
    // Tudo lido do que o banco devolveu, inclusive o bruto e o desconto que
    // esta função acabou de validar: quem arredonda é o `numeric` do Postgres,
    // e repetir a conta aqui é como a tela de sucesso passaria a mostrar um
    // centavo que o pedido não tem.
    bruto: Number(linha.bruto),
    desconto: Number(linha.desconto),
    total: Number(linha.total),
    recebido: Number(linha.total_recebido),
    mlBaixado: Number(linha.ml_baixado),
    caixaNoExtrato: Boolean(linha.caixa_no_extrato),
    comprovanteAnexado,
    avisoComprovante,
    // O cronograma vem do banco, não da prévia: a tela de sucesso mostra o que
    // foi GRAVADO, do mesmo jeito que já fazia com o total e os ml baixados.
    // Inclusive quais parcelas nasceram baixadas — é o que separa "já entrou"
    // de "vai entrar" na lista que o operador confere.
    parcelas: (linha.parcelas ?? []).map((p) => ({
      numero: Number(p.numero),
      valor: Number(p.valor),
      venceEm: String(p.vence_em),
      recebidaEm: p.recebida_em ? String(p.recebida_em) : null,
    })),
  }
}

/**
 * Anexa (ou substitui) o comprovante de um pedido que já existe.
 *
 * Existe por dois motivos. O primeiro é honestidade: é este botão que torna
 * verdadeira a frase "a venda foi registrada, mas o comprovante não ficou
 * guardado" — sem ele, aquele aviso seria um beco sem saída e o operador
 * acabaria registrando a venda duas vezes para conseguir anexar o arquivo. O
 * segundo é o dia a dia: o PIX que só cai depois, o comprovante que o cliente
 * manda no WhatsApp no dia seguinte, a foto que saiu tremida.
 *
 * `upsert: true` porque reenviar é CORRIGIR: o caminho é o mesmo, o arquivo
 * novo substitui o velho e o bucket não junta `comprovante-2`, `-3`, `-4` de
 * quem tentou três vezes. É o contrário da regra das devoluções, onde a prova
 * antiga fica — lá o histórico sustenta a decisão da triagem; aqui o
 * comprovante é só o recibo de um pagamento que não mudou.
 */
export async function anexarComprovanteDoPedido(
  pedidoId: string,
  arquivo: File,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para anexar comprovantes.' }
  }

  const id = pedidoId.trim()
  if (!id) return { ok: false, erro: 'Pedido não informado.' }
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: 'Escolha o arquivo do comprovante.' }
  }
  const recusa = recusaDoComprovante(arquivo)
  if (recusa) return { ok: false, erro: recusa }

  const sb = supabaseServer()

  // Confere o pedido ANTES de subir: sem isso, um id errado criaria uma pasta
  // no bucket para um pedido que não existe — arquivo que ninguém encontra e
  // ninguém apaga, porque nenhuma tela sabe que ele está lá.
  const { data: pedido, error: erroBusca } = await sb
    .from('pedidos')
    .select('id, comprovante')
    .eq('id', id)
    .maybeSingle()
  if (erroBusca) {
    console.error('[comprovante] leitura do pedido falhou:', erroBusca)
    return { ok: false, erro: mensagemDe(erroBusca) }
  }
  if (!pedido) return { ok: false, erro: `Pedido ${id} não encontrado.` }

  const caminho = `${id}/comprovante.${extensaoDoComprovante(arquivo)}`
  const { error: erroUpload } = await sb.storage
    .from(BUCKET_FINANCEIRO)
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: true })
  if (erroUpload) {
    console.error(`[comprovante] upload de ${id} falhou:`, erroUpload)
    return { ok: false, erro: 'Não foi possível guardar o comprovante. Tente de novo.' }
  }

  const { error: erroUpdate } = await sb
    .from('pedidos')
    .update({ comprovante: caminho })
    .eq('id', id)
  if (erroUpdate) {
    console.error(`[comprovante] gravar caminho de ${id} falhou:`, erroUpdate)
    return { ok: false, erro: mensagemDe(erroUpdate) }
  }

  // Trocar de PDF para foto muda a extensão, e o `upsert` só cobre o caminho
  // novo: sem isso o arquivo antigo ficaria no bucket para sempre, sem
  // nenhuma linha apontando para ele.
  const anterior = (pedido as { comprovante?: string | null }).comprovante
  if (anterior && anterior !== caminho) {
    await sb.storage.from(BUCKET_FINANCEIRO).remove([anterior])
  }

  revalidatePath('/pedidos')
  for (const rota of ROTAS_DO_FINANCEIRO) revalidatePath(rota)
  return { ok: true }
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
