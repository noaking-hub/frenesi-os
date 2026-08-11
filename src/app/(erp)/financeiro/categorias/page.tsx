import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Barra, BotaoSecundario, TituloSecao, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { repositorio } from '@/data/repository'

import { NovaCategoria } from '../Widgets'
import { brl, num, participacaoCategoria, plural, resumirCategorias } from '@/domain'
import type { CategoriaFinanceira, NaturezaCategoria } from '@/domain'

const TOM_NATUREZA: Record<NaturezaCategoria, string> = {
  Receita: COR.ok,
  'Custo variável': COR.atencao,
  'Despesa fixa': COR.info,
  Despesa: 'rgba(242,237,227,.5)',
}

export default async function Categorias() {
  const categorias = await repositorio().categorias()
  const r = resumirCategorias(categorias)

  const ordenadas = [...categorias].sort((a, b) => b.valorMes - a.valorMes)
  const maior = ordenadas[0]

  const kpis: Kpi[] = [
    {
      label: 'Categorias em uso',
      valor: String(categorias.length),
      hint: `${r.variaveis} variáveis · ${r.fixas} fixas · ${r.despesas} despesas`,
    },
    {
      label: 'Total classificado',
      valor: brl(r.total),
      hint: 'Custos e despesas de julho',
    },
    {
      label: 'Maior categoria',
      valor: maior.nome,
      hint: `${num(Math.round(participacaoCategoria(maior, categorias) * 10) / 10)}% do total · ${brl(maior.valorMes)}`,
      tom: 'erro',
    },
    {
      label: 'Estrutura fixa mensal',
      valor: brl(r.estruturaFixa),
      hint: 'Base do ponto de equilíbrio no DRE',
      tom: 'atencao',
    },
    {
      label: 'Lançamentos no mês',
      valor: String(r.totalLancamentos),
      hint: `Média de ${brl(r.total / r.totalLancamentos)} por lançamento`,
      tom: 'neutro',
    },
  ]

  const colunas: Coluna<CategoriaFinanceira>[] = [
    {
      chave: 'nome',
      titulo: 'Categoria',
      largura: 'minmax(0,1fr)',
      render: (c) => (
        <span
          className="font-sans"
          style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.3, color: 'var(--color-corrente)' }}
        >
          {c.nome}
        </span>
      ),
    },
    {
      chave: 'natureza',
      titulo: 'Natureza',
      largura: '152px',
      render: (c) => (
        <span
          className="font-sans"
          style={{
            fontWeight: 500,
            fontSize: 10.5,
            lineHeight: 1.3,
            color: TOM_NATUREZA[c.natureza],
            whiteSpace: 'nowrap',
          }}
        >
          {c.natureza}
        </span>
      ),
    },
    {
      chave: 'peso',
      titulo: 'Peso',
      largura: 'minmax(0,1.1fr)',
      render: (c) => {
        const part = participacaoCategoria(c, categorias)
        const tom: Tom = part >= 30 ? 'erro' : part >= 10 ? 'atencao' : 'neutro'
        // ×2,2 para a maior categoria (~41%) quase encher a barra, como no handoff.
        return <Barra pct={part * 2.2} tom={tom} altura={6} />
      },
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      largura: '132px',
      alinhamento: 'right',
      render: (c) => <Valor tamanho={12.5}>{brl(c.valorMes)}</Valor>,
    },
    {
      chave: 'part',
      titulo: '%',
      largura: '76px',
      alinhamento: 'right',
      render: (c) => (
        <Valor tamanho={11.5} peso={400} tom="var(--color-terciario)">
          {`${num(Math.round(participacaoCategoria(c, categorias) * 10) / 10)}%`}
        </Valor>
      ),
    },
    {
      chave: 'lanc',
      titulo: 'Lançamentos',
      largura: '132px',
      alinhamento: 'right',
      render: (c) => (
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.3, color: 'var(--color-terciario)', whiteSpace: 'nowrap' }}
        >
          {plural(c.lancamentos, 'lançamento', 'lançamentos')}
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Para onde vai o dinheiro · julho</TituloSecao>
        <div style={{ flex: 1 }} />
        <NovaCategoria />
      </div>

      <Tabela colunas={colunas} itens={ordenadas} chaveDe={(c) => c.nome} />
    </div>
  )
}
