'use client'

import { useState } from 'react'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { COR, type Tom } from '@/components/erp/tokens'
import type { CarrinhoAbandonado } from '@/data/fixtures'
import { CARRINHOS_7D, CARRINHOS_PRIORIDADE_ALTA, CARRINHOS_RECUPERADOS } from '@/data/fixtures'
import { brl } from '@/domain'

const TOM_PRIORIDADE: Record<CarrinhoAbandonado['prioridade'], Tom> = {
  Alta: 'erro',
  Média: 'atencao',
  Baixa: 'neutro',
}

const FILTROS = ['Todas', 'Alta', 'Média', 'Baixa', 'Contatados'] as const

export function CarrinhosCliente({ carrinhos }: { carrinhos: CarrinhoAbandonado[] }) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>('Todas')

  const visiveis = carrinhos.filter((c) => {
    if (filtro === 'Todas') return true
    if (filtro === 'Contatados') return c.contatado
    return c.prioridade === filtro
  })

  const kpis: Kpi[] = [
    {
      label: 'Carrinhos abertos',
      valor: String(CARRINHOS_7D.abertos),
      hint: 'Últimos 7 dias',
    },
    {
      label: 'Valor em jogo',
      valor: brl(CARRINHOS_7D.valor),
      hint: `Ticket médio ${brl(CARRINHOS_7D.valor / CARRINHOS_7D.abertos)}`,
      tom: 'ouro',
    },
    {
      // O mesmo número que o Dashboard aponta em "Carrinhos com prioridade alta".
      label: 'Prioridade alta',
      valor: String(CARRINHOS_PRIORIDADE_ALTA),
      hint: `Acima de ${brl(400)} e recentes`,
      tom: 'atencao',
    },
    {
      label: 'Recuperados no mês',
      valor: String(CARRINHOS_RECUPERADOS.qtd),
      hint: `${brl(CARRINHOS_RECUPERADOS.valor)} · taxa ${CARRINHOS_RECUPERADOS.taxaPct}%`,
      tom: 'ok',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        {FILTROS.map((f) => {
          const ativo = filtro === f
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className="hover:border-ouro/40 font-sans"
              style={{
                height: 31,
                padding: '0 13px',
                border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.09)'}`,
                background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
                color: ativo ? COR.ouro : 'rgba(242,237,227,.6)',
                fontWeight: 600,
                fontSize: 11,
                lineHeight: 1,
                borderRadius: 'var(--radius-pill)',
                cursor: 'pointer',
              }}
            >
              {f}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14 }}>
        {visiveis.map((c) => {
          const tom = TOM_PRIORIDADE[c.prioridade]
          const cor = tom === 'neutro' ? 'rgba(242,237,227,.4)' : COR[tom]
          return (
            <div
              key={c.cliente}
              className="hover:border-ouro/22"
              style={{
                background: 'linear-gradient(170deg,#141315,#101011)',
                border: '1px solid var(--color-borda)',
                borderTop: `2px solid ${cor}`,
                borderRadius: 13,
                padding: '16px 17px',
                display: 'flex',
                flexDirection: 'column',
                gap: 13,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <span
                    className="font-sans"
                    style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.25, color: 'var(--color-corrente)' }}
                  >
                    {c.cliente}
                  </span>
                  <span className="font-mono" style={{ fontSize: 10.5, lineHeight: 1.3, color: 'rgba(242,237,227,.42)' }}>
                    {c.telefone}
                  </span>
                </div>
                <span
                  className="font-sans"
                  style={{
                    fontWeight: 600,
                    fontSize: 9.5,
                    lineHeight: 1,
                    letterSpacing: '.07em',
                    textTransform: 'uppercase',
                    color: cor,
                    border: `1px solid ${cor}`,
                    borderRadius: 'var(--radius-pill)',
                    padding: '4px 8px',
                    flex: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.prioridade}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span className="font-mono" style={{ fontWeight: 500, fontSize: 21, lineHeight: 1, color: 'var(--color-ouro)' }}>
                  {brl(c.valor)}
                </span>
                <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1, color: 'rgba(242,237,227,.42)' }}>
                  {`abandonado ${c.tempo}`}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: '11px 0',
                  borderTop: '1px solid rgba(255,255,255,.05)',
                  borderBottom: '1px solid rgba(255,255,255,.05)',
                }}
              >
                {c.itens.map((i) => (
                  <span
                    key={i.nome}
                    className="font-sans"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      fontSize: 11.5,
                      lineHeight: 1.3,
                      color: 'rgba(242,237,227,.7)',
                    }}
                  >
                    <span>{i.nome}</span>
                    <span className="font-mono" style={{ fontSize: 11, lineHeight: 1, color: 'rgba(242,237,227,.45)' }}>
                      {i.qtd}
                    </span>
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <button
                  type="button"
                  className="hover:bg-[rgba(92,158,112,.24)] font-sans"
                  style={{
                    flex: 1,
                    height: 31,
                    border: 0,
                    background: 'rgba(92,158,112,.14)',
                    color: COR.ok,
                    fontWeight: 600,
                    fontSize: 11,
                    lineHeight: 1,
                    borderRadius: 7,
                    cursor: 'pointer',
                  }}
                >
                  WhatsApp
                </button>
                <button
                  type="button"
                  className="hover:border-ouro/30 hover:text-ouro font-sans"
                  style={{
                    flex: 1,
                    height: 31,
                    border: '1px solid rgba(255,255,255,.1)',
                    background: 'transparent',
                    color: 'rgba(242,237,227,.7)',
                    fontWeight: 600,
                    fontSize: 11,
                    lineHeight: 1,
                    borderRadius: 7,
                    cursor: 'pointer',
                  }}
                >
                  E-mail
                </button>
                <button
                  type="button"
                  aria-label={`Marcar carrinho de ${c.cliente} como tratado`}
                  className="hover:text-ouro font-sans"
                  style={{
                    width: 31,
                    height: 31,
                    border: '1px solid rgba(255,255,255,.1)',
                    background: 'transparent',
                    color: c.contatado ? COR.ok : 'rgba(242,237,227,.55)',
                    fontSize: 12,
                    lineHeight: 1,
                    borderRadius: 7,
                    cursor: 'pointer',
                  }}
                >
                  ✓
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
