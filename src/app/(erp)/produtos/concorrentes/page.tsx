import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { EstadoVazio, TituloSecao, Valor } from '@/components/erp/primitivos'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { repositorio } from '@/data/repository'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { VARIANTES, analisarMercado, brl, pad2, pct } from '@/domain'
import type { AnaliseMercado } from '@/domain'

import { FontesCliente, type TituloSemDono } from './FontesCliente'

const TOM_REC: Record<AnaliseMercado['recomendacao'], Tom> = {
  baixar: 'ouro',
  subir: 'erro',
  'manter-ideal': 'atencao',
  saudavel: 'ok',
}

/**
 * Títulos lidos que o casamento automático recusou.
 *
 * Vêm para a tela porque escondê-los faria a comparação parecer completa
 * quando falta metade — e é sobre ela que o preço de venda é decidido.
 */
async function lerSemDono(): Promise<TituloSemDono[]> {
  if (!supabaseConfigurado()) return []
  const { data, error } = await supabaseServer()
    .from('concorrente_precos')
    .select('titulo, preco, variante, concorrentes(nome)')
    .is('base_id', null)
    .order('titulo')
    .limit(200)
  if (error) throw error
  return (
    (data ?? []) as unknown as {
      titulo: string
      preco: number | string
      variante: number | null
      concorrentes: { nome: string } | null
    }[]
  ).map((l) => ({
    titulo: l.titulo,
    preco: Number(l.preco),
    variante: l.variante,
    fonte: l.concorrentes?.nome ?? '—',
  }))
}

export default async function Concorrentes() {
  const repo = repositorio()
  const [bases, mercado, precos, parametros, fontes, semDono] = await Promise.all([
    repo.perfumesBase(),
    repo.mercado(),
    repo.precoPraticado(),
    repo.parametros(),
    repo.concorrentesFontes(),
    lerSemDono(),
  ])

  // Todas as variantes, não só 5 e 10 ml: o concorrente pode estar barato
  // justamente na que ficava de fora da comparação.
  const linhas: AnaliseMercado[] = bases.flatMap((base) =>
    VARIANTES.flatMap((v) => {
      const precosConc = mercado[base.id]?.[v]
      const nosso = precos[base.id]?.[v]
      if (!precosConc?.length || !nosso) return []
      return [analisarMercado(base, v, precosConc, nosso, parametros)]
    }),
  )

  const acima = linhas.filter((l) => l.posicao === 'acima')
  const abaixoIdeal = linhas.filter((l) => l.abaixoIdeal)
  const oportunidades = linhas.filter((l) => l.oportunidade)
  const lendo = fontes.filter((f) => f.status === 'lida' || f.status === 'parcial')

  const kpis: Kpi[] = [
    {
      label: 'Concorrentes monitorados',
      valor: String(fontes.length),
      hint: `${lendo.length} com leitura automática`,
    },
    {
      label: 'Produtos comparados',
      valor: String(linhas.length),
      hint: semDono.length
        ? `${semDono.length} preços lidos ainda sem dono`
        : 'Cruzamentos com preço nosso e do mercado',
      tom: semDono.length ? 'atencao' : 'neutro',
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
      <FontesCliente fontes={fontes} bases={bases} semDono={semDono} variantes={VARIANTES} />

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
      </div>

      {linhas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum produto comparado ainda"
          instrucao="A comparação precisa de duas pontas: um preço seu publicado e ao menos um preço de concorrente casado com o mesmo perfume. Vasculhe as lojas acima ou lance um preço à mão para a primeira linha aparecer."
        />
      ) : (
        <Tabela
          colunas={colunas}
          itens={linhas}
          chaveDe={(m) => `${m.base.id}-${m.variante}`}
          bandeiraDe={(m) => (TOM_REC[m.recomendacao] === 'ok' ? null : TOM_REC[m.recomendacao])}
        />
      )}
    </div>
  )
}
