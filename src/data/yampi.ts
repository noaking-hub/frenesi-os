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
    headers: {
      'Content-Type': 'application/json',
      'User-Token': token,
      'User-Secret-Key': secret,
    },
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

  return (await resposta.json()) as T
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
  }>('/orders', { include: 'customer,items,status,transactions', limit: '1' })

  const pedido = resposta.data?.[0]
  const dentro = (valor: unknown): string[] => {
    if (!valor || typeof valor !== 'object') return []
    // A Yampi embrulha relação em { data: {...} }; o que interessa é o miolo.
    const alvo = 'data' in valor ? (valor as { data: unknown }).data : valor
    if (Array.isArray(alvo)) return dentro(alvo[0])
    return alvo && typeof alvo === 'object' ? Object.keys(alvo).sort() : []
  }

  return {
    alias,
    pedidos: resposta.meta?.pagination?.total ?? (pedido ? 1 : 0),
    camposDoPedido: pedido ? Object.keys(pedido).sort() : [],
    camposDoCliente: dentro(pedido?.customer),
    camposDoItem: dentro(pedido?.items),
  }
}
