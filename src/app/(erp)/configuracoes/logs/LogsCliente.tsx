'use client'

import { useState } from 'react'

import { CardKpi, type Kpi } from '@/components/erp/Kpi'
import { BotaoSecundario, TituloSecao } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR } from '@/components/erp/tokens'
import type { RegistroAuditoria } from '@/data/fixtures'

export function LogsCliente({ registros }: { registros: RegistroAuditoria[] }) {
  const [autorFiltro, setAutorFiltro] = useState('Todos os autores')

  const autores = [...new Set(registros.map((r) => r.autor))]
  const visiveis =
    autorFiltro === 'Todos os autores' ? registros : registros.filter((r) => r.autor === autorFiltro)

  // "Hoje" é o que não vem marcado como de outro dia — o quando das fixtures
  // usa hora pura para hoje e prefixo por extenso para dias anteriores.
  const deHoje = registros.filter((r) => /^\d/.test(r.quando))
  const pelaIa = registros.filter((r) => r.autor === 'Assessor IA')
  const sensiveis = registros.filter((r) => r.sensivel)

  const kpis: Kpi[] = [
    {
      label: 'Registros hoje',
      valor: String(deHoje.length),
      hint: 'Ações com alteração de dado',
    },
    {
      label: 'Feitas pela IA',
      valor: String(pelaIa.length),
      hint: 'Todas com aprovação humana',
      tom: 'ouro',
    },
    {
      label: 'Alterações sensíveis',
      valor: String(sensiveis.length),
      hint: 'Preço, permissão ou estoque',
      tom: 'atencao',
    },
    {
      label: 'Retenção',
      valor: '180 dias',
      hint: 'Depois disso o histórico é arquivado',
      tom: 'neutro',
    },
  ]

  const colunas: Coluna<RegistroAuditoria>[] = [
    {
      chave: 'quando',
      titulo: 'Quando',
      largura: '96px',
      render: (l) => (
        <span
          className="font-mono"
          style={{ fontSize: 11, lineHeight: 1.3, color: 'rgba(242,237,227,.5)', whiteSpace: 'nowrap' }}
        >
          {l.quando}
        </span>
      ),
    },
    {
      chave: 'autor',
      titulo: 'Autor',
      largura: '132px',
      render: (l) => (
        <span
          className="font-sans"
          style={{
            fontWeight: 500,
            fontSize: 11.5,
            lineHeight: 1.3,
            color: l.autor === 'Assessor IA' ? COR.ouro : 'rgba(242,237,227,.72)',
            whiteSpace: 'nowrap',
          }}
        >
          {l.autor}
        </span>
      ),
    },
    {
      chave: 'modulo',
      titulo: 'Módulo',
      largura: '128px',
      render: (l) => (
        <span
          className="font-sans"
          style={{
            fontSize: 10.5,
            lineHeight: 1.3,
            letterSpacing: '.04em',
            textTransform: 'uppercase',
            color: 'rgba(239,209,140,.5)',
            whiteSpace: 'nowrap',
          }}
        >
          {l.modulo}
        </span>
      ),
    },
    {
      chave: 'acao',
      titulo: 'Ação',
      largura: 'minmax(0,1.3fr)',
      render: (l) => (
        <span
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.45, color: 'rgba(242,237,227,.72)', textWrap: 'pretty' }}
        >
          {l.acao}
        </span>
      ),
    },
    {
      chave: 'alteracao',
      titulo: 'Alteração',
      largura: 'minmax(0,1fr)',
      render: (l) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          {l.antes && (
            <>
              <span
                className="font-mono"
                style={{
                  fontSize: 11,
                  lineHeight: 1.3,
                  color: 'rgba(242,237,227,.4)',
                  textDecoration: 'line-through',
                  whiteSpace: 'nowrap',
                }}
              >
                {l.antes}
              </span>
              <span
                aria-hidden
                className="font-sans"
                style={{ fontSize: 11, lineHeight: 1, color: 'rgba(242,237,227,.3)' }}
              >
                →
              </span>
            </>
          )}
          <span
            className="font-mono"
            style={{
              fontWeight: 500,
              fontSize: 11,
              lineHeight: 1.35,
              color: l.depois ? 'var(--color-ouro)' : 'rgba(242,237,227,.35)',
              textWrap: 'pretty',
            }}
          >
            {l.depois || '—'}
          </span>
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 13 }}>
        {kpis.map((k) => (
          <CardKpi key={k.label} kpi={k} />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Histórico de alterações</TituloSecao>
        <div style={{ flex: 1 }} />
        <select
          value={autorFiltro}
          onChange={(e) => setAutorFiltro(e.target.value)}
          aria-label="Filtrar por autor"
          className="font-sans"
          style={{
            height: 34,
            padding: '0 11px',
            border: '1px solid rgba(255,255,255,.09)',
            background: '#131214',
            color: 'rgba(242,237,227,.75)',
            fontWeight: 500,
            fontSize: 11,
            lineHeight: 1,
            borderRadius: 8,
          }}
        >
          <option>Todos os autores</option>
          {autores.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <BotaoSecundario altura={34}>Exportar auditoria</BotaoSecundario>
      </div>

      <Tabela
        colunas={colunas}
        itens={visiveis}
        chaveDe={(l) => `${l.quando}-${l.acao}`}
        bandeiraDe={(l) => (l.sensivel ? 'atencao' : null)}
      />
    </div>
  )
}
