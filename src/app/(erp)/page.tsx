import Link from 'next/link'

import { CardKpi, type Kpi } from '@/components/erp/Kpi'
import { Losango, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { COR, FAIXA, type Tom } from '@/components/erp/tokens'
import { carregarDashboard } from '@/data/consultas'
import { AGOSTO, JULHO } from '@/data/fixtures'
import { brl, pad2, pct, volume } from '@/domain'

export default async function Dashboard() {
  const { estoque, lotes, sync, parametros, bases, pendencias } = await carregarDashboard()

  const esgotadas = bases.filter((b) => b.volumeMl === 0)
  const emRisco = estoque.criticos + estoque.esgotados
  const acionaveis = pendencias.filter((p) => p.contagem > 0)
  const total = acionaveis.reduce((a, p) => a + p.contagem, 0)

  // Cada hint qualifica o próprio valor — nada de descrever outro evento.
  const kpis: Kpi[] = [
    {
      label: 'Vendas em agosto',
      valor: brl(AGOSTO.entradas),
      hint: `${AGOSTO.dias} dias · julho fechou em ${brl(JULHO.receitaBruta)}`,
      tom: 'ouro',
    },
    {
      label: 'Resultado em agosto',
      valor: brl(AGOSTO.resultado),
      hint: `Entradas menos saídas · julho fechou em ${brl(JULHO.resultado)}`,
      tom: AGOSTO.resultado >= 0 ? 'ok' : 'erro',
    },
    {
      label: 'Volume em estoque',
      valor: volume(estoque.volumeTotalMl),
      hint: `${estoque.comEstoque} de ${bases.length} bases com volume`,
    },
    {
      label: 'Bases em risco',
      valor: pad2(emRisco),
      hint: `${estoque.esgotados} esgotada · ${estoque.criticos} abaixo de 20 dias de cobertura`,
      tom: emRisco ? 'erro' : 'ok',
    },
    {
      label: 'Perda real medida',
      valor: pct(lotes.perda.mediaPct),
      hint: lotes.perda.subestimado
        ? `Parâmetro de ${pct(parametros.perdaPct)} subestima o custo em ${pct(lotes.perda.delta)}`
        : `Dentro do parâmetro de ${pct(parametros.perdaPct)}`,
      tom: lotes.perda.subestimado ? 'erro' : 'ok',
    },
    {
      label: 'Fora de sincronia',
      valor: pad2(sync.esgotar + sync.reduzir + sync.repor),
      hint: `de ${sync.total} variantes · ${sync.excesso} unidades sobrevendíveis`,
      tom: sync.esgotar ? 'erro' : sync.reduzir ? 'atencao' : 'ok',
    },
  ]

  // Alertas derivados do mesmo estado que alimenta as telas responsáveis.
  const alertas: { tom: Tom; texto: string }[] = [
    ...esgotadas.map((b) => ({
      tom: 'erro' as Tom,
      texto: `${b.nome} base zerou. Nenhuma variante pode ser fracionada.`,
    })),
    ...estoque.coberturas
      .filter((c) => c.criticidade === 'urgente' || c.criticidade === 'atencao')
      .slice(0, 2)
      .map((c) => ({
        tom: c.criticidade === 'urgente' ? ('erro' as Tom) : ('atencao' as Tom),
        texto: `${c.base.nome} acaba em ${c.cobertura} no ritmo atual.`,
      })),
    ...(lotes.perda.subestimado
      ? [
          {
            tom: 'atencao' as Tom,
            texto: `Perda real de ${pct(lotes.perda.mediaPct)} contra ${pct(parametros.perdaPct)} de parâmetro — todo preço calculado está com custo subestimado.`,
          },
        ]
      : []),
    ...(sync.excesso
      ? [
          {
            tom: 'erro' as Tom,
            texto: `${sync.excesso} unidades continuam vendáveis na Shopify sem volume que as sustente.`,
          },
        ]
      : []),
  ]

  const financeiro = [
    { label: 'Receita bruta', valor: JULHO.receitaBruta, tom: 'ok' as Tom },
    { label: 'Receita líquida', valor: JULHO.receitaLiquida, tom: 'ouro' as Tom },
    { label: 'Custos e despesas', valor: JULHO.saidas, tom: 'erro' as Tom },
    { label: 'Resultado', valor: JULHO.resultado, tom: 'ok' as Tom },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 13 }}>
        {kpis.map((k) => (
          <CardKpi key={k.label} kpi={k} />
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) 372px',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <section
          style={{
            background: 'linear-gradient(170deg,#141315,#101011)',
            border: '1px solid var(--color-borda)',
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '17px 20px 15px',
              borderBottom: '1px solid rgba(255,255,255,.06)',
            }}
          >
            <TituloSecao>Ações pendentes hoje</TituloSecao>
            <span
              className="font-mono"
              style={{
                fontWeight: 500,
                fontSize: 10,
                color: 'var(--color-sobre-ouro)',
                background: 'var(--color-ouro)',
                borderRadius: 'var(--radius-pill)',
                padding: '4px 8px',
              }}
            >
              {total}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {acionaveis.map((p) => (
              <Link
                key={p.titulo}
                href={p.href}
                className="hover:bg-[rgba(239,209,140,.045)]"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '3px 34px 1fr auto auto',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 20px',
                  borderTop: '1px solid var(--color-borda-sutil)',
                }}
              >
                <span
                  aria-hidden
                  style={{ width: 3, height: 26, borderRadius: 2, background: COR[p.tom] }}
                />
                <span className="font-mono" style={{ fontWeight: 500, fontSize: 17, color: COR[p.tom] }}>
                  {pad2(p.contagem)}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span
                    className="font-sans"
                    style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.3, color: 'var(--color-corrente)' }}
                  >
                    {p.titulo}
                  </span>
                  <span
                    className="font-sans"
                    style={{ fontSize: 11, lineHeight: 1.35, color: 'rgba(242,237,227,.44)' }}
                  >
                    {p.hint}
                  </span>
                </span>
                <span
                  className="font-sans"
                  style={{
                    fontWeight: 500,
                    fontSize: 10,
                    letterSpacing: '.09em',
                    textTransform: 'uppercase',
                    color: COR[p.tom],
                    border: `1px solid ${COR[p.tom]}`,
                    borderRadius: 'var(--radius-pill)',
                    padding: '4px 9px',
                    opacity: 0.85,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.etiqueta}
                </span>
                <span aria-hidden style={{ fontSize: 13, color: 'var(--color-apagado)' }}>
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="card-ouro" style={{ borderRadius: 16, padding: '18px 19px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
              <Losango />
              <TituloSecao tom="ouro" tamanho={14}>
                Alertas inteligentes
              </TituloSecao>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {alertas.map((a) => (
                <div
                  key={a.texto}
                  style={{
                    display: 'flex',
                    gap: 10,
                    padding: '11px 12px',
                    borderRadius: 10,
                    background: FAIXA.neutro,
                    borderLeft: `2px solid ${COR[a.tom]}`,
                  }}
                >
                  <span
                    className="font-sans"
                    style={{
                      flex: 1,
                      fontSize: 11.5,
                      lineHeight: 1.5,
                      color: 'rgba(242,237,227,.82)',
                      textWrap: 'pretty',
                    }}
                  >
                    {a.texto}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section
            style={{
              background: 'linear-gradient(170deg,#141315,#101011)',
              border: '1px solid var(--color-borda)',
              borderRadius: 16,
              padding: '18px 19px',
            }}
          >
            <div style={{ marginBottom: 15 }}>
              <TituloSecao tamanho={14}>Resumo financeiro · julho fechado</TituloSecao>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {financeiro.map((f) => (
                <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    className="font-sans"
                    style={{ fontSize: 11.5, color: 'var(--color-secundario)', width: 98, flex: 'none' }}
                  >
                    {f.label}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      height: 5,
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
                        // Proporção sobre a receita bruta do mês — não é número solto.
                        width: `${Math.round((f.valor / JULHO.receitaBruta) * 100)}%`,
                        background: COR[f.tom],
                        borderRadius: 3,
                        opacity: 0.75,
                      }}
                    />
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      fontWeight: 500,
                      fontSize: 12,
                      color: COR[f.tom],
                      width: 104,
                      textAlign: 'right',
                      flex: 'none',
                    }}
                  >
                    {brl(f.valor)}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <Rotulo>
                {`${Math.round((JULHO.resultado / JULHO.receitaBruta) * 100)}% de margem sobre a receita bruta`}
              </Rotulo>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
