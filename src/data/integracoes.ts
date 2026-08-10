import 'server-only'

import { emailConfigurado } from './email'
import { mercadoPagoConfigurado } from './mercadopago'
import { shopifyConfigurada } from './shopify'
import { supabaseConfigurado, supabaseServer } from './supabase'
import { yampiConfigurada } from './yampi'

/**
 * Estado real das integrações.
 *
 * A tela antiga listava sete integrações "Conectadas" com ping "há 2 min" —
 * texto fixo, independente de haver credencial. Um painel de integrações que
 * diz "conectada" sem ter tentado é a peça que mais atrapalha justamente no
 * momento em que algo para de funcionar: a primeira coisa que se olha é o
 * lugar que garante que está tudo bem.
 *
 * Aqui cada linha nasce de duas perguntas verificáveis: a credencial existe
 * no ambiente? e quando foi a última vez que essa integração produziu algo
 * no banco?
 */

export type PapelIntegracao =
  | 'Loja e catálogo'
  | 'Checkout e frete'
  | 'Pagamento'
  | 'Comunicação'
  | 'Dados'
  | 'Preço de mercado'
  | 'Nota fiscal'

export interface EstadoIntegracao {
  id: string
  sigla: string
  nome: string
  papel: PapelIntegracao
  /** Tem credencial suficiente para tentar. */
  configurada: boolean
  /** O que falta no ambiente, quando falta. */
  faltando: string[]
  /** O que ela faz por nós, em uma linha. */
  detalhe: string
  /** Último fato que ela produziu no banco. Null quando nunca produziu. */
  ultimaAtividade: string | null
  /** Como se descreve a última atividade. */
  atividade: string
  /** Existe um diagnóstico que dá para rodar daqui. */
  testavel: boolean
}

function falta(nome: string, ...vars: string[]): string[] {
  return vars.filter((v) => !(process.env[v] ?? '').trim()).map((v) => `${v} (${nome})`)
}

export async function estadoDasIntegracoes(): Promise<EstadoIntegracao[]> {
  const atividades = await ultimasAtividades()

  return [
    {
      id: 'supabase',
      sigla: 'SB',
      nome: 'Supabase',
      papel: 'Dados',
      configurada: supabaseConfigurado(),
      faltando: falta('banco', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'),
      detalhe: 'É o banco do ERP. Sem ele toda tela cai nos dados de demonstração.',
      ultimaAtividade: atividades.pedido,
      atividade: 'último pedido gravado',
      testavel: true,
    },
    {
      id: 'shopify',
      sigla: 'SH',
      nome: 'Shopify',
      papel: 'Loja e catálogo',
      configurada: shopifyConfigurada(),
      faltando: shopifyConfigurada()
        ? []
        : ['SHOPIFY_LOJA e um par de credenciais (token fixo ou client id + secret)'],
      detalhe: 'Catálogo, preço publicado, estoque na vitrine e a baixa de entrega.',
      ultimaAtividade: atividades.shopify,
      atividade: 'última sincronia de catálogo',
      testavel: true,
    },
    {
      id: 'yampi',
      sigla: 'YP',
      nome: 'Yampi',
      papel: 'Checkout e frete',
      configurada: yampiConfigurada(),
      faltando: falta('checkout', 'YAMPI_ALIAS', 'YAMPI_USER_TOKEN', 'YAMPI_SECRET_KEY'),
      detalhe: 'Onde o pedido nasce: pagamento, CPF, endereço, rastreio e entrega.',
      ultimaAtividade: atividades.pedido,
      atividade: 'último pedido importado',
      testavel: true,
    },
    {
      id: 'mercadopago',
      sigla: 'MP',
      nome: 'Mercado Pago',
      papel: 'Pagamento',
      configurada: mercadoPagoConfigurado(),
      faltando: falta('gateway', 'MERCADOPAGO_ACCESS_TOKEN'),
      detalhe: 'A tarifa real de cada venda e o que de fato foi creditado.',
      ultimaAtividade: atividades.mercadopago,
      atividade: 'última linha de extrato lida',
      testavel: true,
    },
    {
      id: 'resend',
      sigla: 'EM',
      nome: 'E-mail transacional',
      papel: 'Comunicação',
      configurada: emailConfigurado(),
      faltando: falta('e-mail', 'RESEND_API_KEY', 'EMAIL_REMETENTE'),
      detalhe:
        'Remetente único dos avisos ao cliente e do arquivo mensal ao escritório. O domínio precisa de SPF e DKIM.',
      ultimaAtividade: null,
      atividade: 'sem registro de envio',
      testavel: false,
    },
    {
      id: 'concorrentes',
      sigla: 'CC',
      nome: 'Lojas concorrentes',
      papel: 'Preço de mercado',
      configurada: supabaseConfigurado(),
      faltando: (process.env.CRON_SEGREDO ?? '').trim()
        ? []
        : ['CRON_SEGREDO (sem ele a coleta diária fica sem proteção e não deve ser agendada)'],
      detalhe: 'Leitura diária do preço das lojas cadastradas, para sustentar a decisão de preço.',
      ultimaAtividade: atividades.concorrentes,
      atividade: 'última loja vasculhada',
      testavel: false,
    },
    {
      id: 'olist',
      sigla: 'OL',
      nome: 'Olist ERP',
      papel: 'Nota fiscal',
      configurada: false,
      faltando: falta('nota fiscal', 'OLIST_CLIENT_ID', 'OLIST_CLIENT_SECRET', 'OLIST_REFRESH_TOKEN'),
      detalhe:
        'O ERP não emite nota: leria o Olist para fechar o ciclo do pedido. Ainda não implementado — nenhuma tela depende disto.',
      ultimaAtividade: null,
      atividade: 'não implementado',
      testavel: false,
    },
  ]
}

interface Atividades {
  pedido: string | null
  shopify: string | null
  mercadopago: string | null
  concorrentes: string | null
}

/** Últimos fatos produzidos por cada integração. Nada de ping inventado. */
async function ultimasAtividades(): Promise<Atividades> {
  const vazio: Atividades = {
    pedido: null,
    shopify: null,
    mercadopago: null,
    concorrentes: null,
  }
  if (!supabaseConfigurado()) return vazio

  const sb = supabaseServer()
  const [pedido, sincronia, extratoMp, concorrente] = await Promise.all([
    sb.from('pedidos').select('comprado_em').order('comprado_em', { ascending: false }).limit(1),
    sb
      .from('sincronizacoes')
      .select('executada_em')
      .order('executada_em', { ascending: false })
      .limit(1),
    sb
      .from('extrato_linhas')
      .select('lido_em')
      .eq('origem', 'mercadopago')
      .order('lido_em', { ascending: false })
      .limit(1),
    sb
      .from('concorrentes')
      .select('ultima_leitura')
      .not('ultima_leitura', 'is', null)
      .order('ultima_leitura', { ascending: false })
      .limit(1),
  ])

  return {
    pedido: pedido.data?.[0]?.comprado_em ?? null,
    shopify: sincronia.data?.[0]?.executada_em ?? null,
    mercadopago: extratoMp.data?.[0]?.lido_em ?? null,
    concorrentes: concorrente.data?.[0]?.ultima_leitura ?? null,
  }
}
