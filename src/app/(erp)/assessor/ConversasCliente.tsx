'use client'

import { useState } from 'react'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Losango, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { AGOSTO, JULHO } from '@/data/fixtures'
import type { ComandoIa } from '@/data/fixtures'
import { brl, volume } from '@/domain'

interface Props {
  comandos: ComandoIa[]
  saldoInter: number
  coberturaBac: { volumeMl: number; dias: number } | null
}

const VALOR_LANCAMENTO = 1240

type EstadoAcao = 'pendente' | 'executado' | 'recusado'

export function ConversasCliente({ comandos, saldoInter, coberturaBac }: Props) {
  const [acao, setAcao] = useState<EstadoAcao>('pendente')

  const hoje = comandos.filter((c) => c.quando.startsWith('hoje'))
  const aguardando = comandos.filter((c) => c.estado === 'Aguardando').length
  const executadosHoje = hoje.filter((c) => c.estado === 'Executado').length
  const recusados = comandos.filter((c) => c.estado === 'Recusado').length
  const ultimo = hoje[0]

  const kpis: Kpi[] = [
    {
      label: 'Comandos hoje',
      valor: String(hoje.length),
      hint: `${hoje.filter((c) => c.canal.startsWith('WhatsApp')).length} por WhatsApp`,
    },
    {
      label: 'Aguardando aprovação',
      valor: String(acao === 'pendente' ? aguardando + 1 : aguardando),
      hint: 'Acima do limite ou sem contexto',
      tom: 'atencao',
    },
    {
      label: 'Executados hoje',
      valor: String(acao === 'executado' ? executadosHoje + 1 : executadosHoje),
      hint: 'Sem intervenção',
      tom: 'ok',
    },
    {
      label: 'Recusados',
      valor: String(acao === 'recusado' ? recusados + 1 : recusados),
      hint: 'Por política ou por você',
      tom: 'erro',
    },
    {
      label: 'Último comando',
      valor: ultimo ? ultimo.quando.replace('hoje ', '') : '—',
      hint: ultimo ? `Áudio · ${ultimo.autor}` : 'Nenhum hoje',
      tom: 'ouro',
    },
  ]

  const corAcao = acao === 'pendente' ? COR.atencao : acao === 'executado' ? COR.ok : COR.erro

  const camposAcao = [
    { label: 'Tipo', valor: 'Saída · Despesa', cor: 'var(--color-corrente)' },
    { label: 'Descrição', valor: 'Frete transportadora', cor: 'var(--color-corrente)' },
    { label: 'Valor', valor: brl(VALOR_LANCAMENTO), cor: COR.ouro },
    { label: 'Conta', valor: 'Inter PJ', cor: 'var(--color-corrente)' },
    { label: 'Categoria', valor: 'Logística', cor: 'var(--color-corrente)' },
    { label: 'Data', valor: '05/08/2026', cor: 'rgba(242,237,227,.7)' },
  ]

  // Impacto derivado dos MESMOS números das telas de Contas e DRE.
  const impacto = [
    { label: 'Saldo Inter PJ', antes: saldoInter, depois: saldoInter - VALOR_LANCAMENTO, tom: COR.erro },
    { label: 'Saídas de agosto', antes: AGOSTO.saidas, depois: AGOSTO.saidas + VALOR_LANCAMENTO, tom: COR.atencao },
    { label: 'Resultado de agosto', antes: AGOSTO.resultado, depois: AGOSTO.resultado - VALOR_LANCAMENTO, tom: COR.atencao },
  ]

  const timeline = [
    {
      hora: '09:42',
      texto: `Lançamento de ${brl(VALOR_LANCAMENTO)} · frete transportadora`,
      status: acao === 'pendente' ? 'Aguardando confirmação' : acao === 'executado' ? 'Executado' : 'Recusado',
      tom: corAcao,
    },
    { hora: '09:41', texto: 'Consulta de volume · Baccarat base', status: 'Respondido automaticamente', tom: COR.ok },
    { hora: '08:55', texto: 'Cupom novo bloqueado por regra · usar VOLTA10', status: 'Recusado', tom: COR.erro },
    { hora: '08:20', texto: 'Baixa de entrega na Shopify · 3 pedidos', status: 'Executado', tom: COR.ok },
    { hora: '07:58', texto: 'Lançamento sem categoria identificada', status: 'Pediu esclarecimento', tom: COR.atencao },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 16, alignItems: 'start' }}>
        <section
          style={{
            background: 'linear-gradient(170deg,#141315,#101011)',
            border: '1px solid var(--color-borda)',
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <span
              aria-hidden
              className="font-sans"
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: 'rgba(92,158,112,.16)',
                color: COR.ok,
                fontWeight: 700,
                fontSize: 10,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 'none',
              }}
            >
              JM
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="font-sans" style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.3, color: 'var(--color-corrente)' }}>
                João Marcelo · WhatsApp
              </span>
              <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.3, color: 'rgba(242,237,227,.4)' }}>
                Número autorizado · +55 11 9•••• 4821
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <span
              className="font-sans"
              style={{
                fontWeight: 600,
                fontSize: 9.5,
                lineHeight: 1,
                letterSpacing: '.09em',
                textTransform: 'uppercase',
                color: corAcao,
                border: `1px solid ${corAcao}`,
                borderRadius: 'var(--radius-pill)',
                padding: '4px 9px',
                whiteSpace: 'nowrap',
              }}
            >
              {acao === 'pendente' ? 'Aguardando confirmação' : acao === 'executado' ? 'Resolvida' : 'Recusada'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20 }}>
            <div style={{ display: 'flex', gap: 11 }}>
              <span aria-hidden style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,.06)', flex: 'none' }} />
              <div
                style={{
                  maxWidth: '76%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  background: 'rgba(255,255,255,.035)',
                  border: '1px solid rgba(255,255,255,.06)',
                  borderRadius: '12px 12px 12px 4px',
                  padding: '13px 15px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    className="font-sans"
                    style={{ fontWeight: 600, fontSize: 9.5, lineHeight: 1, letterSpacing: '.09em', textTransform: 'uppercase', color: 'rgba(239,209,140,.6)' }}
                  >
                    Áudio · 14s
                  </span>
                  <span
                    aria-hidden
                    style={{
                      flex: 1,
                      height: 3,
                      borderRadius: 2,
                      background: 'linear-gradient(90deg,rgba(239,209,140,.5),rgba(239,209,140,.12))',
                      display: 'block',
                      minWidth: 88,
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Reproduzir áudio"
                    style={{
                      width: 22,
                      height: 22,
                      border: '1px solid rgba(239,209,140,.3)',
                      background: 'transparent',
                      color: 'var(--color-ouro)',
                      borderRadius: '50%',
                      fontSize: 8,
                      lineHeight: 1,
                      cursor: 'pointer',
                    }}
                  >
                    ▶
                  </button>
                </div>
                <p className="font-sans" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'rgba(242,237,227,.86)' }}>
                  &ldquo;Lança aí a despesa da transportadora, 1.240 reais, saiu da conta Inter hoje. E
                  confirma se o Baccarat base ainda tem volume pra fechar os pedidos da semana.&rdquo;
                </p>
                <span className="font-sans" style={{ fontSize: 10, lineHeight: 1, color: 'rgba(242,237,227,.32)' }}>
                  Transcrição automática · 09:42
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 11, paddingLeft: 37 }}>
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 9,
                  background: 'rgba(239,209,140,.045)',
                  border: '1px solid rgba(239,209,140,.14)',
                  borderRadius: 12,
                  padding: '13px 15px',
                }}
              >
                <span
                  className="font-sans"
                  style={{ fontWeight: 600, fontSize: 9.5, lineHeight: 1, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--color-ouro)' }}
                >
                  Intenção detectada
                </span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['Lançamento financeiro · saída', 'Consulta de estoque'].map((t) => (
                    <span
                      key={t}
                      className="font-sans"
                      style={{
                        fontWeight: 500,
                        fontSize: 10.5,
                        lineHeight: 1,
                        color: 'rgba(242,237,227,.8)',
                        background: 'rgba(255,255,255,.05)',
                        borderRadius: 5,
                        padding: '5px 9px',
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <p className="font-sans" style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'rgba(242,237,227,.68)' }}>
                  Duas ações identificadas. A consulta foi respondida direto no WhatsApp; o
                  lançamento passa do limite de R$ 1.000,00 sem aprovação e precisa de confirmação.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 11, paddingLeft: 37 }}>
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  background: 'rgba(92,158,112,.07)',
                  border: '1px solid rgba(92,158,112,.2)',
                  borderRadius: 12,
                  padding: '13px 15px',
                }}
              >
                <span
                  className="font-sans"
                  style={{ fontWeight: 600, fontSize: 9.5, lineHeight: 1, letterSpacing: '.11em', textTransform: 'uppercase', color: COR.ok }}
                >
                  Respondido automaticamente
                </span>
                <p className="font-sans" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'rgba(242,237,227,.82)' }}>
                  {coberturaBac
                    ? `O Baccarat Rouge 540 tem ${volume(coberturaBac.volumeMl)} em estoque — cobre ${coberturaBac.dias} dias no ritmo atual, suficiente para os pedidos da semana.`
                    : 'Consulta de estoque respondida no WhatsApp.'}
                </p>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              padding: '14px 20px',
              borderTop: '1px solid rgba(255,255,255,.06)',
              background: 'rgba(255,255,255,.015)',
            }}
          >
            <input
              placeholder="Responder no WhatsApp…"
              className="font-sans"
              style={{
                flex: 1,
                height: 36,
                padding: '0 13px',
                border: '1px solid rgba(255,255,255,.09)',
                background: 'rgba(255,255,255,.03)',
                borderRadius: 9,
                color: 'var(--color-corrente)',
                fontSize: 12,
                lineHeight: 1,
                outline: 0,
              }}
            />
            <button
              type="button"
              className="hover:bg-[rgba(239,209,140,.2)] font-sans"
              style={{
                height: 36,
                padding: '0 16px',
                border: 0,
                background: 'rgba(239,209,140,.12)',
                color: 'var(--color-ouro)',
                fontWeight: 600,
                fontSize: 11.5,
                lineHeight: 1,
                borderRadius: 9,
                cursor: 'pointer',
              }}
            >
              Enviar
            </button>
          </div>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section
            style={{
              background: 'linear-gradient(170deg,#16141A,#100F11)',
              border: `1px solid ${acao === 'pendente' ? 'rgba(217,140,63,.3)' : acao === 'executado' ? 'rgba(92,158,112,.35)' : 'rgba(194,90,80,.35)'}`,
              borderRadius: 16,
              padding: '18px 19px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              transition: 'border-color .3s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Losango tom={acao === 'pendente' ? 'atencao' : acao === 'executado' ? 'ok' : 'erro'} />
              <span className="font-display" style={{ fontWeight: 600, fontSize: 14.5, lineHeight: 1, letterSpacing: '.03em', color: corAcao }}>
                Ação proposta
              </span>
              <div style={{ flex: 1 }} />
              <span
                className="font-sans"
                style={{ fontWeight: 600, fontSize: 9.5, lineHeight: 1, letterSpacing: '.09em', textTransform: 'uppercase', color: corAcao }}
              >
                {acao === 'pendente' ? 'Pendente' : acao === 'executado' ? 'Executado' : 'Recusado'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'rgba(255,255,255,.05)', borderRadius: 10, overflow: 'hidden' }}>
              {camposAcao.map((f) => (
                <span
                  key={f.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 13px',
                    background: '#131215',
                  }}
                >
                  <span className="font-sans" style={{ fontSize: 11, lineHeight: 1, color: 'rgba(242,237,227,.5)' }}>
                    {f.label}
                  </span>
                  <span className="font-mono" style={{ fontWeight: 500, fontSize: 12, lineHeight: 1, color: f.cor, textAlign: 'right' }}>
                    {f.valor}
                  </span>
                </span>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: 13,
                borderRadius: 10,
                background: 'rgba(217,140,63,.06)',
                border: '1px solid rgba(217,140,63,.18)',
              }}
            >
              <span
                className="font-sans"
                style={{ fontWeight: 600, fontSize: 9.5, lineHeight: 1, letterSpacing: '.11em', textTransform: 'uppercase', color: COR.atencao }}
              >
                Impacto · antes e depois
              </span>
              {impacto.map((i) => (
                <span key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="font-sans" style={{ flex: 1, fontSize: 11.5, lineHeight: 1, color: 'rgba(242,237,227,.62)' }}>
                    {i.label}
                  </span>
                  <span className="font-mono" style={{ fontSize: 11.5, lineHeight: 1, color: 'rgba(242,237,227,.45)', textDecoration: 'line-through' }}>
                    {brl(i.antes)}
                  </span>
                  <span aria-hidden className="font-sans" style={{ color: 'rgba(242,237,227,.3)', fontSize: 11 }}>
                    →
                  </span>
                  <span className="font-mono" style={{ fontWeight: 500, fontSize: 12, lineHeight: 1, color: i.tom }}>
                    {brl(i.depois)}
                  </span>
                </span>
              ))}
            </div>

            {acao === 'pendente' ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setAcao('executado')}
                  className="botao-ouro font-sans hover:brightness-[1.07]"
                  style={{ flex: 1, height: 38, fontWeight: 700, fontSize: 12, lineHeight: 1, borderRadius: 9, cursor: 'pointer', boxShadow: 'var(--shadow-ouro)' }}
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  className="font-sans hover:border-ouro/35 hover:text-ouro"
                  style={{
                    height: 38,
                    padding: '0 15px',
                    border: '1px solid rgba(255,255,255,.11)',
                    background: 'transparent',
                    color: 'rgba(242,237,227,.75)',
                    fontWeight: 600,
                    fontSize: 12,
                    lineHeight: 1,
                    borderRadius: 9,
                    cursor: 'pointer',
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setAcao('recusado')}
                  className="font-sans hover:bg-[rgba(194,90,80,.12)]"
                  style={{
                    height: 38,
                    padding: '0 15px',
                    border: '1px solid rgba(194,90,80,.3)',
                    background: 'transparent',
                    color: COR.erro,
                    fontWeight: 600,
                    fontSize: 12,
                    lineHeight: 1,
                    borderRadius: 9,
                    cursor: 'pointer',
                  }}
                >
                  Recusar
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 13px',
                  borderRadius: 9,
                  background: acao === 'executado' ? 'rgba(92,158,112,.08)' : 'rgba(194,90,80,.08)',
                  border: `1px solid ${acao === 'executado' ? 'rgba(92,158,112,.35)' : 'rgba(194,90,80,.35)'}`,
                }}
              >
                <span className="font-sans" style={{ flex: 1, fontSize: 11.5, lineHeight: 1.4, color: 'rgba(242,237,227,.8)' }}>
                  {acao === 'executado'
                    ? 'Lançamento criado em Financeiro · Lançamentos. Confirmação enviada no WhatsApp.'
                    : 'Comando recusado. A IA avisou o solicitante e não alterou nenhum registro.'}
                </span>
              </div>
            )}
          </section>

          <section
            style={{
              background: 'linear-gradient(170deg,#141315,#101011)',
              border: '1px solid var(--color-borda)',
              borderRadius: 16,
              padding: '17px 19px',
            }}
          >
            <TituloSecao tamanho={14}>Linha do tempo · hoje</TituloSecao>
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 14 }}>
              {timeline.map((t, i) => (
                <span key={t.hora} style={{ display: 'grid', gridTemplateColumns: '44px 12px 1fr', gap: 10, alignItems: 'start', padding: '9px 0' }}>
                  <span className="font-mono" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'rgba(242,237,227,.35)' }}>
                    {t.hora}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, paddingTop: 3 }}>
                    <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: t.tom, flex: 'none' }} />
                    {i < timeline.length - 1 && (
                      <span style={{ width: 1, flex: 1, minHeight: 14, background: 'rgba(255,255,255,.07)', display: 'block' }} />
                    )}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span className="font-sans" style={{ fontWeight: 500, fontSize: 11.5, lineHeight: 1.35, color: 'rgba(242,237,227,.82)' }}>
                      {t.texto}
                    </span>
                    <span className="font-sans" style={{ fontSize: 10, lineHeight: 1, color: t.tom }}>
                      {t.status}
                    </span>
                  </span>
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
