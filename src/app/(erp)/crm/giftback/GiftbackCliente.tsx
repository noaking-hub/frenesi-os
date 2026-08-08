'use client'

import { useState } from 'react'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { BotaoSecundario, FaixaAlerta, Switch, TituloSecao } from '@/components/erp/primitivos'
import { COR, FUNDO, type Tom } from '@/components/erp/tokens'
import { brl, num, pct, pisoMargem, resumirCashback, saldoDe } from '@/domain'
import type {
  GiftbackEmitido,
  ParametrosPrecificacao,
  RegraCashback,
  SaldoCashback,
} from '@/domain'

interface Props {
  regras: RegraCashback[]
  saldos: SaldoCashback[]
  giftbacks: GiftbackEmitido[]
  parametros: ParametrosPrecificacao
}

const TOM_ESTADO_GB: Record<GiftbackEmitido['estado'], Tom> = {
  Disponível: 'ok',
  Resgatado: 'ouro',
  Expirado: 'neutro',
}

export function GiftbackCliente({ regras, saldos, giftbacks, parametros }: Props) {
  const [ativas, setAtivas] = useState<Record<string, boolean>>(
    Object.fromEntries(regras.map((r) => [r.faixa, r.ativa])),
  )

  const r = resumirCashback(saldos, giftbacks)
  const dessinc = giftbacks.filter((g) => !g.sincronizado)

  const kpis: Kpi[] = [
    {
      label: 'Cashback em circulação',
      valor: brl(r.emCirculacao),
      hint: `${r.clientesComSaldo} clientes com saldo`,
      tom: 'ouro',
    },
    {
      label: 'Vence em até 15 dias',
      valor: brl(r.vencendo15),
      hint: 'Vale disparar lembrete por e-mail',
      tom: 'atencao',
    },
    {
      label: 'Taxa de resgate',
      valor: pct(r.taxaResgatePct),
      hint: `${brl(r.usado)} resgatados de ${brl(r.gerado)}`,
      tom: 'ok',
    },
    {
      label: 'Giftback disponível',
      valor: brl(r.giftbackDisponivel),
      hint: `${r.giftbacksAtivos} códigos ativos`,
    },
    {
      label: 'Custo real no mês',
      valor: brl(r.custoReal),
      hint: 'Só o que foi efetivamente usado',
      tom: 'erro',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Regras de cashback</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          Giftback e cashback são cupons de valor: precisam existir na Shopify e na Yampi, como
          qualquer outro código.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 13 }}>
        {regras.map((regra) => {
          const ligada = ativas[regra.faixa] ?? regra.ativa
          // O quanto o resgate corrói a margem — derivado da margem alvo atual.
          const margemComCashback = parametros.margemAlvo - regra.pct
          const foraDoPiso = margemComCashback < pisoMargem(parametros)
          return (
            <div
              key={regra.faixa}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: '15px 16px',
                border: '1px solid var(--color-borda)',
                background: 'linear-gradient(170deg,#16151A,#101011)',
                borderRadius: 13,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span
                  className="font-sans"
                  style={{
                    fontWeight: 600,
                    fontSize: 12,
                    lineHeight: 1.35,
                    color: ligada ? 'var(--color-corrente)' : 'rgba(242,237,227,.45)',
                    flex: 1,
                    textWrap: 'pretty',
                  }}
                >
                  {regra.faixa}
                </span>
                <Switch
                  ligado={ligada}
                  onChange={(v) => setAtivas((s) => ({ ...s, [regra.faixa]: v }))}
                  label={`${ligada ? 'Pausar' : 'Ativar'} regra "${regra.faixa}"`}
                />
              </div>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                <span
                  className="font-mono"
                  style={{
                    fontWeight: 500,
                    fontSize: 22,
                    lineHeight: 1,
                    color: ligada ? COR.ok : 'rgba(242,237,227,.45)',
                  }}
                >
                  {`${regra.pct}%`}
                </span>
                <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.3, color: 'rgba(242,237,227,.42)' }}>
                  de volta
                </span>
              </span>
              <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'rgba(242,237,227,.45)' }}>
                {`${regra.minimo ? `a partir de ${brl(regra.minimo)}` : 'sem valor mínimo'} · vale ${regra.validade}`}
              </span>
              <span
                className="font-sans"
                style={{
                  fontSize: 10,
                  lineHeight: 1.4,
                  color: foraDoPiso ? COR.erro : 'rgba(242,237,227,.4)',
                  textWrap: 'pretty',
                }}
              >
                {`Margem cai para ${num(Math.round(margemComCashback * 10) / 10)}% quando resgatado${foraDoPiso ? ' · abaixo do piso' : ''}`}
              </span>
            </div>
          )
        })}
      </div>

      {dessinc.length > 0 && (
        <FaixaAlerta
          tom="erro"
          texto={`${dessinc.map((g) => g.codigo).join(', ')} existe só na Shopify. Como o checkout é da Yampi, o cliente não consegue aplicar o crédito.`}
          acao={<BotaoSecundario altura={32}>Criar na Yampi</BotaoSecundario>}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.05fr)', gap: 16, alignItems: 'start' }}>
        <section
          style={{
            background: 'var(--color-mesa)',
            border: '1px solid var(--color-borda)',
            borderRadius: 'var(--radius-card)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '15px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <TituloSecao tamanho={14.5}>Saldos de cashback</TituloSecao>
          </div>
          <div
            className="font-sans"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) 92px 92px 116px',
              gap: 11,
              padding: '10px 18px',
              background: 'var(--color-cabecalho)',
              borderBottom: '1px solid var(--color-borda)',
              fontWeight: 600,
              fontSize: 9,
              lineHeight: 1,
              letterSpacing: '.11em',
              textTransform: 'uppercase',
              color: 'var(--color-terciario)',
            }}
          >
            <span>Cliente</span>
            <span style={{ textAlign: 'right' }}>Gerado</span>
            <span style={{ textAlign: 'right' }}>Saldo</span>
            <span>Expira</span>
          </div>
          {saldos.map((s) => {
            const saldo = saldoDe(s)
            const tom: Tom | null =
              s.expiraEmDias === null ? null : s.expiraEmDias <= 5 ? 'erro' : s.expiraEmDias <= 15 ? 'atencao' : 'ok'
            return (
              <div
                key={s.cliente}
                className="hover:bg-[rgba(239,209,140,.035)]"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0,1fr) 92px 92px 116px',
                  gap: 11,
                  alignItems: 'center',
                  padding: '11px 18px',
                  borderTop: '1px solid var(--color-borda-sutil)',
                  borderLeft: `2px solid ${tom === 'erro' ? COR.erro : tom === 'atencao' ? COR.atencao : 'transparent'}`,
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
                    {s.cliente}
                  </span>
                  <span
                    className="font-sans"
                    style={{
                      fontSize: 10,
                      lineHeight: 1.25,
                      letterSpacing: '.05em',
                      textTransform: 'uppercase',
                      color: 'rgba(239,209,140,.5)',
                    }}
                  >
                    {s.perfil}
                  </span>
                </span>
                <span className="font-mono" style={{ fontSize: 11.5, lineHeight: 1, color: 'rgba(242,237,227,.6)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {brl(s.gerado)}
                </span>
                <span
                  className="font-mono"
                  style={{
                    fontWeight: 500,
                    fontSize: 12,
                    lineHeight: 1,
                    color: saldo ? COR.ouro : 'rgba(242,237,227,.35)',
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {saldo ? brl(saldo) : '—'}
                </span>
                <span
                  className="font-sans"
                  style={{
                    fontWeight: 500,
                    fontSize: 10.5,
                    lineHeight: 1.3,
                    color: tom === null ? 'rgba(242,237,227,.4)' : COR[tom],
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.expiraEmDias === null ? 'resgatado' : `em ${s.expiraEmDias} dias`}
                </span>
              </div>
            )
          })}
        </section>

        <section
          style={{
            background: 'var(--color-mesa)',
            border: '1px solid var(--color-borda)',
            borderRadius: 'var(--radius-card)',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <TituloSecao tamanho={14.5}>Giftback emitido</TituloSecao>
            <div style={{ flex: 1 }} />
            <span className="font-sans" style={{ fontSize: 10, lineHeight: 1, color: 'rgba(242,237,227,.35)' }}>
              crédito para a próxima compra
            </span>
          </div>
          <div
            className="font-sans"
            style={{
              display: 'grid',
              gridTemplateColumns: '104px minmax(0,1fr) 96px 100px 116px',
              gap: 11,
              padding: '10px 18px',
              background: 'var(--color-cabecalho)',
              borderBottom: '1px solid var(--color-borda)',
              fontWeight: 600,
              fontSize: 9,
              lineHeight: 1,
              letterSpacing: '.11em',
              textTransform: 'uppercase',
              color: 'var(--color-terciario)',
            }}
          >
            <span>Código</span>
            <span>Cliente e origem</span>
            <span style={{ textAlign: 'right' }}>Valor</span>
            <span>Estado</span>
            <span>Shopify · Yampi</span>
          </div>
          {giftbacks.map((g) => (
            <div
              key={g.codigo}
              className="hover:bg-[rgba(239,209,140,.035)]"
              style={{
                display: 'grid',
                gridTemplateColumns: '104px minmax(0,1fr) 96px 100px 116px',
                gap: 11,
                alignItems: 'center',
                padding: '11px 18px',
                borderTop: '1px solid var(--color-borda-sutil)',
                borderLeft: `2px solid ${!g.sincronizado ? COR.erro : g.estado === 'Disponível' ? COR.ok : 'transparent'}`,
              }}
            >
              <span className="font-mono" style={{ fontWeight: 500, fontSize: 11, lineHeight: 1.3, color: 'var(--color-ouro)' }}>
                {g.codigo}
              </span>
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
                  {g.cliente}
                </span>
                <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.25, color: 'rgba(242,237,227,.4)' }}>
                  {`${g.origem} · mínimo ${brl(g.minimo)}`}
                </span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                <span className="font-mono" style={{ fontWeight: 500, fontSize: 12.5, lineHeight: 1, color: 'var(--color-corrente)', whiteSpace: 'nowrap' }}>
                  {brl(g.valor)}
                </span>
                <span className="font-sans" style={{ fontSize: 9.5, lineHeight: 1, color: 'rgba(242,237,227,.32)', whiteSpace: 'nowrap' }}>
                  {g.validade}
                </span>
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
                  color: g.estado === 'Expirado' ? 'rgba(242,237,227,.45)' : COR[TOM_ESTADO_GB[g.estado]],
                  background: FUNDO[TOM_ESTADO_GB[g.estado]],
                  borderRadius: 5,
                  padding: '5px 8px',
                  whiteSpace: 'nowrap',
                }}
              >
                {g.estado}
              </span>
              <span
                className="font-sans"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontWeight: 500,
                  fontSize: 10.5,
                  lineHeight: 1.3,
                  color: g.sincronizado ? COR.ok : COR.erro,
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: g.sincronizado ? COR.ok : COR.erro,
                    flex: 'none',
                  }}
                />
                {g.sincronizado ? 'Sincronizado' : 'Só na Shopify'}
              </span>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
