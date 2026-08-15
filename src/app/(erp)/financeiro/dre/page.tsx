import Link from 'next/link'

import {
  AcaoPainel,
  Colunas,
  Etiqueta,
  Ferramentas,
  GradeIndicadores,
  Ico,
  Indicador,
  ListaBarras,
  Num,
  Painel,
  Pilha,
  Segmentado,
  Vazio,
  type TomUi,
} from '@/components/erp/ui'
import { AreaPontos } from '@/components/erp/Visualizacoes'
import { carregarDre, lerLancamentos } from '@/data/financeiro'
import {
  brl,
  competenciaAnterior,
  competenciaPorExtenso,
  plural,
  ROTULO_NATUREZA,
} from '@/domain'
import type { LancamentoGerencial, LinhaDreGerencial, NaturezaGerencial } from '@/domain'

/**
 * DRE Gerencial — resultado por competência OU por regime de caixa.
 *
 * A venda de 30 de agosto que o gateway paga em 15 de setembro é resultado de
 * agosto e caixa de setembro. A alternância no topo troca a pergunta que a
 * tabela responde: competência apura o que o mês PRODUZIU; caixa mostra o que
 * o mês MOVIMENTOU. Misturar as duas foi o que fazia o Financeiro antigo
 * somar a mesma venda duas vezes — aqui elas convivem lado a lado, nomeadas.
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

function competenciaSeguinte(c: string): string {
  const [ano, mes] = c.split('-').map(Number)
  return mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, '0')}`
}

/** O caixa de um mês: só o que foi BAIXADO nele, sem pernas de transferência. */
function caixaDoMes(lancs: LancamentoGerencial[], mes: string) {
  const doMes = lancs.filter(
    (l) => !l.canceladoEm && !l.transferenciaId && (l.baixadoEm ?? '').slice(0, 7) === mes,
  )
  const entradas = doMes.filter((l) => l.tipo === 'entrada').reduce((a, l) => a + l.recebido, 0)
  const porNatureza = new Map<string, number>()
  for (const l of doMes.filter((x) => x.tipo === 'saida')) {
    const nat = l.natureza ? ROTULO_NATUREZA[l.natureza] : 'Sem natureza gerencial'
    porNatureza.set(nat, (porNatureza.get(nat) ?? 0) + l.recebido)
  }
  const saidas = [...porNatureza.values()].reduce((a, v) => a + v, 0)
  return {
    entradas: arred(entradas),
    saidas: arred(saidas),
    resultado: arred(entradas - saidas),
    porNatureza,
    baixados: doMes.length,
  }
}

function arred(v: number): number {
  return Math.round(v * 100) / 100
}

export default async function Dre({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string; regime?: string }>
}) {
  const sp = await searchParams
  const mesAtual = new Date().toISOString().slice(0, 7)
  const alvo = /^\d{4}-\d{2}$/.test(sp.competencia ?? '') ? sp.competencia! : mesAtual
  const regime = sp.regime === 'caixa' ? 'caixa' : 'competencia'

  const [p, lancs] = await Promise.all([
    carregarDre(alvo),
    // O regime de caixa precisa dos lançamentos crus; em competência a RPC do
    // banco já entrega as linhas prontas.
    regime === 'caixa' ? lerLancamentos() : Promise.resolve([] as LancamentoGerencial[]),
  ])

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
  const seguinte = competenciaSeguinte(alvo)
  const linhaResultado = d.linhas.find((l) => l.linha === '= Resultado gerencial')

  // ── Regime de caixa: linhas montadas dos lançamentos baixados ────────────
  const cx = regime === 'caixa' ? caixaDoMes(lancs, alvo) : null
  const cxAnterior = regime === 'caixa' ? caixaDoMes(lancs, anterior) : null

  let linhasCaixa: LinhaDreGerencial[] = []
  if (cx && cxAnterior) {
    const linha = (nome: string, valor: number, ant: number, destaque: boolean): LinhaDreGerencial => ({
      linha: nome,
      valor,
      destaque,
      pctReceita: cx.entradas !== 0 ? (valor / cx.entradas) * 100 : 0,
      anterior: ant,
      variacao: arred(valor - ant),
      variacaoPct: ant !== 0 ? ((valor - ant) / Math.abs(ant)) * 100 : 0,
    })

    const naturezas = [...new Set([...cx.porNatureza.keys(), ...cxAnterior.porNatureza.keys()])].sort(
      (a, b) => (cx.porNatureza.get(b) ?? 0) - (cx.porNatureza.get(a) ?? 0),
    )

    linhasCaixa = [
      linha('Entradas recebidas', cx.entradas, cxAnterior.entradas, true),
      ...naturezas.map((n) =>
        linha(`(−) ${n}`, -(cx.porNatureza.get(n) ?? 0), -(cxAnterior.porNatureza.get(n) ?? 0), false),
      ),
      linha('= Saídas pagas', -cx.saidas, -cxAnterior.saidas, true),
      linha('= Resultado de caixa', cx.resultado, cxAnterior.resultado, true),
    ]
  }

  const transferido =
    regime === 'caixa'
      ? arred(
          lancs
            .filter(
              (l) =>
                l.transferenciaId &&
                l.tipo === 'saida' &&
                !l.canceladoEm &&
                (l.baixadoEm ?? '').slice(0, 7) === alvo,
            )
            .reduce((a, l) => a + l.recebido, 0),
        )
      : 0

  // Evolução: em caixa, a série sai da MESMA conta que a tabela — os dois
  // nunca podem discordar.
  const meses: string[] = []
  let cursor = alvo
  for (let i = 0; i < 6; i++) {
    meses.unshift(cursor)
    cursor = competenciaAnterior(cursor)
  }
  const evolucao =
    regime === 'caixa'
      ? meses.map((m) => ({ competencia: m, resultado: caixaDoMes(lancs, m).resultado }))
      : p.evolucao

  const deltaCaixa = (atual: number, ant: number, subirEhRuim = false) =>
    ant !== 0
      ? { pct: ((atual - ant) / Math.abs(ant)) * 100, base: `vs. ${anterior}`, subirEhRuim }
      : undefined

  return (
    <Pilha gap={16}>
      <Ferramentas
        esquerda={
          <>
            <Segmentado
              opcoes={[
                { id: 'competencia', rotulo: 'Competência' },
                { id: 'caixa', rotulo: 'Caixa' },
              ]}
              ativo={regime}
              base="/financeiro/dre"
              chave="regime"
              manter={{ competencia: alvo }}
            />
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                border: '1px solid rgba(255,255,255,.09)',
                background: 'rgba(255,255,255,.025)',
                borderRadius: 10,
                padding: '0 4px',
                height: 36,
              }}
            >
              <SetaMes href={`/financeiro/dre?regime=${regime}&competencia=${anterior}`} lado="esquerda" />
              <span
                className="font-sans"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 8px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--color-corrente)',
                  whiteSpace: 'nowrap',
                }}
              >
                <Ico n="calendario" tamanho={14} />
                {competenciaPorExtenso(alvo)
                  .replace(' de ', ' / ')
                  .replace(/^./, (c) => c.toUpperCase())}
              </span>
              {/* Sem futuro: apurar setembro em agosto produziria uma tabela
                  de zeros com cara de mês catastrófico. */}
              {seguinte <= mesAtual ? (
                <SetaMes href={`/financeiro/dre?regime=${regime}&competencia=${seguinte}`} lado="direita" />
              ) : (
                <span style={{ width: 26 }} />
              )}
            </span>
          </>
        }
      />

      {regime === 'competencia' ? (
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
            tomNota={d.pontoEquilibrio > 0 && d.receitaLiquida >= d.pontoEquilibrio ? 'ok' : 'atencao'}
          />
          <Indicador
            icone="escudo"
            tom={d.receitaLiquida >= d.pontoEquilibrio && d.pontoEquilibrio > 0 ? 'ok' : 'neutro'}
            rotulo="Folga sobre o equilíbrio"
            valor={d.pontoEquilibrio > 0 ? brl(d.receitaLiquida - d.pontoEquilibrio) : '—'}
            tomValor={d.pontoEquilibrio > 0 && d.receitaLiquida - d.pontoEquilibrio < 0 ? 'erro' : 'ok'}
            nota={
              d.pontoEquilibrio > 0
                ? 'Quanto a receita passou do mínimo que cobre a estrutura'
                : 'Ponto de equilíbrio não calculável'
            }
          />
        </GradeIndicadores>
      ) : (
        cx &&
        cxAnterior && (
          <GradeIndicadores>
            <Indicador
              icone="entrada"
              tom="ok"
              rotulo="Entradas recebidas"
              valor={brl(cx.entradas)}
              delta={deltaCaixa(cx.entradas, cxAnterior.entradas)}
              nota={cxAnterior.entradas === 0 ? 'Sem base de comparação no mês anterior' : undefined}
            />
            <Indicador
              icone="saida"
              tom="erro"
              rotulo="Saídas pagas"
              valor={brl(cx.saidas)}
              delta={deltaCaixa(cx.saidas, cxAnterior.saidas, true)}
              nota={cxAnterior.saidas === 0 ? 'Sem base de comparação no mês anterior' : undefined}
            />
            <Indicador
              icone="carteira"
              tom="ouro"
              rotulo="Resultado de caixa"
              valor={brl(cx.resultado)}
              tomValor={cx.resultado >= 0 ? 'ok' : 'erro'}
              delta={deltaCaixa(cx.resultado, cxAnterior.resultado)}
              nota={cxAnterior.resultado === 0 ? 'Sem base de comparação no mês anterior' : undefined}
            />
            <Indicador
              icone="porcento"
              tom="ciano"
              rotulo="Sobra de caixa"
              valor={
                cx.entradas > 0
                  ? `${((cx.resultado / cx.entradas) * 100).toFixed(1).replace('.', ',')}%`
                  : '—'
              }
              tomValor={cx.resultado >= 0 ? 'ok' : 'erro'}
              nota="Resultado sobre as entradas do mês"
            />
            <Indicador
              icone="transferir"
              tom="neutro"
              rotulo="Transferências neutralizadas"
              valor={brl(transferido)}
              nota="Movem dinheiro entre contas próprias; não são entrada nem saída"
            />
            <Indicador
              icone="recibo"
              tom="info"
              rotulo="Lançamentos baixados"
              valor={String(cx.baixados)}
              nota={plural(cx.baixados, 'movimento efetivado no mês', 'movimentos efetivados no mês')}
            />
          </GradeIndicadores>
        )
      )}

      <Colunas proporcao="minmax(0,1.7fr) minmax(0,1fr)">
        <Painel
          titulo={regime === 'competencia' ? 'DRE por competência' : 'Resultado por regime de caixa'}
          icone="lista"
          nota={competenciaPorExtenso(alvo)}
          padding="16px 0 14px"
        >
          {(regime === 'competencia' ? d.linhas : linhasCaixa).length === 0 ? (
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
                  <Etiqueta style={{ textAlign: 'right' }}>
                    {regime === 'competencia' ? '% receita' : '% entradas'}
                  </Etiqueta>
                  <Etiqueta style={{ textAlign: 'right' }}>Mês anterior</Etiqueta>
                  <Etiqueta style={{ textAlign: 'right' }}>Variação</Etiqueta>
                </div>

                {(regime === 'competencia' ? d.linhas : linhasCaixa).map((l) => (
                  <LinhaDre key={l.linha} l={l} />
                ))}

                <div style={{ padding: '13px 17px 0' }}>
                  <span
                    className="font-sans"
                    style={{ fontSize: 10.5, color: 'rgba(242,237,227,.38)', textWrap: 'pretty' }}
                  >
                    {regime === 'competencia'
                      ? 'O percentual é calculado sobre a Receita Líquida. Transferências entre contas próprias, aportes e investimentos não entram em nenhuma linha desta apuração.'
                      : 'Só movimentos efetivamente baixados no mês. A venda de agosto recebida em setembro aparece aqui em setembro — na aba Competência ela é resultado de agosto.'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </Painel>

        <Pilha gap={14}>
          <Painel
            titulo={regime === 'competencia' ? 'Categorias que mais pesam' : 'Saídas pagas por natureza'}
            icone="pizza"
            nota={competenciaPorExtenso(alvo)}
            acao={<AcaoPainel href="/financeiro/categorias">Ver todas</AcaoPainel>}
          >
            {regime === 'competencia' ? (
              p.porCategoria.length > 0 ? (
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
              )
            ) : cx && cx.porNatureza.size > 0 ? (
              <ListaBarras
                itens={[...cx.porNatureza.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([rotulo, valor]) => ({
                    rotulo,
                    valor,
                    texto: brl(valor),
                    direita:
                      cx.saidas > 0
                        ? `${((valor / cx.saidas) * 100).toFixed(1).replace('.', ',')}%`
                        : undefined,
                    tom: 'erro' as TomUi,
                  }))}
              />
            ) : (
              <Vazio icone="pizza" texto="Nenhuma saída paga neste mês." />
            )}
          </Painel>

          <Painel
            titulo={
              regime === 'competencia' ? 'Evolução do resultado' : 'Evolução do resultado de caixa'
            }
            icone="linha"
            nota="últimos 6 meses"
            rodape={{
              nota: 'Meses sem lançamento aparecem como zero: a série é do que foi registrado, não uma estimativa do que faltou registrar.',
            }}
          >
            {evolucao.length >= 2 ? (
              <AreaPontos
                valores={evolucao.map((e) => e.resultado)}
                rotulos={evolucao.map((e) => `${e.competencia.slice(5)}/${e.competencia.slice(2, 4)}`)}
                altura={208}
                formatar={brl}
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

function SetaMes({ href, lado }: { href: string; lado: 'esquerda' | 'direita' }) {
  return (
    <Link
      href={href}
      aria-label={lado === 'esquerda' ? 'Mês anterior' : 'Mês seguinte'}
      className="hover:text-ouro"
      style={{
        width: 26,
        height: 28,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 7,
        color: 'rgba(242,237,227,.5)',
        textDecoration: 'none',
      }}
    >
      <Ico n={lado === 'esquerda' ? 'seta-esquerda' : 'seta-direita'} tamanho={13} />
    </Link>
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
          color: l.destaque ? (positivo ? '#5FC084' : '#E8756F') : 'rgba(242,237,227,.66)',
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
