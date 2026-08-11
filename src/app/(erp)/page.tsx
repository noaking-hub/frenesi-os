import Link from 'next/link'

import { CardKpi, type Kpi } from '@/components/erp/Kpi'
import { Losango, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { COR, FAIXA, type Tom } from '@/components/erp/tokens'
import { carregarDashboard } from '@/data/consultas'
import { repositorio } from '@/data/repository'
import { brl, pad2, pct, plural, saldoConsolidado, volume } from '@/domain'

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
  const [{ estoque, lotes, sync, parametros, bases, pendencias }, contas, pedidos] =
    await Promise.all([carregarDashboard(), repositorio().contas(), repositorio().pedidos()])

  const caixa = saldoConsolidado(contas)
  const esgotadas = bases.filter((b) => b.volumeMl === 0 && b.sobControle)
  const emRisco = estoque.criticos + estoque.esgotados
  const acionaveis = pendencias.filter((p) => p.contagem > 0)
  const total = acionaveis.reduce((a, p) => a + p.contagem, 0)

  // Tudo no fuso da operação: no deploy o servidor roda em UTC, e "hoje" em
  // UTC começa 3 horas antes — a venda das 22h cairia no dia seguinte.
  const SP = { timeZone: 'America/Sao_Paulo' } as const
  const mes = new Date().toLocaleDateString('pt-BR', { month: 'long', ...SP })
  const mesNumero = Number(new Date().toLocaleDateString('pt-BR', { month: 'numeric', ...SP }))
  const pagos = pedidos.filter((p) => p.pagamento === 'pago')
  const pagosNoMes = pagos.filter((p) => {
    const [, m] = p.data.split('/')
    return Number(m.slice(0, 2)) === mesNumero
  })
  const vendasNoMes = pagosNoMes.reduce((a, p) => a + p.valor, 0)

  // Vendas por dia dos últimos 7 dias. `data` vem como dd/mm — os rótulos de
  // comparação são gerados pelo mesmo formato, então a virada de ano não
  // desalinha (os 7 dias são sempre recentes).
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86_400_000)
    return {
      rotulo: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', ...SP }),
      diaSemana: d.toLocaleDateString('pt-BR', { weekday: 'short', ...SP }).replace('.', ''),
      valor: 0,
      pedidos: 0,
    }
  })
  const porDia = new Map(dias.map((d) => [d.rotulo, d]))
  for (const p of pagos) {
    const alvo = porDia.get(p.data.slice(0, 5))
    if (!alvo) continue
    alvo.valor += p.valor
    alvo.pedidos += 1
  }
  const vendas7d = dias.reduce((a, d) => a + d.valor, 0)
  const pedidos7d = dias.reduce((a, d) => a + d.pedidos, 0)
  const picoDoPeriodo = Math.max(...dias.map((d) => d.valor), 1)

  const kpis: Kpi[] = [
    {
      label: `Vendas em ${mes}`,
      valor: brl(vendasNoMes),
      hint: `${plural(pagosNoMes.length, 'pedido pago', 'pedidos pagos')}${
        pagosNoMes.length ? ` · ticket ${brl(vendasNoMes / pagosNoMes.length)}` : ''
      }`,
      tom: 'ouro',
    },
    {
      label: 'Últimos 7 dias',
      valor: brl(vendas7d),
      hint: `${plural(pedidos7d, 'pedido pago', 'pedidos pagos')} na semana`,
      tom: 'ok',
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div
        className="empilha-900"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 13 }}
      >
        {kpis.map((k) => (
          <CardKpi key={k.label} kpi={k} />
        ))}
      </div>

      <div
        className="empilha-1180"
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
              <TituloSecao tamanho={14}>Vendas dos últimos 7 dias</TituloSecao>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {dias.map((d) => (
                <div key={d.rotulo} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    className="font-mono"
                    style={{ fontSize: 10, color: 'var(--color-terciario)', width: 58, flex: 'none' }}
                  >
                    {`${d.diaSemana} ${d.rotulo}`}
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
                        // Proporção sobre o melhor dia da semana — não é número solto.
                        width: `${Math.round((d.valor / picoDoPeriodo) * 100)}%`,
                        background: COR.ouro,
                        borderRadius: 3,
                        opacity: 0.75,
                      }}
                    />
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      fontWeight: 500,
                      fontSize: 11.5,
                      color: d.valor > 0 ? 'var(--color-corrente)' : 'rgba(242,237,227,.35)',
                      width: 92,
                      textAlign: 'right',
                      flex: 'none',
                    }}
                  >
                    {d.valor > 0 ? brl(d.valor) : '—'}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Rotulo>
                {pedidos7d > 0
                  ? `${plural(pedidos7d, 'pedido pago', 'pedidos pagos')} · ticket ${brl(vendas7d / pedidos7d)}`
                  : 'Sem venda paga na semana ainda'}
              </Rotulo>
              <div style={{ flex: 1 }} />
              <Link
                href="/pedidos"
                className="font-sans hover:text-ouro"
                style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}
              >
                Todos os pedidos →
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
