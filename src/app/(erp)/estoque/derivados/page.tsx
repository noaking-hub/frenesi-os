import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { TituloSecao, Valor } from '@/components/erp/primitivos'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { repositorio } from '@/data/repository'
import { apurarDerivado, brl, frascoDe, pad2, plural, volume } from '@/domain'
import type { LinhaDerivado } from '@/domain'

const TOM: Record<LinhaDerivado['estado'], Tom> = {
  'Tudo reservado': 'erro',
  'Últimas unidades': 'atencao',
  Disponível: 'ok',
}

export default async function ProdutosDerivados() {
  const repo = repositorio()
  const [bases, derivados] = await Promise.all([
    repo.perfumesBase(),
    repo.produtosDerivados(),
  ])

  const linhas: LinhaDerivado[] = derivados
    .map((d) => {
      const base = bases.find((b) => b.id === d.baseId)
      return apurarDerivado(
        d.baseId,
        base?.nome ?? d.baseId,
        base?.marca ?? '',
        d.variante,
        d.envasadas,
        d.reservadas,
        d.precoPraticado,
      )
    })
    .sort((a, b) => a.perfume.localeCompare(b.perfume) || a.variante - b.variante)

  const envasadas = linhas.reduce((a, l) => a + l.envasadas, 0)
  const reservadas = linhas.reduce((a, l) => a + l.reservadas, 0)
  const volumeImobilizado = linhas.reduce((a, l) => a + l.volumeMl, 0)
  const valorVenda = linhas.reduce((a, l) => a + l.valorTotal, 0)

  const kpis: Kpi[] = [
    {
      label: 'Unidades envasadas',
      valor: String(envasadas),
      hint: `${linhas.length} combinações de base e variante`,
    },
    {
      label: 'Prontas para venda',
      valor: String(envasadas - reservadas),
      hint: 'Já etiquetadas e conferidas',
      tom: 'ok',
    },
    {
      label: 'Reservadas em pedidos',
      valor: String(reservadas),
      hint: 'Aguardando separação',
      tom: reservadas ? 'atencao' : 'ok',
    },
    {
      label: 'Valor a preço de venda',
      valor: brl(valorVenda),
      hint: 'Se tudo for vendido pelo preço atual',
      tom: 'ouro',
    },
    {
      label: 'Volume imobilizado',
      valor: volume(volumeImobilizado),
      hint: 'Já fracionado, fora do estoque de base',
      tom: 'info',
    },
  ]

  const colunas: Coluna<LinhaDerivado>[] = [
    {
      chave: 'perfume',
      titulo: 'Perfume',
      largura: 'minmax(0,1fr)',
      render: (d) => <CelulaDupla principal={d.perfume} secundaria={d.marca} />,
    },
    {
      chave: 'variante',
      titulo: 'Variante',
      largura: '116px',
      render: (d) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span
            className="font-sans"
            style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.25, color: 'var(--color-corrente)' }}
          >
            {`${d.variante} ml`}
          </span>
          <span
            className="font-sans"
            style={{ fontSize: 9.5, lineHeight: 1.25, color: 'rgba(242,237,227,.35)', whiteSpace: 'nowrap' }}
          >
            {`frasco ${frascoDe(d.variante)} ml`}
          </span>
        </span>
      ),
    },
    {
      chave: 'envasadas',
      titulo: 'Envasadas',
      largura: '92px',
      alinhamento: 'right',
      render: (d) => (
        <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.7)">
          {d.envasadas}
        </Valor>
      ),
    },
    {
      chave: 'reservadas',
      titulo: 'Reservadas',
      largura: '104px',
      alinhamento: 'right',
      render: (d) => (
        <Valor tamanho={12} peso={400} tom="var(--color-terciario)">
          {d.reservadas || '—'}
        </Valor>
      ),
    },
    {
      chave: 'disponivel',
      titulo: 'Disponível',
      largura: '104px',
      alinhamento: 'right',
      render: (d) => (
        <Valor tamanho={12.5} tom={TOM[d.estado]}>
          {d.disponiveis}
        </Valor>
      ),
    },
    {
      chave: 'volume',
      titulo: 'Volume',
      largura: '116px',
      alinhamento: 'right',
      render: (d) => (
        <Valor tamanho={11.5} peso={400} tom="var(--color-secundario)">
          {volume(d.volumeMl)}
        </Valor>
      ),
    },
    {
      chave: 'preco',
      titulo: 'Preço',
      largura: '120px',
      alinhamento: 'right',
      render: (d) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
          <Valor tamanho={12}>{brl(d.precoPraticado)}</Valor>
          <span
            className="font-mono"
            style={{ fontSize: 9.5, lineHeight: 1.25, color: 'rgba(242,237,227,.32)', whiteSpace: 'nowrap' }}
          >
            {`total ${brl(d.valorTotal)}`}
          </span>
        </span>
      ),
    },
    {
      chave: 'estado',
      titulo: 'Estado',
      largura: '128px',
      render: (d) => (
        <span
          className="font-sans"
          style={{
            fontWeight: 600,
            fontSize: 10,
            lineHeight: 1,
            letterSpacing: '.05em',
            textTransform: 'uppercase',
            color: COR[TOM[d.estado]],
            border: `1px solid ${COR[TOM[d.estado]]}`,
            borderRadius: 'var(--radius-pill)',
            padding: '4px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          {d.estado}
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Decants prontos por variante</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          {/* O caminho é de mão única: fracionou, saiu da base. */}
          Estas {plural(envasadas, 'unidade já saiu', 'unidades já saíram')} do volume de perfume
          base. O estoque de base só volta a subir com nova compra, nunca com o retorno de um decant.
        </span>
      </div>

      <Tabela
        colunas={colunas}
        itens={linhas}
        chaveDe={(d) => `${d.baseId}-${d.variante}`}
        bandeiraDe={(d) =>
          d.estado === 'Tudo reservado'
            ? 'erro'
            : d.estado === 'Últimas unidades'
              ? 'atencao'
              : null
        }
        rodape={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '13px 18px',
              borderTop: '1px solid rgba(255,255,255,.06)',
            }}
          >
            <span
              className="font-sans"
              style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--color-terciario)' }}
            >
              {`${pad2(linhas.filter((l) => l.disponiveis === 0).length)} combinações sem unidade disponível · ${volume(volumeImobilizado)} imobilizados`}
            </span>
          </div>
        }
      />
    </div>
  )
}
