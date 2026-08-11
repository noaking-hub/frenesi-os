import Link from 'next/link'

import { CardKpi, type Kpi } from '@/components/erp/Kpi'
import { Losango, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { COR, FAIXA, type Tom } from '@/components/erp/tokens'
import { carregarDashboard, carregarDre } from '@/data/consultas'
import { repositorio } from '@/data/repository'
import { brl, montarDre, pad2, pct, plural, saldoConsolidado, volume } from '@/domain'

/**
 * Dashboard: o dia da operação numa tela.
 *
 * Tudo aqui é derivado dos mesmos dados das telas responsáveis — nenhum
 * número nasce no dashboard. A versão anterior mostrava "Financeiro ainda
 * não integrado" com o financeiro já integrado: o card foi escrito quando a
 * frase era verdade e ninguém voltou nele. Números de exemplo não entram
 * mais em lugar nenhum desta tela.
 */
export default async function Dashboard() {
  const [{ estoque, lotes, sync, parametros, bases, pendencias }, apuracao, contas, pedidos] =
    await Promise.all([
      carregarDashboard(),
      carregarDre(),
      repositorio().contas(),
      repositorio().pedidos(),
    ])

  const dre = montarDre(
    [apuracao.receitaBruta, ...apuracao.receitasExtras],
    apuracao.deducoes,
    apuracao.custos,
    apuracao.despesas,
  )

  const caixa = saldoConsolidado(contas)
  const esgotadas = bases.filter((b) => b.volumeMl === 0 && b.sobControle)
  const emRisco = estoque.criticos + estoque.esgotados
  const acionaveis = pendencias.filter((p) => p.contagem > 0)
  const total = acionaveis.reduce((a, p) => a + p.contagem, 0)

  const mes = new Date().toLocaleDateString('pt-BR', { month: 'long' })
  const pagosNoMes = pedidos.filter((p) => {
    if (p.pagamento !== 'pago') return false
    const [, m] = p.data.split('/')
    return Number(m) === new Date().getMonth() + 1
  })

  const kpis: Kpi[] = [
    {
      label: `Vendas em ${mes}`,
      valor: brl(dre.receitaBruta),
      hint: `${plural(pagosNoMes.length, 'pedido pago', 'pedidos pagos')} · loja e fora dela`,
      tom: 'ouro',
    },
    {
      label: `Resultado em ${mes}`,
      valor: brl(dre.resultado),
      hint: `Receita menos custos e despesas classificados · margem de ${pct(dre.margemLiquidaPct)}`,
      tom: dre.resultado >= 0 ? 'ok' : 'erro',
    },
    {
      label: 'Caixa hoje',
      valor: brl(caixa),
      hint: contas.map((c) => c.nome).join(' + ') || 'Nenhuma conta cadastrada',
      tom: caixa >= 0 ? 'ok' : 'erro',
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
      label: 'Fora de sincronia',
      valor: pad2(sync.esgotar + sync.reduzir + sync.repor),
      hint: `de ${sync.total} variantes · ${sync.excesso} unidades sobrevendíveis`,
      tom: sync.esgotar ? 'erro' : sync.reduzir ? 'atencao' : 'ok',
    },
  ]

  // Alertas AGREGADOS. A versão anterior listava cada base zerada numa linha
  // — uma parede de 30 avisos idênticos que ninguém lê é pior que nenhum
  // aviso. Um alerta por assunto, com os primeiros nomes e a conta do resto.
  const alertas: { tom: Tom; texto: string }[] = [
    ...(esgotadas.length
      ? [
          {
            tom: 'erro' as Tom,
            texto:
              esgotadas.length === 1
                ? `${esgotadas[0].nome} zerou — nenhuma variante pode ser fracionada.`
                : `${esgotadas.length} bases com volume zerado (${esgotadas
                    .slice(0, 3)
                    .map((b) => b.nome.split(' ').slice(0, 3).join(' '))
                    .join('; ')}${esgotadas.length > 3 ? ` e mais ${esgotadas.length - 3}` : ''}). Nenhuma variante delas pode ser fracionada.`,
          },
        ]
      : []),
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

  // Resumo financeiro do mês corrente, derivado do DRE — a mesma conta da
  // tela de DRE, nunca uma versão paralela.
  const saidas = dre.receitaBruta - dre.resultado
  const financeiro = [
    { label: 'Receita bruta', valor: dre.receitaBruta, tom: 'ok' as Tom },
    { label: 'Receita líquida', valor: dre.receitaLiquida, tom: 'ouro' as Tom },
    { label: 'Custos e despesas', valor: saidas, tom: 'erro' as Tom },
    { label: 'Resultado', valor: dre.resultado, tom: dre.resultado >= 0 ? ('ok' as Tom) : ('erro' as Tom) },
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
            {acionaveis.length === 0 && (
              <span
                className="font-sans"
                style={{ padding: '18px 20px', fontSize: 11.5, lineHeight: 1.5, color: 'var(--color-terciario)' }}
              >
                Nada pendente: pedidos despachados, extrato classificado e estoque sob controle.
              </span>
            )}
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
          <section
            style={{
              background: 'linear-gradient(170deg,#141315,#101011)',
              border: '1px solid var(--color-borda)',
              borderRadius: 16,
              padding: '18px 19px',
            }}
          >
            <div style={{ marginBottom: 15 }}>
              <TituloSecao tamanho={14}>{`Financeiro de ${mes}`}</TituloSecao>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {financeiro.map((f) => (
                <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    className="font-sans"
                    style={{ fontSize: 11.5, color: 'var(--color-secundario)', width: 108, flex: 'none' }}
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
                        width: `${dre.receitaBruta > 0 ? Math.min(100, Math.round((Math.abs(f.valor) / dre.receitaBruta) * 100)) : 0}%`,
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
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Rotulo>
                {dre.receitaBruta > 0
                  ? `${pct(dre.margemLiquidaPct)} de margem sobre a receita bruta`
                  : 'Sem venda paga no mês ainda'}
              </Rotulo>
              <div style={{ flex: 1 }} />
              <Link
                href="/financeiro/dre"
                className="font-sans hover:text-ouro"
                style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}
              >
                DRE completo →
              </Link>
            </div>
          </section>

          <section className="card-ouro" style={{ borderRadius: 16, padding: '18px 19px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
              <Losango />
              <TituloSecao tom="ouro" tamanho={14}>
                Alertas
              </TituloSecao>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {alertas.length === 0 && (
                <span
                  className="font-sans"
                  style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
                >
                  Nenhum alerta: estoque, lotes e sincronia não acusam nada nos dados atuais.
                </span>
              )}
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
        </div>
      </div>
    </div>
  )
}
