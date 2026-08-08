'use client'

import { useState } from 'react'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { BotaoOuro, BotaoSecundario, Rotulo } from '@/components/erp/primitivos'
import { COR, FUNDO } from '@/components/erp/tokens'
import { JULHO } from '@/data/fixtures'
import { brl, cupomDessincronizado, cuponsDoFluxo, num, pct, resumirFluxos } from '@/domain'
import type { CupomPromo, EtapaFluxo, FluxoEmail } from '@/domain'

interface Props {
  fluxos: FluxoEmail[]
  etapas: Record<string, EtapaFluxo[]>
  cupons: CupomPromo[]
}

export function EmailsCliente({ fluxos, etapas, cupons }: Props) {
  const [fluxoSel, setFluxoSel] = useState(fluxos[0]?.id ?? '')

  const r = resumirFluxos(fluxos)
  const sel = fluxos.find((f) => f.id === fluxoSel) ?? fluxos[0]
  const etapasSel = etapas[sel.id] ?? []
  const codigosFluxo = cuponsDoFluxo(etapasSel)
  // O aviso só acende se o cupom do fluxo estiver de fato quebrado nas
  // plataformas — mesma checagem da tela de Promoções.
  const cuponsQuebrados = codigosFluxo.filter((codigo) => {
    const cupom = cupons.find((c) => c.codigo === codigo)
    return !cupom || cupomDessincronizado(cupom)
  })

  const kpis: Kpi[] = [
    {
      label: 'Fluxos ativos',
      valor: String(r.ativos),
      hint: `${r.rascunhos} rascunho ainda sem disparos`,
    },
    { label: 'E-mails enviados', valor: String(r.enviados), hint: 'Últimos 30 dias' },
    {
      label: 'Abertura média',
      valor: pct(r.aberturaMedia),
      hint: 'Ponderada por envio',
      tom: 'ok',
    },
    {
      label: 'Receita atribuída',
      valor: brl(r.receita),
      hint: `${num(Math.round((r.receita / JULHO.receitaBruta) * 1000) / 10)}% da receita de julho`,
      tom: 'ouro',
    },
    {
      label: 'Receita por e-mail',
      valor: brl(Math.round(r.receitaPorEmail * 100) / 100),
      hint: 'Retorno médio de cada disparo',
      tom: 'ouro',
    },
  ]

  const grid = 'minmax(0,1fr) 72px 92px 72px 104px 92px'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 330px', gap: 16, alignItems: 'start' }}>
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
              gridTemplateColumns: grid,
              gap: 12,
              padding: '11px 18px',
              background: 'var(--color-cabecalho)',
              borderBottom: '1px solid var(--color-borda)',
            }}
          >
            {['Fluxo', 'Envios', 'Abertura', 'Cliques', 'Receita', 'Status'].map((t, i) => (
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
                  textAlign: i === 1 || i === 3 || i === 4 ? 'right' : 'left',
                }}
              >
                {t}
              </span>
            ))}
          </div>
          {fluxos.map((f) => {
            const ativo = f.id === sel.id
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFluxoSel(f.id)}
                className="hover:bg-[rgba(239,209,140,.045)]"
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: grid,
                  gap: 12,
                  alignItems: 'center',
                  padding: '11px 18px',
                  border: 0,
                  borderTop: '1px solid var(--color-borda-sutil)',
                  borderLeft: `2px solid ${ativo ? COR.ouro : 'transparent'}`,
                  background: ativo ? 'rgba(239,209,140,.06)' : 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span
                    className="font-sans"
                    style={{
                      fontWeight: 600,
                      fontSize: 12,
                      lineHeight: 1.25,
                      color: 'var(--color-corrente)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {f.nome}
                  </span>
                  <span
                    className="font-sans"
                    style={{
                      fontSize: 10.5,
                      lineHeight: 1.3,
                      color: 'rgba(242,237,227,.42)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {`${f.gatilho} · ${f.etapas} ${f.etapas === 1 ? 'e-mail' : 'e-mails'}`}
                  </span>
                </span>
                <span className="font-mono" style={{ fontSize: 12, lineHeight: 1, color: 'rgba(242,237,227,.68)', textAlign: 'right' }}>
                  {f.enviados ? f.enviados : '—'}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span className="font-mono" style={{ fontWeight: 500, fontSize: 11.5, lineHeight: 1, color: 'var(--color-corrente)' }}>
                    {f.enviados ? pct(f.aberturaPct) : 'nunca disparado'}
                  </span>
                  <span style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden', display: 'block' }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.round(f.aberturaPct)}%`, background: 'rgba(239,209,140,.6)', borderRadius: 2 }} />
                  </span>
                </span>
                <span className="font-mono" style={{ fontSize: 12, lineHeight: 1, color: 'rgba(242,237,227,.6)', textAlign: 'right' }}>
                  {f.enviados ? pct(f.cliquesPct) : '—'}
                </span>
                <span className="font-mono" style={{ fontWeight: 500, fontSize: 12.5, lineHeight: 1, color: 'var(--color-ouro)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {f.enviados ? brl(f.receita) : '—'}
                </span>
                <span
                  className="font-sans"
                  style={{
                    justifySelf: 'start',
                    fontWeight: 600,
                    fontSize: 10,
                    lineHeight: 1,
                    letterSpacing: '.05em',
                    textTransform: 'uppercase',
                    color: f.status === 'Ativo' ? COR.ok : COR.atencao,
                    background: f.status === 'Ativo' ? FUNDO.ok : FUNDO.atencao,
                    borderRadius: 5,
                    padding: '5px 8px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.status}
                </span>
              </button>
            )
          })}
        </section>

        <section
          style={{
            background: 'linear-gradient(170deg,#16141A,#100F11)',
            border: '1px solid rgba(239,209,140,.16)',
            borderRadius: 16,
            padding: '18px 19px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Rotulo style={{ color: 'rgba(239,209,140,.6)' }}>Sequência do fluxo</Rotulo>
            <span className="font-display" style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2, color: 'var(--color-tinta)' }}>
              {sel.nome}
            </span>
            <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'rgba(242,237,227,.45)' }}>
              {`Dispara: ${sel.gatilho}`}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {etapasSel.map((e, i) => (
              <span key={e.quando} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%' }}>
                  <span
                    className="font-sans"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      border: '1px solid rgba(239,209,140,.4)',
                      color: 'var(--color-ouro)',
                      fontWeight: 600,
                      fontSize: 10,
                      lineHeight: '20px',
                      textAlign: 'center',
                      flex: 'none',
                    }}
                  >
                    {i + 1}
                  </span>
                  {i < etapasSel.length - 1 && (
                    <span style={{ width: 1, flex: 1, minHeight: 12, background: 'rgba(255,255,255,.08)', display: 'block' }} />
                  )}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 16, minWidth: 0 }}>
                  <span className="font-mono" style={{ fontSize: 10, lineHeight: 1, color: 'rgba(242,237,227,.4)' }}>
                    {e.quando}
                  </span>
                  <span className="font-sans" style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.35, color: 'var(--color-corrente)', textWrap: 'pretty' }}>
                    {e.assunto}
                  </span>
                  <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(242,237,227,.5)', textWrap: 'pretty' }}>
                    {e.corpo}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                    {e.cupom && (
                      <span
                        className="font-mono"
                        style={{
                          fontWeight: 500,
                          fontSize: 10,
                          lineHeight: 1,
                          color: 'var(--color-ouro)',
                          border: '1px solid rgba(239,209,140,.3)',
                          borderRadius: 'var(--radius-pill)',
                          padding: '4px 9px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {e.cupom}
                      </span>
                    )}
                    <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1, color: 'rgba(242,237,227,.42)', whiteSpace: 'nowrap' }}>
                      {e.aberturaPct ? `${pct(e.aberturaPct)} de abertura` : 'sem histórico'}
                    </span>
                    {e.receita > 0 && (
                      <span className="font-mono" style={{ fontWeight: 500, fontSize: 10.5, lineHeight: 1, color: COR.ok, whiteSpace: 'nowrap' }}>
                        {brl(e.receita)}
                      </span>
                    )}
                  </span>
                </span>
              </span>
            ))}
          </div>

          {codigosFluxo.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '12px 13px',
                borderRadius: 11,
                background: cuponsQuebrados.length ? 'rgba(194,90,80,.07)' : 'rgba(217,140,63,.06)',
                border: `1px solid ${cuponsQuebrados.length ? 'rgba(194,90,80,.26)' : 'rgba(217,140,63,.2)'}`,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: cuponsQuebrados.length ? COR.erro : COR.atencao,
                  flex: 'none',
                  marginTop: 5,
                }}
              />
              <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(242,237,227,.7)', textWrap: 'pretty' }}>
                {cuponsQuebrados.length
                  ? `O cupom ${cuponsQuebrados.join(' e ')} deste fluxo não está ativo nas duas plataformas — o cliente vai tentar aplicar e o checkout vai recusar.`
                  : `O cupom ${codigosFluxo.join(' e ')} usado neste fluxo precisa estar ativo na Shopify e na Yampi para o cliente conseguir aplicar. Hoje está.`}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <BotaoOuro altura={36}>Editar sequência</BotaoOuro>
            <BotaoSecundario altura={36}>Enviar teste</BotaoSecundario>
          </div>
        </section>
      </div>
    </div>
  )
}
