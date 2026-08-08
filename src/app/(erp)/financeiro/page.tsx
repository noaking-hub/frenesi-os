import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, BotaoOuro, TituloSecao, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import type { Tom } from '@/components/erp/tokens'
import { repositorio } from '@/data/repository'
import { AGOSTO, JULHO } from '@/data/fixtures'
import { brl, conciliarRepasse, pad2, pct, plural } from '@/domain'
import type { ResultadoConciliacao, StatusConciliacao } from '@/domain'

const TOM_STATUS: Record<StatusConciliacao, Tom> = {
  previsto: 'info',
  pendente: 'atencao',
  confirmado: 'ok',
  conciliado: 'ok',
  divergente: 'erro',
}

const ROTULO: Record<StatusConciliacao, string> = {
  previsto: 'Previsto',
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  conciliado: 'Conciliado',
  divergente: 'Divergente',
}

export default async function Conciliacao() {
  const repasses = await repositorio().repasses()
  // O status de cada repasse é derivado dos números — nunca vem marcado.
  const resultados = repasses.map(conciliarRepasse)

  const divergentes = resultados.filter((r) => r.status === 'divergente')
  const pendentes = resultados.filter((r) => r.status === 'pendente')
  const conferidos = resultados.filter(
    (r) => r.status === 'conciliado' || r.status === 'confirmado',
  )
  // Um repasse a menos e outro a mais não se anulam — cada direção é um
  // problema próprio, então as somas ficam separadas.
  const aMenos = divergentes
    .filter((r) => (r.diferenca ?? 0) < 0)
    .reduce((a, r) => a + Math.abs(r.diferenca ?? 0), 0)
  const aMais = divergentes
    .filter((r) => (r.diferenca ?? 0) > 0)
    .reduce((a, r) => a + (r.diferenca ?? 0), 0)
  const aguardando = pendentes.reduce((a, r) => a + r.liquidoEsperado, 0)

  const kpis: Kpi[] = [
    {
      label: 'Repasses no período',
      valor: pad2(resultados.length),
      hint: `${conferidos.length} conferidos contra o extrato`,
    },
    {
      label: 'Conciliados',
      valor: pad2(conferidos.length),
      hint: 'Recebido bate com o esperado menos a taxa',
      tom: 'ok',
    },
    {
      label: 'Aguardando repasse',
      valor: brl(aguardando),
      hint: plural(pendentes.length, 'pagamento confirmado sem crédito', 'pagamentos confirmados sem crédito'),
      tom: pendentes.length ? 'atencao' : 'ok',
    },
    {
      label: 'Divergências',
      valor: pad2(divergentes.length),
      hint: divergentes.length
        ? [aMenos ? `${brl(aMenos)} a menos` : '', aMais ? `${brl(aMais)} a mais` : '']
            .filter(Boolean)
            .join(' · ') + ' que o esperado'
        : 'Tudo dentro da tolerância',
      tom: divergentes.length ? 'erro' : 'ok',
    },
    {
      label: 'Resultado em agosto',
      valor: brl(AGOSTO.resultado),
      hint: `Julho fechou em ${brl(JULHO.resultado)}`,
      tom: AGOSTO.resultado >= 0 ? 'ok' : 'erro',
    },
    {
      label: 'A conciliar',
      valor: pad2(pendentes.length + divergentes.length),
      hint: 'Pendentes e divergentes precisam de ação',
      tom: pendentes.length + divergentes.length ? 'atencao' : 'ok',
    },
  ]

  const colunas: Coluna<ResultadoConciliacao>[] = [
    {
      chave: 'pedido',
      titulo: 'Pedido',
      largura: '104px',
      render: (r) => (
        <Valor tamanho={11.5} tom="ouro">
          {r.repasse.pedidoId}
        </Valor>
      ),
    },
    {
      chave: 'origem',
      titulo: 'Origem',
      largura: 'minmax(0,1fr)',
      render: (r) => (
        <span
          className="font-sans"
          style={{ fontWeight: 500, fontSize: 12, lineHeight: 1, color: 'rgba(242,237,227,.8)' }}
        >
          {r.repasse.origem}
        </span>
      ),
    },
    {
      chave: 'esperado',
      titulo: 'Esperado',
      largura: '118px',
      alinhamento: 'right',
      render: (r) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
          <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.7)">
            {brl(r.repasse.esperado)}
          </Valor>
          {/* O que deveria cair depois da taxa — a régua da conciliação. */}
          <span
            className="font-mono"
            style={{ fontSize: 9.5, lineHeight: 1.25, color: 'rgba(242,237,227,.32)', whiteSpace: 'nowrap' }}
          >
            {`líquido ${brl(r.liquidoEsperado)}`}
          </span>
        </span>
      ),
    },
    {
      chave: 'recebido',
      titulo: 'Recebido',
      largura: '118px',
      alinhamento: 'right',
      render: (r) => (
        <Valor tamanho={12}>{r.repasse.recebido === null ? '—' : brl(r.repasse.recebido)}</Valor>
      ),
    },
    {
      chave: 'taxa',
      titulo: 'Taxa',
      largura: '92px',
      alinhamento: 'right',
      render: (r) => (
        <Valor tamanho={12} peso={400} tom="var(--color-terciario)">
          {pct(r.repasse.taxaPct, 2)}
        </Valor>
      ),
    },
    {
      chave: 'diferenca',
      titulo: 'Diferença',
      largura: '108px',
      alinhamento: 'right',
      render: (r) => (
        <Valor
          tamanho={12}
          tom={r.diferenca === null ? 'var(--color-terciario)' : r.diferenca < 0 ? 'erro' : 'atencao'}
        >
          {r.diferenca === null
            ? '—'
            : `${r.diferenca < 0 ? '−' : '+'} ${brl(Math.abs(r.diferenca))}`}
        </Valor>
      ),
    },
    {
      chave: 'status',
      titulo: 'Status',
      largura: '128px',
      render: (r) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge tom={TOM_STATUS[r.status]}>{ROTULO[r.status]}</Badge>
          {r.precisaAcao && (
            <button
              type="button"
              aria-label={`Tratar repasse do pedido ${r.repasse.pedidoId}`}
              className="font-sans hover:bg-[rgba(239,209,140,.1)]"
              style={{
                height: 26,
                padding: '0 9px',
                border: '1px solid rgba(239,209,140,.22)',
                background: 'transparent',
                color: 'var(--color-ouro)',
                fontWeight: 600,
                fontSize: 10,
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Tratar
            </button>
          )}
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Extrato contra lançamentos</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          O status sai da comparação entre o recebido e o esperado menos a taxa — nada é marcado à mão.
        </span>
        <div style={{ flex: 1 }} />
        <BotaoOuro altura={34}>+ Novo lançamento</BotaoOuro>
      </div>

      <Tabela
        colunas={colunas}
        itens={resultados}
        chaveDe={(r) => r.repasse.pedidoId}
        bandeiraDe={(r) =>
          r.status === 'divergente' ? 'erro' : r.status === 'pendente' ? 'atencao' : null
        }
      />
    </div>
  )
}
