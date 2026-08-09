import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { BotaoSecundario, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { carregarDre } from '@/data/consultas'
import { repositorio } from '@/data/repository'
import { brl, montarDre, num, pct, pontoEquilibrio, resumirCategorias } from '@/domain'
import type { LinhaDre } from '@/domain'

export default async function Dre() {
  const [categorias, apuracao] = await Promise.all([repositorio().categorias(), carregarDre()])

  // Receita líquida, margem e resultado são DERIVADOS das linhas primitivas —
  // e as próprias linhas vêm dos lançamentos e dos pedidos pagos do mês.
  const dre = montarDre(
    apuracao.receitaBruta,
    apuracao.deducoes,
    apuracao.custos,
    apuracao.despesas,
  )
  const cat = resumirCategorias(categorias)
  const equilibrio = pontoEquilibrio(cat.estruturaFixa, dre)
  // Mês sem lançamento classificado não tem "maior custo" — e inventar um
  // zero aqui faria o KPI afirmar algo sobre uma apuração que não existe.
  const maiorCusto = [...apuracao.custos].sort((a, b) => b.valor - a.valor)[0] ?? null

  const kpis: Kpi[] = [
    {
      label: 'Receita líquida',
      valor: brl(dre.receitaLiquida),
      hint: `${pct((dre.receitaLiquida / dre.receitaBruta) * 100)} da receita bruta`,
    },
    {
      label: 'Margem de contribuição',
      valor: pct((dre.margemContribuicao / dre.receitaBruta) * 100),
      hint: `${brl(dre.margemContribuicao)} · ${pct(dre.margemContribuicaoPct)} da receita líquida`,
      tom: 'ok',
    },
    {
      label: 'Resultado líquido',
      valor: brl(dre.resultado),
      hint: `${pct(dre.margemLiquidaPct)} da bruta`,
      tom: 'ouro',
    },
    {
      label: 'Ponto de equilíbrio',
      valor: brl(equilibrio),
      hint: `${brl(cat.estruturaFixa)} de estrutura fixa ÷ ${pct(dre.margemContribuicaoPct)} de margem`,
      tom: 'info',
    },
    {
      label: 'Maior custo variável',
      valor:
        maiorCusto && dre.receitaBruta > 0
          ? pct((maiorCusto.valor / dre.receitaBruta) * 100)
          : '—',
      hint: maiorCusto
        ? `${maiorCusto.linha} · ${brl(maiorCusto.valor)}`
        : 'Nenhum custo classificado no mês',
      tom: 'atencao',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Demonstrativo de resultado · julho fechado</TituloSecao>
        <div style={{ flex: 1 }} />
        <BotaoSecundario altura={34}>Exportar</BotaoSecundario>
      </div>

      <section
        style={{
          background: 'var(--color-mesa)',
          border: '1px solid var(--color-borda)',
          borderRadius: 'var(--radius-card)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) 200px 132px 72px',
            gap: 14,
            padding: '11px 20px',
            background: 'var(--color-cabecalho)',
            borderBottom: '1px solid var(--color-borda)',
          }}
        >
          {['Linha', 'Peso sobre a receita bruta', 'Valor', '% bruta'].map((t, i) => (
            <span
              key={t}
              className="font-sans"
              style={{
                fontWeight: 600,
                fontSize: 9.5,
                lineHeight: 1,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: 'var(--color-terciario)',
                textAlign: i >= 2 ? 'right' : 'left',
              }}
            >
              {t}
            </span>
          ))}
        </div>
        {dre.linhas.map((d) => (
          <LinhaDoDre key={d.linha} d={d} />
        ))}
      </section>
    </div>
  )
}

function LinhaDoDre({ d }: { d: LinhaDre }) {
  const forte = d.tipo === 'subtotal' || d.tipo === 'resultado'
  const cor =
    d.tipo === 'resultado'
      ? COR.ouro
      : d.tipo === 'subtotal'
        ? 'var(--color-tinta)'
        : d.valor < 0
          ? COR.erro
          : COR.ok
  const corBarra =
    d.tipo === 'resultado'
      ? COR.ouro
      : d.tipo === 'subtotal'
        ? 'rgba(239,209,140,.45)'
        : d.valor < 0
          ? 'rgba(194,90,80,.55)'
          : 'rgba(127,192,149,.55)'
  const tamanho = d.tipo === 'resultado' ? 17 : forte ? 14 : 12.5

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 200px 132px 72px',
        gap: 14,
        alignItems: 'center',
        padding: '11px 20px',
        borderTop: `1px solid ${forte ? 'rgba(239,209,140,.16)' : 'var(--color-borda-sutil)'}`,
        background:
          d.tipo === 'resultado'
            ? 'rgba(239,209,140,.06)'
            : forte
              ? 'rgba(255,255,255,.028)'
              : 'transparent',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span
          className="font-sans"
          style={{ fontWeight: forte ? 600 : 400, fontSize: tamanho, lineHeight: 1.3, color: cor }}
        >
          {d.linha}
        </span>
        {d.nota && (
          <span
            className="font-sans"
            style={{ fontSize: 10, lineHeight: 1.3, color: 'rgba(242,237,227,.38)', textWrap: 'pretty' }}
          >
            {d.nota}
          </span>
        )}
      </span>
      <span
        style={{
          height: 6,
          borderRadius: 3,
          background: 'rgba(255,255,255,.05)',
          overflow: 'hidden',
          display: 'block',
        }}
      >
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${Math.min(100, d.pctBruta)}%`,
            background: corBarra,
            borderRadius: 3,
          }}
        />
      </span>
      <span
        className="font-mono"
        style={{
          fontWeight: forte ? 600 : 400,
          fontSize: tamanho,
          lineHeight: 1,
          color: cor,
          textAlign: 'right',
          whiteSpace: 'nowrap',
        }}
      >
        {`${d.valor < 0 ? '− ' : ''}${brl(Math.abs(d.valor))}`}
      </span>
      <span
        className="font-mono"
        style={{ fontSize: 11, lineHeight: 1, color: 'var(--color-terciario)', textAlign: 'right' }}
      >
        {`${num(Math.round(d.pctBruta * 10) / 10)}%`}
      </span>
    </div>
  )
}
