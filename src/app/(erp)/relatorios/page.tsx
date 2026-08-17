import Link from 'next/link'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { EstadoVazio, TituloSecao } from '@/components/erp/primitivos'
import { COR, FUNDO, type Tom } from '@/components/erp/tokens'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { brl, num, pct, plural } from '@/domain'

import { CatalogoDeRelatorios } from './CatalogoDeRelatorios'
import { ExportarAbc } from './ExportarAbc'

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

interface PontoDia {
  dia: string
  rotulo: string
  pedidos: number
  receita: number
}

interface VendaVariante {
  rotulo: string
  unidades: number
  receita: number
}

interface VendaUf {
  uf: string
  pedidos: number
  receita: number
}

/** Receita e pedidos da janela de MESMO tamanho imediatamente anterior. */
interface Comparativo {
  receitaAntes: number
  pedidosAntes: number
}

const diaSp = (iso: string) => new Date(iso).toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' })

async function vendasReais(periodo: ChavePeriodo): Promise<{
  itens: ItemVendido[]
  canais: CanalVendas[]
  porDia: PontoDia[]
  porVariante: VendaVariante[]
  porUf: VendaUf[]
  comparativo: Comparativo | null
}> {
  const vazio = { itens: [], canais: [], porDia: [], porVariante: [], porUf: [], comparativo: null }
  if (!supabaseConfigurado()) return vazio
  const sb = supabaseServer()
  const corte = corteDe(periodo)

  let consultaItens = sb
    .from('pedido_itens')
    .select('descricao, preco, quantidade, variante, pedidos!inner(pagamento, comprado_em)')
    .eq('pedidos.pagamento', 'pago')
    .limit(10000)
  if (corte) consultaItens = consultaItens.gte('pedidos.comprado_em', corte)

  let consultaPedidos = sb
    .from('pedidos')
    .select('canal, valor, pagamento, comprado_em, destino')
    .eq('pagamento', 'pago')
    .limit(10000)
  if (corte) consultaPedidos = consultaPedidos.gte('comprado_em', corte)

  // A janela anterior de mesmo tamanho: é o que transforma "R$ 8 mil" em
  // "R$ 8 mil, 12% acima da semana passada". Só faz sentido para recortes de
  // tamanho fixo — "mês atual" e "tudo" não têm um "anterior" comparável.
  const dias = PERIODOS.find((p) => p.chave === periodo)?.dias ?? null
  const consultaAnterior =
    corte && dias
      ? sb
          .from('pedidos')
          .select('valor')
          .eq('pagamento', 'pago')
          .gte('comprado_em', new Date(new Date(corte).getTime() - dias * 86_400_000).toISOString())
          .lt('comprado_em', corte)
          .limit(10000)
      : null

  const [{ data: itensCrus }, { data: pedidosCrus }, anterior] = await Promise.all([
    consultaItens,
    consultaPedidos,
    consultaAnterior ?? Promise.resolve(null),
  ])

  // Agrupado pelo nome SEM o tamanho: "Perfume X 5ml" e "Perfume X 10ml" são
  // o mesmo produto para a curva ABC — a pergunta é qual perfume sustenta o
  // faturamento, não qual frasco.
  const porProduto = new Map<string, ItemVendido>()
  const variantes = new Map<string, VendaVariante>()
  for (const i of (itensCrus ?? []) as unknown as {
    descricao: string
    preco: number | string
    quantidade: number
    variante: number | null
  }[]) {
    const nome = i.descricao.replace(/\s*[-·]?\s*\d+\s*ml.*$/i, '').trim() || i.descricao
    const atual = porProduto.get(nome) ?? { descricao: nome, receita: 0, unidades: 0 }
    atual.receita += Number(i.preco) * (i.quantidade || 1)
    atual.unidades += i.quantidade || 1
    porProduto.set(nome, atual)

    const rotulo = i.variante ? `${i.variante} ml` : 'sem tamanho'
    const v = variantes.get(rotulo) ?? { rotulo, unidades: 0, receita: 0 }
    v.unidades += i.quantidade || 1
    v.receita += Number(i.preco) * (i.quantidade || 1)
    variantes.set(rotulo, v)
  }

  const porCanal = new Map<string, CanalVendas>()
  const dias14 = new Map<string, PontoDia>()
  const ufs = new Map<string, VendaUf>()
  for (const p of (pedidosCrus ?? []) as unknown as {
    canal: string
    valor: number | string
    comprado_em: string
    destino: string | null
  }[]) {
    const nome = p.canal === 'yampi' ? 'Yampi (loja)' : p.canal || 'Sem canal'
    const atual = porCanal.get(nome) ?? { canal: nome, pedidos: 0, receita: 0 }
    atual.pedidos += 1
    atual.receita += Number(p.valor)
    porCanal.set(nome, atual)

    const dia = diaSp(p.comprado_em)
    const ponto = dias14.get(dia) ?? {
      dia,
      rotulo: `${dia.slice(8, 10)}/${dia.slice(5, 7)}`,
      pedidos: 0,
      receita: 0,
    }
    ponto.pedidos += 1
    ponto.receita += Number(p.valor)
    dias14.set(dia, ponto)

    // O destino vem como "Cidade · UF" da importação.
    const uf = p.destino?.split('·').pop()?.trim().toUpperCase() ?? ''
    const chaveUf = /^[A-Z]{2}$/.test(uf) ? uf : 'Sem UF'
    const vUf = ufs.get(chaveUf) ?? { uf: chaveUf, pedidos: 0, receita: 0 }
    vUf.pedidos += 1
    vUf.receita += Number(p.valor)
    ufs.set(chaveUf, vUf)
  }

  const linhasAnterior = (anterior?.data ?? []) as { valor: number | string }[]

  return {
    itens: [...porProduto.values()].sort((a, b) => b.receita - a.receita),
    canais: [...porCanal.values()].sort((a, b) => b.receita - a.receita),
    porDia: [...dias14.values()].sort((a, b) => a.dia.localeCompare(b.dia)).slice(-14),
    porVariante: [...variantes.values()].sort((a, b) => b.receita - a.receita),
    porUf: [...ufs.values()].sort((a, b) => b.receita - a.receita),
    comparativo: consultaAnterior
      ? {
          receitaAntes: linhasAnterior.reduce((a, l) => a + Number(l.valor), 0),
          pedidosAntes: linhasAnterior.length,
        }
      : null,
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

  const { itens, canais, porDia, porVariante, porUf, comparativo } = await vendasReais(periodo)

  const receitaTotal = itens.reduce((a, i) => a + i.receita, 0)
  const receitaCanais = canais.reduce((a, c) => a + c.receita, 0)
  const pedidosTotal = canais.reduce((a, c) => a + c.pedidos, 0)

  // Variação contra a janela anterior de mesmo tamanho, quando ela existe.
  const deltaPct =
    comparativo && comparativo.receitaAntes > 0
      ? ((receitaCanais - comparativo.receitaAntes) / comparativo.receitaAntes) * 100
      : null

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
      hint:
        deltaPct !== null
          ? `${deltaPct >= 0 ? '+' : ''}${num(Math.round(deltaPct * 10) / 10)}% vs período anterior (${brl(comparativo!.receitaAntes)})`
          : plural(pedidosTotal, 'pedido importado', 'pedidos importados'),
      tom: deltaPct === null ? 'ouro' : deltaPct >= 0 ? 'ok' : 'erro',
    },
    {
      label: 'Ticket médio',
      valor: pedidosTotal ? brl(receitaCanais / pedidosTotal) : '—',
      hint:
        comparativo && comparativo.pedidosAntes > 0
          ? `Antes: ${brl(comparativo.receitaAntes / comparativo.pedidosAntes)} em ${comparativo.pedidosAntes} pedidos`
          : 'Receita ÷ pedidos pagos',
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
        <CatalogoDeRelatorios />
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
      {/* O catálogo primeiro: quem abre "Relatórios" quer escolher a pergunta,
          e a visão de vendas abaixo é a resposta padrão — a que se olha todo
          dia sem precisar escolher nada. */}
      <CatalogoDeRelatorios />
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
            <ExportarAbc linhas={abc} periodo={periodo} />
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

      <div
        className="empilha-1180"
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}
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
            <TituloSecao tamanho={14.5}>Vendas por dia</TituloSecao>
            <div style={{ flex: 1 }} />
            <span className="font-sans" style={{ fontSize: 10, lineHeight: 1, color: 'rgba(242,237,227,.35)' }}>
              {`últimos ${porDia.length} dias com venda no recorte`}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, padding: '18px 18px 8px', height: 150 }}>
            {porDia.map((d) => {
              const maior = Math.max(...porDia.map((x) => x.receita), 1)
              const altura = Math.max(5, Math.round((d.receita / maior) * 100))
              return (
                <span
                  key={d.dia}
                  title={`${d.rotulo} · ${brl(d.receita)} · ${plural(d.pedidos, 'pedido', 'pedidos')}`}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 0 }}
                >
                  <span
                    className="font-mono"
                    style={{ fontSize: 8.5, lineHeight: 1, color: 'rgba(242,237,227,.5)', whiteSpace: 'nowrap' }}
                  >
                    {`${Math.round(d.receita / 100) / 10}k`.replace('.', ',')}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      width: '100%',
                      maxWidth: 34,
                      height: altura,
                      background: altura === 100 ? 'rgba(239,209,140,.85)' : 'rgba(239,209,140,.45)',
                      borderRadius: '4px 4px 0 0',
                    }}
                  />
                </span>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, padding: '0 18px 14px' }}>
            {porDia.map((d) => (
              <span
                key={d.dia}
                className="font-mono"
                style={{ flex: 1, textAlign: 'center', fontSize: 8.5, lineHeight: 1.2, color: 'rgba(242,237,227,.4)', minWidth: 0 }}
              >
                {d.rotulo}
              </span>
            ))}
          </div>
          <div style={{ padding: '11px 18px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
            <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.5, color: 'rgba(242,237,227,.45)' }}>
              {porDia.length
                ? `Melhor dia: ${porDia.slice().sort((a, b) => b.receita - a.receita)[0].rotulo} com ${brl(porDia.slice().sort((a, b) => b.receita - a.receita)[0].receita)}.`
                : 'Sem vendas no recorte.'}
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
          <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <TituloSecao tamanho={14.5}>Tamanhos que vendem</TituloSecao>
          </div>
          {porVariante.map((v) => {
            const receitaVar = porVariante.reduce((a, x) => a + x.receita, 0)
            const parte = receitaVar > 0 ? (v.receita / receitaVar) * 100 : 0
            return (
              <div key={v.rotulo} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 18px', borderTop: '1px solid var(--color-borda-sutil)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span className="font-sans" style={{ fontWeight: 600, fontSize: 12, color: 'var(--color-corrente)' }}>
                    {v.rotulo}
                  </span>
                  <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.4)' }}>
                    {plural(v.unidades, 'unidade', 'unidades')}
                  </span>
                  <div style={{ flex: 1 }} />
                  <span className="font-mono" style={{ fontWeight: 500, fontSize: 11.5, color: 'var(--color-corrente)', whiteSpace: 'nowrap' }}>
                    {brl(v.receita)}
                  </span>
                </div>
                <span style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden', display: 'block' }}>
                  <span style={{ display: 'block', height: '100%', width: `${Math.round(parte)}%`, background: 'rgba(239,209,140,.55)', borderRadius: 2 }} />
                </span>
                <span className="font-sans" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.35)' }}>
                  {`${num(Math.round(parte * 10) / 10)}% da receita`}
                </span>
              </div>
            )
          })}
          <div style={{ padding: '11px 18px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
            <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.5, color: 'rgba(242,237,227,.45)', textWrap: 'pretty' }}>
              É o que orienta a compra de frascos e etiquetas: produza mais do tamanho que o cliente escolhe.
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
            <TituloSecao tamanho={14.5}>Para onde vai</TituloSecao>
            <div style={{ flex: 1 }} />
            <span className="font-sans" style={{ fontSize: 10, lineHeight: 1, color: 'rgba(242,237,227,.35)' }}>
              por estado
            </span>
          </div>
          {porUf.slice(0, 8).map((u) => (
            <div key={u.uf} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 18px', borderTop: '1px solid var(--color-borda-sutil)' }}>
              <span className="font-mono" style={{ fontWeight: 700, fontSize: 11.5, color: COR.ouro, width: 30 }}>
                {u.uf}
              </span>
              <span style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden', display: 'block' }}>
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${Math.round((u.receita / Math.max(1, porUf[0]?.receita ?? 1)) * 100)}%`,
                    background: 'rgba(239,209,140,.55)',
                    borderRadius: 2,
                  }}
                />
              </span>
              <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.4)', whiteSpace: 'nowrap' }}>
                {`${u.pedidos} ped.`}
              </span>
              <span className="font-mono" style={{ fontWeight: 500, fontSize: 11.5, color: 'var(--color-corrente)', textAlign: 'right', whiteSpace: 'nowrap', minWidth: 76 }}>
                {brl(u.receita)}
              </span>
            </div>
          ))}
          {porUf.length > 8 && (
            <div style={{ padding: '10px 18px', borderTop: '1px solid var(--color-borda-sutil)' }}>
              <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.4)' }}>
                {`+ ${plural(porUf.length - 8, 'outro estado', 'outros estados')} · ${brl(porUf.slice(8).reduce((a, u) => a + u.receita, 0))}`}
              </span>
            </div>
          )}
          <div style={{ padding: '11px 18px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
            <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.5, color: 'rgba(242,237,227,.45)', textWrap: 'pretty' }}>
              Onde a receita se concentra é onde vale anúncio segmentado e prazo de frete curto.
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}
