import { Badge, BotaoOuro, TituloSecao, Valor } from '@/components/erp/primitivos'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import type { Tom } from '@/components/erp/tokens'
import { repositorio } from '@/data/repository'
import {
  VARIANTES,
  brl,
  calcularPreco,
  coberturaDe,
  margemDe,
  pct,
  volume,
} from '@/domain'
import type {
  CoberturaBase,
  ParametrosPrecificacao,
  PerfumeBase,
  ProdutoDerivado,
  VarianteMl,
} from '@/domain'

interface LinhaCatalogo {
  base: PerfumeBase
  cobertura: CoberturaBase
  unidades: number
  /** Margem média dos preços publicados, ponderada nada — média simples. */
  margemMedia: number | null
  status: string
  tom: Tom
}

/**
 * O status do catálogo é derivado, em ordem de urgência: esgotado bloqueia
 * pedidos; crítico é questão de dias; margem baixa corrói sem avisar; parado
 * prende capital; alto giro é informação de planejamento.
 */
function classificar(
  base: PerfumeBase,
  cobertura: CoberturaBase,
  margemMedia: number | null,
  p: ParametrosPrecificacao,
): { status: string; tom: Tom } {
  // Sem custo, toda margem calculada é mentira — este estado vem primeiro.
  if (base.custoPorMl === 0) return { status: 'Sem custo', tom: 'erro' }
  if (cobertura.criticidade === 'zero') return { status: 'Esgotado', tom: 'erro' }
  if (cobertura.criticidade === 'urgente' || cobertura.criticidade === 'atencao')
    return { status: 'Crítico', tom: 'atencao' }
  if (margemMedia !== null && margemMedia < p.margemAlvo - 5)
    return { status: 'Margem baixa', tom: 'atencao' }
  if (cobertura.criticidade === 'parado')
    return { status: `Parado ${cobertura.dias}d`, tom: 'info' }
  if (base.consumoDiarioMl >= 25) return { status: 'Alto giro', tom: 'ouro' }
  return { status: 'Ativo', tom: 'ok' }
}

export default async function Catalogo() {
  const repo = repositorio()
  const [bases, derivados, precos, parametros] = await Promise.all([
    repo.perfumesBase(),
    repo.produtosDerivados(),
    repo.precoPraticado(),
    repo.parametros(),
  ])

  const linhas: LinhaCatalogo[] = bases
    .map((base) => {
      const cobertura = coberturaDe(base)
      const unidades = derivados
        .filter((d) => d.baseId === base.id)
        .reduce((a, d: ProdutoDerivado) => a + d.envasadas, 0)

      // Margem média das variantes com preço publicado, pela mesma fórmula
      // da Precificação — nunca um percentual digitado. Sem custo cadastrado
      // não existe margem: mostrar um número aqui seria fantasia.
      const margens =
        base.custoPorMl > 0
          ? VARIANTES.map((v: VarianteMl) => {
              const preco = precos[base.id]?.[v]
              if (!preco) return null
              const c = calcularPreco(base.custoPorMl, v, parametros)
              return margemDe(preco, c.custoProduto, parametros)
            }).filter((m): m is number => m !== null)
          : []
      const margemMedia = margens.length
        ? margens.reduce((a, m) => a + m, 0) / margens.length
        : null

      return {
        base,
        cobertura,
        unidades,
        margemMedia,
        ...classificar(base, cobertura, margemMedia, parametros),
      }
    })
    .sort((a, b) => a.base.nome.localeCompare(b.base.nome))

  const colunas: Coluna<LinhaCatalogo>[] = [
    {
      chave: 'foto',
      titulo: '',
      largura: '46px',
      render: (l) =>
        l.base.imagemUrl ? (
          // Foto importada da Shopify junto com o catálogo.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={l.base.imagemUrl}
            alt=""
            loading="lazy"
            style={{
              width: 34,
              height: 44,
              borderRadius: 5,
              objectFit: 'cover',
              border: '1px solid var(--color-borda)',
              display: 'block',
              background: '#131214',
            }}
          />
        ) : (
          // Sem foto na loja — o slot diz o que vai ali.
          <span
            aria-hidden
            style={{
              width: 34,
              height: 44,
              borderRadius: 5,
              background:
                'repeating-linear-gradient(135deg,rgba(239,209,140,.14) 0 3px,rgba(239,209,140,.05) 3px 6px)',
              border: '1px solid var(--color-borda)',
              display: 'block',
            }}
          />
        ),
    },
    {
      chave: 'perfume',
      titulo: 'Perfume',
      largura: 'minmax(0,1fr)',
      render: (l) => <CelulaDupla principal={l.base.nome} secundaria={l.base.marca} />,
    },
    {
      chave: 'genero',
      titulo: 'Gênero',
      largura: '78px',
      render: (l) => (
        <span
          className="font-sans"
          style={{ fontWeight: 500, fontSize: 10.5, lineHeight: 1, color: 'var(--color-secundario)' }}
        >
          {l.base.genero ?? '—'}
        </span>
      ),
    },
    {
      chave: 'volume',
      titulo: 'Volume',
      largura: '92px',
      alinhamento: 'right',
      render: (l) => (
        <Valor
          tamanho={12}
          tom={l.tom === 'erro' ? 'erro' : l.tom === 'atencao' ? 'atencao' : 'var(--color-corrente)'}
        >
          {volume(l.base.volumeMl)}
        </Valor>
      ),
    },
    {
      chave: 'unidades',
      titulo: 'Unidades',
      largura: '96px',
      alinhamento: 'right',
      render: (l) => (
        <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.72)">
          {`${l.unidades} un`}
        </Valor>
      ),
    },
    {
      chave: 'custo',
      titulo: 'Custo/ml',
      largura: '92px',
      alinhamento: 'right',
      render: (l) => (
        <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.72)">
          {brl(l.base.custoPorMl)}
        </Valor>
      ),
    },
    {
      chave: 'margem',
      titulo: 'Margem',
      largura: '92px',
      alinhamento: 'right',
      render: (l) => (
        <Valor
          tamanho={12}
          tom={
            l.margemMedia === null
              ? 'var(--color-terciario)'
              : l.margemMedia >= 0 && l.margemMedia < 20
                ? 'atencao'
                : 'ok'
          }
        >
          {l.margemMedia === null ? '—' : pct(l.margemMedia, 0)}
        </Valor>
      ),
    },
    {
      chave: 'status',
      titulo: 'Status',
      largura: '116px',
      render: (l) => <Badge tom={l.tom}>{l.status}</Badge>,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Catálogo de perfumes base</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          Status derivado da cobertura de estoque e da margem dos preços publicados.
        </span>
        <div style={{ flex: 1 }} />
        <BotaoOuro altura={34}>+ Novo perfume base</BotaoOuro>
      </div>

      <Tabela
        colunas={colunas}
        itens={linhas}
        chaveDe={(l) => l.base.id}
        bandeiraDe={(l) => (l.tom === 'erro' ? 'erro' : l.tom === 'atencao' ? 'atencao' : null)}
      />
    </div>
  )
}
