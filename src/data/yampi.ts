import 'server-only'

/**
 * Cliente da API da Yampi (Dooki v2).
 *
 * A Yampi é o checkout: é nela que o pedido nasce, o pagamento é confirmado,
 * o cliente informa CPF e endereço, e a entrega é marcada. A Shopify guarda
 * um espelho desse pedido, mas sem CPF, sem data de entrega e com os dados de
 * cliente atrás de uma aprovação que a Yampi não exige.
 *
 * Divisão de responsabilidade no ERP:
 *  - Shopify: catálogo, variantes, imagens e o estoque publicado na vitrine;
 *  - Yampi: pedido, pagamento, cliente, frete, rastreio e entrega.
 *
 * A ponte entre as duas é o SKU — o id de variante da Shopify não existe do
 * lado da Yampi, e já provou ser instável quando um produto é recriado.
 */

import { transacoesDoPedido } from '@/domain'

import { supabaseConfigurado, supabaseServer } from './supabase'

const BASE = 'https://api.dooki.com.br/v2'

function limpa(valor: string | undefined): string {
  return (valor ?? '').trim().replace(/^["']|["']$/g, '')
}

/**
 * O alias é o identificador da loja na URL do painel da Yampi. Aceita a URL
 * inteira colada por engano.
 */
function aliasNormalizado(valor: string): string {
  return limpa(valor)
    .replace(/^https?:\/\//, '')
    .replace(/^(app\.)?dooki\.com\.br\//, '')
    .replace(/^painel\.yampi\.com\.br\//, '')
    .replace(/\/.*$/, '')
}

export function credenciaisYampi() {
  return {
    alias: aliasNormalizado(process.env.YAMPI_ALIAS ?? ''),
    token: limpa(process.env.YAMPI_USER_TOKEN),
    secret: limpa(process.env.YAMPI_SECRET_KEY),
  }
}

export function yampiConfigurada(): boolean {
  const { alias, token, secret } = credenciaisYampi()
  return Boolean(alias && token && secret)
}

/** Erro de permissão ou credencial, separado para a tela reagir diferente. */
export class AcessoNegadoYampi extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'AcessoNegadoYampi'
  }
}

export async function chamarYampi<T>(
  caminho: string,
  parametros: Record<string, string> = {},
  opcoes: { metodo?: 'GET' | 'POST' | 'PUT' | 'DELETE'; corpo?: unknown } = {},
): Promise<T> {
  const { alias, token, secret } = credenciaisYampi()
  if (!alias || !token || !secret) {
    throw new Error(
      'Configure no .env.local: YAMPI_ALIAS (o identificador da loja na URL do painel), ' +
        'YAMPI_USER_TOKEN e YAMPI_SECRET_KEY — as duas chaves ficam em Configurações → Credenciais de API.',
    )
  }

  const url = new URL(`${BASE}/${alias}${caminho}`)
  for (const [chave, valor] of Object.entries(parametros)) url.searchParams.set(chave, valor)

  const resposta = await fetch(url, {
    method: opcoes.metodo ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'User-Token': token,
      'User-Secret-Key': secret,
    },
    body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
    cache: 'no-store',
  })

  if (resposta.status === 401 || resposta.status === 403) {
    throw new AcessoNegadoYampi(
      `A Yampi recusou as credenciais (${resposta.status}). Confira o alias "${alias}", o ` +
        'User-Token e a Secret Key — as duas chaves são geradas juntas e não valem em lojas diferentes.',
    )
  }
  if (resposta.status === 404) {
    throw new Error(
      `A Yampi não encontrou "${caminho}" na loja "${alias}". O alias costuma ser o trecho que ` +
        'aparece na URL do painel — confira se não é outro.',
    )
  }
  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '')
    throw new Error(
      `Yampi respondeu ${resposta.status}${detalhe ? ` — ${detalhe.slice(0, 200)}` : ''}.`,
    )
  }

  // DELETE (e alguns POST) respondem 2xx com corpo vazio. Fazer .json()
  // direto estourava "Unexpected end of JSON input" — e uma exclusão que DEU
  // CERTO na Yampi era contada como falha na tela.
  const cru = await resposta.text()
  if (!cru.trim()) return undefined as T
  try {
    return JSON.parse(cru) as T
  } catch {
    throw new Error(`A Yampi respondeu algo que não é JSON em ${caminho} — ${cru.slice(0, 160)}`)
  }
}

export interface DiagnosticoYampi {
  alias: string
  pedidos: number
  /**
   * Campos que a Yampi devolve num pedido real.
   *
   * A tela mostra isto porque o formato da resposta é o que decide o
   * mapeamento — e conferir contra um pedido de verdade vale mais que confiar
   * na documentação, que descreve o caso geral e não a sua loja.
   */
  camposDoPedido: string[]
  camposDoCliente: string[]
  camposDoItem: string[]
  /**
   * Campos da transação de pagamento e os identificadores que o leitor colheu
   * de uma venda real.
   *
   * É a única forma de saber se a ponte com o extrato vai funcionar antes de
   * depender dela: se a lista de identificadores vier vazia, nenhuma venda vai
   * encontrar o crédito, e é melhor descobrir aqui que num fechamento de mês.
   */
  camposDaTransacao: string[]
  identificadoresDaAmostra: string[]
}

/**
 * Confere as credenciais lendo UM pedido, e relata o formato que veio.
 *
 * Um teste que só diz "conectou" não ajuda: o que trava a importação é nome
 * de campo divergente, e é isso que este diagnóstico expõe antes de escrever
 * qualquer coisa no banco.
 */
export async function diagnosticarYampi(): Promise<DiagnosticoYampi> {
  const { alias } = credenciaisYampi()

  const resposta = await chamarYampi<{
    data?: Record<string, unknown>[]
    meta?: { pagination?: { total?: number } }
  }>('/orders', { include: 'customer,items,status,transactions,payments', limit: '1' })

  const pedido = resposta.data?.[0]
  const dentro = (valor: unknown): string[] => {
    if (!valor || typeof valor !== 'object') return []
    // A Yampi embrulha relação em { data: {...} }; o que interessa é o miolo.
    const alvo = 'data' in valor ? (valor as { data: unknown }).data : valor
    if (Array.isArray(alvo)) return dentro(alvo[0])
    return alvo && typeof alvo === 'object' ? Object.keys(alvo).sort() : []
  }

  const transacoes = pedido ? transacoesDoPedido(pedido) : []

  return {
    alias,
    pedidos: resposta.meta?.pagination?.total ?? (pedido ? 1 : 0),
    camposDoPedido: pedido ? Object.keys(pedido).sort() : [],
    camposDoCliente: dentro(pedido?.customer),
    camposDoItem: dentro(pedido?.items),
    camposDaTransacao: [
      ...new Set([...dentro(pedido?.transactions), ...dentro(pedido?.payments)]),
    ].sort(),
    identificadoresDaAmostra: transacoes.flatMap((t) => t.identificadores),
  }
}

// ── Importação de pedidos ──────────────────────────────────────────────────

/**
 * Forma de um pedido da Yampi, conferida contra a resposta real da loja.
 *
 * Só os campos que o ERP usa. A Yampi devolve mais de sessenta por pedido —
 * declarar todos convidaria a mapear o que ninguém lê.
 */
interface PedidoYampi {
  id: number
  number: number | string
  created_at: { date?: string } | string | null
  value_total: number | string | null
  value_shipment: number | string | null
  value_discount: number | string | null
  /** Marcação de entrega. É daqui que o prazo de devolução começa a contar. */
  delivered: boolean | number | null
  date_delivery: { date?: string } | string | null
  track_code: string | null
  shipment_service: string | null
  promocode: string | null
  /** Número do mesmo pedido na Shopify — a Yampi guarda como venda de marketplace. */
  marketplace_sale_number: string | number | null
  /**
   * Autorização do pagamento.
   *
   * É ESTE o sinal de "pago", não o status do pedido: o status descreve a
   * jornada logística (separação, enviado, entregue) e um pedido pode estar a
   * caminho com o status ainda no passo anterior.
   *
   * `has_payment` NÃO entra na conta: ele diz que existe uma TENTATIVA de
   * pagamento — um Pix gerado e nunca pago, um boleto vencido. Tratá-lo como
   * aprovação encheu o CRM de "clientes" que nunca pagaram.
   */
  authorized: boolean | number | null
  shipping_address?: { data?: EnderecoYampi } | EnderecoYampi | null
  status?: { data?: { alias?: string; name?: string } } | null
  customer?: { data?: ClienteYampi } | null
  items?: { data?: ItemYampi[] } | null
  /**
   * As transações de pagamento — a ponte com o extrato.
   *
   * Sem tipo estrito de propósito: quem lê é `transacoesDoPedido`, no domínio,
   * que colhe todos os identificadores possíveis em vez de apostar num nome
   * de campo. Declarar a forma aqui seria fingir que ela é conhecida.
   */
  transactions?: unknown
}

interface EnderecoYampi {
  street?: string | null
  number?: string | null
  neighborhood?: string | null
  city?: string | null
  state?: string | null
  zip_code?: string | null
  complement?: string | null
}

interface ClienteYampi {
  id: number
  name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: { formated_number?: string; full_number?: string } | string | null
  whatsapp: string | null
  cpf: string | null
  cnpj: string | null
}

interface ItemYampi {
  id: number
  sku?: { data?: { title?: string; sku?: string } } | null
  item_sku: string | null
  quantity: number
  price: number | string | null
  product_id: number | null
}

/** A Yampi devolve data ora como string, ora como `{ date: '...' }`. */
function dataYampi(valor: { date?: string } | string | null | undefined): string | null {
  if (!valor) return null
  const bruto = typeof valor === 'string' ? valor : valor.date
  if (!bruto) return null
  // `2026-08-09 14:55:00.000000` não é ISO — e é hora DE SÃO PAULO, não UTC.
  // O `Z` que ficava aqui empurrava todo pedido 3 horas para trás: a compra
  // das 21h aparecia no dia seguinte e a venda do dia caía no dia errado.
  // O Brasil não tem mais horário de verão, então o deslocamento é fixo.
  const iso = bruto.includes('T') ? bruto : `${bruto.replace(' ', 'T').slice(0, 19)}-03:00`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function numero(valor: number | string | null | undefined): number {
  const n = typeof valor === 'string' ? Number(valor) : (valor ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** A Yampi ora embrulha a relação em `{ data }`, ora devolve o objeto direto. */
function enderecoDe(p: PedidoYampi): EnderecoYampi | null {
  const e = p.shipping_address
  if (!e) return null
  if ('data' in e) return (e as { data?: EnderecoYampi }).data ?? null
  return e as EnderecoYampi
}

function telefoneDe(c: ClienteYampi): string {
  if (typeof c.phone === 'string') return c.phone
  return c.phone?.formated_number ?? c.phone?.full_number ?? c.whatsapp ?? ''
}

/**
 * Situação de pagamento de um pedido, com a TRANSAÇÃO como autoridade.
 *
 * O campo `authorized` do pedido mente: uma autorização anulada antes da
 * captura o deixa true para sempre, e o status do pedido às vezes nem
 * registra o cancelamento. Quem sabe a verdade é a transação — `cancelled`,
 * `refused` e `waiting_payment` não são venda, por mais que o pedido diga
 * que sim. O status do pedido só decide quando não há transação nenhuma.
 */
function situacaoDoPedido(
  p: PedidoYampi,
): 'pago' | 'pendente' | 'divergente' | 'cancelado' {
  const transacoes = transacoesDoPedido(p as unknown as Record<string, unknown>)
  const situacoes = transacoes.map((t) => t.status.toLowerCase())
  const temEstorno = situacoes.some((s) => /refund|estorn|chargeback|devolv/.test(s))
  const temPagamento = situacoes.some((s) => /paid|approv|authoriz|captur|settl/.test(s))
  if (temEstorno) return 'divergente'
  if (temPagamento) return 'pago'
  // Transações existem e nenhuma pagou: recusada, anulada ou esperando.
  if (situacoes.length > 0) return 'cancelado'
  return pagamentoYampi(
    p.status?.data?.alias ?? '',
    p.status?.data?.name ?? '',
    Boolean(p.authorized),
  )
}

/**
 * Situação de pagamento a partir do status da Yampi.
 *
 * Estorno vira `divergente` e não `pago`: o dinheiro entrou e voltou, e a
 * conciliação precisa enxergar pendência, não receita limpa.
 */
function pagamentoYampi(
  alias: string,
  nome: string,
  autorizado: boolean,
): 'pago' | 'pendente' | 'divergente' | 'cancelado' {
  const t = `${alias} ${nome}`.toLowerCase()

  // Estorno e cancelamento vêm do status e mandam mais que a autorização: um
  // pedido estornado FOI autorizado um dia.
  if (/estorn|refund|charge_?back/.test(t)) return 'divergente'
  if (/cancel|expirad|recusad|negad/.test(t)) return 'cancelado'

  // A autorização é o fato do pagamento; o status é a jornada logística.
  // Derivar "pago" só do status fazia pedido já enviado aparecer como
  // pendente — o alias da Yampi vem em inglês (`shipped`, `delivered`) e não
  // casava com a lista de palavras em português.
  if (autorizado) return 'pago'
  // Sobrou como rede: um passo posterior à cobrança só existe se ela ocorreu.
  return /paid|pago|aprovad|approved|authorized|faturad|invoiced|separa|picking|enviad|shipped|entregue|delivered/.test(
    t,
  )
    ? 'pago'
    : 'pendente'
}

function envioYampi(alias: string, nome: string, entregue: boolean, rastreio: string | null) {
  if (entregue) return 'entregue'
  const t = `${alias} ${nome}`.toLowerCase()
  if (/entregue|delivered/.test(t)) return 'entregue'
  if (/enviad|shipped|transito|transporte|on_?carriage/.test(t)) return 'enviado'
  if (rastreio) return 'enviado'
  if (/separa|faturad|invoiced|picking/.test(t)) return 'aguardando_envio'
  return 'nao_iniciado'
}

export interface ResultadoYampi {
  pedidos: number
  itens: number
  clientes: number
  entregues: number
  itensSemVariante: number
  casadosPorSku: number
  /** Transações de pagamento lidas — a ponte com o extrato do gateway. */
  transacoes: number
  /** Pedidos pagos que vieram sem transação. Cada um é uma venda que o extrato não vai achar. */
  pedidosSemTransacao: number
  /** Linhas do extrato que encontraram a venda graças a estas transações. */
  extratoLigado: number
  /** Pedidos que deixaram de ser venda na Yampi e saíram do banco. */
  removidos: number
  desde: string
}

export type MapaVariante = Map<string, { baseId: string; variante: number }>

/**
 * Importa os pedidos da Yampi — cliente, itens, pagamento, rastreio e entrega.
 *
 * O casamento do item usa o SKU, e não o id da variante: o id é da Shopify e
 * não existe do lado da Yampi. É a única chave que os dois sistemas
 * compartilham.
 */
export async function lerPedidosYampi(dias: number): Promise<PedidoYampi[]> {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const ate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const pedidos: PedidoYampi[] = []
  for (let pagina = 1; pagina <= 60; pagina++) {
    const r = await chamarYampi<{
      data?: PedidoYampi[]
      meta?: { pagination?: { current_page: number; total_pages: number } }
    }>('/orders', {
      // `shipping_address` não vem sem pedir: sem ele o pedido chega sem
      // cidade, CEP nem logradouro, e a ficha fica com três campos vazios.
      //
      // `transactions` é o que liga a venda ao dinheiro: traz o id que o
      // Mercado Pago devolveu, e é o mesmo que aparece no extrato. Sem ele
      // sobra casar por valor e data, que recusa sempre que dois decants do
      // mesmo preço caem no mesmo dia — e eram 89 vendas órfãs por isso.
      include: 'customer,items,status,shipping_address,transactions,payments',
      date: `created_at:${desde}|${ate}`,
      limit: '50',
      page: String(pagina),
    })
    pedidos.push(...(r.data ?? []))
    const p = r.meta?.pagination
    if (!p || p.current_page >= p.total_pages) break
  }
  return pedidos
}

/**
 * Importa os pedidos da Yampi para o ERP.
 *
 * Grava com canal `yampi`, o que separa estes pedidos do espelho antigo da
 * Shopify e permite limpar um sem tocar no outro.
 */
export async function importarPedidosYampi(dias = 90): Promise<ResultadoYampi> {
  if (!supabaseConfigurado()) {
    throw new Error('O Supabase precisa estar configurado para receber a importação.')
  }
  const sb = supabaseServer()
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // Só venda entra no ERP: cancelado e pendente ficam na Yampi. 'divergente'
  // (estornado) entra de propósito — o dinheiro entrou e voltou, e a
  // conciliação precisa enxergar esse movimento. Um pendente que for pago
  // amanhã entra na próxima rodada, já como pago.
  const lidos = await lerPedidosYampi(dias)
  const eVenda = (p: PedidoYampi) => {
    const situacao = situacaoDoPedido(p)
    return situacao === 'pago' || situacao === 'divergente'
  }
  const pedidos = lidos.filter(eVenda)

  // Autocura: o que a Yampi diz que NÃO é venda sai do banco, se um dia
  // entrou — versões antigas do importador aceitavam Pix gerado como pago.
  // A trava dos vínculos protege o histórico financeiro: linha de extrato,
  // devolução ou lançamento apontando para o pedido impede o descarte.
  const descartar = lidos.filter((p) => !eVenda(p)).map((p) => `YP-${p.number}`)
  let removidos = 0
  for (const parte of lotes(descartar, 200)) {
    const { data: removiveis, error: erroRemoviveis } = await sb.rpc('pedidos_descartaveis', {
      p_ids: parte,
    })
    if (erroRemoviveis) throw erroRemoviveis
    const ids = (removiveis ?? []) as string[]
    if (!ids.length) continue
    const { error: erroRemover } = await sb.from('pedidos').delete().in('id', ids)
    if (erroRemover) throw erroRemover
    removidos += ids.length
  }

  // Ponte entre as plataformas: o SKU. O id de variante é da Shopify e não
  // existe do lado da Yampi.
  const { data: derivados, error: erroDerivados } = await sb
    .from('produtos_derivados')
    .select('base_id, variante, sku')
    .not('sku', 'is', null)
  if (erroDerivados) throw erroDerivados
  const porSku: MapaVariante = new Map(
    (derivados ?? []).map((d) => [
      String(d.sku).trim().toLowerCase(),
      { baseId: d.base_id as string, variante: d.variante as number },
    ]),
  )

  const clientes = new Map<string, Record<string, unknown>>()
  for (const p of pedidos) {
    const c = p.customer?.data
    const email = c?.email?.trim().toLowerCase()
    if (!c || !email) continue
    clientes.set(email, {
      nome: c.name ?? [c.first_name, c.last_name].filter(Boolean).join(' ') ?? email,
      email,
      // O portal de devolução encontra o pedido por CPF — é o dado que a
      // Shopify não tem e que sozinho justifica importar daqui.
      cpf: (c.cpf ?? c.cnpj ?? '').replace(/\D/g, '') || null,
      telefone: telefoneDe(c) || null,
    })
  }

  for (const parte of lotes([...clientes.values()], 500)) {
    const { error } = await sb.from('clientes').upsert(parte, { onConflict: 'email' })
    if (error) throw error
  }

  const { data: idsClientes, error: erroIds } = await sb.from('clientes').select('id, email')
  if (erroIds) throw erroIds
  const clientePorEmail = new Map(
    (idsClientes ?? []).map((c) => [(c.email as string).toLowerCase(), c.id as string]),
  )

  let entregues = 0
  const linhasPedidos = pedidos.map((p) => {
    const alias = p.status?.data?.alias ?? ''
    const nome = p.status?.data?.name ?? ''
    const entregue = Boolean(p.delivered)
    const endereco = enderecoDe(p)
    const entregueEm = entregue ? dataYampi(p.date_delivery) : null
    if (entregueEm) entregues++
    const email = p.customer?.data?.email?.trim().toLowerCase()

    return {
      id: `YP-${p.number}`,
      cliente_id: email ? (clientePorEmail.get(email) ?? null) : null,
      canal: 'yampi',
      valor: numero(p.value_total),
      frete: numero(p.value_shipment),
      cashback: 0,
      pagamento: situacaoDoPedido(p),
      envio: envioYampi(alias, nome, entregue, p.track_code),
      comprado_em: dataYampi(p.created_at) ?? new Date().toISOString(),
      // Sem esta data o Portal de Devoluções não funciona: o prazo de 7 dias
      // conta a partir dela, e é a única plataforma que a marca.
      entregue_em: entregueEm,
      rastreio: p.track_code,
      // O serviço diz por qual plataforma o envio foi emitido (Frenet ou
      // Melhor Envio) — a Yampi não informa a plataforma diretamente.
      servico_frete: p.shipment_service ?? null,
      gateway: null,
      destino: endereco
        ? [endereco.city, endereco.state].filter(Boolean).join(' · ') || null
        : null,
      cep: endereco?.zip_code?.replace(/\D/g, '') || null,
      logradouro: endereco
        ? [endereco.street, endereco.number, endereco.neighborhood]
            .filter(Boolean)
            .join(', ') || null
        : null,
      // O vínculo com o pedido espelhado na Shopify. É por ele que o rastreio
      // chega até a conta onde o cliente faz login.
      shopify_numero: p.marketplace_sale_number ? String(p.marketplace_sale_number) : null,
    }
  })

  for (const parte of lotes(linhasPedidos, 500)) {
    const { error } = await sb.from('pedidos').upsert(parte, { onConflict: 'id' })
    if (error) throw error
  }

  // Itens são reescritos por pedido: quantidade e preço mudam por edição do
  // pedido, e somar de novo duplicaria a venda.
  const { error: erroLimpa } = await sb
    .from('pedido_itens')
    .delete()
    .in('pedido_id', linhasPedidos.map((p) => p.id))
  if (erroLimpa) throw erroLimpa

  let itensSemVariante = 0
  let casadosPorSku = 0
  const linhasItens = pedidos.flatMap((p) =>
    (p.items?.data ?? []).map((i) => {
      const sku = (i.sku?.data?.sku ?? i.item_sku ?? '').trim()
      const casado = sku ? porSku.get(sku.toLowerCase()) : undefined
      if (casado) casadosPorSku++
      else itensSemVariante++

      return {
        pedido_id: `YP-${p.number}`,
        base_id: casado?.baseId ?? null,
        descricao: i.sku?.data?.title ?? sku ?? 'Item sem descrição',
        variante: casado?.variante ?? null,
        quantidade: i.quantity || 1,
        preco: numero(i.price),
        sku: sku || null,
      }
    }),
  )

  for (const parte of lotes(linhasItens, 500)) {
    const { error } = await sb.from('pedido_itens').insert(parte)
    if (error) throw error
  }

  // ── Transações: a ponte entre a venda e o dinheiro ───────────────────────
  //
  // Guardadas depois dos pedidos porque a chave estrangeira exige que o
  // pedido exista. Reimportar sobrescreve: o status da transação muda quando
  // um pagamento é estornado, e a versão nova é a que vale.
  let pedidosSemTransacao = 0
  const linhasTransacoes = pedidos.flatMap((p) => {
    const transacoes = transacoesDoPedido(p as unknown as Record<string, unknown>)
    const autorizado = Boolean(p.authorized)
    // Pedido não pago sem transação é normal — não houve pagamento. Pedido
    // PAGO sem transação é o caso que interessa: é uma venda que o extrato
    // não vai conseguir achar, e o número precisa aparecer no relatório.
    if (autorizado && transacoes.length === 0) pedidosSemTransacao += 1

    return transacoes.map((t) => ({
      pedido_id: `YP-${p.number}`,
      transacao_id: t.id,
      gateway: t.gateway,
      status: t.status,
      valor: t.valor,
      parcelas: t.parcelas,
      identificadores: t.identificadores,
      lido_em: new Date().toISOString(),
    }))
  })

  for (const parte of lotes(linhasTransacoes, 500)) {
    const { error } = await sb
      .from('pedido_transacoes')
      .upsert(parte, { onConflict: 'pedido_id,transacao_id' })
    if (error) throw error
  }

  // O dinheiro pode ter chegado antes do pedido. Ligar aqui resolve esse
  // atraso; a atualização do extrato resolve o inverso.
  const { data: ligadas, error: erroLigar } = await sb.rpc('ligar_extrato_por_transacao', {
    p_origem: 'mercadopago',
  })
  if (erroLigar) throw erroLigar

  // Pago e depois estornado não é venda: quem tem rastro de estorno (linha
  // de saída no extrato ou status de transação) vira divergente agora. E
  // quem só tem transação recusada/anulada nunca foi venda — sai do banco.
  const { error: erroEstornos } = await sb.rpc('marcar_estornados')
  if (erroEstornos) throw erroEstornos
  const { error: erroNaoVendas } = await sb.rpc('limpar_nao_vendas')
  if (erroNaoVendas) throw erroNaoVendas

  // Venda que ainda não saiu é volume comprometido. Sem este passo a próxima
  // sincronia devolveria à Shopify o número de antes da venda, e a loja
  // voltaria a oferecer o que já foi vendido.
  const { error: erroReservas } = await sb.rpc('recalcular_reservas')
  if (erroReservas) throw erroReservas

  const { error: erroLog } = await sb.from('sincronizacoes').insert({
    origem: 'yampi',
    tipo: 'pedidos',
    perfumes: clientes.size,
    variantes: linhasItens.length,
    ignorados: itensSemVariante,
    detalhes: {
      desde,
      dias,
      entregues,
      casadosPorSku,
      transacoes: linhasTransacoes.length,
      pedidosSemTransacao,
      extratoLigado: Number(ligadas ?? 0),
      removidos,
    },
  })
  if (erroLog) throw erroLog

  return {
    pedidos: linhasPedidos.length,
    itens: linhasItens.length,
    clientes: clientes.size,
    entregues,
    itensSemVariante,
    casadosPorSku,
    transacoes: linhasTransacoes.length,
    pedidosSemTransacao,
    extratoLigado: Number(ligadas ?? 0),
    removidos,
    desde,
  }
}

function lotes<T>(itens: T[], tamanho: number): T[][] {
  const partes: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) partes.push(itens.slice(i, i + tamanho))
  return partes
}

/**
 * Apaga os pedidos que vieram do espelho da Shopify.
 *
 * Com a Yampi como origem, os dois conjuntos descrevem as MESMAS vendas com
 * ids diferentes — mantê-los somaria o faturamento duas vezes em todo KPI.
 */
export async function limparPedidosShopify(): Promise<{ removidos: number }> {
  if (!supabaseConfigurado()) throw new Error('O Supabase precisa estar configurado.')
  const sb = supabaseServer()

  // Nunca apagar o espelho quando não há nada no lugar dele. Uma importação
  // que voltou vazia — janela errada, loja sem venda no período — deixaria o
  // ERP sem pedido nenhum e sem aviso.
  const { count, error: erroConta } = await sb
    .from('pedidos')
    .select('id', { count: 'exact', head: true })
    .eq('canal', 'yampi')
  if (erroConta) throw erroConta
  if (!count) return { removidos: 0 }

  const { data, error } = await sb.from('pedidos').delete().eq('canal', 'shopify').select('id')
  if (error) throw error
  return { removidos: (data ?? []).length }
}
