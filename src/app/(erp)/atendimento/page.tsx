import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { BotaoOuro, BotaoSecundario, TituloSecao } from '@/components/erp/primitivos'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { ATENDIMENTO_RESOLVIDAS_IA, ATENDIMENTO_RESPONDIDAS_HOJE } from '@/data/fixtures'
import { repositorio } from '@/data/repository'
import { esperaTexto, resumirFila } from '@/domain'
import type { TicketAtendimento } from '@/domain'

const TOM_PRIORIDADE: Record<TicketAtendimento['prioridade'], Tom> = {
  Alta: 'erro',
  Média: 'atencao',
  Baixa: 'neutro',
}

export default async function Atendimento() {
  const tickets = await repositorio().atendimento()
  const fila = resumirFila(tickets)

  const kpis: Kpi[] = [
    {
      label: 'Na fila',
      valor: String(fila.pendentes),
      hint: `${fila.semResponsavel} sem responsável`,
      tom: 'ouro',
    },
    {
      label: 'Prioridade alta',
      valor: String(fila.altas),
      hint: 'Todas ligadas a entrega ou devolução',
      tom: 'erro',
    },
    {
      label: 'Espera mais longa',
      valor: fila.maisEspera ? esperaTexto(fila.maisEspera.esperaMin) : '—',
      hint: fila.maisEspera
        ? `${fila.maisEspera.id} · ${fila.maisEspera.assunto.toLowerCase()}`
        : 'Fila vazia',
      tom: fila.maisEspera && (fila.maisEspera.esperaMin ?? 0) >= 1440 ? 'erro' : 'atencao',
    },
    {
      label: 'Respondidas hoje',
      valor: String(ATENDIMENTO_RESPONDIDAS_HOJE.qtd),
      hint: `Tempo médio de ${ATENDIMENTO_RESPONDIDAS_HOJE.tempoMedio}`,
      tom: 'ok',
    },
    {
      label: 'Resolvidas pela IA',
      valor: String(ATENDIMENTO_RESOLVIDAS_IA.qtd),
      hint: ATENDIMENTO_RESOLVIDAS_IA.hint,
      tom: 'ouro',
    },
  ]

  const colunas: Coluna<TicketAtendimento>[] = [
    {
      chave: 'ticket',
      titulo: 'Ticket',
      largura: '80px',
      render: (o) => (
        <span className="font-mono" style={{ fontWeight: 500, fontSize: 11.5, lineHeight: 1, color: 'var(--color-ouro)' }}>
          {o.id}
        </span>
      ),
    },
    {
      chave: 'assunto',
      titulo: 'Assunto',
      largura: 'minmax(0,1.4fr)',
      render: (o) => <CelulaDupla principal={o.assunto} secundaria={`${o.cliente} · ${o.pedido}`} />,
    },
    {
      chave: 'canal',
      titulo: 'Canal',
      largura: '104px',
      render: (o) => (
        <span className="font-sans" style={{ fontWeight: 500, fontSize: 11, lineHeight: 1.3, color: 'rgba(242,237,227,.68)' }}>
          {o.canal}
        </span>
      ),
    },
    {
      chave: 'responsavel',
      titulo: 'Responsável',
      largura: '116px',
      render: (o) => (
        <span
          className="font-sans"
          style={{
            fontWeight: 500,
            fontSize: 11,
            lineHeight: 1.3,
            color: o.responsavel === 'Não atribuída' ? COR.atencao : 'rgba(242,237,227,.72)',
          }}
        >
          {o.responsavel}
        </span>
      ),
    },
    {
      chave: 'origem',
      titulo: 'Origem',
      largura: '96px',
      render: (o) => (
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.3, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(239,209,140,.55)' }}
        >
          {o.origem}
        </span>
      ),
    },
    {
      chave: 'espera',
      titulo: 'Espera',
      largura: '116px',
      alinhamento: 'right',
      render: (o) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
          <span
            className="font-mono"
            style={{
              fontWeight: 500,
              fontSize: 11.5,
              lineHeight: 1.25,
              color:
                o.esperaMin === null
                  ? COR.ok
                  : o.prioridade === 'Alta'
                    ? COR.erro
                    : o.prioridade === 'Média'
                      ? COR.atencao
                      : 'rgba(242,237,227,.55)',
              whiteSpace: 'nowrap',
            }}
          >
            {esperaTexto(o.esperaMin)}
          </span>
          <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.25, color: 'rgba(242,237,227,.35)', whiteSpace: 'nowrap' }}>
            {o.abertura}
          </span>
        </span>
      ),
    },
    {
      chave: 'prioridade',
      titulo: 'Prioridade',
      largura: '100px',
      render: (o) => {
        const cor = o.esperaMin === null ? COR.ok : o.prioridade === 'Baixa' ? 'rgba(242,237,227,.5)' : COR[TOM_PRIORIDADE[o.prioridade]]
        return (
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
              whiteSpace: 'nowrap',
            }}
          >
            {o.esperaMin === null ? 'Respondida' : o.prioridade}
          </span>
        )
      },
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Fila de ocorrências</TituloSecao>
        <div style={{ flex: 1 }} />
        <BotaoSecundario altura={34}>Distribuir automaticamente</BotaoSecundario>
        <BotaoOuro altura={34}>+ Nova ocorrência</BotaoOuro>
      </div>

      <Tabela
        colunas={colunas}
        itens={tickets}
        chaveDe={(o) => o.id}
        bandeiraDe={(o) =>
          o.esperaMin === null ? null : o.prioridade === 'Alta' ? 'erro' : o.prioridade === 'Média' ? 'atencao' : null
        }
      />
    </div>
  )
}
