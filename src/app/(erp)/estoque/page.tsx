import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Barra, BotaoOuro, BotaoSecundario, TituloSecao, Valor } from '@/components/erp/primitivos'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import type { Tom } from '@/components/erp/tokens'
import { carregarEstoque } from '@/data/consultas'
import { brl, pad2, volume } from '@/domain'
import type { CoberturaBase } from '@/domain'

const TOM: Record<CoberturaBase['criticidade'], Tom> = {
  zero: 'erro',
  urgente: 'erro',
  atencao: 'atencao',
  parado: 'neutro',
  ok: 'ok',
}

export default async function PerfumesBase() {
  const { coberturas, volumeTotalMl, comEstoque, esgotados, criticos, valorReposicao } =
    await carregarEstoque()

  const kpis: Kpi[] = [
    {
      label: 'Volume total',
      valor: volume(volumeTotalMl),
      hint: `${coberturas.length} perfumes base`,
    },
    {
      label: 'Com estoque',
      valor: pad2(comEstoque),
      hint: esgotados ? `${esgotados} esgotado` : 'Nenhum esgotado',
    },
    {
      label: 'Estoque crítico',
      valor: pad2(criticos),
      hint: 'Menos de 20 dias de cobertura',
      tom: criticos ? 'atencao' : 'ok',
    },
    {
      label: 'Esgotados',
      valor: pad2(esgotados),
      hint: esgotados
        ? 'Nenhuma variante pode ser fracionada'
        : 'Todas as bases têm volume',
      tom: esgotados ? 'erro' : 'ok',
    },
    {
      label: 'Valor em estoque',
      valor: brl(valorReposicao),
      hint: 'Custo de reposição do volume atual',
      tom: 'ouro',
    },
  ]

  const colunas: Coluna<CoberturaBase>[] = [
    {
      chave: 'perfume',
      titulo: 'Perfume base',
      largura: 'minmax(0,1fr)',
      render: (c) => <CelulaDupla principal={c.base.nome} secundaria={c.base.marca} />,
    },
    {
      chave: 'disponivel',
      titulo: 'Disponível',
      largura: '118px',
      alinhamento: 'right',
      render: (c) => (
        <Valor tamanho={12.5} tom={TOM[c.criticidade]}>
          {volume(c.base.volumeMl)}
        </Valor>
      ),
    },
    {
      chave: 'consumo',
      titulo: 'Consumo 30d',
      largura: '118px',
      alinhamento: 'right',
      // Derivado do consumo diário, não um campo à parte.
      render: (c) => (
        <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.65)">
          {volume(c.base.consumoDiarioMl * 30)}
        </Valor>
      ),
    },
    {
      chave: 'acaba',
      titulo: 'Acaba em',
      largura: '140px',
      render: (c) => (
        <span
          style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}
        >
          <Valor tamanho={11.5} tom={TOM[c.criticidade]}>
            {c.cobertura}
          </Valor>
          {/* 60 dias é a régua: o que passa disso enche a barra. */}
          <span style={{ width: '100%' }}>
            <Barra pct={Math.min(100, (c.dias / 60) * 100)} tom={TOM[c.criticidade]} />
          </span>
        </span>
      ),
    },
    {
      chave: 'acao',
      titulo: 'Ação recomendada',
      largura: 'minmax(0,1fr)',
      render: (c) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className="font-sans"
            style={{ fontSize: 11.5, lineHeight: 1.3, color: 'var(--color-secundario)', flex: 1 }}
          >
            {c.acao}
          </span>
          <button
            type="button"
            className="font-sans hover:bg-[rgba(239,209,140,.13)]"
            style={{
              height: 28,
              padding: '0 11px',
              border: '1px solid rgba(239,209,140,.22)',
              background: 'rgba(239,209,140,.05)',
              color: 'var(--color-ouro)',
              fontWeight: 600,
              fontSize: 10.5,
              borderRadius: 7,
              cursor: 'pointer',
              flex: 'none',
            }}
          >
            {c.cta}
          </button>
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Perfumes base · quando o estoque acaba</TituloSecao>
        <div style={{ flex: 1 }} />
        <BotaoSecundario altura={34}>Movimentar estoque</BotaoSecundario>
        <BotaoOuro altura={34}>Nova ordem de produção</BotaoOuro>
      </div>

      <Tabela
        colunas={colunas}
        itens={coberturas}
        chaveDe={(c) => c.base.id}
        bandeiraDe={(c) =>
          c.criticidade === 'zero' || c.criticidade === 'urgente'
            ? 'erro'
            : c.criticidade === 'atencao'
              ? 'atencao'
              : null
        }
      />
    </div>
  )
}
