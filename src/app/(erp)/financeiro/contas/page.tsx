import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Barra, BotaoSecundario, Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { repositorio } from '@/data/repository'

import { NovaConta } from '../Widgets'
import { brl, num, participacao, plural, resumirLancamentos, saldoConsolidado } from '@/domain'

export default async function Contas() {
  const repo = repositorio()
  const [contas, lancamentos] = await Promise.all([repo.contas(), repo.lancamentos()])

  const saldo = saldoConsolidado(contas)
  const fin = resumirLancamentos(lancamentos)
  const comprometido = fin.aPagar + fin.vencido
  const livre = saldo - comprometido
  const entradas = contas.reduce((a, c) => a + c.entradasMes, 0)
  const saidas = contas.reduce((a, c) => a + c.saidasMes, 0)

  const kpis: Kpi[] = [
    {
      label: 'Saldo consolidado',
      valor: brl(saldo),
      hint: plural(contas.length, 'conta ativa', 'contas ativas'),
    },
    { label: 'Entradas em agosto', valor: brl(entradas), hint: 'Repasses já creditados', tom: 'ok' },
    { label: 'Saídas em agosto', valor: brl(saidas), hint: 'Pagamentos liquidados', tom: 'erro' },
    {
      label: 'Comprometido',
      valor: brl(comprometido),
      // O mesmo número da tela de Lançamentos — derivado de lá, não daqui.
      hint: 'A pagar e vencido nos lançamentos',
      tom: 'atencao',
    },
    {
      label: 'Livre depois de pagar',
      valor: brl(livre),
      hint: 'Saldo real disponível',
      tom: livre > 0 ? 'ok' : 'erro',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Contas da operação</TituloSecao>
        <div style={{ flex: 1 }} />
        <NovaConta />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14 }}>
        {contas.map((c) => {
          const part = participacao(c, contas)
          return (
            <div
              key={c.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 13,
                padding: '18px 19px',
                border: `1px solid ${c.principal ? 'rgba(239,209,140,.26)' : 'var(--color-borda)'}`,
                background: 'linear-gradient(170deg,#16151A,#101011)',
                borderRadius: 'var(--radius-card)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                  <span
                    className="font-display"
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      lineHeight: 1.25,
                      color: c.principal ? 'var(--color-ouro)' : 'var(--color-corrente)',
                    }}
                  >
                    {c.nome}
                  </span>
                  <span
                    className="font-sans"
                    style={{ fontSize: 10, lineHeight: 1.3, color: 'var(--color-terciario)' }}
                  >
                    {c.banco}
                  </span>
                </span>
                {c.principal && (
                  <span
                    className="font-sans"
                    style={{
                      fontWeight: 600,
                      fontSize: 9,
                      lineHeight: 1,
                      letterSpacing: '.08em',
                      textTransform: 'uppercase',
                      color: 'var(--color-ouro)',
                      border: '1px solid rgba(239,209,140,.3)',
                      borderRadius: 'var(--radius-pill)',
                      padding: '3px 7px',
                      flex: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Principal
                  </span>
                )}
              </div>

              <Valor tamanho={24}>{brl(c.saldo)}</Valor>

              <Barra pct={part} tom="ouro" altura={5} />
              <span
                className="font-sans"
                style={{ fontSize: 10, lineHeight: 1, color: 'rgba(242,237,227,.35)' }}
              >
                {`${num(Math.round(part * 10) / 10)}% do caixa`}
              </span>

              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  paddingTop: 11,
                  borderTop: '1px solid rgba(255,255,255,.06)',
                }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Rotulo>Entradas</Rotulo>
                  <Valor tamanho={12} tom="ok">
                    {`+ ${brl(c.entradasMes)}`}
                  </Valor>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Rotulo>Saídas</Rotulo>
                  <Valor tamanho={12} tom="erro">
                    {`− ${brl(c.saidasMes)}`}
                  </Valor>
                </span>
              </div>

              <span
                className="font-sans"
                style={{ fontSize: 10.5, lineHeight: 1.45, color: 'var(--color-terciario)', textWrap: 'pretty' }}
              >
                {c.uso}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
