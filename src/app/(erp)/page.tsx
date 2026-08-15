import Link from 'next/link'

import {
  AcaoPainel,
  Celula,
  Chip,
  Colunas,
  Comparacao,
  Etiqueta,
  Ferramentas,
  GradeIndicadores,
  Ico,
  Indicador,
  LinhaValor,
  Num,
  Painel,
  Pilha,
  Pilula,
  Segmentado,
  TINTA,
  Vazio,
  type Delta,
  type NomeIcone,
  type TomUi,
} from '@/components/erp/ui'
import { AreaPontos, PALETA, RoscaLegenda, curto } from '@/components/erp/Visualizacoes'
import { carregarDashboard } from '@/data/consultas'
import { carregarPainelPrincipal, PERIODOS, variacao, type Periodo } from '@/data/painel'
import { sessaoAtual } from '@/data/sessao'
import { brl, diaCurtoPt, num, plural } from '@/domain'

/**
 * Dashboard Principal — a central de decisão operacional e gerencial.
 *
 * O critério do escopo é de dez segundos: ao abrir o ERP, o dono precisa
 * entender se o negócio está saudável, quais exceções exigem ação e qual
 * módulo abrir em seguida. Por isso a ordem é sempre a mesma — saúde,
 * exceções, tendência, diagnóstico —, e nenhum número aparece sem a
 * comparação que lhe dá sentido.
 *
 * A regra de integridade que sustenta os números: faturamento sai de PEDIDOS
 * PAGOS, caixa sai de LANÇAMENTOS BAIXADOS. As duas grandezas convivem sem se
 * somar, e é isso que impede o mesmo recebimento de ser contado duas vezes.
 */
export const dynamic = 'force-dynamic'

const TOM_PENDENCIA: Record<string, TomUi> = {
  ok: 'ok',
  atencao: 'atencao',
  erro: 'erro',
  info: 'info',
  ouro: 'ouro',
  neutro: 'neutro',
}

const ICONE_PENDENCIA: Record<string, NomeIcone> = {
  Urgente: 'alerta',
  Financeiro: 'cifrao',
  Preço: 'etiqueta',
  Bloqueia: 'alerta-circulo',
  Cadastro: 'documento',
  Estoque: 'caixa',
  Devoluções: 'repetir',
  Entregas: 'carrinho',
  Transporte: 'alerta',
}

/** Atalhos do §2.3 — os módulos de maior uso, sem replicar o menu inteiro. */
const ATALHOS: { rotulo: string; href: string; icone: NomeIcone; tom: TomUi }[] = [
  { rotulo: 'Pedidos', href: '/pedidos', icone: 'carrinho', tom: 'ouro' },
  { rotulo: 'Envase', href: '/envase', icone: 'frasco', tom: 'ciano' },
  { rotulo: 'Estoque', href: '/estoque', icone: 'caixa', tom: 'info' },
  { rotulo: 'Financeiro', href: '/financeiro', icone: 'cifrao', tom: 'ok' },
  { rotulo: 'CRM', href: '/crm', icone: 'pessoas', tom: 'roxo' },
  { rotulo: 'Relatórios', href: '/relatorios', icone: 'barras', tom: 'atencao' },
]

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  const { periodo } = await searchParams
  const escolhido = (PERIODOS.some((p) => p.id === periodo) ? periodo : '30d') as Periodo

  const [p, geral, usuario] = await Promise.all([
    carregarPainelPrincipal(escolhido),
    carregarDashboard(),
    sessaoAtual(),
  ])

  const primeiroNome = (usuario?.nome ?? '').trim().split(/\s+/)[0] || null

  if (p.semBanco) {
    return (
      <Pilha>
        <Painel>
          <Vazio icone="cadeado" texto="O Supabase precisa estar configurado para o Dashboard ler a operação." />
        </Painel>
      </Pilha>
    )
  }

  /** Delta pronto, com a regra de base zero do §10. */
  const delta = (atual: number, anterior: number, subirEhRuim = false): Delta | undefined => {
    const v = variacao(atual, anterior)
    return v === null ? undefined : { pct: v, base: `vs. ${p.base.rotulo}`, subirEhRuim }
  }
  const semBase = (anterior: number) =>
    anterior === 0 ? `sem base de comparação em ${p.base.rotulo}` : undefined

  const serieFaturamento = p.serieDiaria.map((d) => d.faturamento)

  // Cobertura média PONDERADA pelo volume disponível, como manda §6.1: a
  // média simples deixaria uma base de 2 ml com 90 dias de cobertura puxar o
  // indicador para cima. Bases sem giro ficam de fora — elas não têm "0 dias
  // de cobertura", têm ausência de consumo, que é outra coisa.
  const comGiro = geral.estoque.coberturas.filter((c) => c.dias !== null && c.disponivelMl > 0)
  const mlComGiro = comGiro.reduce((a, c) => a + c.disponivelMl, 0)
  const coberturaMedia = mlComGiro
    ? Math.round(comGiro.reduce((a, c) => a + (c.dias ?? 0) * c.disponivelMl, 0) / mlComGiro)
    : 0
  const alertas = geral.pendencias.filter((x) => x.contagem > 0)
  const totalCanal = p.porCanal.reduce((a, c) => a + c.valor, 0)
  const totalCategoria = p.porCategoria.reduce((a, c) => a + c.valor, 0)

  return (
    <Pilha gap={16}>

      <Ferramentas
        esquerda={
          <>
            <Pilula icone="calendario">
              {`${p.janela.rotulo} · ${diaCurtoPt(p.janela.de)} a ${diaCurtoPt(p.janela.ate)}`}
            </Pilula>
            <Comparacao texto="comparado a" alvo={p.base.rotulo} />
          </>
        }
        direita={
          <Segmentado opcoes={PERIODOS} ativo={escolhido} base="/" chave="periodo" />
        }
      />

      {/* Camada 1 — saúde do negócio */}
      <GradeIndicadores minimo={206}>
        <Indicador
          icone="cifrao"
          tom="ouro"
          rotulo="Faturamento total"
          valor={brl(p.atual.faturamento)}
          delta={delta(p.atual.faturamento, p.anterior.faturamento)}
          nota={semBase(p.anterior.faturamento)}
          faixa={serieFaturamento}
          href="/relatorios"
        />
        <Indicador
          icone="carrinho"
          tom="info"
          rotulo="Pedidos pagos"
          valor={String(p.atual.pedidos)}
          delta={delta(p.atual.pedidos, p.anterior.pedidos)}
          nota={semBase(p.anterior.pedidos)}
          faixa={p.serieDiaria.map((d) => d.pedidos)}
          href="/pedidos"
        />
        <Indicador
          icone="etiqueta"
          tom="ciano"
          rotulo="Ticket médio"
          valor={brl(p.atual.ticket)}
          delta={delta(p.atual.ticket, p.anterior.ticket)}
          nota={semBase(p.anterior.ticket)}
        />
        <Indicador
          icone="tendencia"
          tom={p.resultado >= 0 ? 'ok' : 'erro'}
          rotulo="Resultado gerencial"
          valor={brl(p.resultado)}
          tomValor={p.resultado >= 0 ? 'ok' : 'erro'}
          nota="Competência corrente, por regime gerencial"
          href="/financeiro/dre"
        />
        <Indicador
          icone="porcento"
          tom="roxo"
          rotulo="Margem líquida"
          valor={`${p.margemPct.toFixed(1).replace('.', ',')}%`}
          tomValor={p.margemPct >= 0 ? 'ok' : 'erro'}
          nota={`Sobre ${brl(p.receitaLiquida)} de receita líquida`}
          href="/financeiro/dre"
        />
      </GradeIndicadores>

      <GradeIndicadores minimo={206}>
        <Indicador
          icone="pessoas"
          tom="roxo"
          rotulo="Clientes novos"
          valor={String(p.atual.clientesNovos)}
          delta={delta(p.atual.clientesNovos, p.anterior.clientesNovos)}
          nota={semBase(p.anterior.clientesNovos) ?? 'Primeiro pedido pago caiu no período'}
          href="/crm"
        />
        <Indicador
          icone="frasco"
          tom="ciano"
          rotulo="Decants vendidos"
          valor={p.atual.volumeMl > 0 ? `${num(p.atual.volumeMl)} ml` : '—'}
          nota={
            p.atual.volumeMl > 0
              ? 'Volume fracionado efetivamente vendido'
              : 'Sem volume identificado nas variantes do período'
          }
          href="/envase"
        />
        <Indicador
          icone="caixa"
          tom={geral.estoque.criticos ? 'erro' : 'ok'}
          rotulo="Estoque crítico"
          valor={String(geral.estoque.criticos)}
          tomValor={geral.estoque.criticos ? 'erro' : 'ok'}
          nota={
            geral.estoque.criticos
              ? 'Bases abaixo de 20 dias de cobertura'
              : 'Nenhuma base abaixo do limite'
          }
          tomNota={geral.estoque.criticos ? 'erro' : 'ok'}
          href="/estoque"
        />
        <Indicador
          icone="saida"
          tom={p.vencidos.qtd ? 'erro' : 'atencao'}
          rotulo="Contas a pagar (7 dias)"
          valor={brl(p.aPagar7.valor)}
          nota={
            p.vencidos.qtd
              ? `${plural(p.vencidos.qtd, 'título vencido', 'títulos vencidos')} · ${brl(p.vencidos.valor)}`
              : plural(p.aPagar7.qtd, 'título a pagar', 'títulos a pagar')
          }
          tomNota={p.vencidos.qtd ? 'erro' : 'neutro'}
          href="/financeiro/lancamentos?tipo=saida"
        />
        <Indicador
          icone="entrada"
          tom="ok"
          rotulo="Contas a receber (7 dias)"
          valor={brl(p.aReceber7.valor)}
          nota={plural(p.aReceber7.qtd, 'título a receber', 'títulos a receber')}
          tomNota="ok"
          href="/financeiro/lancamentos?tipo=entrada"
        />
      </GradeIndicadores>

      {/* Camada 3 — tendência, e camada 2 na coluna da direita */}
      <Colunas proporcao="minmax(0,1.55fr) minmax(0,1fr) minmax(0,1fr)">
        <Painel
          titulo="Faturamento diário"
          icone="linha"
          nota="últimos 30 dias"
          acao={<AcaoPainel href="/relatorios">Ver relatório completo</AcaoPainel>}
          rodape={{
            nota: 'Só pedidos pagos, sem cancelados nem estornados. É a mesma base do relatório de vendas.',
          }}
        >
          {serieFaturamento.some((v) => v > 0) ? (
            <AreaPontos
              valores={serieFaturamento}
              rotulos={p.serieDiaria.map((d, i) =>
                i % 5 === 0 || i === p.serieDiaria.length - 1 ? diaCurtoPt(d.dia) : '',
              )}
              altura={228}
              formatar={curto}
            />
          ) : (
            <Vazio icone="linha" texto="Nenhuma venda paga nos últimos 30 dias." />
          )}
        </Painel>

        <Painel
          titulo="Vendas por categoria"
          icone="pizza"
          nota={p.janela.rotulo.toLowerCase()}
          rodape={{ link: { href: '/produtos', texto: 'Ver catálogo' } }}
        >
          {p.porCategoria.length > 0 ? (
            <RoscaLegenda
              fatias={p.porCategoria.map((c) => ({ rotulo: c.rotulo, valor: c.valor }))}
              total={totalCategoria}
              legendaTotal="Total vendido"
              formatar={brl}
              tamanho={158}
              maximo={5}
            />
          ) : (
            <Vazio icone="pizza" texto="Nenhuma venda classificada no período." />
          )}
        </Painel>

        <Painel
          titulo="Alertas importantes"
          icone="sino"
          tom={alertas.length ? 'atencao' : 'ok'}
          nota={alertas.length ? `${alertas.length} exigem ação` : undefined}
          rodape={alertas.length > 4 ? { link: { href: '/relatorios', texto: 'Ver todos os alertas' } } : undefined}
        >
          {alertas.length === 0 ? (
            <Vazio icone="check-circulo" texto="Nenhuma exceção aberta. A operação está em dia." />
          ) : (
            <Pilha gap={0}>
              {alertas.slice(0, 5).map((a) => (
                <Link
                  key={a.titulo}
                  href={a.href}
                  className="hover:brightness-125"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 0',
                    borderTop: '1px solid rgba(255,255,255,.05)',
                    textDecoration: 'none',
                  }}
                >
                  <span style={{ color: TINTA[TOM_PENDENCIA[a.tom] ?? 'neutro'], paddingTop: 1 }}>
                    <Ico n={ICONE_PENDENCIA[a.etiqueta] ?? 'info'} tamanho={15} />
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                    <span
                      className="font-sans"
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        lineHeight: 1.35,
                        color: TINTA[TOM_PENDENCIA[a.tom] ?? 'neutro'],
                        textWrap: 'pretty',
                      }}
                    >
                      {`${a.contagem} · ${a.titulo}`}
                    </span>
                    <span
                      className="font-sans"
                      style={{
                        fontSize: 10.5,
                        lineHeight: 1.4,
                        color: 'rgba(242,237,227,.42)',
                        textWrap: 'pretty',
                      }}
                    >
                      {a.hint}
                    </span>
                  </span>
                </Link>
              ))}
            </Pilha>
          )}
        </Painel>
      </Colunas>

      {/* Camada 4 — diagnóstico rápido */}
      <Colunas proporcao="minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr)">
        <Painel
          titulo="Top 5 perfumes mais vendidos"
          icone="frasco"
          nota={p.janela.rotulo.toLowerCase()}
          acao={<AcaoPainel href="/produtos">Ver todos os produtos</AcaoPainel>}
        >
          {p.topProdutos.length > 0 ? (
            <Pilha gap={0}>
              {p.topProdutos.map((t, i) => (
                <div
                  key={t.nome}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '26px minmax(0,1fr) 92px 116px',
                    gap: 12,
                    alignItems: 'center',
                    padding: '10px 0',
                    borderTop: '1px solid rgba(255,255,255,.05)',
                  }}
                >
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: i === 0 ? TINTA.ouro : 'rgba(242,237,227,.3)',
                    }}
                  >
                    {i + 1}
                  </span>
                  {t.baseId ? (
                    <Link
                      href={`/produtos/${t.baseId}`}
                      className="hover:brightness-125"
                      style={{ textDecoration: 'none', minWidth: 0 }}
                    >
                      <Celula principal={t.nome} />
                    </Link>
                  ) : (
                    <Celula principal={t.nome} />
                  )}
                  <span style={{ textAlign: 'right' }}>
                    <Num tamanho={11.5} tom="ciano" peso={400}>
                      {t.ml > 0 ? `${num(t.ml)} ml` : '—'}
                    </Num>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <Num tamanho={12}>{brl(t.faturamento)}</Num>
                  </span>
                </div>
              ))}
            </Pilha>
          ) : (
            <Vazio icone="frasco" texto="Nenhum item vendido no período." />
          )}
        </Painel>

        <Painel
          titulo="Canais de venda"
          icone="megafone"
          nota="origem do pedido, não meio de pagamento"
          rodape={{ link: { href: '/pedidos', texto: 'Ver pedidos' } }}
        >
          {p.porCanal.length > 0 ? (
            <RoscaLegenda
              fatias={p.porCanal.map((c, i) => ({
                rotulo: c.rotulo,
                valor: c.valor,
                cor: PALETA[i % PALETA.length],
              }))}
              total={totalCanal}
              legendaTotal="Faturamento"
              formatar={brl}
              tamanho={158}
              maximo={5}
            />
          ) : (
            <Vazio icone="megafone" texto="Nenhuma venda com canal identificado." />
          )}
        </Painel>

        <Painel
          titulo="Atividades recentes"
          icone="relogio"
          nota="movimentos financeiros baixados"
          rodape={{ link: { href: '/financeiro/lancamentos', texto: 'Ver todas as atividades' } }}
        >
          {p.atividades.length > 0 ? (
            <Pilha gap={0}>
              {p.atividades.map((a, i) => (
                <Link
                  key={`${a.quando}-${i}`}
                  href={a.href}
                  className="hover:brightness-125"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 0',
                    borderTop: '1px solid rgba(255,255,255,.05)',
                    textDecoration: 'none',
                  }}
                >
                  <span style={{ color: 'rgba(242,237,227,.3)' }}>
                    <Ico n="recibo" tamanho={14} />
                  </span>
                  <span
                    className="font-sans"
                    style={{
                      flex: 1,
                      fontSize: 11.5,
                      color: 'rgba(242,237,227,.72)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {a.texto}
                  </span>
                  <Num tamanho={10} peso={400} tom="neutro">
                    {diaCurtoPt(a.quando)}
                  </Num>
                </Link>
              ))}
            </Pilha>
          ) : (
            <Vazio icone="relogio" texto="Nenhuma baixa registrada ainda." />
          )}
        </Painel>
      </Colunas>

      {/* Faixa inferior — caixa, cobertura e compromissos próximos */}
      <Colunas proporcao="minmax(0,1.25fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)">
        <Painel
          titulo="Fluxo de caixa do dia"
          icone="carteira"
          nota="só o que foi movimentado hoje"
          rodape={{ link: { href: '/financeiro/fluxo-de-caixa', texto: 'Ver fluxo completo' } }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Pilha gap={5}>
              <Etiqueta>Entradas</Etiqueta>
              <Num tamanho={15} tom="ok">
                {brl(p.caixaDia.entradas)}
              </Num>
            </Pilha>
            <Pilha gap={5}>
              <Etiqueta>Saídas</Etiqueta>
              <Num tamanho={15} tom="erro">
                {brl(p.caixaDia.saidas)}
              </Num>
            </Pilha>
            <Pilha gap={5}>
              <Etiqueta>Saldo do dia</Etiqueta>
              <Num
                tamanho={15}
                tom={p.caixaDia.entradas - p.caixaDia.saidas >= 0 ? 'ouro' : 'erro'}
              >
                {brl(p.caixaDia.entradas - p.caixaDia.saidas)}
              </Num>
            </Pilha>
          </div>
          <LinhaValor
            rotulo="Saldo disponível nas contas"
            valor={brl(p.saldoDisponivel)}
            tom={p.saldoDisponivel > 0 ? 'ok' : 'erro'}
            destaque
          />
          <span
            className="font-sans"
            style={{ fontSize: 10, lineHeight: 1.45, color: 'rgba(242,237,227,.34)', textWrap: 'pretty' }}
          >
            Transferências entre contas próprias são neutralizadas no consolidado.
          </span>
        </Painel>

        <Painel
          titulo="Cobertura de estoque"
          icone="caixa"
          nota="média das bases sob controle"
          rodape={{ link: { href: '/estoque', texto: 'Ver perfumes base' } }}
        >
          <Pilha gap={7}>
            <Num tamanho={26} tom={geral.estoque.criticos ? 'atencao' : 'ok'} peso={600}>
              {coberturaMedia > 0 ? `${coberturaMedia} dias` : '—'}
            </Num>
            <span
              className="font-sans"
              style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(242,237,227,.45)', textWrap: 'pretty' }}
            >
              {geral.estoque.criticos
                ? `${plural(geral.estoque.criticos, 'base abaixo', 'bases abaixo')} de 20 dias — repor o quanto antes.`
                : geral.estoque.semGiro
                  ? `Nenhuma base sob risco. ${plural(geral.estoque.semGiro, 'base sem giro fica', 'bases sem giro ficam')} fora da média.`
                  : 'Nenhuma base sob risco de ruptura.'}
            </span>
          </Pilha>
        </Painel>

        <Painel
          titulo="Pagamentos próximos"
          icone="saida"
          tom="erro"
          nota="7 dias"
          rodape={{ link: { href: '/financeiro/lancamentos?tipo=saida', texto: 'Ver contas a pagar' } }}
        >
          <Pilha gap={7}>
            <Num tamanho={22} tom="erro" peso={600}>
              {brl(p.aPagar7.valor)}
            </Num>
            <span className="font-sans" style={{ fontSize: 11, color: 'rgba(242,237,227,.45)' }}>
              {plural(p.aPagar7.qtd, 'título a pagar', 'títulos a pagar')}
            </span>
            {p.vencidos.qtd > 0 && (
              <Chip tom="erro">{`${brl(p.vencidos.valor)} já vencidos`}</Chip>
            )}
          </Pilha>
        </Painel>

        <Painel
          titulo="Recebimentos próximos"
          icone="entrada"
          tom="ok"
          nota="7 dias"
          rodape={{ link: { href: '/financeiro/lancamentos?tipo=entrada', texto: 'Ver recebimentos' } }}
        >
          <Pilha gap={7}>
            <Num tamanho={22} tom="ok" peso={600}>
              {brl(p.aReceber7.valor)}
            </Num>
            <span className="font-sans" style={{ fontSize: 11, color: 'rgba(242,237,227,.45)' }}>
              {plural(p.aReceber7.qtd, 'título a receber', 'títulos a receber')}
            </span>
          </Pilha>
        </Painel>
      </Colunas>

      <Painel titulo="Acesso rápido" icone="grade" nota="os módulos de maior uso">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 11,
          }}
        >
          {ATALHOS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="hover:border-ouro/35"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                padding: '13px 14px',
                border: '1px solid rgba(255,255,255,.06)',
                borderRadius: 12,
                background: 'rgba(255,255,255,.012)',
                textDecoration: 'none',
              }}
            >
              <span style={{ color: TINTA[a.tom] }}>
                <Ico n={a.icone} tamanho={17} />
              </span>
              <span
                className="font-sans"
                style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(242,237,227,.82)' }}
              >
                {a.rotulo}
              </span>
            </Link>
          ))}
        </div>
      </Painel>
    </Pilha>
  )
}
