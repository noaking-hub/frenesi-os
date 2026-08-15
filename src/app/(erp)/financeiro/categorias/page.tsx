import { Cartao, CabecalhoCartao, VazioInterno } from '@/components/erp/Cartao'
import { BarraProporcao, PALETA_CATEGORIA } from '@/components/erp/Graficos'
import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, EstadoVazio, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { lerRegrasCategoria } from '@/data/extrato'
import { lerCategorias, lerCentrosCusto, lerLancamentos } from '@/data/financeiro'
import {
  brl,
  competenciaPorExtenso,
  ehSaida,
  impactaResultado,
  plural,
  ROTULO_NATUREZA,
} from '@/domain'
import type { CategoriaGerencial, NaturezaGerencial } from '@/domain'

import { EditarCategoria, NovaCategoria } from './Editor'
import { RegrasCategoria } from './Regras'

/**
 * Categorias — o plano de contas gerencial.
 *
 * É a tela mais consequente do módulo e a que menos parece: a natureza que
 * se escolhe aqui decide em qual linha da DRE cada pagamento cai. "Compra de
 * perfume" cadastrada como despesa administrativa não muda o resultado final
 * do mês, mas destrói a margem de contribuição — e é ela que diz se vender
 * mais melhora ou piora a situação.
 */
export const dynamic = 'force-dynamic'

const TOM_NATUREZA: Record<NaturezaGerencial, Tom> = {
  receita_operacional: 'ok',
  deducao_receita: 'atencao',
  cmv: 'atencao',
  despesa_fixa: 'info',
  despesa_comercial: 'info',
  despesa_administrativa: 'neutro',
  despesa_financeira: 'erro',
  investimento: 'ouro',
  transferencia: 'neutro',
  aporte_retirada: 'ouro',
}

export default async function Categorias() {
  const [categorias, centros, lancamentos, regras] = await Promise.all([
    lerCategorias(),
    lerCentrosCusto(),
    lerLancamentos(),
    lerRegrasCategoria(),
  ])

  if (categorias.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <EstadoVazio
          titulo="Nenhuma categoria cadastrada"
          instrucao="Sem categoria, nenhum lançamento entra na DRE. Crie ao menos uma de receita e uma de custo variável."
        />
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <NovaCategoria centros={centros} />
        </div>
      </div>
    )
  }

  const competencia = new Date().toISOString().slice(0, 7)
  const doMes = lancamentos.filter(
    (l) => !l.canceladoEm && l.competencia.slice(0, 7) === competencia,
  )

  const valorPorCategoria = new Map<string, number>()
  for (const l of doMes) {
    if (!l.categoriaId) continue
    valorPorCategoria.set(l.categoriaId, (valorPorCategoria.get(l.categoriaId) ?? 0) + l.valor)
  }

  const enriquecidas = categorias
    .map((c) => ({ c, valorMes: valorPorCategoria.get(c.id) ?? 0 }))
    .sort((a, b) => b.valorMes - a.valorMes || a.c.nome.localeCompare(b.c.nome))

  const estruturaFixa = enriquecidas
    .filter(({ c }) => c.natureza === 'despesa_fixa')
    .reduce((a, x) => a + x.valorMes, 0)
  const custoVariavel = enriquecidas
    .filter(({ c }) => c.natureza === 'cmv')
    .reduce((a, x) => a + x.valorMes, 0)
  const totalSaidas = enriquecidas
    .filter(({ c }) => ehSaida(c.natureza))
    .reduce((a, x) => a + x.valorMes, 0)

  const semLigacao = lancamentos.filter((l) => !l.canceladoEm && !l.categoriaId).length
  const foraDaDre = categorias.filter((c) => !impactaResultado(c.natureza) || !c.impactaDre).length
  const maiorValor = Math.max(1, ...enriquecidas.map((x) => x.valorMes))

  const kpis: Kpi[] = [
    {
      label: 'Categorias ativas',
      valor: String(categorias.filter((c) => c.ativa).length).padStart(2, '0'),
      hint: `${categorias.length - categorias.filter((c) => c.ativa).length} inativa(s) preservando histórico`,
    },
    {
      label: 'Custo variável no mês',
      valor: brl(custoVariavel),
      hint: 'CMV — o que varia com a venda e entra na margem de contribuição',
      tom: 'atencao',
    },
    {
      label: 'Estrutura fixa no mês',
      valor: brl(estruturaFixa),
      hint: 'Base do ponto de equilíbrio na DRE',
      tom: 'info',
    },
    {
      label: 'Total classificado',
      valor: brl(totalSaidas),
      hint: `Custos e despesas de ${competenciaPorExtenso(competencia)}`,
    },
    {
      label: 'Fora do resultado',
      valor: String(foraDaDre).padStart(2, '0'),
      hint: 'Transferência, investimento e aporte — movem caixa sem virar resultado',
      tom: 'neutro',
    },
    {
      label: 'Lançamentos sem categoria',
      valor: String(semLigacao).padStart(2, '0'),
      hint: semLigacao
        ? 'Eles não entram na DRE nem no fechamento contábil'
        : 'Tudo classificado',
      tom: semLigacao ? 'erro' : 'ok',
    },
  ]

  const colunas: Coluna<{ c: CategoriaGerencial; valorMes: number }>[] = [
    {
      chave: 'nome',
      titulo: 'Categoria',
      largura: 'minmax(0,1fr)',
      render: ({ c }) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span
            className="font-sans"
            style={{
              fontWeight: 600,
              fontSize: 12,
              color: c.ativa ? 'var(--color-corrente)' : 'var(--color-terciario)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {c.nome}
          </span>
          <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
            {[
              c.contaContabil || 'sem conta contábil',
              c.centroCusto,
              c.emUso > 0 ? plural(c.emUso, 'lançamento', 'lançamentos') : 'nunca usada',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      ),
    },
    {
      chave: 'natureza',
      titulo: 'Natureza gerencial',
      largura: '190px',
      render: ({ c }) => <Badge tom={TOM_NATUREZA[c.natureza]}>{ROTULO_NATUREZA[c.natureza]}</Badge>,
    },
    {
      chave: 'regras',
      titulo: 'Regras',
      largura: '176px',
      render: ({ c }) => (
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {!c.impactaDre && <Marca tom="atencao">fora da DRE</Marca>}
          {!c.impactaCaixa && <Marca tom="info">fora do caixa</Marca>}
          {c.exigeDocumento && <Marca tom="ouro">exige doc.</Marca>}
          {!c.usarEmAutomacao && <Marca tom="neutro">sem automação</Marca>}
          {c.impactaDre && c.impactaCaixa && !c.exigeDocumento && c.usarEmAutomacao && (
            <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
              padrão
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'valor',
      titulo: 'No mês',
      largura: '150px',
      alinhamento: 'right',
      render: ({ c, valorMes }, ) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', width: '100%' }}>
          <Valor tamanho={12} peso={400} tom={valorMes === 0 ? 'neutro' : undefined}>
            {valorMes === 0 ? '—' : brl(valorMes)}
          </Valor>
          {valorMes > 0 && (
            <span style={{ width: '100%' }}>
              <BarraProporcao
                valor={valorMes}
                maximo={maiorValor}
                cor={COR[TOM_NATUREZA[c.natureza]] === COR.neutro ? '#A8A29A' : PALETA_CATEGORIA[0]}
                altura={4}
              />
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      largura: '132px',
      alinhamento: 'right',
      render: ({ c }) => <EditarCategoria categoria={c} centros={centros} />,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <Tabela
        colunas={colunas}
        itens={enriquecidas}
        chaveDe={({ c }) => c.id}
        bandeiraDe={({ c }) => (c.ativa ? null : 'neutro')}
        cabecalho={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              padding: '14px 18px',
              borderBottom: '1px solid var(--color-borda)',
            }}
          >
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <span
                className="font-display"
                style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-tinta)' }}
              >
                Plano de contas gerencial
              </span>
              <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
                {`Valores de ${competenciaPorExtenso(competencia)} · a natureza decide a linha da DRE`}
              </span>
            </span>
            <div style={{ flex: 1 }} />
            <NovaCategoria centros={centros} />
          </div>
        }
        vazio={<VazioInterno texto="Nenhuma categoria cadastrada." />}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px,1fr))', gap: 14 }}>
        <Cartao>
          <CabecalhoCartao
            titulo="Classificação automática do extrato"
            nota="O que casar com o padrão vira lançamento sozinho"
          />
          <RegrasCategoria
            regras={regras}
            categorias={categorias.filter((c) => c.ativa && c.usarEmAutomacao).map((c) => c.nome)}
          />
        </Cartao>

        <Cartao>
          <CabecalhoCartao titulo="Como a natureza muda o resultado" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {(Object.keys(ROTULO_NATUREZA) as NaturezaGerencial[]).map((n) => {
              const quantas = categorias.filter((c) => c.natureza === n).length
              return (
                <span
                  key={n}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 0',
                    borderTop: '1px solid var(--color-borda-sutil)',
                    opacity: quantas ? 1 : 0.5,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 2,
                      flex: 'none',
                      background: COR[TOM_NATUREZA[n]],
                    }}
                  />
                  <span className="font-sans" style={{ flex: 1, fontSize: 11.5, color: 'var(--color-corrente)' }}>
                    {ROTULO_NATUREZA[n]}
                  </span>
                  <span
                    className="font-sans"
                    style={{ fontSize: 10, color: impactaResultado(n) ? COR.ok : 'var(--color-terciario)' }}
                  >
                    {impactaResultado(n) ? 'entra no resultado' : 'fora do resultado'}
                  </span>
                  <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-terciario)', width: 22, textAlign: 'right' }}>
                    {quantas}
                  </span>
                </span>
              )
            })}
          </div>
        </Cartao>
      </div>
    </div>
  )
}

function Marca({ children, tom }: { children: React.ReactNode; tom: Tom }) {
  return (
    <span
      className="font-sans"
      style={{
        fontSize: 9,
        fontWeight: 600,
        lineHeight: 1,
        letterSpacing: '.04em',
        color: COR[tom],
        border: `1px solid ${COR[tom]}44`,
        borderRadius: 'var(--radius-pill)',
        padding: '3px 6px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}
