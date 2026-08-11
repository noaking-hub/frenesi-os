import Link from 'next/link'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { EstadoVazio, TituloSecao } from '@/components/erp/primitivos'
import { COR, FUNDO, type Tom } from '@/components/erp/tokens'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { brl, num, pct, plural } from '@/domain'

export const dynamic = 'force-dynamic'

/**
 * Relatórios: curva ABC e canais, derivados dos pedidos importados.
 *
 * Nada aqui é digitado nem vem de exemplo — a versão anterior mostrava uma
 * grade de "relatórios" que eram botões sem função e números de julho que
 * nunca existiram. Cada linha desta tela sai de `pedido_itens` e `pedidos`,
 * e muda sozinha quando a próxima sincronização trouxer vendas novas.
 */

/** A classe deriva da participação acumulada: A até 80%, B até 95%, C o resto. */
function classeDe(acumulado: number): 'A' | 'B' | 'C' {
  if (acumulado <= 80) return 'A'
  if (acumulado <= 95.5) return 'B'
  return 'C'
}

const TOM_CLASSE: Record<'A' | 'B' | 'C', Tom> = { A: 'ouro', B: 'info', C: 'neutro' }

interface ItemVendido {
  descricao: string
  receita: number
  unidades: number
}

interface CanalVendas {
  canal: string
  pedidos: number
  receita: number
}

/** Recortes de período, resolvidos para uma data de corte. `null` = tudo. */
const PERIODOS = [
  { chave: '7d', rotulo: 'Últimos 7 dias', dias: 7 },
  { chave: '30d', rotulo: 'Últimos 30 dias', dias: 30 },
  { chave: 'mes', rotulo: 'Mês atual', dias: null },
  { chave: 'tudo', rotulo: 'Tudo', dias: null },
] as const
type ChavePeriodo = (typeof PERIODOS)[number]['chave']

const ORDENS = [
  { chave: 'receita', rotulo: 'Por receita' },
  { chave: 'unidades', rotulo: 'Por unidades' },
  { chave: 'nome', rotulo: 'Por nome' },
] as const
type ChaveOrdem = (typeof ORDENS)[number]['chave']

function corteDe(periodo: ChavePeriodo): string | null {
  if (periodo === 'tudo') return null
  if (periodo === 'mes') {
    const agora = new Date()
    return new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString()
  }
  const dias = PERIODOS.find((p) => p.chave === periodo)?.dias ?? 30
  return new Date(Date.now() - dias * 86_400_000).toISOString()
}

async function vendasReais(
  periodo: ChavePeriodo,
): Promise<{ itens: ItemVendido[]; canais: CanalVendas[] }> {
  if (!supabaseConfigurado()) return { itens: [], canais: [] }
  const sb = supabaseServer()
  const corte = corteDe(periodo)

  let consultaItens = sb
    .from('pedido_itens')
    .select('descricao, preco, quantidade, pedidos!inner(pagamento, comprado_em)')
    .eq('pedidos.pagamento', 'pago')
    .limit(10000)
  if (corte) consultaItens = consultaItens.gte('pedidos.comprado_em', corte)

  let consultaPedidos = sb
    .from('pedidos')
    .select('canal, valor, pagamento, comprado_em')
    .eq('pagamento', 'pago')
    .limit(10000)
  if (corte) consultaPedidos = consultaPedidos.gte('comprado_em', corte)

  const [{ data: itensCrus }, { data: pedidosCrus }] = await Promise.all([
    consultaItens,
    consultaPedidos,
  ])

  // Agrupado pelo nome SEM o tamanho: "Perfume X 5ml" e "Perfume X 10ml" são
  // o mesmo produto para a curva ABC — a pergunta é qual perfume sustenta o
  // faturamento, não qual frasco.
  const porProduto = new Map<string, ItemVendido>()
  for (const i of (itensCrus ?? []) as unknown as {
    descricao: string
    preco: number | string
    quantidade: number
  }[]) {
    const nome = i.descricao.replace(/\s*[-·]?\s*\d+\s*ml.*$/i, '').trim() || i.descricao
    const atual = porProduto.get(nome) ?? { descricao: nome, receita: 0, unidades: 0 }
    atual.receita += Number(i.preco) * (i.quantidade || 1)
    atual.unidades += i.quantidade || 1
    porProduto.set(nome, atual)
  }

  const porCanal = new Map<string, CanalVendas>()
  for (const p of (pedidosCrus ?? []) as unknown as { canal: string; valor: number | string }[]) {
    const nome = p.canal === 'yampi' ? 'Yampi (loja)' : p.canal || 'Sem canal'
    const atual = porCanal.get(nome) ?? { canal: nome, pedidos: 0, receita: 0 }
    atual.pedidos += 1
    atual.receita += Number(p.valor)
    porCanal.set(nome, atual)
  }

  return {
    itens: [...porProduto.values()].sort((a, b) => b.receita - a.receita),
    canais: [...porCanal.values()].sort((a, b) => b.receita - a.receita),
  }
}

export default async function Relatorios({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; ordem?: string }>
}) {
  const sp = await searchParams
  const periodo: ChavePeriodo = PERIODOS.some((p) => p.chave === sp.periodo)
    ? (sp.periodo as ChavePeriodo)
    : 'tudo'
  const ordem: ChaveOrdem = ORDENS.some((o) => o.chave === sp.ordem)
    ? (sp.ordem as ChaveOrdem)
    : 'receita'

  const { itens, canais } = await vendasReais(periodo)

  const receitaTotal = itens.reduce((a, i) => a + i.receita, 0)
  const receitaCanais = canais.reduce((a, c) => a + c.receita, 0)
  const pedidosTotal = canais.reduce((a, c) => a + c.pedidos, 0)

  let acumulado = 0
  const abc = itens.slice(0, 25).map((i) => {
    const partPct = receitaTotal > 0 ? (i.receita / receitaTotal) * 100 : 0
    acumulado = Math.min(100, acumulado + partPct)
    return { ...i, partPct, acumulado, classe: classeDe(acumulado) }
  })
  const classeA = abc.filter((l) => l.classe === 'A')
  const lider = abc[0]

  // A classe e o acumulado são SEMPRE calculados na ordem de receita — é o
  // que "curva ABC" significa. A ordenação escolhida só muda a exibição.
  const exibidos = [...abc].sort((a, b) => {
    if (ordem === 'unidades') return b.unidades - a.unidades
    if (ordem === 'nome') return a.descricao.localeCompare(b.descricao, 'pt-BR')
    return b.receita - a.receita
  })

  const linkDe = (p: ChavePeriodo, o: ChaveOrdem) => `/relatorios?periodo=${p}&ordem=${o}`
  const chip = (ativo: boolean): React.CSSProperties => ({
    height: 31,
    padding: '0 13px',
    display: 'inline-flex',
    alignItems: 'center',
    border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.09)'}`,
    background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
    color: ativo ? COR.ouro : 'rgba(242,237,227,.6)',
    fontWeight: 600,
    fontSize: 11,
    lineHeight: 1,
    borderRadius: 'var(--radius-pill)',
    textDecoration: 'none',
  })

  const filtros = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
      {PERIODOS.map((p) => (
        <Link key={p.chave} href={linkDe(p.chave, ordem)} className="hover:border-ouro/40 font-sans" style={chip(periodo === p.chave)}>
          {p.rotulo}
        </Link>
      ))}
      <div style={{ flex: 1 }} />
      {ORDENS.map((o) => (
        <Link key={o.chave} href={linkDe(periodo, o.chave)} className="hover:border-ouro/40 font-sans" style={chip(ordem === o.chave)}>
          {o.rotulo}
        </Link>
      ))}
    </div>
  )

  const kpis: Kpi[] = [
    {
      label: 'Receita dos pedidos pagos',
      valor: brl(receitaCanais),
      hint: plural(pedidosTotal, 'pedido importado', 'pedidos importados'),
      tom: 'ouro',
    },
    {
      label: 'Ticket médio',
      valor: pedidosTotal ? brl(receitaCanais / pedidosTotal) : '—',
      hint: 'Receita ÷ pedidos pagos',
    },
    {
      label: 'Perfumes vendidos',
      valor: String(itens.length),
      hint: `${classeA.length} deles sustentam 80% do faturamento`,
    },
    {
      label: 'Líder de vendas',
      valor: lider ? pct(lider.partPct) : '—',
      hint: lider ? `${lider.descricao} · ${plural(lider.unidades, 'unidade', 'unidades')}` : 'Sem vendas',
      tom: 'ok',
    },
  ]

  if (itens.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {filtros}
        <EstadoVazio
          titulo={periodo === 'tudo' ? 'Sem vendas importadas ainda' : 'Sem vendas nesse período'}
          instrucao={
            periodo === 'tudo'
              ? 'Os relatórios derivam dos pedidos pagos. Importe os pedidos da Yampi em Pedidos e volte aqui.'
              : 'Nenhum pedido pago no recorte escolhido — troque o período acima.'
          }
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {filtros}
      <FaixaKpis kpis={kpis} />

      <div
        className="empilha-1180"
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}
      >
        <section
          style={{
            background: 'var(--color-mesa)',
            border: '1px solid var(--color-borda)',
            borderRadius: 'var(--radius-card)',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <TituloSecao tamanho={14.5}>Curva ABC de perfumes</TituloSecao>
            <div style={{ flex: 1 }} />
            <span className="font-sans" style={{ fontSize: 10, lineHeight: 1, color: 'rgba(242,237,227,.35)' }}>
              receita dos pedidos pagos · participação acumulada
            </span>
          </div>
          {exibidos.map((l) => (
            <div
              key={l.descricao}
              className="hover:bg-[rgba(239,209,140,.035)]"
              style={{
                display: 'grid',
                gridTemplateColumns: '26px minmax(0,1fr) 124px 88px 68px 72px',
                gap: 11,
                alignItems: 'center',
                padding: '11px 18px',
                borderTop: '1px solid var(--color-borda-sutil)',
              }}
            >
              <span
                className="font-sans"
                style={{
                  justifySelf: 'start',
                  fontWeight: 700,
                  fontSize: 10,
                  lineHeight: 1,
                  color: l.classe === 'C' ? 'rgba(242,237,227,.4)' : COR[TOM_CLASSE[l.classe]],
                  background: FUNDO[TOM_CLASSE[l.classe]],
                  borderRadius: 5,
                  padding: '5px 7px',
                }}
              >
                {l.classe}
              </span>
              <span
                className="font-sans"
                style={{
                  fontWeight: 500,
                  fontSize: 12,
                  lineHeight: 1.25,
                  color: 'var(--color-corrente)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {l.descricao}
              </span>
              <span style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,.06)', overflow: 'hidden', display: 'block' }}>
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${Math.min(100, Math.round(l.partPct * 4))}%`,
                    background: l.classe === 'C' ? 'rgba(242,237,227,.35)' : COR[TOM_CLASSE[l.classe]],
                    borderRadius: 3,
                  }}
                />
              </span>
              <span className="font-mono" style={{ fontSize: 11.5, lineHeight: 1, color: 'rgba(242,237,227,.6)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                {brl(l.receita)}
              </span>
              <span className="font-mono" style={{ fontWeight: 500, fontSize: 11.5, lineHeight: 1, color: 'var(--color-corrente)', textAlign: 'right' }}>
                {pct(Math.round(l.partPct * 10) / 10)}
              </span>
              <span className="font-mono" style={{ fontSize: 11, lineHeight: 1, color: 'rgba(242,237,227,.45)', textAlign: 'right' }}>
                {pct(Math.round(l.acumulado * 10) / 10)}
              </span>
            </div>
          ))}
          <div style={{ padding: '13px 18px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
            <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(242,237,227,.45)', textWrap: 'pretty' }}>
              {`${plural(classeA.length, 'perfume responde', 'perfumes respondem')} por 80% do faturamento. Reposição e destaque na loja começam por eles.`}
            </span>
          </div>
        </section>

        <section
          style={{
            background: 'var(--color-mesa)',
            border: '1px solid var(--color-borda)',
            borderRadius: 'var(--radius-card)',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <TituloSecao tamanho={14.5}>Vendas por canal</TituloSecao>
            <div style={{ flex: 1 }} />
            <span className="font-sans" style={{ fontSize: 10, lineHeight: 1, color: 'rgba(242,237,227,.35)' }}>
              {`${pedidosTotal} pedidos pagos`}
            </span>
          </div>
          {canais.map((c) => (
            <div
              key={c.canal}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
                padding: '13px 18px',
                borderTop: '1px solid var(--color-borda-sutil)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span className="font-sans" style={{ fontWeight: 600, fontSize: 12, color: 'var(--color-corrente)' }}>
                  {c.canal}
                </span>
                <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.4)' }}>
                  {`${c.pedidos} pedidos · ticket ${brl(c.receita / c.pedidos)}`}
                </span>
                <div style={{ flex: 1 }} />
                <span className="font-mono" style={{ fontWeight: 500, fontSize: 12, color: 'var(--color-corrente)', whiteSpace: 'nowrap' }}>
                  {brl(c.receita)}
                </span>
              </div>
              <span style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden', display: 'block' }}>
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${receitaCanais > 0 ? Math.round((c.receita / receitaCanais) * 100) : 0}%`,
                    background: 'rgba(239,209,140,.55)',
                    borderRadius: 2,
                  }}
                />
              </span>
              <span className="font-sans" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.35)' }}>
                {`${num(Math.round((c.receita / Math.max(1, receitaCanais)) * 1000) / 10)}% da receita`}
              </span>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
