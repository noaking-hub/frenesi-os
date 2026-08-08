import Link from 'next/link'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { TituloSecao, Valor } from '@/components/erp/primitivos'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, FUNDO, type Tom } from '@/components/erp/tokens'
import { JULHO } from '@/data/fixtures'
import { repositorio } from '@/data/repository'
import { brl, num, pct, resumirCampanhas, retornoDe } from '@/domain'
import type { CampanhaMkt } from '@/domain'

const TOM_ESTADO: Record<CampanhaMkt['estado'], Tom> = {
  'Em veiculação': 'ok',
  Agendada: 'info',
  Encerrada: 'neutro',
}

export default async function Campanhas() {
  const campanhas = await repositorio().campanhasMkt()
  const r = resumirCampanhas(campanhas)
  const maiorReceita = Math.max(...campanhas.map((c) => c.receita), 1)

  const kpis: Kpi[] = [
    {
      label: 'Campanhas no mês',
      valor: String(r.total),
      hint: `${r.ativas} em veiculação`,
    },
    {
      label: 'Alcance total',
      valor: r.alcance.toLocaleString('pt-BR'),
      hint: 'Contatos impactados',
    },
    {
      label: 'Receita atribuída',
      valor: brl(r.receita),
      hint: `${num(Math.round((r.receita / JULHO.receitaBruta) * 1000) / 10)}% da receita de julho`,
      tom: 'ouro',
    },
    {
      label: 'Investimento',
      valor: brl(r.custo),
      hint: 'ADS e ferramentas',
      tom: 'erro',
    },
    {
      label: 'Retorno médio',
      valor: `${num(Math.round(r.retornoMedio * 10) / 10)}x`,
      hint: 'Receita sobre investimento',
      tom: r.retornoMedio >= 3 ? 'ok' : 'atencao',
    },
  ]

  const colunas: Coluna<CampanhaMkt>[] = [
    {
      chave: 'campanha',
      titulo: 'Campanha',
      largura: 'minmax(220px,1.4fr)',
      render: (c) => <CelulaDupla principal={c.nome} secundaria={`${c.publico} · ${c.periodo}`} />,
    },
    {
      chave: 'canal',
      titulo: 'Canal',
      largura: '108px',
      render: (c) => (
        <span
          className="font-sans"
          style={{ fontWeight: 500, fontSize: 11, lineHeight: 1.35, color: 'rgba(242,237,227,.68)', textWrap: 'pretty' }}
        >
          {c.canal}
        </span>
      ),
    },
    {
      chave: 'alcance',
      titulo: 'Alcance',
      largura: '84px',
      alinhamento: 'right',
      render: (c) => (
        <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.6)">
          {c.alcance.toLocaleString('pt-BR')}
        </Valor>
      ),
    },
    {
      chave: 'receita',
      titulo: 'Receita',
      largura: 'minmax(130px,1fr)',
      render: (c) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <Valor tamanho={12.5} tom="ouro">
            {brl(c.receita)}
          </Valor>
          <span style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden', display: 'block' }}>
            <span
              style={{
                display: 'block',
                height: '100%',
                width: `${Math.min(100, Math.round((c.receita / maiorReceita) * 100))}%`,
                background: 'rgba(239,209,140,.55)',
                borderRadius: 2,
              }}
            />
          </span>
        </span>
      ),
    },
    {
      chave: 'conversao',
      titulo: 'Conversão',
      largura: '76px',
      alinhamento: 'right',
      render: (c) => (
        <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.6)">
          {pct(c.conversaoPct)}
        </Valor>
      ),
    },
    {
      chave: 'custo',
      titulo: 'Investimento',
      largura: '96px',
      alinhamento: 'right',
      render: (c) => (
        <span className="font-mono" style={{ fontSize: 11.5, lineHeight: 1, color: 'rgba(242,237,227,.55)', whiteSpace: 'nowrap' }}>
          {c.custo ? brl(c.custo) : 'sem custo'}
        </span>
      ),
    },
    {
      chave: 'retorno',
      titulo: 'Retorno',
      largura: '68px',
      alinhamento: 'right',
      render: (c) => {
        const roi = retornoDe(c)
        return (
          <Valor
            tamanho={12.5}
            tom={roi === null ? 'rgba(242,237,227,.4)' : roi >= 4 ? 'ok' : roi >= 2 ? 'atencao' : 'erro'}
          >
            {roi === null ? '—' : `${num(Math.round(roi * 10) / 10)}x`}
          </Valor>
        )
      },
    },
    {
      chave: 'estado',
      titulo: 'Estado',
      largura: '104px',
      render: (c) => (
        <span
          className="font-sans"
          style={{
            fontWeight: 600,
            fontSize: 10,
            lineHeight: 1,
            letterSpacing: '.05em',
            textTransform: 'uppercase',
            color: c.estado === 'Encerrada' ? 'rgba(242,237,227,.45)' : COR[TOM_ESTADO[c.estado]],
            background: FUNDO[TOM_ESTADO[c.estado]],
            borderRadius: 5,
            padding: '5px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          {c.estado}
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Campanhas</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          {/* O "melhor retorno" sai da lista — nunca é opinião digitada. */}
          {`A campanha com melhor retorno é ${r.melhor.nome}. Vale replicar o formato antes de aumentar verba nas demais.`}
        </span>
        <div style={{ flex: 1 }} />
        <Link
          href="/assessor/email"
          className="font-sans hover:brightness-[1.07]"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 34,
            padding: '0 15px',
            border: 0,
            background: 'linear-gradient(135deg,#EFD18C,#C9A868)',
            color: '#12100D',
            fontWeight: 700,
            fontSize: 11.5,
            lineHeight: 1,
            borderRadius: 8,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 14px rgba(239,209,140,.16)',
          }}
        >
          + Criar campanha com IA
        </Link>
      </div>

      <Tabela
        colunas={colunas}
        itens={campanhas}
        chaveDe={(c) => c.nome}
        bandeiraDe={(c) => (c.estado === 'Em veiculação' ? 'ok' : null)}
      />
    </div>
  )
}
