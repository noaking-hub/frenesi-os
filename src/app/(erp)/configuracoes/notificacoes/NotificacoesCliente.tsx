'use client'

import { useState } from 'react'

import { CardKpi, type Kpi } from '@/components/erp/Kpi'
import { Switch, TituloSecao } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import type { RegraNotificacao } from '@/data/fixtures'

const TOM_NIVEL: Record<RegraNotificacao['nivel'], Tom> = {
  Crítico: 'erro',
  Atenção: 'atencao',
  Informativo: 'info',
}

export function NotificacoesCliente({ regras }: { regras: RegraNotificacao[] }) {
  // Estado do switch por evento; começa como veio da regra.
  const [ligadas, setLigadas] = useState<Record<string, boolean>>(
    Object.fromEntries(regras.map((r) => [r.evento, r.ativa])),
  )

  const ativa = (r: RegraNotificacao) => ligadas[r.evento] ?? r.ativa
  const ativas = regras.filter(ativa)
  const pausadas = regras.length - ativas.length
  const disparosHoje = regras.reduce((a, r) => a + r.disparosHoje, 0)
  const criticas = regras.filter((r) => r.nivel === 'Crítico')

  const kpis: Kpi[] = [
    {
      label: 'Regras ativas',
      valor: String(ativas.length),
      hint: pausadas ? `${pausadas} pausadas` : 'Nenhuma pausada',
    },
    {
      label: 'Disparos hoje',
      valor: String(disparosHoje),
      hint: 'Somando todos os canais',
    },
    {
      label: 'Críticas',
      valor: String(criticas.length),
      hint: 'Interrompem venda ou entrega',
      tom: 'erro',
    },
  ]

  const colunas: Coluna<RegraNotificacao>[] = [
    {
      chave: 'evento',
      titulo: 'Evento',
      largura: 'minmax(0,1fr)',
      render: (r) => (
        <span
          className="font-sans"
          style={{
            fontWeight: 600,
            fontSize: 12,
            lineHeight: 1.3,
            color: ativa(r) ? 'var(--color-corrente)' : 'rgba(242,237,227,.45)',
            textWrap: 'pretty',
          }}
        >
          {r.evento}
        </span>
      ),
    },
    {
      chave: 'condicao',
      titulo: 'Condição',
      largura: 'minmax(0,1fr)',
      render: (r) => (
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.4, color: 'rgba(242,237,227,.45)', textWrap: 'pretty' }}
        >
          {r.condicao}
        </span>
      ),
    },
    {
      chave: 'canais',
      titulo: 'Canais',
      largura: '132px',
      render: (r) => (
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(242,237,227,.6)', textWrap: 'pretty' }}
        >
          {r.canais}
        </span>
      ),
    },
    {
      chave: 'modulo',
      titulo: 'Módulo',
      largura: '116px',
      render: (r) => (
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
          {r.modulo}
        </span>
      ),
    },
    {
      chave: 'nivel',
      titulo: 'Nível',
      largura: '108px',
      render: (r) => (
        <span
          className="font-sans"
          style={{
            fontWeight: 600,
            fontSize: 9.5,
            lineHeight: 1,
            letterSpacing: '.07em',
            textTransform: 'uppercase',
            color: COR[TOM_NIVEL[r.nivel]],
            border: `1px solid ${COR[TOM_NIVEL[r.nivel]]}`,
            borderRadius: 'var(--radius-pill)',
            padding: '4px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          {r.nivel}
        </span>
      ),
    },
    {
      chave: 'hoje',
      titulo: 'Hoje',
      largura: '92px',
      render: (r) => (
        <span
          className="font-mono"
          style={{ fontSize: 10.5, lineHeight: 1.3, color: 'rgba(242,237,227,.45)', whiteSpace: 'nowrap' }}
        >
          {r.disparosHoje ? `${r.disparosHoje} hoje` : 'nenhum hoje'}
        </span>
      ),
    },
    {
      chave: 'switch',
      titulo: '',
      largura: '56px',
      alinhamento: 'right',
      render: (r) => (
        <Switch
          ligado={ativa(r)}
          onChange={(v) => setLigadas((s) => ({ ...s, [r.evento]: v }))}
          label={`${ativa(r) ? 'Desativar' : 'Ativar'} regra "${r.evento}"`}
        />
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,320px))', gap: 13 }}>
        {kpis.map((k) => (
          <CardKpi key={k.label} kpi={k} />
        ))}
      </div>

      <TituloSecao tamanho={16}>Quando o ERP avisa</TituloSecao>

      <Tabela
        colunas={colunas}
        itens={regras}
        chaveDe={(r) => r.evento}
        // Regra crítica LIGADA ganha bandeira: é o alerta que pode parar venda.
        bandeiraDe={(r) => (ativa(r) && r.nivel === 'Crítico' ? 'erro' : null)}
      />
    </div>
  )
}
