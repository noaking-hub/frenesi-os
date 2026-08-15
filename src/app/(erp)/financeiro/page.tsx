import Link from 'next/link'

import {
  AcaoPainel,
  BotaoLinha,
  Celula,
  Chip,
  Colunas,
  Comparacao,
  Destaque,
  Etiqueta,
  Ferramentas,
  GradeIndicadores,
  Ico,
  Indicador,
  LinhaValor,
  LinkSeta,
  Num,
  Painel,
  Pilha,
  Pilula,
  Segmentado,
  TINTA,
  TabelaUi,
  Vazio,
  type ColunaUi,
  type TomUi,
} from '@/components/erp/ui'
import { TileMarca, iconeDaCategoria } from '@/components/erp/Marcas'
import { BarrasEixo, CORES_SERIE, Legenda, RoscaLegenda } from '@/components/erp/Visualizacoes'
import { carregarVisaoFinanceira } from '@/data/financeiro'
import { brl, competenciaPorExtenso, diaCurtoPt, plural } from '@/domain'
import type { AlertaFinanceiro, LancamentoGerencial } from '@/domain'

/**
 * Dashboard Financeiro — a tela inicial do módulo.
 *
 * Responde três perguntas nesta ordem: quanto tem, quanto vai ter, e o que
 * exige decisão hoje. Uma lista de lançamentos não responde nenhuma das três
 * — por isso deixou de ser a porta de entrada do Financeiro.
 *
 * Todo indicador daqui carrega comparação ou nota. Número sem contexto é o
 * que o escopo proíbe, e é o que transforma painel em planilha escura.
 */
export const dynamic = 'force-dynamic'

const TOM_ALERTA: Record<AlertaFinanceiro['severidade'], TomUi> = {
  critico: 'erro',
  atencao: 'atencao',
  informativo: 'info',
}

export default async function DashboardFinanceiro({
  searchParams,
}: {
  searchParams: Promise<{ fluxo?: string }>
}) {
  const { fluxo } = await searchParams
  // O mockup abre em 7 dias: horizonte curto o bastante para cada barra ter
  // nome, com 30 e 90 a um clique para quem procura o vale.
  const horizonte = ['7', '30', '90'].includes(fluxo ?? '') ? Number(fluxo) : 7
  const v = await carregarVisaoFinanceira()

  if (v.semBanco) {
    return (
      <Pilha>
        <Painel>
          <Vazio
            icone="cadeado"
            texto="O Supabase precisa estar configurado para o Financeiro ler contas, lançamentos e conciliação."
          />
        </Painel>
      </Pilha>
    )
  }

  // Variação contra o caixa de HOJE: é a única comparação que a projeção
  // permite sem inventar histórico. "Cresce 8% até domingo" informa; o saldo
  // bruto de domingo, sozinho, não.
  const variacao = (futuro: number) =>
    v.caixaHoje !== 0 ? ((futuro - v.caixaHoje) / Math.abs(v.caixaHoje)) * 100 : 0

  const totalSaidas = v.saidasPorCategoria.reduce((a, c) => a + c.valor, 0)
  const risco = v.projecao.menorSaldo < 0

  const barras = v.projecao.dias.slice(0, horizonte).map((d) => ({
    rotulo: diaCurtoPt(d.dia),
    entrada: d.entradas,
    saida: d.saidas,
    saldo: d.saldo,
    previsto: !d.realizado,
  }))

  // As linhas do resumo saem das mesmas grandezas da DRE, por subtração:
  // nenhum subtotal é digitado, e o cartão nunca discorda da tela cheia.
  const custosVariaveis = v.receitaLiquidaMes - v.margemMes
  const despesasFixas = v.margemMes - v.resultadoMes

  const hoje = new Date().toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <Pilha gap={16}>

      <Ferramentas
        esquerda={
          <>
            <Pilula icone="calendario">{`Hoje, ${hoje}`}</Pilula>
            <Comparacao texto="competência de" alvo={competenciaPorExtenso(v.competencia)} />
          </>
        }
        direita={
          <BotaoLinha href="/financeiro/configuracoes" icone="ajustes">
            Personalizar dashboard
          </BotaoLinha>
        }
      />

      <GradeIndicadores>
        <Indicador
          icone="carteira"
          tom="ouro"
          rotulo="Saldo disponível hoje"
          valor={brl(v.caixaHoje)}
          tomValor={v.caixaHoje > 0 ? 'ok' : 'erro'}
          nota={
            v.caixaALiquidar > 0
              ? `+ ${brl(v.caixaALiquidar)} a liquidar nos gateways`
              : `Soma de ${plural(v.contas.length, 'conta ativa', 'contas ativas')}`
          }
          href="/financeiro/contas"
        />
        <Indicador
          icone="calendario"
          tom="info"
          rotulo="Saldo projetado 7 dias"
          valor={brl(v.saldo7)}
          delta={{ pct: variacao(v.saldo7), base: 'vs. hoje' }}
          href="/financeiro/fluxo-de-caixa?dias=15"
        />
        <Indicador
          icone="tendencia"
          tom="ciano"
          rotulo="Saldo projetado 30 dias"
          valor={brl(v.saldo30)}
          delta={{ pct: variacao(v.saldo30), base: 'vs. hoje' }}
          href="/financeiro/fluxo-de-caixa?dias=30"
        />
        <Indicador
          icone="saida"
          tom="erro"
          rotulo="Contas a pagar"
          valor={brl(v.aPagar.valor)}
          nota={
            v.vencidos.qtd
              ? `${plural(v.vencidos.qtd, 'compromisso vencido', 'compromissos vencidos')} · ${brl(v.vencidos.valor)}`
              : plural(v.aPagar.qtd, 'compromisso em aberto', 'compromissos em aberto')
          }
          tomNota={v.vencidos.qtd ? 'erro' : 'neutro'}
          href="/financeiro/lancamentos?tipo=saida"
        />
        <Indicador
          icone="entrada"
          tom="ok"
          rotulo="Contas a receber"
          valor={brl(v.aReceber.valor)}
          nota={plural(v.aReceber.qtd, 'recebimento previsto', 'recebimentos previstos')}
          tomNota="ok"
          href="/financeiro/lancamentos?tipo=entrada"
        />
        <Indicador
          icone="recibo"
          tom={v.pendenciasConciliacao.qtd ? 'atencao' : 'ok'}
          rotulo="Pendências de conciliação"
          valor={
            v.pendenciasConciliacao.qtd
              ? `${v.pendenciasConciliacao.qtd} ${v.pendenciasConciliacao.qtd === 1 ? 'venda' : 'vendas'}`
              : 'Tudo conciliado'
          }
          nota={
            v.pendenciasConciliacao.qtd
              ? `${brl(v.pendenciasConciliacao.valor)} em diferença`
              : 'Nenhuma venda exige decisão'
          }
          tomNota={v.pendenciasConciliacao.qtd ? 'atencao' : 'ok'}
          href="/financeiro/conciliacao"
        />
      </GradeIndicadores>

      <Colunas proporcao="minmax(0,1.6fr) minmax(0,1.05fr) minmax(0,.85fr)">
        <Painel
          titulo="Fluxo de caixa projetado"
          icone="barras"
          acao={
            <Segmentado
              opcoes={[
                { id: '7', rotulo: '7 dias' },
                { id: '30', rotulo: '30 dias' },
                { id: '90', rotulo: '90 dias' },
              ]}
              ativo={String(horizonte)}
              base="/financeiro"
              chave="fluxo"
            />
          }
          rodape={{
            nota: 'Projeção baseada em lançamentos confirmados e contas a pagar/receber futuras.',
            link: { href: '/financeiro/fluxo-de-caixa', texto: 'Ver fluxo de caixa' },
          }}
        >
          <Legenda
            itens={[
              { cor: CORES_SERIE.entrada, rotulo: 'Entradas' },
              { cor: CORES_SERIE.saida, rotulo: 'Saídas' },
              { cor: CORES_SERIE.saldo, rotulo: 'Saldo projetado' },
            ]}
          />
          {barras.length > 0 ? (
            <BarrasEixo dados={barras} altura={244} />
          ) : (
            <Vazio icone="barras" texto="Sem movimentos previstos no horizonte." />
          )}
        </Painel>

        <Painel
          titulo="Composição de saídas"
          icone="pizza"
          nota={competenciaPorExtenso(v.competencia)}
          rodape={{ link: { href: '/financeiro/categorias', texto: 'Ver todas as categorias' } }}
        >
          {v.saidasPorCategoria.length > 0 ? (
            <RoscaLegenda
              fatias={v.saidasPorCategoria.map((c) => ({ rotulo: c.categoria, valor: c.valor }))}
              total={totalSaidas}
              legendaTotal="Total de saídas"
              formatar={brl}
              tamanho={176}
            />
          ) : (
            <Vazio icone="pizza" texto="Nenhuma saída classificada nesta competência." />
          )}
        </Painel>

        <Pilha gap={14}>
          <Painel
            titulo="Menor saldo futuro"
            icone={risco ? 'alerta' : 'escudo'}
            tom={risco ? 'erro' : 'ok'}
          >
            {v.projecao.menorSaldoEm ? (
              <Destaque
                tom={risco ? 'erro' : 'ok'}
                titulo={risco ? 'Risco de caixa' : 'Caixa sustentado'}
                icone={risco ? 'alerta-circulo' : 'check-circulo'}
              >
                <span style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <span className="font-sans" style={{ fontSize: 11.5, color: 'rgba(242,237,227,.6)' }}>
                    {new Date(`${v.projecao.menorSaldoEm}T12:00:00`).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                  <Num tamanho={23} tom={risco ? 'erro' : 'ok'} peso={600}>
                    {brl(v.projecao.menorSaldo)}
                  </Num>
                  <span
                    className="font-sans"
                    style={{
                      fontSize: 11,
                      lineHeight: 1.5,
                      color: 'rgba(242,237,227,.5)',
                      textWrap: 'pretty',
                    }}
                  >
                    {risco
                      ? 'A partir desta data o saldo fica negativo. Antecipar um recebimento ou renegociar um vencimento resolve enquanto há prazo.'
                      : 'É o ponto mais baixo do horizonte, e ele continua positivo.'}
                  </span>
                </span>
              </Destaque>
            ) : (
              <Vazio icone="escudo" texto="Sem vale no horizonte projetado." />
            )}
            <LinkSeta href="/financeiro/fluxo-de-caixa">Ver fluxo de caixa completo</LinkSeta>
          </Painel>

          {v.alertas.length > 0 && (
            <Painel titulo="Exige decisão" icone="sino" tom="atencao">
              <Pilha gap={0}>
                {v.alertas.slice(0, 4).map((a) => (
                  <Link
                    key={a.id}
                    href={a.href}
                    className="hover:brightness-125"
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '9px 0',
                      borderTop: '1px solid rgba(255,255,255,.05)',
                      textDecoration: 'none',
                    }}
                  >
                    <span style={{ color: TINTA[TOM_ALERTA[a.severidade]], paddingTop: 1 }}>
                      <Ico n={a.severidade === 'critico' ? 'alerta' : 'info'} tamanho={14} />
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <span
                        className="font-sans"
                        style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          lineHeight: 1.35,
                          color: TINTA[TOM_ALERTA[a.severidade]],
                          textWrap: 'pretty',
                        }}
                      >
                        {a.titulo}
                      </span>
                      <span
                        className="font-sans"
                        style={{ fontSize: 10.5, lineHeight: 1.4, color: 'rgba(242,237,227,.42)' }}
                      >
                        {a.detalhe}
                      </span>
                    </span>
                  </Link>
                ))}
              </Pilha>
            </Painel>
          )}
        </Pilha>
      </Colunas>

      <Colunas proporcao="minmax(0,1fr) minmax(0,1fr) minmax(0,.9fr)">
        <Painel
          titulo="Próximos compromissos"
          icone="saida"
          tom="erro"
          acao={<AcaoPainel href="/financeiro/lancamentos?tipo=saida">Ver contas a pagar</AcaoPainel>}
        >
          <ListaDeTitulos
            itens={v.proximosCompromissos}
            tom="erro"
            vazio="Nada a pagar no horizonte."
          />
        </Painel>

        <Painel
          titulo="Recebimentos previstos"
          icone="entrada"
          tom="ok"
          acao={<AcaoPainel href="/financeiro/lancamentos?tipo=entrada">Ver recebimentos</AcaoPainel>}
        >
          <ListaDeTitulos
            itens={v.proximosRecebimentos}
            tom="ok"
            vazio="Nenhum recebimento agendado."
          />
        </Painel>

        <Painel
          titulo="Resumo da DRE"
          icone="balanca"
          tom="roxo"
          nota={competenciaPorExtenso(v.competencia)}
          rodape={{ link: { href: '/financeiro/dre', texto: 'Ver DRE gerencial completa' } }}
        >
          <Pilha gap={0}>
            <LinhaValor rotulo="Receita líquida" valor={brl(v.receitaLiquidaMes)} tom="ok" />
            <LinhaValor rotulo="(−) Custos variáveis" valor={brl(custosVariaveis)} tom="erro" />
            <LinhaValor rotulo="(−) Despesas fixas" valor={brl(despesasFixas)} tom="erro" />
            <LinhaValor
              rotulo="Resultado gerencial"
              valor={brl(v.resultadoMes)}
              tom={v.resultadoMes >= 0 ? 'ok' : 'erro'}
              destaque
            />
          </Pilha>
          <span
            className="font-sans"
            style={{
              fontSize: 10.5,
              lineHeight: 1.5,
              color: 'rgba(242,237,227,.38)',
              textWrap: 'pretty',
            }}
          >
            Resultado por competência: o dinheiro da venda pode entrar em outro mês — e quando
            entra, aparece no fluxo de caixa, não aqui.
          </span>
        </Painel>
      </Colunas>

      <Painel
        titulo="Contas e carteiras"
        icone="banco"
        nota="O saldo mostra de onde veio: integração, informado ou calculado"
        acao={<AcaoPainel href="/financeiro/contas">Ver todas as contas e caixas</AcaoPainel>}
        rodape={{
          nota: 'Os saldos são atualizados automaticamente via integração bancária; contas sem integração dependem do extrato ou do saldo informado.',
        }}
      >
        {v.contas.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(208px, 1fr))',
              gap: 11,
            }}
          >
            {v.contas.map((c, i) => (
              <Link
                key={c.id}
                href="/financeiro/contas"
                className="hover:border-ouro/30"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 7,
                  padding: '13px 14px',
                  border: '1px solid rgba(255,255,255,.06)',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,.012)',
                  textDecoration: 'none',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <TileMarca nome={`${c.nome} ${c.banco}`} tamanho={34} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                    <span
                      className="font-sans"
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: 'rgba(242,237,227,.92)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.nome}
                    </span>
                    <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.38)' }}>
                      {c.tipo}
                    </span>
                  </span>
                  {c.principal && <Chip tom="ouro">Padrão</Chip>}
                </span>
                <Num tamanho={17} peso={500} tom={c.saldoDisponivel < 0 ? 'erro' : undefined}>
                  {brl(c.saldoDisponivel)}
                </Num>
                <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.36)' }}>
                  {v.caixaHoje > 0
                    ? `${((c.saldoDisponivel / v.caixaHoje) * 100).toFixed(1).replace('.', ',')}% do total`
                    : 'sem saldo'}
                </span>
              </Link>
            ))}
            <Link
              href="/financeiro/contas"
              className="hover:border-ouro/40 hover:text-ouro"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '13px 14px',
                border: '1px dashed rgba(255,255,255,.16)',
                borderRadius: 12,
                color: 'rgba(242,237,227,.45)',
                textDecoration: 'none',
                minHeight: 110,
              }}
            >
              <Ico n="mais" tamanho={17} />
              <span className="font-sans" style={{ fontSize: 11.5, fontWeight: 600 }}>
                Adicionar conta ou carteira
              </span>
            </Link>
          </div>
        ) : (
          <Vazio icone="banco" texto="Nenhuma conta cadastrada." />
        )}
      </Painel>
    </Pilha>
  )
}

/** Tabela curta de títulos — a mesma nos compromissos e nos recebimentos. */
function ListaDeTitulos({
  itens,
  tom,
  vazio,
}: {
  itens: LancamentoGerencial[]
  tom: TomUi
  vazio: string
}) {
  const colunas: ColunaUi<LancamentoGerencial>[] = [
    {
      chave: 'venc',
      titulo: 'Vencimento',
      largura: '74px',
      render: (l) => (
        <Num tamanho={11} peso={500} tom={tom}>
          {l.venceEm ? diaCurtoPt(l.venceEm) : '—'}
        </Num>
      ),
    },
    {
      chave: 'desc',
      titulo: 'Descrição',
      largura: 'minmax(0,1fr)',
      render: (l) => <Celula principal={l.descricao} secundaria={l.favorecido ?? l.conta} />,
    },
    {
      chave: 'cat',
      titulo: 'Categoria',
      largura: '124px',
      render: (l) => (
        <Chip tom="neutro" contorno>
          <Ico n={iconeDaCategoria(l.categoria)} tamanho={11} />
          <span
            style={{
              maxWidth: 88,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {l.categoria}
          </span>
        </Chip>
      ),
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      largura: '104px',
      alinhamento: 'right',
      render: (l) => (
        <Num tamanho={12} tom={tom}>
          {brl(l.valor - l.recebido)}
        </Num>
      ),
    },
  ]

  const total = itens.reduce((a, l) => a + (l.valor - l.recebido), 0)

  return (
    <TabelaUi
      colunas={colunas}
      itens={itens}
      chaveDe={(l) => l.id}
      larguraMinima={380}
      vazio={<Vazio icone="check-circulo" texto={vazio} />}
      rodape={
        itens.length > 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              paddingTop: 11,
              borderTop: '1px solid rgba(255,255,255,.05)',
            }}
          >
            <Etiqueta>Total listado</Etiqueta>
            <div style={{ flex: 1 }} />
            <Num tamanho={13} tom={tom}>
              {brl(total)}
            </Num>
          </div>
        ) : null
      }
    />
  )
}
