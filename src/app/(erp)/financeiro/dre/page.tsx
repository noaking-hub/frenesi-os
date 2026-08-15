import Link from 'next/link'

import { Cartao, CabecalhoCartao, LinhaResumo, VazioInterno } from '@/components/erp/Cartao'
import { BarraProporcao, LinhaEvolucao, PALETA_CATEGORIA } from '@/components/erp/Graficos'
import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { EstadoVazio, Rotulo, Valor } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { carregarDre } from '@/data/financeiro'
import {
  brl,
  competenciaAnterior,
  competenciaPorExtenso,
  ROTULO_NATUREZA,
} from '@/domain'
import type { LinhaDreGerencial } from '@/domain'

/**
 * DRE gerencial — o resultado por COMPETÊNCIA.
 *
 * A venda de 30 de agosto que o gateway paga em 15 de setembro é resultado de
 * agosto e caixa de setembro. Esta tela responde pela primeira leitura; o
 * fluxo de caixa responde pela segunda. Foi misturar as duas que fazia o
 * Financeiro antigo somar a mesma venda duas vezes.
 *
 * Nenhum subtotal é digitado: todos saem das linhas, e a base dos percentuais
 * é a receita LÍQUIDA — comparar despesa com um faturamento que ainda inclui
 * imposto e devolução infla a margem aparente.
 */
export const dynamic = 'force-dynamic'

export default async function Dre({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string }>
}) {
  const { competencia } = await searchParams
  const alvo = /^\d{4}-\d{2}$/.test(competencia ?? '') ? competencia! : new Date().toISOString().slice(0, 7)
  const p = await carregarDre(alvo)

  if (p.semBanco) {
    return (
      <EstadoVazio
        titulo="DRE indisponível"
        instrucao="O Supabase precisa estar configurado para apurar o resultado por competência."
      />
    )
  }

  const d = p.dre
  const anterior = competenciaAnterior(alvo)
  const maiorCategoria = Math.max(1, ...p.porCategoria.map((c) => c.valor))

  const kpis: Kpi[] = [
    {
      label: 'Receita bruta',
      valor: brl(d.receitaBruta),
      hint: `Vendas reconhecidas em ${competenciaPorExtenso(alvo)}`,
      tom: 'neutro',
    },
    {
      label: 'Receita líquida',
      valor: brl(d.receitaLiquida),
      hint: 'Depois de impostos, devoluções e taxas de gateway',
      tom: 'info',
    },
    {
      label: 'Margem de contribuição',
      valor: brl(d.margemContribuicao),
      hint: `${d.margemContribuicaoPct.toFixed(1).replace('.', ',')}% da receita líquida`,
      tom: d.margemContribuicao > 0 ? 'ok' : 'erro',
    },
    {
      label: 'Resultado gerencial',
      valor: brl(d.resultado),
      hint: `${d.margemLiquidaPct.toFixed(1).replace('.', ',')}% da receita líquida`,
      tom: d.resultado > 0 ? 'ok' : 'erro',
    },
    {
      label: 'Ponto de equilíbrio',
      valor: d.pontoEquilibrio > 0 ? brl(d.pontoEquilibrio) : '—',
      hint:
        d.pontoEquilibrio > 0
          ? 'Faturamento líquido que cobre a estrutura fixa'
          : 'Sem margem de contribuição positiva, vender mais aumenta o prejuízo',
      tom: d.pontoEquilibrio > 0 && d.receitaLiquida >= d.pontoEquilibrio ? 'ok' : 'atencao',
    },
    {
      label: 'Contra o mês anterior',
      valor: variacaoDe(d.linhas, '= Resultado gerencial'),
      hint: `Resultado de ${competenciaPorExtenso(anterior)}`,
      tom: sinalDe(d.linhas, '= Resultado gerencial'),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 14 }}>
        <Cartao padding="15px 0 0">
          <div style={{ padding: '0 17px' }}>
            <CabecalhoCartao
              titulo="Demonstração do resultado"
              nota={competenciaPorExtenso(alvo)}
              acao={<SeletorCompetencia atual={alvo} disponiveis={p.disponiveis} />}
            />
          </div>

          {d.linhas.length === 0 ? (
            <div style={{ padding: '0 17px 17px' }}>
              <VazioInterno texto="Nenhum lançamento nesta competência." />
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 560 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) 128px 74px 118px',
                    gap: 12,
                    padding: '10px 17px',
                    background: 'var(--color-cabecalho)',
                    borderTop: '1px solid var(--color-borda)',
                    borderBottom: '1px solid var(--color-borda)',
                  }}
                >
                  <Rotulo>Linha</Rotulo>
                  <Rotulo style={{ textAlign: 'right' }}>{competenciaPorExtenso(alvo)}</Rotulo>
                  <Rotulo style={{ textAlign: 'right' }}>% RL</Rotulo>
                  <Rotulo style={{ textAlign: 'right' }}>vs. mês anterior</Rotulo>
                </div>

                {d.linhas.map((l) => (
                  <LinhaDre key={l.linha} linha={l} />
                ))}
              </div>
            </div>
          )}
        </Cartao>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Cartao>
            <CabecalhoCartao titulo="Resultado nos últimos 6 meses" nota="Por competência" />
            {p.evolucao.length >= 2 ? (
              <>
                <LinhaEvolucao
                  valores={p.evolucao.map((e) => e.resultado)}
                  rotulos={p.evolucao.map((e) => e.competencia.slice(5))}
                  altura={150}
                  cor={p.evolucao[p.evolucao.length - 1].resultado >= 0 ? '#5FA97A' : '#E06D6D'}
                />
                <span
                  className="font-sans"
                  style={{ fontSize: 10, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
                >
                  Meses sem lançamento aparecem como zero — a série é do que foi registrado, não
                  uma estimativa do que faltou registrar.
                </span>
              </>
            ) : (
              <VazioInterno texto="Ainda não há meses suficientes para desenhar a tendência." />
            )}
          </Cartao>

          <Cartao>
            <CabecalhoCartao titulo="Saúde do resultado" nota="Indicadores derivados das linhas" />
            <LinhaResumo
              rotulo="Margem de contribuição"
              nota="Quanto sobra de cada real depois do custo variável"
              valor={`${d.margemContribuicaoPct.toFixed(1).replace('.', ',')}%`}
            />
            <LinhaResumo
              rotulo="Margem líquida"
              nota="Depois de toda a estrutura"
              valor={`${d.margemLiquidaPct.toFixed(1).replace('.', ',')}%`}
            />
            <LinhaResumo
              rotulo="Ponto de equilíbrio"
              nota="Receita líquida mínima do mês"
              valor={d.pontoEquilibrio > 0 ? brl(d.pontoEquilibrio) : '—'}
            />
            <LinhaResumo
              rotulo="Folga sobre o equilíbrio"
              nota={
                d.pontoEquilibrio > 0
                  ? 'Quanto a receita passou (ou faltou para) o ponto de equilíbrio'
                  : 'Sem ponto de equilíbrio calculável'
              }
              valor={d.pontoEquilibrio > 0 ? brl(d.receitaLiquida - d.pontoEquilibrio) : '—'}
              destaque
            />
          </Cartao>
        </div>
      </div>

      <Cartao>
        <CabecalhoCartao
          titulo="Onde o dinheiro foi"
          nota={`Custos e despesas de ${competenciaPorExtenso(alvo)}, por categoria`}
        />
        {p.porCategoria.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))',
              gap: 14,
            }}
          >
            {p.porCategoria.slice(0, 12).map((c, i) => (
              <span key={c.categoria} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <span
                    className="font-sans"
                    style={{
                      fontSize: 11.5,
                      color: 'var(--color-corrente)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.categoria}
                  </span>
                  <Valor tamanho={12} peso={400}>
                    {brl(c.valor)}
                  </Valor>
                </span>
                <BarraProporcao
                  valor={c.valor}
                  maximo={maiorCategoria}
                  cor={PALETA_CATEGORIA[i % PALETA_CATEGORIA.length]}
                  altura={5}
                />
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className="font-sans" style={{ fontSize: 9.5, color: 'var(--color-terciario)' }}>
                    {ROTULO_NATUREZA[c.natureza]}
                  </span>
                  <span className="font-sans" style={{ fontSize: 9.5, color: 'var(--color-terciario)' }}>
                    {d.receitaLiquida > 0
                      ? `${((c.valor / d.receitaLiquida) * 100).toFixed(1).replace('.', ',')}% da receita`
                      : '—'}
                  </span>
                </span>
              </span>
            ))}
          </div>
        ) : (
          <VazioInterno texto="Nenhum custo ou despesa classificado nesta competência." />
        )}
      </Cartao>
    </div>
  )
}

function LinhaDre({ linha }: { linha: LinhaDreGerencial }) {
  const positivo = linha.valor >= 0
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 128px 74px 118px',
        gap: 12,
        alignItems: 'center',
        padding: linha.destaque ? '12px 17px' : '9px 17px',
        borderTop: '1px solid var(--color-borda-sutil)',
        background: linha.destaque ? 'rgba(239,209,140,.035)' : 'transparent',
      }}
    >
      <span
        className="font-sans"
        style={{
          fontWeight: linha.destaque ? 600 : 400,
          fontSize: linha.destaque ? 12.5 : 11.5,
          // A indentação separa o que soma do que é somado: as linhas de
          // detalhe recuam sob o subtotal a que pertencem.
          paddingLeft: linha.destaque ? 0 : 12,
          color: linha.destaque ? 'var(--color-tinta)' : 'var(--color-secundario)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {linha.linha}
      </span>

      <span style={{ textAlign: 'right' }}>
        <Valor
          tamanho={linha.destaque ? 14 : 12}
          peso={linha.destaque ? 600 : 400}
          tom={linha.destaque ? (positivo ? 'ok' : 'erro') : positivo ? undefined : 'erro'}
        >
          {brl(linha.valor)}
        </Valor>
      </span>

      <span
        className="font-mono"
        style={{ fontSize: 10.5, textAlign: 'right', color: 'var(--color-terciario)' }}
      >
        {linha.pctReceita === 0 ? '—' : `${linha.pctReceita.toFixed(1).replace('.', ',')}%`}
      </span>

      <span style={{ textAlign: 'right' }}>
        {linha.anterior === 0 && linha.valor === 0 ? (
          <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
            —
          </span>
        ) : (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            <span
              className="font-mono"
              style={{ fontSize: 11, color: linha.variacao >= 0 ? COR.ok : COR.erro }}
            >
              {`${linha.variacao >= 0 ? '+' : '−'} ${brl(Math.abs(linha.variacao))}`}
            </span>
            {linha.anterior !== 0 && (
              <span className="font-mono" style={{ fontSize: 9.5, color: 'var(--color-terciario)' }}>
                {`${linha.variacaoPct >= 0 ? '+' : '−'}${Math.abs(linha.variacaoPct).toFixed(0)}%`}
              </span>
            )}
          </span>
        )}
      </span>
    </div>
  )
}

/**
 * Meses navegáveis.
 *
 * A lista sai das competências que TÊM receita — oferecer 24 meses vazios
 * transformaria o seletor num calendário de nada.
 */
function SeletorCompetencia({ atual, disponiveis }: { atual: string; disponiveis: string[] }) {
  const meses = [...new Set([atual, ...disponiveis])].sort().reverse().slice(0, 12)
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {meses.map((m) => (
        <Link
          key={m}
          href={`/financeiro/dre?competencia=${m}`}
          className="font-sans hover:border-ouro/40 hover:text-ouro"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 26,
            padding: '0 9px',
            border: `1px solid ${m === atual ? 'rgba(239,209,140,.42)' : 'rgba(255,255,255,.1)'}`,
            background: m === atual ? 'rgba(239,209,140,.08)' : 'transparent',
            color: m === atual ? COR.ouro : 'var(--color-secundario)',
            fontWeight: 600,
            fontSize: 10,
            borderRadius: 6,
            textDecoration: 'none',
          }}
        >
          {m}
        </Link>
      ))}
    </span>
  )
}

function variacaoDe(linhas: LinhaDreGerencial[], nome: string): string {
  const l = linhas.find((x) => x.linha === nome)
  if (!l || (l.anterior === 0 && l.valor === 0)) return '—'
  return `${l.variacao >= 0 ? '+' : '−'} ${brl(Math.abs(l.variacao))}`
}

function sinalDe(linhas: LinhaDreGerencial[], nome: string) {
  const l = linhas.find((x) => x.linha === nome)
  if (!l) return 'neutro' as const
  return l.variacao >= 0 ? ('ok' as const) : ('erro' as const)
}
