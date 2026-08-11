import 'server-only'

import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * Cashback como livro-razão: crédito nasce do pedido pago, vence na data da
 * regra; resgate e ajuste são lançados pela operação. Tudo é derivado dos
 * lançamentos — não existe coluna de saldo para divergir.
 */

export interface RegraCashback {
  pct: number
  validadeDias: number
  ativo: boolean
}

export const REGRA_PADRAO: RegraCashback = { pct: 5, validadeDias: 90, ativo: false }

export interface LancamentoCashback {
  id: string
  tipo: 'credito' | 'resgate' | 'ajuste'
  valor: number
  descricao: string | null
  pedidoId: string | null
  criadoEm: string
  expiraEm: string | null
  /** Crédito cuja validade já passou — não conta no saldo. */
  vencido: boolean
}

export interface CarteiraCashback {
  email: string
  nome: string
  creditado: number
  resgatado: number
  expirado: number
  /** Créditos vigentes menos débitos — nunca negativo. */
  saldo: number
  /** Valor de créditos vigentes que vencem nos próximos 30 dias. */
  expirando30: number
  proximoVencimento: string | null
  lancamentos: LancamentoCashback[]
}

export async function lerRegraCashback(): Promise<RegraCashback> {
  if (!supabaseConfigurado()) return REGRA_PADRAO
  const { data } = await supabaseServer()
    .from('cashback_regra')
    .select('pct, validade_dias, ativo')
    .maybeSingle()
  if (!data) return REGRA_PADRAO
  return { pct: Number(data.pct), validadeDias: Number(data.validade_dias), ativo: Boolean(data.ativo) }
}

export async function gravarRegraCashback(r: RegraCashback): Promise<void> {
  const { error } = await supabaseServer().from('cashback_regra').upsert({
    id: true,
    pct: r.pct,
    validade_dias: r.validadeDias,
    ativo: r.ativo,
    atualizado_em: new Date().toISOString(),
  })
  if (error) throw error
}

/**
 * Credita os pedidos pagos que ainda não têm crédito — idempotente pelo
 * índice único por pedido: rodar duas vezes não credita duas vezes.
 */
export async function gerarCreditosCashback(): Promise<{ gerados: number; valor: number }> {
  const sb = supabaseServer()
  const regra = await lerRegraCashback()
  if (!regra.ativo) {
    throw new Error('A regra de cashback está desligada — ative e salve antes de gerar créditos.')
  }

  const [{ data: pedidos, error: e1 }, { data: creditados, error: e2 }] = await Promise.all([
    sb
      .from('pedidos')
      .select('id, valor, comprado_em, clientes(nome, email)')
      .eq('pagamento', 'pago')
      .not('cliente_id', 'is', null)
      .limit(5000),
    sb.from('cashback_lancamentos').select('pedido_id').eq('tipo', 'credito').limit(10000),
  ])
  if (e1) throw e1
  if (e2) throw e2

  const jaTem = new Set((creditados ?? []).map((c) => c.pedido_id as string))
  const novos = ((pedidos ?? []) as unknown as {
    id: string
    valor: number | string
    comprado_em: string
    clientes: { nome: string; email: string } | null
  }[])
    .filter((p) => p.clientes?.email && !jaTem.has(p.id))
    .map((p) => {
      const expira = new Date(new Date(p.comprado_em).getTime() + regra.validadeDias * 86_400_000)
      return {
        email: p.clientes!.email,
        cliente_nome: p.clientes!.nome,
        pedido_id: p.id,
        tipo: 'credito',
        valor: Math.round(Number(p.valor) * regra.pct) / 100,
        descricao: `${regra.pct}% do pedido ${p.id}`,
        criado_em: p.comprado_em,
        expira_em: expira.toISOString().slice(0, 10),
      }
    })
    .filter((n) => n.valor > 0)

  for (let i = 0; i < novos.length; i += 500) {
    const { error } = await sb.from('cashback_lancamentos').insert(novos.slice(i, i + 500))
    if (error) throw error
  }
  return { gerados: novos.length, valor: novos.reduce((a, n) => a + n.valor, 0) }
}

export async function lancarMovimentoCashback(dados: {
  email: string
  nome: string
  /** Positivo credita (ajuste a favor), negativo debita (resgate). */
  valor: number
  descricao: string
}): Promise<void> {
  if (!dados.valor || !Number.isFinite(dados.valor)) throw new Error('Informe o valor.')
  const { error } = await supabaseServer().from('cashback_lancamentos').insert({
    email: dados.email,
    cliente_nome: dados.nome,
    tipo: dados.valor < 0 ? 'resgate' : 'ajuste',
    valor: Math.round(dados.valor * 100) / 100,
    descricao: dados.descricao || null,
  })
  if (error) throw error
}

export async function carteirasCashback(): Promise<CarteiraCashback[]> {
  if (!supabaseConfigurado()) return []
  const { data, error } = await supabaseServer()
    .from('cashback_lancamentos')
    .select('id, email, cliente_nome, pedido_id, tipo, valor, descricao, criado_em, expira_em')
    .order('criado_em', { ascending: false })
    .limit(10000)
  if (error) throw error

  const hoje = new Date().toISOString().slice(0, 10)
  const em30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

  const porEmail = new Map<string, CarteiraCashback>()
  for (const l of (data ?? []) as {
    id: string
    email: string
    cliente_nome: string | null
    pedido_id: string | null
    tipo: 'credito' | 'resgate' | 'ajuste'
    valor: number | string
    descricao: string | null
    criado_em: string
    expira_em: string | null
  }[]) {
    const c = porEmail.get(l.email) ?? {
      email: l.email,
      nome: l.cliente_nome ?? l.email,
      creditado: 0,
      resgatado: 0,
      expirado: 0,
      saldo: 0,
      expirando30: 0,
      proximoVencimento: null,
      lancamentos: [],
    }
    const valor = Number(l.valor)
    const vencido = l.tipo === 'credito' && Boolean(l.expira_em && l.expira_em < hoje)
    if (l.tipo === 'credito') {
      c.creditado += valor
      if (vencido) c.expirado += valor
      else {
        c.saldo += valor
        if (l.expira_em && l.expira_em <= em30) c.expirando30 += valor
        if (l.expira_em && (!c.proximoVencimento || l.expira_em < c.proximoVencimento)) {
          c.proximoVencimento = l.expira_em
        }
      }
    } else {
      c.saldo += valor
      if (valor < 0) c.resgatado += -valor
      else c.creditado += valor
    }
    c.lancamentos.push({
      id: l.id,
      tipo: l.tipo,
      valor,
      descricao: l.descricao,
      pedidoId: l.pedido_id,
      criadoEm: l.criado_em,
      expiraEm: l.expira_em,
      vencido,
    })
    porEmail.set(l.email, c)
  }

  return [...porEmail.values()]
    .map((c) => ({ ...c, saldo: Math.max(0, Math.round(c.saldo * 100) / 100) }))
    .sort((a, b) => b.saldo - a.saldo)
}
