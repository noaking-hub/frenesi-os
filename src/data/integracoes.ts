import 'server-only'

import { emailConfigurado } from './email'
import { frenetConfigurada } from './frenet'
import { melhorEnvioConfigurado } from './melhorenvio'
import { quizConfigurado, resumoDoQuiz } from './quiz'
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
  | 'Frete'

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
      id: 'frenet',
      sigla: 'FR',
      nome: 'Frenet',
      papel: 'Frete',
      configurada: frenetConfigurada(),
      faltando: falta('rastreio', 'FRENET_TOKEN'),
      detalhe:
        'Eventos de rastreio dos Correios e da Jadlog — 78% dos envios. A Yampi entrega o código; o caminho do objeto vem daqui.',
      ultimaAtividade: atividades.rastreio,
      atividade: 'último evento de rastreio gravado',
      testavel: false,
    },
    {
      id: 'melhorenvio',
      sigla: 'ME',
      nome: 'Melhor Envio',
      papel: 'Frete',
      configurada: melhorEnvioConfigurado(),
      faltando: falta('rastreio', 'MELHORENVIO_CLIENT_ID', 'MELHORENVIO_CLIENT_SECRET'),
      detalhe:
        'Os 22% restantes dos envios. Depois das credenciais, precisa de UMA autorização no navegador — o botão Conectar abaixo.',
      ultimaAtividade: atividades.rastreio,
      atividade: 'último evento de rastreio gravado',
      testavel: false,
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
      id: 'quiz',
      sigla: 'QZ',
      nome: 'Curadoria Olfativa (quiz)',
      papel: 'Dados',
      configurada: quizConfigurado(),
      faltando: falta('quiz', 'QUIZ_SUPABASE_URL', 'QUIZ_SUPABASE_SERVICE_KEY'),
      detalhe: quizConfigurado()
        ? await detalheDoQuiz()
        : 'Respostas do quiz importadas de hora em hora e cruzadas com os clientes por e-mail.',
      ultimaAtividade: atividades.quiz,
      atividade: 'última resposta importada',
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
  rastreio: string | null
  quiz: string | null
}

/** Últimos fatos produzidos por cada integração. Nada de ping inventado. */
async function ultimasAtividades(): Promise<Atividades> {
  const vazio: Atividades = {
    pedido: null,
    shopify: null,
    mercadopago: null,
    rastreio: null,
    quiz: null,
  }
  if (!supabaseConfigurado()) return vazio

  const sb = supabaseServer()
  const [pedido, sincronia, extratoMp, rastreio, quiz] = await Promise.all([
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
      .from('rastreio_eventos')
      .select('criado_em')
      .order('criado_em', { ascending: false })
      .limit(1),
    sb
      .from('quiz_respostas')
      .select('importado_em')
      .order('importado_em', { ascending: false })
      .limit(1),
  ])

  return {
    pedido: pedido.data?.[0]?.comprado_em ?? null,
    shopify: sincronia.data?.[0]?.executada_em ?? null,
    mercadopago: extratoMp.data?.[0]?.lido_em ?? null,
    rastreio: rastreio.data?.[0]?.criado_em ?? null,
    quiz: quiz.data?.[0]?.importado_em ?? null,
  }
}

/**
 * O placar da curadoria dentro do card: quantos responderam, quantos viraram
 * cliente e a receita atribuída (pedido pago do mesmo e-mail DEPOIS da
 * resposta — atribuição, não certeza).
 */
async function detalheDoQuiz(): Promise<string> {
  const r = await resumoDoQuiz()
  if (r.respostas === 0) {
    return 'Configurado. A primeira importação sai na próxima rodada de hora em hora.'
  }
  if (r.comEmail === 0) {
    // O quiz de hoje não captura e-mail: o que chega é o clique na
    // recomendação, com o perfil de respostas — sinal de demanda, anônimo.
    return `${r.respostas} interações importadas, todas anônimas — o quiz ainda não captura e-mail, então não há cruzamento com clientes.`
  }
  const receita = r.receitaAtribuida.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  return (
    `${r.respostas} respostas importadas (${r.comEmail} com e-mail) · ` +
    `${r.viraramClientes} viraram clientes · R$ ${receita} em pedidos pagos após a resposta.`
  )
}
