import {
  AcaoPainel,
  Colunas,
  Etiqueta,
  Ferramentas,
  GradeIndicadores,
  Indicador,
  ListaBarras,
  Num,
  Painel,
  Pilha,
  Pilula,
  Segmentado,
  Vazio,
  type TomUi,
} from '@/components/erp/ui'
import { AreaPontos, curto } from '@/components/erp/Visualizacoes'
import { carregarDre } from '@/data/financeiro'
import {
  brl,
  competenciaAnterior,
  competenciaPorExtenso,
  ROTULO_NATUREZA,
} from '@/domain'
import type { LinhaDreGerencial, NaturezaGerencial } from '@/domain'

/**
 * DRE Gerencial — resultado por competência.
 *
 * A venda de 30 de agosto que o gateway paga em 15 de setembro é resultado de
 * agosto e caixa de setembro. Esta tela responde pela primeira leitura; o
 * fluxo de caixa responde pela segunda. Misturar as duas foi o que fazia o
 * Financeiro antigo somar a mesma venda duas vezes.
 *
 * Nenhum subtotal é digitado — todos saem das linhas — e a base dos
 * percentuais é a receita LÍQUIDA: comparar despesa com um faturamento que
 * ainda inclui imposto e devolução infla a margem aparente.
 */
export const dynamic = 'force-dynamic'

const TOM_NATUREZA: Record<NaturezaGerencial, TomUi> = {
  receita_operacional: 'ok',
  deducao_receita: 'atencao',
  cmv: 'erro',
  despesa_fixa: 'info',
  despesa_comercial: 'roxo',
  despesa_administrativa: 'neutro',
  despesa_financeira: 'erro',
  investimento: 'ouro',
  transferencia: 'neutro',
  aporte_retirada: 'ouro',
}

export default async function Dre({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string }>
}) {
  const { competencia } = await searchParams
  const alvo = /^\d{4}-\d{2}$/.test(competencia ?? '')
    ? competencia!
    : new Date().toISOString().slice(0, 7)
  const p = await carregarDre(alvo)

  if (p.semBanco) {
    return (
      <Pilha>
        <Painel>
          <Vazio icone="cadeado" texto="O Supabase precisa estar configurado para apurar o resultado." />
        </Painel>
      </Pilha>
    )
  }

  const d = p.dre
  const anterior = competenciaAnterior(alvo)
  const linhaResultado = d.linhas.find((l) => l.linha === '= Resultado gerencial')

  const meses = [...new Set([alvo, ...p.disponiveis])].sort().reverse().slice(0, 8).reverse()

  return (
    <Pilha gap={16}>

      <Ferramentas
        esquerda={
          <>
            <Pilula icone="calendario" tom="ouro">
              {competenciaPorExtenso(alvo)}
            </Pilula>
            <span className="font-sans" style={{ fontSize: 12, color: 'rgba(242,237,227,.42)' }}>
              {`comparado a ${competenciaPorExtenso(anterior)}`}
            </span>
          </>
        }
        direita={
          meses.length > 1 ? (
            <Segmentado
              opcoes={meses.map((m) => ({ id: m, rotulo: m.slice(5) + '/' + m.slice(2, 4) }))}
              ativo={alvo}
              base="/financeiro/dre"
              chave="competencia"
            />
          ) : undefined
        }
      />

      <GradeIndicadores>
        <Indicador
          icone="tendencia"
          tom="ok"
          rotulo="Receita líquida"
          valor={brl(d.receitaLiquida)}
          nota={`Bruta de ${brl(d.receitaBruta)} menos deduções`}
        />
        <Indicador
          icone="pizza"
          tom="roxo"
          rotulo="Margem de contribuição"
          valor={brl(d.margemContribuicao)}
          tomValor={d.margemContribuicao >= 0 ? 'ok' : 'erro'}
          nota={`${d.margemContribuicaoPct.toFixed(1).replace('.', ',')}% da receita líquida`}
        />
        <Indicador
          icone="caixa"
          tom="ouro"
          rotulo="Resultado gerencial"
          valor={brl(d.resultado)}
          tomValor={d.resultado >= 0 ? 'ok' : 'erro'}
          delta={
            linhaResultado && linhaResultado.anterior !== 0
              ? { pct: linhaResultado.variacaoPct, base: `vs. ${anterior}` }
              : undefined
          }
          nota={
            linhaResultado && linhaResultado.anterior === 0
              ? 'Sem base de comparação no mês anterior'
              : undefined
          }
        />
        <Indicador
          icone="porcento"
          tom="ciano"
          rotulo="Margem líquida"
          valor={`${d.margemLiquidaPct.toFixed(1).replace('.', ',')}%`}
          tomValor={d.margemLiquidaPct >= 0 ? 'ok' : 'erro'}
          nota="Resultado sobre a receita líquida"
        />
        <Indicador
          icone="alvo"
          tom="atencao"
          rotulo="Ponto de equilíbrio"
          valor={d.pontoEquilibrio > 0 ? brl(d.pontoEquilibrio) : '—'}
          nota={
            d.pontoEquilibrio > 0
              ? `${((d.receitaLiquida / d.pontoEquilibrio) * 100).toFixed(0)}% atingido no mês`
              : 'Sem margem positiva, vender mais aumenta o prejuízo'
          }
          tomNota={
            d.pontoEquilibrio > 0 && d.receitaLiquida >= d.pontoEquilibrio ? 'ok' : 'atencao'
          }
        />
        <Indicador
          icone="escudo"
          tom={d.receitaLiquida >= d.pontoEquilibrio && d.pontoEquilibrio > 0 ? 'ok' : 'neutro'}
          rotulo="Folga sobre o equilíbrio"
          valor={d.pontoEquilibrio > 0 ? brl(d.receitaLiquida - d.pontoEquilibrio) : '—'}
          tomValor={
            d.pontoEquilibrio > 0 && d.receitaLiquida - d.pontoEquilibrio < 0 ? 'erro' : 'ok'
          }
          nota={
            d.pontoEquilibrio > 0
              ? 'Quanto a receita passou do mínimo que cobre a estrutura'
              : 'Ponto de equilíbrio não calculável'
          }
        />
      </GradeIndicadores>

      <Colunas proporcao="minmax(0,1.7fr) minmax(0,1fr)">
        <Painel
          titulo="DRE por competência"
          icone="lista"
          nota={competenciaPorExtenso(alvo)}
          padding="16px 0 14px"
          rodape={undefined}
        >
          {d.linhas.length === 0 ? (
            <Vazio icone="lista" texto="Nenhum lançamento nesta competência." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 700 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) 132px 78px 132px 96px',
                    gap: 12,
                    padding: '0 17px 10px',
                    borderBottom: '1px solid rgba(255,255,255,.07)',
                  }}
                >
                  <Etiqueta>Descrição</Etiqueta>
                  <Etiqueta style={{ textAlign: 'right' }}>Valor do mês</Etiqueta>
                  <Etiqueta style={{ textAlign: 'right' }}>% receita</Etiqueta>
                  <Etiqueta style={{ textAlign: 'right' }}>Mês anterior</Etiqueta>
                  <Etiqueta style={{ textAlign: 'right' }}>Variação</Etiqueta>
                </div>

                {d.linhas.map((l) => (
                  <LinhaDre key={l.linha} l={l} />
                ))}

                <div style={{ padding: '13px 17px 0' }}>
                  <span
                    className="font-sans"
                    style={{ fontSize: 10.5, color: 'rgba(242,237,227,.38)', textWrap: 'pretty' }}
                  >
                    O percentual é calculado sobre a Receita Líquida. Transferências entre contas
                    próprias, aportes e investimentos não entram em nenhuma linha desta apuração.
                  </span>
                </div>
              </div>
            </div>
          )}
        </Painel>

        <Pilha gap={14}>
          <Painel
            titulo="Categorias que mais pesam"
            icone="pizza"
            nota={competenciaPorExtenso(alvo)}
            acao={<AcaoPainel href="/financeiro/categorias">Ver todas</AcaoPainel>}
          >
            {p.porCategoria.length > 0 ? (
              <ListaBarras
                itens={p.porCategoria.slice(0, 7).map((c) => ({
                  rotulo: c.categoria,
                  valor: c.valor,
                  texto: brl(c.valor),
                  direita:
                    d.receitaLiquida > 0
                      ? `${((c.valor / d.receitaLiquida) * 100).toFixed(1).replace('.', ',')}%`
                      : undefined,
                  tom: TOM_NATUREZA[c.natureza],
                  icone: 'etiqueta',
                }))}
              />
            ) : (
              <Vazio icone="pizza" texto="Nenhum custo ou despesa classificado nesta competência." />
            )}
          </Painel>

          <Painel
            titulo="Evolução do resultado"
            icone="linha"
            nota="últimos 6 meses"
            rodape={{
              nota: 'Meses sem lançamento aparecem como zero: a série é do que foi registrado, não uma estimativa do que faltou registrar.',
            }}
          >
            {p.evolucao.length >= 2 ? (
              <AreaPontos
                valores={p.evolucao.map((e) => e.resultado)}
                rotulos={p.evolucao.map((e) => `${e.competencia.slice(5)}/${e.competencia.slice(2, 4)}`)}
                altura={196}
                formatar={curto}
                rotularTodos
              />
            ) : (
              <Vazio icone="linha" texto="Ainda não há meses suficientes para desenhar a tendência." />
            )}
          </Painel>
        </Pilha>
      </Colunas>
    </Pilha>
  )
}

/**
 * Uma linha da demonstração.
 *
 * Subtotal ganha peso, fundo e fonte maior; linha de detalhe recua sob o
 * subtotal a que pertence. Sem essa hierarquia, quinze linhas de mesmo peso
 * viram uma parede de números onde o resultado se perde.
 */
function LinhaDre({ l }: { l: LinhaDreGerencial }) {
  const resultado = l.linha.toLowerCase().includes('resultado')
  const positivo = l.valor >= 0

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 132px 78px 132px 96px',
        gap: 12,
        alignItems: 'center',
        padding: l.destaque ? '12px 17px' : '9px 17px',
        borderBottom: '1px solid rgba(255,255,255,.04)',
        background: resultado
          ? 'rgba(233,197,131,.06)'
          : l.destaque
            ? 'rgba(255,255,255,.018)'
            : 'transparent',
        borderLeft: resultado ? '2px solid #E9C583' : '2px solid transparent',
      }}
    >
      <span
        className="font-sans"
        style={{
          fontWeight: l.destaque ? 600 : 400,
          fontSize: l.destaque ? 12.5 : 11.5,
          letterSpacing: l.destaque ? '.02em' : 0,
          paddingLeft: l.destaque ? 0 : 14,
          color: l.destaque
            ? positivo
              ? '#5FC084'
              : '#E8756F'
            : 'rgba(242,237,227,.66)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {l.linha}
      </span>

      <span style={{ textAlign: 'right' }}>
        <Num
          tamanho={l.destaque ? 14 : 12}
          peso={l.destaque ? 600 : 500}
          tom={l.destaque ? (positivo ? 'ok' : 'erro') : positivo ? undefined : 'erro'}
        >
          {brl(l.valor)}
        </Num>
      </span>

      <span style={{ textAlign: 'right' }}>
        <Num tamanho={11} peso={400} tom={l.destaque ? 'ouro' : 'neutro'}>
          {l.pctReceita === 0 ? '—' : `${l.pctReceita.toFixed(1).replace('.', ',')}%`}
        </Num>
      </span>

      <span style={{ textAlign: 'right' }}>
        <Num tamanho={11.5} peso={400} tom="neutro">
          {l.anterior === 0 ? '—' : brl(l.anterior)}
        </Num>
      </span>

      <span style={{ textAlign: 'right' }}>
        {l.anterior === 0 && l.valor === 0 ? (
          <Num tamanho={11} peso={400} tom="neutro">
            —
          </Num>
        ) : (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            <Num tamanho={11} peso={500} tom={l.variacao >= 0 ? 'ok' : 'erro'}>
              {`${l.variacao >= 0 ? '+' : '−'} ${brl(Math.abs(l.variacao))}`}
            </Num>
            {l.anterior !== 0 && (
              <Num tamanho={9.5} peso={400} tom="neutro">
                {`${l.variacaoPct >= 0 ? '+' : '−'}${Math.abs(l.variacaoPct).toFixed(1).replace('.', ',')}%`}
              </Num>
            )}
          </span>
        )}
      </span>
    </div>
  )
}
