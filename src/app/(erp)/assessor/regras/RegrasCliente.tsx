'use client'

import { useState } from 'react'

import { CardKpi, type Kpi } from '@/components/erp/Kpi'
import { Badge, Switch, TituloSecao } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import type { RegraIa } from '@/data/fixtures'

export function RegrasCliente({ regras }: { regras: RegraIa[] }) {
  const [permitidas, setPermitidas] = useState<Record<string, boolean>>(
    Object.fromEntries(regras.map((r) => [r.acao, r.permitida])),
  )

  const permitida = (r: RegraIa) => permitidas[r.acao] ?? r.permitida
  const ligadas = regras.filter(permitida)
  const sozinhas = ligadas.filter((r) => !r.aprovacao)
  const comAprovacao = ligadas.filter((r) => r.aprovacao)

  const kpis: Kpi[] = [
    {
      label: 'Ações permitidas',
      valor: `${ligadas.length} de ${regras.length}`,
      hint: `${regras.length - ligadas.length} bloqueadas por política`,
    },
    {
      label: 'Executam sozinhas',
      valor: String(sozinhas.length),
      hint: 'Sem aprovação humana',
      tom: 'ok',
    },
    {
      label: 'Exigem aprovação',
      valor: String(comAprovacao.length),
      hint: 'Passam pela sua confirmação',
      tom: 'atencao',
    },
    {
      label: 'Princípio',
      valor: 'Ler livre',
      hint: 'Escrever, só com limite e trilha de auditoria',
      tom: 'ouro',
    },
  ]

  const colunas: Coluna<RegraIa>[] = [
    {
      chave: 'acao',
      titulo: 'Ação',
      largura: 'minmax(0,1.1fr)',
      render: (r) => (
        <span
          className="font-sans"
          style={{
            fontWeight: 600,
            fontSize: 12,
            lineHeight: 1.35,
            color: permitida(r) ? 'var(--color-corrente)' : 'rgba(242,237,227,.45)',
            textWrap: 'pretty',
          }}
        >
          {r.acao}
        </span>
      ),
    },
    {
      chave: 'modulo',
      titulo: 'Módulo',
      largura: '132px',
      render: (r) => (
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.3, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(239,209,140,.5)', whiteSpace: 'nowrap' }}
        >
          {r.modulo}
        </span>
      ),
    },
    {
      chave: 'limite',
      titulo: 'Limite',
      largura: '148px',
      render: (r) => (
        <span className="font-mono" style={{ fontWeight: 500, fontSize: 11, lineHeight: 1.35, color: 'rgba(242,237,227,.6)', textWrap: 'pretty' }}>
          {r.limite}
        </span>
      ),
    },
    {
      chave: 'motivo',
      titulo: 'Por quê',
      largura: 'minmax(0,1.2fr)',
      render: (r) => (
        <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.45, color: 'rgba(242,237,227,.45)', textWrap: 'pretty' }}>
          {r.motivo}
        </span>
      ),
    },
    {
      chave: 'comportamento',
      titulo: 'Comportamento',
      largura: '148px',
      render: (r) =>
        permitida(r) ? (
          r.aprovacao ? (
            <Badge tom="atencao">Pede aprovação</Badge>
          ) : (
            <Badge tom="ok">Executa sozinha</Badge>
          )
        ) : (
          <Badge tom="neutro">Bloqueada</Badge>
        ),
    },
    {
      chave: 'switch',
      titulo: '',
      largura: '56px',
      alinhamento: 'right',
      render: (r) => (
        <Switch
          ligado={permitida(r)}
          onChange={(v) => setPermitidas((s) => ({ ...s, [r.acao]: v }))}
          label={`${permitida(r) ? 'Bloquear' : 'Permitir'} "${r.acao}"`}
        />
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

      <TituloSecao tamanho={16}>O que a IA pode fazer</TituloSecao>

      <Tabela
        colunas={colunas}
        itens={regras}
        chaveDe={(r) => r.acao}
        bandeiraDe={(r) => (permitida(r) ? null : 'neutro')}
      />
    </div>
  )
}
