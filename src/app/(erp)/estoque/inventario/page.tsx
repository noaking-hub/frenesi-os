import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { BotaoOuro, BotaoSecundario, TituloSecao, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { repositorio } from '@/data/repository'
import { apurarInventario, brl, pad2, plural, volume } from '@/domain'
import type { LinhaInventario } from '@/domain'

export default async function Inventario() {
  const repo = repositorio()
  const [contagens, bases] = await Promise.all([repo.inventario(), repo.perfumesBase()])
  const inv = apurarInventario(contagens)

  // Custo médio por ml ponderado pelo volume em estoque — não é constante.
  const volumeTotal = bases.reduce((a, b) => a + b.volumeMl, 0)
  const custoMedioPorMl = volumeTotal
    ? bases.reduce((a, b) => a + b.volumeMl * b.custoPorMl, 0) / volumeTotal
    : 0

  const kpis: Kpi[] = [
    {
      label: 'Bases contadas',
      valor: `${inv.contadas} de ${inv.total}`,
      hint: inv.pendentes
        ? `${plural(inv.pendentes, 'base ainda sem contagem', 'bases ainda sem contagem')}`
        : 'Contagem completa',
      tom: inv.pendentes ? 'atencao' : 'ok',
    },
    {
      label: 'Sem divergência',
      valor: pad2(inv.semDivergencia),
      hint: 'Sistema bate com o físico',
      tom: 'ok',
    },
    {
      label: 'Com divergência',
      valor: pad2(inv.divergentes),
      hint: inv.divergentes ? 'Precisa de ajuste no estoque' : 'Nada a ajustar',
      tom: inv.divergentes ? 'erro' : 'ok',
    },
    {
      label: 'Diferença líquida',
      valor: `${inv.diferencaLiquidaMl >= 0 ? '+' : '−'} ${volume(Math.abs(inv.diferencaLiquidaMl))}`,
      hint: 'Contado menos sistema',
      tom: inv.diferencaLiquidaMl === 0 ? 'ok' : 'erro',
    },
    {
      label: 'Impacto no custo',
      valor: brl(Math.abs(inv.diferencaLiquidaMl) * custoMedioPorMl),
      hint: `Pelo custo médio de ${brl(custoMedioPorMl)}/ml`,
      tom: inv.diferencaLiquidaMl === 0 ? 'ok' : 'erro',
    },
  ]

  const colunas: Coluna<LinhaInventario>[] = [
    {
      chave: 'perfume',
      titulo: 'Perfume base',
      largura: 'minmax(0,1fr)',
      render: (i) => (
        <span
          className="font-sans"
          style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.3, color: 'var(--color-corrente)' }}
        >
          {i.perfume}
        </span>
      ),
    },
    {
      chave: 'sistema',
      titulo: 'Sistema',
      largura: '128px',
      alinhamento: 'right',
      render: (i) => (
        <Valor tamanho={12} peso={400} tom="var(--color-secundario)">
          {volume(i.sistemaMl)}
        </Valor>
      ),
    },
    {
      chave: 'contado',
      titulo: 'Contado',
      largura: '128px',
      alinhamento: 'right',
      // Não contado é diferente de contado zero — por isso o travessão.
      render: (i) => <Valor tamanho={12}>{i.contado ? volume(i.contadoMl!) : '—'}</Valor>,
    },
    {
      chave: 'diferenca',
      titulo: 'Diferença',
      largura: '148px',
      alinhamento: 'right',
      render: (i) => (
        <Valor
          tamanho={12}
          tom={!i.contado ? 'var(--color-apagado)' : i.divergente ? 'erro' : 'ok'}
        >
          {!i.contado
            ? '—'
            : i.diferencaMl === 0
              ? 'sem diferença'
              : `${i.diferencaMl > 0 ? '+' : '−'} ${volume(Math.abs(i.diferencaMl))}`}
        </Valor>
      ),
    },
    {
      chave: 'responsavel',
      titulo: 'Responsável',
      largura: '168px',
      render: (i) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span
            className="font-sans"
            style={{
              fontWeight: 500,
              fontSize: 11,
              lineHeight: 1.3,
              color: i.contado ? 'rgba(242,237,227,.66)' : 'var(--color-atencao)',
            }}
          >
            {i.responsavel ?? 'Não contado'}
          </span>
          <span
            className="font-mono"
            style={{ fontSize: 10, lineHeight: 1.25, color: 'rgba(242,237,227,.32)' }}
          >
            {i.quando ?? 'pendente'}
          </span>
        </span>
      ),
    },
    {
      chave: 'acao',
      titulo: 'Ação',
      largura: '116px',
      // A linha não é clicável aqui, então isto é um botão de verdade —
      // alcançável por teclado, não um span com cara de botão.
      render: (i) =>
        i.divergente ? (
          <button
            type="button"
            aria-label={`Ajustar ${i.perfume} em ${volume(Math.abs(i.diferencaMl))}`}
            className="font-sans hover:bg-[rgba(239,209,140,.16)]"
            style={{
              height: 27,
              padding: '0 11px',
              border: '1px solid rgba(239,209,140,.28)',
              background: 'rgba(239,209,140,.07)',
              color: 'var(--color-ouro)',
              fontWeight: 600,
              fontSize: 10.5,
              lineHeight: 1,
              borderRadius: 7,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Ajustar
          </button>
        ) : null,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Contagem em andamento</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          {/* Diz de antemão o que o botão vai fazer, com o número exato. */}
          {inv.divergentes
            ? `Confirmar o inventário lança ${plural(inv.divergentes, 'ajuste', 'ajustes')} em Movimentações, com o motivo “Inventário · divergência encontrada”.`
            : 'Nenhuma divergência a ajustar nesta contagem.'}
        </span>
        <div style={{ flex: 1 }} />
        <BotaoSecundario altura={34}>Exportar folha de contagem</BotaoSecundario>
        <BotaoOuro altura={34}>Confirmar inventário</BotaoOuro>
      </div>

      <Tabela
        colunas={colunas}
        itens={inv.linhas}
        chaveDe={(i) => i.baseId}
        bandeiraDe={(i) => (!i.contado ? 'atencao' : i.divergente ? 'erro' : null)}
      />
    </div>
  )
}
