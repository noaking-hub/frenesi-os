import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { BotaoOuro, BotaoSecundario, TituloSecao, Valor } from '@/components/erp/primitivos'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { repositorio } from '@/data/repository'
import { analisarMercado, brl, pad2, pct } from '@/domain'
import type { AnaliseMercado, FonteConcorrente, VarianteMl } from '@/domain'

const TOM_REC: Record<AnaliseMercado['recomendacao'], Tom> = {
  baixar: 'ouro',
  subir: 'erro',
  'manter-ideal': 'atencao',
  saudavel: 'ok',
}

const TOM_FONTE: Record<FonteConcorrente['status'], Tom> = {
  Lida: 'ok',
  Parcial: 'atencao',
  Bloqueada: 'erro',
}

const VARIANTES_COMPARADAS: VarianteMl[] = [5, 10]

export default async function Concorrentes() {
  const repo = repositorio()
  const [bases, mercado, precos, parametros, fontes] = await Promise.all([
    repo.perfumesBase(),
    repo.mercado(),
    repo.precoPraticado(),
    repo.parametros(),
    repo.concorrentesFontes(),
  ])

  const linhas: AnaliseMercado[] = bases.flatMap((base) =>
    VARIANTES_COMPARADAS.flatMap((v) => {
      const precosConc = mercado[base.id]?.[v]
      const nosso = precos[base.id]?.[v]
      if (!precosConc?.length || !nosso) return []
      return [analisarMercado(base, v, precosConc, nosso, parametros)]
    }),
  )

  const acima = linhas.filter((l) => l.posicao === 'acima')
  const abaixoIdeal = linhas.filter((l) => l.abaixoIdeal)
  const oportunidades = linhas.filter((l) => l.oportunidade)
  const lendo = fontes.filter((f) => f.status === 'Lida')

  const kpis: Kpi[] = [
    {
      label: 'Concorrentes monitorados',
      valor: String(fontes.length),
      hint: `${lendo.length} com leitura automática`,
    },
    {
      label: 'Produtos comparados',
      valor: String(linhas.length),
      hint: 'Variantes de 5 e 10 ml',
    },
    {
      label: 'Acima do mercado',
      valor: pad2(acima.length),
      hint: 'Preço nosso maior que todos',
      tom: acima.length ? 'atencao' : 'ok',
    },
    {
      label: 'Abaixo do ideal',
      valor: pad2(abaixoIdeal.length),
      hint: 'Vendendo com margem menor que a alvo',
      tom: abaixoIdeal.length ? 'erro' : 'ok',
    },
    {
      label: 'Oportunidades',
      valor: pad2(oportunidades.length),
      hint: 'Cabe subir preço mantendo o menor do mercado',
      tom: 'ouro',
    },
  ]

  const colunas: Coluna<AnaliseMercado>[] = [
    {
      chave: 'produto',
      titulo: 'Produto',
      largura: 'minmax(0,1.1fr)',
      render: (m) => (
        <CelulaDupla principal={`${m.base.nome} · ${m.variante} ml`} secundaria={m.base.marca} />
      ),
    },
    {
      chave: 'nosso',
      titulo: 'Nosso',
      largura: '92px',
      alinhamento: 'right',
      render: (m) => <Valor tamanho={12.5}>{brl(m.nosso)}</Valor>,
    },
    {
      chave: 'margem',
      titulo: 'Margem',
      largura: '96px',
      alinhamento: 'right',
      render: (m) => (
        <Valor
          tamanho={12}
          tom={
            m.nossaMargem >= parametros.margemAlvo - 0.5
              ? 'ok'
              : m.nossaMargem >= parametros.margemAlvo - 5
                ? 'atencao'
                : 'erro'
          }
        >
          {pct(m.nossaMargem)}
        </Valor>
      ),
    },
    {
      chave: 'concorrentes',
      titulo: 'Concorrentes',
      largura: '240px',
      render: (m) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {m.precos.map((p, i) => (
            <span
              key={i}
              className="font-mono"
              style={{
                fontSize: 11.5,
                lineHeight: 1.3,
                // Vermelho quando o concorrente está mais barato que a gente.
                color: p < m.nosso ? COR.erro : 'rgba(242,237,227,.7)',
                whiteSpace: 'nowrap',
              }}
            >
              {brl(p)}
            </span>
          ))}
        </span>
      ),
    },
    {
      chave: 'menor',
      titulo: 'Menor',
      largura: '96px',
      alinhamento: 'right',
      render: (m) => (
        <Valor
          tamanho={12}
          tom={m.posicao === 'acima' ? 'atencao' : m.posicao === 'menor-preco' ? 'ok' : 'info'}
        >
          {brl(m.menor)}
        </Valor>
      ),
    },
    {
      chave: 'ideal',
      titulo: 'Ideal',
      largura: '96px',
      alinhamento: 'right',
      render: (m) => (
        <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.6)">
          {brl(m.ideal)}
        </Valor>
      ),
    },
    {
      chave: 'recomendacao',
      titulo: 'Recomendação',
      largura: 'minmax(0,1.3fr)',
      render: (m) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span
            className="font-sans"
            style={{
              fontWeight: 500,
              fontSize: 11,
              lineHeight: 1.4,
              color: COR[TOM_REC[m.recomendacao]],
              textWrap: 'pretty',
            }}
          >
            {m.frase}
          </span>
          <span
            className="font-sans"
            style={{ fontSize: 10, lineHeight: 1.25, color: 'rgba(242,237,227,.35)' }}
          >
            {`Preço recomendado ${brl(m.precoRecomendado)}`}
          </span>
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {fontes.map((f) => (
          <div
            key={f.dominio}
            style={{
              background: 'linear-gradient(150deg,#16151A,#101011)',
              border: `1px solid ${
                f.status === 'Bloqueada'
                  ? 'rgba(194,90,80,.28)'
                  : f.status === 'Parcial'
                    ? 'rgba(217,140,63,.22)'
                    : 'rgba(92,158,112,.22)'
              }`,
              borderRadius: 'var(--radius-card)',
              padding: '15px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 9,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span
                className="font-sans"
                style={{
                  fontWeight: 600,
                  fontSize: 12.5,
                  lineHeight: 1.25,
                  color: 'var(--color-corrente)',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {f.nome}
              </span>
              <span
                className="font-sans"
                style={{
                  fontWeight: 600,
                  fontSize: 9,
                  lineHeight: 1,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  color: COR[TOM_FONTE[f.status]],
                  border: `1px solid ${COR[TOM_FONTE[f.status]]}`,
                  borderRadius: 'var(--radius-pill)',
                  padding: '3px 7px',
                  whiteSpace: 'nowrap',
                }}
              >
                {f.status}
              </span>
            </div>
            <span
              className="font-mono"
              style={{
                fontSize: 10.5,
                lineHeight: 1,
                color: 'rgba(239,209,140,.6)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {f.dominio}
            </span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span
                className="font-sans"
                style={{ fontWeight: 500, fontSize: 11.5, lineHeight: 1.3, color: 'var(--color-secundario)' }}
              >
                {f.itensLidos ? `${f.itensLidos} preços lidos` : 'Nenhum preço lido'}
              </span>
              <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.3, color: 'rgba(242,237,227,.35)' }}>
                {f.quando}
              </span>
            </span>
            <span
              className="font-sans"
              style={{ fontSize: 10, lineHeight: 1.4, color: 'var(--color-terciario)' }}
            >
              {f.status === 'Bloqueada'
                ? 'Bloqueio por robô · leitura manual necessária'
                : f.status === 'Parcial'
                  ? 'Algumas páginas sem preço estruturado'
                  : 'Leitura automática a cada 12h'}
            </span>
          </div>
        ))}
      </div>

      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Comparativo de preços</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          {/* A regra que manda na recomendação, dita de frente. */}
          Nenhuma recomendação fura o piso de margem de {pct(Math.max(0, parametros.margemAlvo - 10), 0)}.
        </span>
        <div style={{ flex: 1 }} />
        <BotaoSecundario altura={34}>+ Adicionar concorrente</BotaoSecundario>
        <BotaoOuro altura={34}>Vasculhar preços agora</BotaoOuro>
      </div>

      <Tabela
        colunas={colunas}
        itens={linhas}
        chaveDe={(m) => `${m.base.id}-${m.variante}`}
        bandeiraDe={(m) => TOM_REC[m.recomendacao] === 'ok' ? null : TOM_REC[m.recomendacao]}
      />
    </div>
  )
}
