import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { BotaoOuro, TituloSecao, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { repositorio } from '@/data/repository'
import { origemDoAjuste, pct, plural, resumirMovimentacoes, volume } from '@/domain'
import type { Movimentacao, TipoMovimentacao } from '@/domain'

const ROTULO: Record<TipoMovimentacao, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Ajuste',
  devolucao: 'Devolução',
}

const TOM: Record<TipoMovimentacao, Tom> = {
  entrada: 'ok',
  saida: 'atencao',
  ajuste: 'erro',
  devolucao: 'info',
}

export default async function Movimentacoes() {
  const repo = repositorio()
  const [movs, parametros] = await Promise.all([repo.movimentacoes(), repo.parametros()])
  const r = resumirMovimentacoes(movs)

  const kpis: Kpi[] = [
    {
      label: 'Movimentações no período',
      valor: String(r.total),
      hint: 'Entradas, saídas, ajustes e devoluções',
    },
    {
      label: 'Entrada de base',
      valor: volume(r.entradasMl),
      hint: 'Compras e retorno de devolução',
      tom: 'ok',
    },
    {
      label: 'Consumo em produção',
      valor: volume(r.saidasMl),
      // O hint decompõe o próprio valor: envasado + perda = consumido.
      hint: `${volume(r.envasadoMl)} envasados + ${volume(r.perdaMl)} de perda técnica`,
      tom: 'atencao',
    },
    {
      label: 'Perda técnica',
      valor: volume(r.perdaMl),
      hint: `${pct(r.perdaPct)} do envasado · parâmetro ${pct(parametros.perdaPct)}`,
      tom: r.perdaPct <= parametros.perdaPct ? 'ok' : 'erro',
    },
    {
      label: 'Ajustes de estoque',
      valor: volume(r.ajustesMl),
      // Ajuste não é uma categoria só: a referência diz de onde veio cada um.
      hint: `${plural(r.encerramentosDeLote, 'encerramento de lote', 'encerramentos de lote')} · ${
        r.divergenciasDeContagem
          ? plural(r.divergenciasDeContagem, 'divergência de contagem', 'divergências de contagem')
          : 'nenhuma divergência de contagem'
      }`,
      tom: 'erro',
    },
  ]

  const colunas: Coluna<Movimentacao>[] = [
    {
      chave: 'data',
      titulo: 'Data',
      largura: '104px',
      render: (m) => (
        <Valor tamanho={11} peso={400} tom="var(--color-terciario)">
          {m.data}
        </Valor>
      ),
    },
    {
      chave: 'tipo',
      titulo: 'Tipo',
      largura: '104px',
      render: (m) => (
        <span
          className="font-sans"
          style={{
            fontWeight: 600,
            fontSize: 9.5,
            lineHeight: 1,
            letterSpacing: '.07em',
            textTransform: 'uppercase',
            color: COR[TOM[m.tipo]],
            border: `1px solid ${COR[TOM[m.tipo]]}`,
            borderRadius: 'var(--radius-pill)',
            padding: '4px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          {ROTULO[m.tipo]}
        </span>
      ),
    },
    {
      chave: 'base',
      titulo: 'Perfume base',
      largura: '168px',
      render: (m) => (
        <span
          className="font-sans"
          style={{
            fontWeight: 600,
            fontSize: 12,
            lineHeight: 1.3,
            color: 'var(--color-corrente)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {m.perfume}
        </span>
      ),
    },
    {
      chave: 'motivo',
      titulo: 'Motivo',
      largura: 'minmax(0,1fr)',
      render: (m) => {
        const origem = origemDoAjuste(m)
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span
              className="font-sans"
              style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--color-secundario)', textWrap: 'pretty' }}
            >
              {m.motivo}
              {/* Saída informa o líquido envasado; a perda é a diferença. */}
              {m.tipo === 'saida' && m.liquidoMl !== null && (
                <span style={{ color: 'var(--color-terciario)' }}>
                  {` · ${volume(m.liquidoMl)} envasados`}
                </span>
              )}
            </span>
            <span
              className="font-mono"
              style={{ fontSize: 10, lineHeight: 1.25, color: 'rgba(239,209,140,.5)' }}
            >
              {m.ref}
              {origem === 'encerramento-lote' && ' · encerramento de lote'}
              {origem === 'divergencia-contagem' && ' · divergência de contagem'}
            </span>
          </span>
        )
      },
    },
    {
      chave: 'volume',
      titulo: 'Volume',
      largura: '116px',
      alinhamento: 'right',
      render: (m) => (
        <Valor
          tamanho={12.5}
          tom={m.volumeMl > 0 ? 'ok' : m.tipo === 'ajuste' ? 'erro' : 'var(--color-corrente)'}
        >
          {`${m.volumeMl > 0 ? '+' : '−'} ${volume(Math.abs(m.volumeMl))}`}
        </Valor>
      ),
    },
    {
      chave: 'saldo',
      titulo: 'Saldo',
      largura: '108px',
      alinhamento: 'right',
      render: (m) => (
        <Valor tamanho={11.5} peso={400} tom="var(--color-secundario)">
          {volume(m.saldoMl)}
        </Valor>
      ),
    },
    {
      chave: 'responsavel',
      titulo: 'Responsável',
      largura: '112px',
      render: (m) => (
        <span
          className="font-sans"
          style={{
            fontWeight: 500,
            fontSize: 11,
            lineHeight: 1.3,
            color: 'rgba(242,237,227,.66)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {m.responsavel}
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Histórico de movimentações</TituloSecao>
        <div style={{ flex: 1 }} />
        <BotaoOuro altura={34}>+ Nova movimentação</BotaoOuro>
      </div>

      <Tabela
        colunas={colunas}
        itens={movs}
        chaveDe={(m) => m.id}
        bandeiraDe={(m) => (m.tipo === 'ajuste' ? 'erro' : null)}
      />
    </div>
  )
}
