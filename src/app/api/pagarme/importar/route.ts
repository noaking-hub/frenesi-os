import { NextResponse } from 'next/server'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

/**
 * Importação ÚNICA do histórico da Pagar.me (gateway usado até 21/07/2026).
 *
 * A operação trocou de intermediador em 22/07: antes disso o dinheiro passava
 * pela Pagar.me, e o ERP não tem nenhum registro desse período — 394 dos 622
 * pedidos ficaram sem data de recebimento e sem a tarifa real, o que deixa a
 * margem de maio e junho superestimada.
 *
 * Isto NÃO é uma integração: é um resgate de histórico. Não há cron, não há
 * tela, e o acesso à conta é temporário — depois de rodar, a chave pode (e
 * deve) ser revogada. Por isso a rota vive sozinha, com a mesma guarda das
 * rotinas, e não dentro do módulo Financeiro.
 *
 *     POST /api/pagarme/importar?dry=1   → mostra o que viria, sem gravar
 *     POST /api/pagarme/importar         → grava no extrato
 *     Authorization: Bearer $CRON_SEGREDO
 */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const BASE = 'https://api.pagar.me/core/v5'
/** A conta do gateway antigo é separada: misturar dois provedores numa conta
 *  só apagaria a data da migração e a comparação de tarifa entre eles. */
const CONTA = 'pagarme'
const DE = '2026-05-01'
const ATE = '2026-07-22'

function autorizado(req: Request): boolean {
  const esperado = process.env.CRON_SEGREDO
  if (!esperado) return false
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') === esperado
}

interface Cobranca {
  id: string
  code?: string
  status?: string
  amount?: number
  paid_amount?: number
  created_at?: string
  paid_at?: string
  payment_method?: string
  order?: { id?: string; code?: string } | null
  customer?: { name?: string; email?: string } | null
  last_transaction?: {
    acquirer_name?: string
    installments?: number
    paid_amount?: number
    amount?: number
  } | null
}

/** Centavos → reais. A v5 devolve tudo em centavos inteiros. */
const reais = (centavos: number | undefined | null) => Math.round((centavos ?? 0)) / 100

export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })

  const chave = process.env.PAGARME_SECRET_KEY
  if (!chave) {
    return NextResponse.json(
      { erro: 'PAGARME_SECRET_KEY não está definida nas variáveis do site.' },
      { status: 400 },
    )
  }
  if (!supabaseConfigurado()) {
    return NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 400 })
  }

  const ensaio = new URL(req.url).searchParams.get('dry') === '1'
  const auth = `Basic ${Buffer.from(`${chave}:`).toString('base64')}`

  const cobrancas: Cobranca[] = []
  let pagina = 1
  let erroApi: string | null = null

  // A v5 pagina por `page`/`size`; 100 é o teto por página.
  while (pagina <= 30) {
    const url =
      `${BASE}/charges?size=100&page=${pagina}` +
      `&created_since=${DE}T00:00:00Z&created_until=${ATE}T23:59:59Z`
    const r = await fetch(url, { headers: { Authorization: auth } })
    if (!r.ok) {
      erroApi = `${r.status} ${(await r.text()).slice(0, 300)}`
      break
    }
    const json = (await r.json()) as { data?: Cobranca[] }
    const lote = json.data ?? []
    cobrancas.push(...lote)
    if (lote.length < 100) break
    pagina++
  }

  if (erroApi) return NextResponse.json({ erro: `Pagar.me respondeu ${erroApi}` }, { status: 502 })

  // Só o que virou dinheiro. Recusada e não paga não movimentam caixa.
  const pagas = cobrancas.filter((c) => c.status === 'paid')

  const linhas = pagas.map((c) => {
    const bruto = reais(c.amount)
    const liquido = reais(c.paid_amount ?? c.last_transaction?.paid_amount ?? c.amount)
    const quando = (c.paid_at ?? c.created_at ?? '').slice(0, 10)
    return {
      origem: 'pagarme',
      chave: `pagarme:${c.id}`,
      conta_id: CONTA,
      ocorrido_em: quando,
      // O código do pedido na Pagar.me é o que casa com o pedido do ERP.
      descricao: 'Venda recebida',
      contraparte: c.customer?.name ?? null,
      documento: c.order?.code ?? c.code ?? null,
      tipo: 'entrada',
      valor: liquido,
      pedido_id: null as string | null,
      ignorado: false,
      interno: false,
      bruto: {
        bruto,
        liquido,
        meio: c.payment_method ?? null,
        parcelas: c.last_transaction?.installments ?? null,
        adquirente: c.last_transaction?.acquirer_name ?? null,
        pedido_pagarme: c.order?.code ?? null,
      },
    }
  })

  const totalBruto = pagas.reduce((a, c) => a + reais(c.amount), 0)
  const totalLiquido = linhas.reduce((a, l) => a + l.valor, 0)

  const resumo = {
    periodo: `${DE} a ${ATE}`,
    cobrancasLidas: cobrancas.length,
    pagas: pagas.length,
    totalBruto: Math.round(totalBruto * 100) / 100,
    totalLiquido: Math.round(totalLiquido * 100) / 100,
    tarifaEstimada: Math.round((totalBruto - totalLiquido) * 100) / 100,
    primeira: linhas.at(-1)?.ocorrido_em ?? null,
    ultima: linhas[0]?.ocorrido_em ?? null,
  }

  if (ensaio) {
    return NextResponse.json({ ensaio: true, resumo, amostra: linhas.slice(0, 3) })
  }

  const sb = supabaseServer()

  // A conta do gateway antigo precisa existir antes das linhas apontarem
  // para ela. Saldo calculado: quem manda é o extrato que estamos trazendo.
  const { error: erroConta } = await sb.from('contas_bancarias').upsert(
    {
      id: CONTA,
      nome: 'Pagar.me',
      tipo: 'Gateway',
      banco: 'Pagar.me',
      uso: 'Checkout até 21/07/2026',
      principal: false,
      ativa: false,
      origem_saldo: 'calculado',
    },
    { onConflict: 'id' },
  )
  if (erroConta) return NextResponse.json({ erro: erroConta.message }, { status: 500 })

  const { error } = await sb.from('extrato_linhas').upsert(linhas, { onConflict: 'chave' })
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })

  // Casa cada crédito com o pedido do ERP pelo código do pedido na Pagar.me,
  // e só então converte em caixa — a conversão grava a receita bruta e a
  // tarifa quando conhece o pedido.
  const { error: erroLigacao } = await sb.rpc('ligar_extrato_pagarme')
  const { data: convertido, error: erroConversao } = await sb.rpc('converter_extrato_em_caixa')

  return NextResponse.json({
    resumo,
    gravadas: linhas.length,
    ligacao: erroLigacao ? erroLigacao.message : 'ok',
    conversao: erroConversao ? erroConversao.message : convertido,
  })
}
