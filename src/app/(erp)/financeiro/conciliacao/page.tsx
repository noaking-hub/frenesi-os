import Link from 'next/link'

import {
  AcaoPainel,
  Abas,
  Bolinha,
  BotaoLinha,
  ComTrilha,
  Destaque,
  LinhaValor,
  TINTA,
  Celula,
  Chip,
  Colunas,
  Etiqueta,
  Ferramentas,
  GradeIndicadores,
  Indicador,
  ListaBarras,
  Num,
  Painel,
  Pilha,
  RodapeTabela,
  TabelaUi,
  Vazio,
  type ColunaUi,
  type TomUi,
} from '@/components/erp/ui'
import { carregarConciliacao } from '@/data/financeiro'
import { brl, diaCurtoPt, plural, ROTULO_STATUS_VENDA } from '@/domain'
import type { StatusVenda, VendaConciliada } from '@/domain'

import { ConciliarRepasse, PreverRepasses } from '../Widgets'

/**
 * A causa provável sai da CADEIA DE EVIDÊNCIAS, não de adivinhação: cada
 * status já é a conclusão de `avaliarVenda`, e o texto só a traduz para a
 * decisão que o operador precisa tomar.
 */
function causaDe(v: VendaConciliada): string {
  switch (v.status) {
    case 'taxa_divergente':
      return `A tarifa cobrada (${brl(v.taxaReal ?? 0)}) difere da prevista (${brl(v.taxaEsperada)}). Provável mudança de bandeira, parcelamento ou reajuste do adquirente — vale conferir a regra de taxa cadastrada.`
    case 'valor_divergente':
      return 'O crédito não bate com o líquido esperado e a tarifa está correta. Provável crédito parcial (split), estorno parcial ou lançamento trocado de pedido.'
    case 'sem_credito':
      return 'Pagamento confirmado há mais de 5 dias sem crédito correspondente no extrato. Ou o repasse atrasou, ou o crédito entrou sem vínculo com o pedido.'
    case 'chargeback':
      return 'Contestação aberta pelo portador do cartão: o valor foi revertido e o prazo de defesa corre contra a loja. Reúna comprovante de entrega e comunicação com o cliente.'
    case 'estornada':
      return 'Venda cancelada com estorno ao cliente. Nenhuma ação pendente — o registro fica para o histórico.'
    case 'aguardando':
      return 'Dentro do prazo normal de repasse do adquirente. Pix credita em minutos; cartão respeita a agenda de recebíveis.'
    default:
      return 'Crédito casado com o pedido dentro da tolerância de centavos. Nenhuma ação pendente.'
  }
}

/**
 * Conciliação Bancária — cada venda contra o extrato e as tarifas reais.
 *
 * A regra que esvaziou o alarme falso: taxa cobrada CORRETAMENTE é custo, não
 * divergência. A versão antiga comparava bruto com líquido e acusava toda
 * venda no cartão — uma fila que ninguém abria mais. Aqui divergência é a
 * diferença entre a taxa REAL e a esperada, e só ela exige decisão.
 */
export const dynamic = 'force-dynamic'

const TOM: Record<StatusVenda, TomUi> = {
  conciliada: 'ok',
  taxa_divergente: 'atencao',
  sem_credito: 'erro',
  valor_divergente: 'erro',
  estornada: 'neutro',
  chargeback: 'erro',
  aguardando: 'info',
}

/** Filas que pedem gente, na ordem em que doem. */
const EXIGEM_DECISAO: StatusVenda[] = [
  'chargeback',
  'sem_credito',
  'valor_divergente',
  'taxa_divergente',
]

export default async function Conciliacao({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; pedido?: string }>
}) {
  const { status, pedido } = await searchParams
  const c = await carregarConciliacao()

  if (c.semBanco) {
    return (
      <Pilha>
        <Painel>
          <Vazio icone="cadeado" texto="O Supabase precisa estar configurado para comparar vendas com repasses." />
        </Painel>
      </Pilha>
    )
  }

  if (c.vendas.length === 0) {
    return (
      <Pilha>
      <Ferramentas direita={<PreverRepasses />} />
        <Painel>
          <Vazio
            icone="recibo"
            texto="Nenhuma venda para conciliar. Importe pedidos e gere a previsão de repasse para o ERP saber o que cada plataforma deve creditar."
          />
        </Painel>
      </Pilha>
    )
  }

  const filtro = (status ?? '') as StatusVenda | ''
  const visiveis = filtro ? c.vendas.filter((v) => v.status === filtro) : c.vendas

  // A venda selecionada abre no painel de detalhe ao lado da tabela. Sem
  // seleção na URL, o painel abre na primeira que exige decisão — que é a
  // pergunta que trouxe o operador até aqui.
  const selecionada =
    visiveis.find((v) => v.pedidoId === pedido) ??
    visiveis.find((v) => EXIGEM_DECISAO.includes(v.status)) ??
    visiveis[0] ??
    null
  const posicao = selecionada ? visiveis.findIndex((v) => v.pedidoId === selecionada.pedidoId) : -1
  const urlDe = (id: string) =>
    `/financeiro/conciliacao?${filtro ? `status=${filtro}&` : ''}pedido=${encodeURIComponent(id)}`

  const naFila = EXIGEM_DECISAO.reduce((a, s) => a + c.totais[s].qtd, 0)
  const taxaEfetiva = c.taxaMediaReal > 0 ? c.taxaMediaReal : c.taxaMediaPrevista
  const desvioTaxa = c.taxaMediaReal > 0 ? c.taxaMediaReal - c.taxaMediaPrevista : 0
  const comCredito = c.vendas.filter((v) => v.liquidoRecebido !== null).length

  // Causas: agrupa as vendas com problema pelo status que as explica. É a
  // lista que responde "por que a fila está cheia?" sem abrir venda por venda.
  const causas = EXIGEM_DECISAO.filter((s) => c.totais[s].qtd > 0).map((s) => ({
    rotulo: ROTULO_STATUS_VENDA[s],
    valor: c.totais[s].qtd,
    texto: plural(c.totais[s].qtd, 'venda', 'vendas'),
    direita: naFila > 0 ? `${((c.totais[s].qtd / naFila) * 100).toFixed(0)}%` : undefined,
    tom: TOM[s],
  }))

  const colunas: ColunaUi<VendaConciliada>[] = [
    {
      chave: 'pedido',
      titulo: 'Pedido',
      largura: 'minmax(0,1fr)',
      render: (v) => (
        <Link
          href={urlDe(v.pedidoId)}
          className="hover:brightness-125"
          style={{ textDecoration: 'none', display: 'block', minWidth: 0 }}
        >
          <Celula principal={v.pedidoId} secundaria={`${v.cliente} · ${v.canal}`} />
        </Link>
      ),
    },
    {
      chave: 'meio',
      titulo: 'Pagamento',
      largura: '124px',
      render: (v) => (
        <span
          className="font-sans"
          style={{
            display: 'block',
            fontSize: 11,
            color: 'rgba(242,237,227,.6)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {v.meio}
        </span>
      ),
    },
    {
      chave: 'bruto',
      titulo: 'Bruto (pedido)',
      largura: '108px',
      alinhamento: 'right',
      render: (v) => <Num tamanho={12}>{brl(v.bruto)}</Num>,
    },
    {
      chave: 'taxa',
      titulo: 'Tarifa',
      largura: '120px',
      alinhamento: 'right',
      render: (v) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
          <Num tamanho={11.5} peso={500} tom={v.taxaReal === null ? 'neutro' : 'erro'}>
            {brl(v.taxaReal ?? v.taxaEsperada)}
          </Num>
          <span className="font-sans" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.36)' }}>
            {v.taxaReal === null
              ? 'prevista'
              : `prevista ${brl(v.taxaEsperada)}`}
          </span>
        </span>
      ),
    },
    {
      chave: 'liquido',
      titulo: 'Caiu na conta',
      largura: '126px',
      alinhamento: 'right',
      render: (v) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
          <Num tamanho={12} tom={v.liquidoRecebido === null ? 'neutro' : 'ok'}>
            {v.liquidoRecebido === null ? '—' : brl(v.liquidoRecebido)}
          </Num>
          <span className="font-sans" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.36)' }}>
            {`esperado ${brl(v.liquidoEsperado)}`}
          </span>
        </span>
      ),
    },
    {
      chave: 'dif',
      titulo: 'Diferença',
      largura: '106px',
      alinhamento: 'right',
      render: (v) =>
        v.diferenca === 0 ? (
          <Num tamanho={11} tom="neutro" peso={400}>
            R$ 0,00
          </Num>
        ) : (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            <Num tamanho={12} tom={v.diferenca < 0 ? 'erro' : 'ouro'}>
              {`${v.diferenca > 0 ? '+' : '−'} ${brl(Math.abs(v.diferenca))}`}
            </Num>
            {v.bruto > 0 && (
              <span className="font-sans" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.36)' }}>
                {`${((Math.abs(v.diferenca) / v.bruto) * 100).toFixed(2).replace('.', ',')}% do bruto`}
              </span>
            )}
          </span>
        ),
    },
    {
      chave: 'credito',
      titulo: 'Data do crédito',
      largura: '112px',
      render: (v) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Num tamanho={11} peso={400} tom={v.recebidoEm ? undefined : 'neutro'}>
            {v.recebidoEm ? diaCurtoPt(v.recebidoEm.slice(0, 10)) : '—'}
          </Num>
          <span className="font-sans" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.34)' }}>
            {v.previstoEm ? `pedido ${diaCurtoPt(v.previstoEm)}` : ''}
          </span>
        </span>
      ),
    },
    {
      chave: 'status',
      titulo: 'Status',
      largura: '124px',
      render: (v) => <Chip tom={TOM[v.status]}>{ROTULO_STATUS_VENDA[v.status]}</Chip>,
    },
    {
      chave: 'acao',
      titulo: 'Ações',
      largura: '116px',
      alinhamento: 'right',
      render: (v) =>
        v.status === 'conciliada' || v.status === 'estornada' ? (
          <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.32)' }}>
            sem pendência
          </span>
        ) : (
          <ConciliarRepasse pedidoId={v.pedidoId} esperado={v.liquidoEsperado} />
        ),
    },
  ]

  return (
    <Pilha gap={16}>
      <Ferramentas direita={<PreverRepasses />} />

      <Abas
        itens={[
          { id: '', rotulo: 'Todas', contagem: c.vendas.length },
          ...(Object.keys(c.totais) as StatusVenda[])
            .filter((s) => c.totais[s].qtd > 0)
            .sort((a, b) => {
              const peso = (s: StatusVenda) => (EXIGEM_DECISAO.includes(s) ? 0 : 1)
              return peso(a) - peso(b) || c.totais[b].qtd - c.totais[a].qtd
            })
            .map((s) => ({
              id: s,
              rotulo: ROTULO_STATUS_VENDA[s],
              contagem: c.totais[s].qtd,
              tom: TOM[s],
            })),
        ]}
        ativo={filtro}
        base="/financeiro/conciliacao"
        chave="status"
      />

      <GradeIndicadores>
        <Indicador
          icone="check-circulo"
          tom="ok"
          rotulo="Conciliadas"
          valor={String(c.totais.conciliada.qtd)}
          nota={
            c.vendas.length
              ? `${((c.totais.conciliada.qtd / c.vendas.length) * 100).toFixed(1).replace('.', ',')}% das vendas`
              : 'Nenhuma venda no período'
          }
          tomNota="ok"
        />
        <Indicador
          icone="alerta"
          tom={naFila ? 'erro' : 'ok'}
          rotulo="Precisam de ação"
          valor={String(naFila)}
          tomValor={naFila ? 'erro' : 'ok'}
          nota={
            naFila
              ? 'Chargeback, venda sem crédito ou divergência de valor'
              : 'Nenhuma venda parada esperando gente'
          }
          tomNota={naFila ? 'erro' : 'ok'}
        />
        <Indicador
          icone="relogio"
          tom="info"
          rotulo="Aguardando prazo"
          valor={String(c.totais.aguardando.qtd)}
          nota="Dentro do prazo de repasse — ainda não é problema"
        />
        <Indicador
          icone="porcento"
          tom="ouro"
          rotulo="Tarifa média real"
          valor={`${taxaEfetiva.toFixed(2).replace('.', ',')}%`}
          delta={
            c.taxaMediaReal > 0
              ? {
                  pct: desvioTaxa,
                  base: `vs. ${c.taxaMediaPrevista.toFixed(2).replace('.', ',')}% prevista`,
                  subirEhRuim: true,
                  unidade: 'p.p.',
                }
              : undefined
          }
          nota={
            c.taxaMediaReal > 0
              ? undefined
              : 'Estimada pelo parâmetro — nenhum repasse com tarifa real ainda'
          }
        />
        <Indicador
          icone="moeda"
          tom="neutro"
          rotulo="Volume bruto"
          valor={brl(c.volumeBruto)}
          nota={`${plural(comCredito, 'venda creditada', 'vendas creditadas')} · ${brl(c.valorCreditado)}`}
        />
        <Indicador
          icone="balanca"
          tom={Math.abs(c.diferencaTotal) > 1 ? 'erro' : 'ok'}
          rotulo="Diferença acumulada"
          valor={brl(c.diferencaTotal)}
          tomValor={c.diferencaTotal < 0 ? 'erro' : c.diferencaTotal > 0 ? 'ouro' : 'ok'}
          nota={
            c.diferencaTotal < 0
              ? 'A menos do que era esperado receber'
              : c.diferencaTotal > 0
                ? 'A mais do que era esperado receber'
                : 'Tudo bate com o esperado'
          }
          tomNota={c.diferencaTotal < 0 ? 'erro' : 'neutro'}
        />
      </GradeIndicadores>

      <ComTrilha
        largura={330}
        trilha={
          selecionada ? (
            <Painel
              titulo="Detalhes da divergência"
              icone="busca"
              tom={TOM[selecionada.status]}
              acao={<Chip tom={TOM[selecionada.status]}>{ROTULO_STATUS_VENDA[selecionada.status]}</Chip>}
            >
              <Pilha gap={3}>
                <span className="font-display" style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-tinta)' }}>
                  {`Pedido ${selecionada.pedidoId}`}
                </span>
                <span className="font-sans" style={{ fontSize: 11, color: 'rgba(242,237,227,.5)' }}>
                  {`${selecionada.cliente} · ${selecionada.canal}${selecionada.meio !== '—' ? ` · ${selecionada.meio}` : ''}`}
                </span>
              </Pilha>

              <Pilha gap={0}>
                <Etiqueta>Comparativo financeiro</Etiqueta>
                <LinhaValor rotulo="Bruto do pedido" valor={brl(selecionada.bruto)} />
                <LinhaValor rotulo="Tarifa prevista" valor={brl(selecionada.taxaEsperada)} tom="neutro" />
                <LinhaValor
                  rotulo="Tarifa real"
                  valor={selecionada.taxaReal === null ? '—' : brl(selecionada.taxaReal)}
                  tom={
                    selecionada.taxaReal !== null &&
                    Math.abs(selecionada.taxaReal - selecionada.taxaEsperada) > 0.05
                      ? 'erro'
                      : 'neutro'
                  }
                />
                <LinhaValor rotulo="Líquido esperado" valor={brl(selecionada.liquidoEsperado)} />
                <LinhaValor
                  rotulo="Caiu na conta"
                  valor={selecionada.liquidoRecebido === null ? '—' : brl(selecionada.liquidoRecebido)}
                  tom={selecionada.liquidoRecebido === null ? 'neutro' : 'ok'}
                />
                <LinhaValor
                  rotulo="Diferença encontrada"
                  valor={brl(selecionada.diferenca)}
                  tom={selecionada.diferenca < 0 ? 'erro' : selecionada.diferenca > 0 ? 'ouro' : 'ok'}
                  nota={
                    selecionada.bruto > 0 && selecionada.diferenca !== 0
                      ? `${((Math.abs(selecionada.diferenca) / selecionada.bruto) * 100).toFixed(2).replace('.', ',')}% do bruto`
                      : undefined
                  }
                  destaque
                />
              </Pilha>

              <Destaque tom={TOM[selecionada.status]} icone="info" titulo="Provável causa">
                <span
                  className="font-sans"
                  style={{ fontSize: 11, lineHeight: 1.55, color: 'rgba(242,237,227,.6)', textWrap: 'pretty' }}
                >
                  {causaDe(selecionada)}
                </span>
              </Destaque>

              {selecionada.status !== 'conciliada' && selecionada.status !== 'estornada' && (
                <Pilha gap={7}>
                  <Etiqueta>Ação sugerida</Etiqueta>
                  <span
                    className="font-sans"
                    style={{ fontSize: 10.5, lineHeight: 1.5, color: 'rgba(242,237,227,.45)', textWrap: 'pretty' }}
                  >
                    Informe o crédito que caiu de fato — a divergência é recalculada na leitura,
                    nunca digitada.
                  </span>
                  <ConciliarRepasse
                    pedidoId={selecionada.pedidoId}
                    esperado={selecionada.liquidoEsperado}
                  />
                </Pilha>
              )}

              <Pilha gap={0}>
                <Etiqueta>Histórico do pedido</Etiqueta>
                {[
                  selecionada.previstoEm && {
                    quando: selecionada.previstoEm,
                    texto: 'Pedido realizado e pagamento confirmado',
                    tom: 'info' as TomUi,
                  },
                  selecionada.recebidoEm
                    ? {
                        quando: selecionada.recebidoEm.slice(0, 10),
                        texto: 'Crédito identificado no extrato',
                        tom: 'ok' as TomUi,
                      }
                    : {
                        quando: null,
                        texto: 'Crédito ainda não identificado no extrato',
                        tom: 'atencao' as TomUi,
                      },
                ]
                  .filter(Boolean)
                  .map((e) => {
                    const ev = e as { quando: string | null; texto: string; tom: TomUi }
                    return (
                      <span
                        key={ev.texto}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 9,
                          padding: '7px 0',
                          borderTop: '1px solid rgba(255,255,255,.05)',
                        }}
                      >
                        <Bolinha cor={TINTA[ev.tom]} tamanho={7} />
                        <span
                          className="font-sans"
                          style={{ flex: 1, fontSize: 10.5, lineHeight: 1.4, color: 'rgba(242,237,227,.6)' }}
                        >
                          {ev.texto}
                        </span>
                        {ev.quando && (
                          <Num tamanho={10} peso={400} tom="neutro">
                            {diaCurtoPt(ev.quando)}
                          </Num>
                        )}
                      </span>
                    )
                  })}
              </Pilha>

              <div style={{ display: 'flex', gap: 8 }}>
                {posicao > 0 && (
                  <BotaoLinha href={urlDe(visiveis[posicao - 1].pedidoId)} icone="seta-esquerda">
                    Anterior
                  </BotaoLinha>
                )}
                <div style={{ flex: 1 }} />
                {posicao >= 0 && posicao < visiveis.length - 1 && (
                  <BotaoLinha href={urlDe(visiveis[posicao + 1].pedidoId)} primario>
                    Próximo
                  </BotaoLinha>
                )}
              </div>
            </Painel>
          ) : (
            <Painel titulo="Detalhes da divergência" icone="busca">
              <Vazio icone="busca" texto="Selecione uma venda na tabela para abrir o detalhe." />
            </Painel>
          )
        }
      >
        <Painel
          titulo="Conciliação: pedidos vs. extrato"
          icone="lista"
          nota={filtro ? ROTULO_STATUS_VENDA[filtro] : 'todas as vendas do período'}
        >
          <TabelaUi
            colunas={colunas}
            itens={visiveis}
            chaveDe={(v) => v.pedidoId}
            larguraMinima={900}
            selecionadoDe={(v) => v.pedidoId === selecionada?.pedidoId}
            faixaDe={(v) =>
              v.status === 'chargeback' || v.status === 'sem_credito' || v.status === 'valor_divergente'
                ? 'erro'
                : v.status === 'taxa_divergente'
                  ? 'atencao'
                  : null
            }
            vazio={<Vazio icone="busca" texto="Nenhuma venda neste status." />}
            rodape={
              visiveis.length > 0 ? (
                <RodapeTabela
                  contagem={plural(visiveis.length, 'venda listada', 'vendas listadas')}
                  totais={[
                    { rotulo: 'Bruto', valor: brl(visiveis.reduce((a, v) => a + v.bruto, 0)) },
                    {
                      rotulo: 'Creditado',
                      valor: brl(visiveis.reduce((a, v) => a + (v.liquidoRecebido ?? 0), 0)),
                      tom: 'ok',
                    },
                    {
                      rotulo: 'Diferença',
                      valor: brl(visiveis.reduce((a, v) => a + v.diferenca, 0)),
                      tom: visiveis.reduce((a, v) => a + v.diferenca, 0) < 0 ? 'erro' : 'ouro',
                    },
                  ]}
                />
              ) : null
            }
          />
        </Painel>
      </ComTrilha>

      <Colunas proporcao="minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)">
        <Painel titulo="Resumo do período" icone="calculadora">
          <Pilha gap={0}>
            <LinhaResumo rotulo="Volume bruto" valor={brl(c.volumeBruto)} nota={plural(c.vendas.length, 'transação', 'transações')} />
            <LinhaResumo rotulo="Valor creditado" valor={brl(c.valorCreditado)} nota={plural(comCredito, 'crédito', 'créditos')} tom="ok" />
            <LinhaResumo
              rotulo="Tarifa retida"
              valor={brl(c.volumeBruto - c.valorCreditado - Math.abs(Math.min(0, c.diferencaTotal)))}
              nota={`${taxaEfetiva.toFixed(2).replace('.', ',')}% do bruto`}
              tom="erro"
            />
            <LinhaResumo
              rotulo="Diferença total"
              valor={brl(c.diferencaTotal)}
              tom={c.diferencaTotal < 0 ? 'erro' : 'ouro'}
              destaque
            />
          </Pilha>
        </Painel>

        <Painel
          titulo="Principais causas de divergência"
          icone="alerta"
          tom="atencao"
          acao={naFila > 0 ? <AcaoPainel href="/financeiro/conciliacao?status=chargeback">Ver críticas</AcaoPainel> : undefined}
        >
          {causas.length > 0 ? (
            <ListaBarras itens={causas} />
          ) : (
            <Vazio icone="check-circulo" texto="Nenhuma divergência aberta no período." />
          )}
        </Painel>

        <Painel titulo="Dicas rápidas" icone="info" tom="info">
          <Pilha gap={9}>
            {[
              'Tarifa cobrada corretamente é CUSTO, não divergência: ela já entra na DRE como dedução da receita.',
              'Divergência é a diferença entre a tarifa REAL do extrato e a esperada pelo contrato do adquirente.',
              'Crédito de Pix pode cair em até 30 minutos; cartão respeita o prazo do adquirente. Antes disso, a venda fica "Aguardando".',
              'Chargeback reverte a venda inteira — no caixa e no resultado — e o prazo de contestação corre contra a loja.',
            ].map((t) => (
              <span key={t} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                <span
                  aria-hidden
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 2,
                    marginTop: 6,
                    flex: 'none',
                    background: 'rgba(127,169,216,.6)',
                  }}
                />
                <span
                  className="font-sans"
                  style={{
                    fontSize: 11,
                    lineHeight: 1.55,
                    color: 'rgba(242,237,227,.56)',
                    textWrap: 'pretty',
                  }}
                >
                  {t}
                </span>
              </span>
            ))}
          </Pilha>
        </Painel>
      </Colunas>
    </Pilha>
  )
}

function LinhaResumo({
  rotulo,
  valor,
  nota,
  tom,
  destaque,
}: {
  rotulo: string
  valor: string
  nota?: string
  tom?: TomUi
  destaque?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: destaque ? '11px 0' : '9px 0',
        borderTop: '1px solid rgba(255,255,255,.05)',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span
          className="font-sans"
          style={{
            fontSize: destaque ? 12.5 : 12,
            fontWeight: destaque ? 600 : 400,
            color: destaque ? 'var(--color-tinta)' : 'rgba(242,237,227,.7)',
          }}
        >
          {rotulo}
        </span>
        {nota && <Etiqueta>{nota}</Etiqueta>}
      </span>
      <Num tamanho={destaque ? 15 : 12.5} peso={destaque ? 600 : 500} tom={tom}>
        {valor}
      </Num>
    </div>
  )
}
