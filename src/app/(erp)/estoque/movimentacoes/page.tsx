import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { TituloSecao, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { carregarLotes } from '@/data/consultas'
import { repositorio } from '@/data/repository'
import { origemDoAjuste, pct, plural, resumirMovimentacoes, volume } from '@/domain'
import type { Movimentacao, TipoMovimentacao } from '@/domain'

/**
 * Estoque nunca pode vir do cache do build.
 *
 * Sem isto a página é pré-renderizada no deploy e congela: reserva muda a
 * cada pedido pago, baixa muda a cada faturamento, e a tela mostraria o
 * saldo de horas atrás com cara de saldo atual.
 */
export const dynamic = 'force-dynamic'


const ROTULO: Record<TipoMovimentacao, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Ajuste',
  devolucao: 'Devolução',
  reserva: 'Reserva',
  liberacao: 'Liberação',
  perda: 'Perda',
  estorno: 'Estorno',
}

const TOM: Record<TipoMovimentacao, Tom> = {
  entrada: 'ok',
  saida: 'atencao',
  ajuste: 'erro',
  devolucao: 'info',
  // Reserva e liberação não mexem no líquido: tom neutro, para não competir
  // com o que realmente entrou ou saiu do frasco.
  reserva: 'info',
  liberacao: 'neutro',
  perda: 'erro',
  estorno: 'neutro',
}

export default async function Movimentacoes() {
  const repo = repositorio()
  const [movs, parametros, { perda }] = await Promise.all([
    repo.movimentacoes(),
    repo.parametros(),
    carregarLotes(),
  ])
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
      hint: 'Volume envasado nas ordens concluídas',
      tom: 'atencao',
    },
    {
      // A perda não sai daqui: produção baixa só o envasado. Quem a mede é o
      // encerramento do lote — e este KPI lê a MESMA conta da tela de Lotes,
      // em vez de uma segunda versão da mesma grandeza.
      label: 'Perda real medida',
      valor: pct(perda.mediaPct),
      hint: perda.lotesEncerrados
        ? `${plural(perda.lotesEncerrados, 'lote encerrado', 'lotes encerrados')} · parâmetro ${pct(parametros.perdaPct)}`
        : 'Nenhum lote encerrado ainda · só o frasco vazio mede a perda',
      tom: perda.lotesEncerrados === 0 ? 'neutro' : perda.mediaPct <= parametros.perdaPct ? 'ok' : 'erro',
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
      largura: 'minmax(0,1fr)',
      render: (m) => (
        <span
          className="font-sans"
          style={{
            display: 'block',
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
      largura: 'minmax(0,1.5fr)',
      render: (m) => {
        const origem = origemDoAjuste(m)
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span
              className="font-sans"
              style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--color-secundario)', textWrap: 'pretty' }}
            >
              {m.motivo}
              {/* Só vale dizer quando difere do volume: produção baixa o
                  envasado, então repetir o mesmo número seria ruído. */}
              {m.tipo === 'saida' &&
                m.liquidoMl !== null &&
                m.liquidoMl !== Math.abs(m.volumeMl) && (
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
          {m.tipo === 'reserva' || m.tipo === 'liberacao'
            ? // Reserva não tira líquido do frasco: mostrar "±0 ml" faria
              // parecer lançamento vazio. O que se move aqui é o comprometido.
              `${(m.reservaMl ?? 0) > 0 ? '+' : '−'} ${volume(Math.abs(m.reservaMl ?? 0))} reservados`
            : `${m.volumeMl > 0 ? '+' : '−'} ${volume(Math.abs(m.volumeMl))}`}
        </Valor>
      ),
    },
    {
      chave: 'saldo',
      titulo: 'Saldo',
      largura: '138px',
      alinhamento: 'right',
      // Antes e depois na mesma linha: é o que permite auditar sem refazer a
      // conta de cabeça, e o escopo pede os dois.
      render: (m) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
          <Valor tamanho={11.5} peso={400} tom="var(--color-secundario)">
            {m.saldoMl === null ? '—' : volume(m.saldoMl)}
          </Valor>
          {m.saldoAnteriorMl !== null && m.saldoAnteriorMl !== undefined && m.saldoMl !== null && (
            <span
              className="font-mono"
              style={{ fontSize: 9, lineHeight: 1.2, color: 'rgba(242,237,227,.3)', whiteSpace: 'nowrap' }}
            >
              {`antes ${volume(m.saldoAnteriorMl)}`}
            </span>
          )}
          {(m.tipo === 'reserva' || m.tipo === 'liberacao') &&
            m.saldoReservadoMl !== null &&
            m.saldoReservadoMl !== undefined && (
              <span
                className="font-mono"
                style={{ fontSize: 9, lineHeight: 1.2, color: 'rgba(242,237,227,.38)', whiteSpace: 'nowrap' }}
              >
                {`reservado ${volume(m.saldoReservadoMl)}`}
              </span>
            )}
        </span>
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
            display: 'block',
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
        {/* Não existe movimentação avulsa: cada linha aqui é o rastro de uma
            ação feita em outra tela. Um botão de lançar à mão quebraria o
            "uma ação, um lançamento" que sustenta a apuração. */}
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          Toda linha nasce de uma ação: compra e encerramento em Lotes, envase em Produção,
          divergência em Inventário.
        </span>
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
