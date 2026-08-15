import Link from 'next/link'

import { Cartao, CabecalhoCartao, VazioInterno } from '@/components/erp/Cartao'
import { BarrasFluxo, LegendaGrafico, PALETA_CATEGORIA, Rosca } from '@/components/erp/Graficos'
import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { EstadoVazio, LinkSecundario, Losango } from '@/components/erp/primitivos'
import { COR, type Tom } from '@/components/erp/tokens'
import { carregarVisaoFinanceira } from '@/data/financeiro'
import { brl, competenciaPorExtenso, diaCurtoPt, pad2, plural } from '@/domain'
import type { AlertaFinanceiro, LancamentoGerencial } from '@/domain'

/**
 * Visão Financeira — a landing do módulo.
 *
 * Trocou Lançamentos como primeira tela por uma razão do escopo: quem abre o
 * Financeiro quer saber quanto tem, quanto vai ter e o que exige decisão hoje.
 * Uma lista cronológica responde nenhuma das três.
 *
 * A hierarquia segue a regra §17: número com ação associada ocupa mais
 * espaço; número que só informa fica menor.
 */
export const dynamic = 'force-dynamic'

const TOM_ALERTA: Record<AlertaFinanceiro['severidade'], Tom> = {
  critico: 'erro',
  atencao: 'atencao',
  informativo: 'neutro',
}

export default async function VisaoFinanceira() {
  const v = await carregarVisaoFinanceira()

  if (v.semBanco) {
    return (
      <EstadoVazio
        titulo="Financeiro indisponível"
        instrucao="O Supabase precisa estar configurado para o módulo financeiro ler contas, lançamentos e conciliação."
      />
    )
  }

  const kpis: Kpi[] = [
    {
      label: 'Caixa disponível hoje',
      valor: brl(v.caixaHoje),
      hint:
        v.caixaALiquidar > 0
          ? `+ ${brl(v.caixaALiquidar)} a liquidar nos gateways`
          : 'Soma das contas ativas',
      tom: v.caixaHoje > 0 ? 'ok' : 'erro',
    },
    {
      label: 'Saldo projetado 7 dias',
      valor: brl(v.saldo7),
      hint: 'Caixa + recebimentos − pagamentos do período',
      tom: v.saldo7 < 0 ? 'erro' : 'neutro',
    },
    {
      label: 'Saldo projetado 30 dias',
      valor: brl(v.saldo30),
      hint: v.projecao.menorSaldoEm
        ? `Menor ponto: ${brl(v.projecao.menorSaldo)} em ${diaCurtoPt(v.projecao.menorSaldoEm)}`
        : 'Sem vale no horizonte',
      tom: v.projecao.menorSaldo < 0 ? 'erro' : 'ouro',
    },
    {
      label: 'A pagar',
      valor: brl(v.aPagar.valor),
      hint: `${plural(v.aPagar.qtd, 'compromisso aberto', 'compromissos abertos')}`,
      tom: v.vencidos.qtd > 0 ? 'atencao' : 'neutro',
    },
    {
      label: 'A receber',
      valor: brl(v.aReceber.valor),
      hint: `${plural(v.aReceber.qtd, 'recebimento previsto', 'recebimentos previstos')}`,
      tom: 'ok',
    },
    {
      label: 'Pendências de conciliação',
      valor: pad2(v.pendenciasConciliacao.qtd),
      hint: v.pendenciasConciliacao.qtd
        ? `${brl(v.pendenciasConciliacao.valor)} em diferença`
        : 'Nenhuma venda exige decisão',
      tom: v.pendenciasConciliacao.qtd ? 'erro' : 'ok',
    },
  ]

  const totalSaidas = v.saidasPorCategoria.reduce((a, c) => a + c.valor, 0)

  // O gráfico mostra 30 dias: o suficiente para enxergar o vale sem espremer
  // as barras a ponto de virarem uma faixa contínua.
  const barras = v.projecao.dias.slice(0, 30).map((d) => ({
    rotulo: diaCurtoPt(d.dia),
    entrada: d.entradas,
    saida: d.saidas,
    saldo: d.saldo,
    previsto: !d.realizado,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      {v.alertas.length > 0 && <PainelAlertas alertas={v.alertas} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,1fr)', gap: 14 }}>
        <Cartao>
          <CabecalhoCartao
            titulo="Fluxo de caixa projetado"
            nota="Barras cheias já aconteceram; listradas são previsão"
            acao={<LinkSecundario href="/financeiro/fluxo-de-caixa" altura={30}>Ver fluxo completo</LinkSecundario>}
          />
          <LegendaGrafico
            itens={[
              { cor: '#5FA97A', rotulo: 'Entradas' },
              { cor: '#E06D6D', rotulo: 'Saídas' },
              { cor: '#EFD18C', rotulo: 'Saldo acumulado' },
            ]}
          />
          {barras.length > 0 ? (
            <BarrasFluxo dados={barras} altura={210} />
          ) : (
            <VazioInterno texto="Sem movimentos no horizonte de 30 dias." />
          )}
        </Cartao>

        <Cartao>
          <CabecalhoCartao
            titulo="Composição das saídas"
            nota={`Competência de ${competenciaPorExtenso(v.competencia)}`}
          />
          {v.saidasPorCategoria.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <Rosca
                fatias={v.saidasPorCategoria.map((c, i) => ({
                  rotulo: c.categoria,
                  valor: c.valor,
                  cor: PALETA_CATEGORIA[i % PALETA_CATEGORIA.length],
                }))}
                tamanho={172}
                legendaTotal="Total de saídas"
                valorTotal={brl(totalSaidas)}
              />
              <span style={{ flex: 1, minWidth: 190, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {v.saidasPorCategoria.map((c, i) => (
                  <span key={c.categoria} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      aria-hidden
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        flex: 'none',
                        background: PALETA_CATEGORIA[i % PALETA_CATEGORIA.length],
                      }}
                    />
                    <span
                      className="font-sans"
                      style={{
                        flex: 1,
                        fontSize: 11,
                        color: 'var(--color-secundario)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.categoria}
                    </span>
                    <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-corrente)' }}>
                      {brl(c.valor)}
                    </span>
                    <span
                      className="font-sans"
                      style={{ fontSize: 10, color: 'var(--color-terciario)', width: 40, textAlign: 'right' }}
                    >
                      {totalSaidas ? `${((c.valor / totalSaidas) * 100).toFixed(1).replace('.', ',')}%` : '—'}
                    </span>
                  </span>
                ))}
              </span>
            </div>
          ) : (
            <VazioInterno texto="Nenhuma saída classificada nesta competência." />
          )}
        </Cartao>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 14,
        }}
      >
        <ListaDeLancamentos
          titulo="Próximos compromissos"
          vazio="Nada a pagar no horizonte."
          itens={v.proximosCompromissos}
          href="/financeiro/lancamentos?tipo=saida"
          rotuloAcao="Ver contas a pagar"
          tom="erro"
        />
        <ListaDeLancamentos
          titulo="Recebimentos previstos"
          vazio="Nenhum recebimento agendado."
          itens={v.proximosRecebimentos}
          href="/financeiro/lancamentos?tipo=entrada"
          rotuloAcao="Ver recebimentos"
          tom="ok"
        />
        <Cartao>
          <CabecalhoCartao
            titulo="Resumo da DRE"
            nota={competenciaPorExtenso(v.competencia)}
            acao={<LinkSecundario href="/financeiro/dre" altura={30}>Ver DRE</LinkSecundario>}
          />
          <LinhaResumo rotulo="Receita líquida" valor={v.receitaLiquidaMes} />
          <LinhaResumo rotulo="Margem de contribuição" valor={v.margemMes} />
          <LinhaResumo rotulo="Resultado gerencial" valor={v.resultadoMes} destaque />
          <span
            className="font-sans"
            style={{ fontSize: 10, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
          >
            Resultado por competência — o dinheiro da venda pode entrar em outro mês, e entra no
            fluxo de caixa, não aqui.
          </span>
        </Cartao>
      </div>

      <Cartao>
        <CabecalhoCartao
          titulo="Contas e carteiras"
          nota="O saldo mostra de onde veio: integração, informado ou calculado"
          acao={<LinkSecundario href="/financeiro/contas" altura={30}>Ver todas as contas</LinkSecundario>}
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
            gap: 11,
          }}
        >
          {v.contas.map((c) => (
            <Link
              key={c.id}
              href="/financeiro/contas"
              className="hover:border-ouro/40"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '13px 14px',
                border: '1px solid var(--color-borda-sutil)',
                borderRadius: 12,
                background: 'rgba(255,255,255,.015)',
                textDecoration: 'none',
              }}
            >
              <span
                className="font-sans"
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-corrente)' }}
              >
                {c.nome}
              </span>
              <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
                {c.tipo}
              </span>
              <span
                className="font-mono"
                style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-tinta)', paddingTop: 2 }}
              >
                {brl(c.saldoDisponivel)}
              </span>
              <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
                {v.caixaHoje > 0
                  ? `${((c.saldoDisponivel / v.caixaHoje) * 100).toFixed(1).replace('.', ',')}% do total`
                  : 'sem saldo'}
              </span>
            </Link>
          ))}
        </div>
      </Cartao>
    </div>
  )
}

// ── Blocos ─────────────────────────────────────────────────────────────────

function PainelAlertas({ alertas }: { alertas: AlertaFinanceiro[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 11,
      }}
    >
      {alertas.slice(0, 4).map((a) => (
        <Link
          key={a.id}
          href={a.href}
          className="hover:brightness-110"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 11,
            padding: '13px 15px',
            border: `1px solid ${a.severidade === 'critico' ? 'rgba(224,109,109,.32)' : a.severidade === 'atencao' ? 'rgba(224,168,109,.28)' : 'var(--color-borda-sutil)'}`,
            borderRadius: 12,
            background:
              a.severidade === 'critico'
                ? 'rgba(224,109,109,.06)'
                : a.severidade === 'atencao'
                  ? 'rgba(224,168,109,.05)'
                  : 'rgba(255,255,255,.015)',
            textDecoration: 'none',
          }}
        >
          <span style={{ paddingTop: 3 }}>
            <Losango tom={TOM_ALERTA[a.severidade]} preenchido />
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span
              className="font-sans"
              style={{
                fontSize: 12,
                fontWeight: 600,
                lineHeight: 1.35,
                color: COR[TOM_ALERTA[a.severidade]],
                textWrap: 'pretty',
              }}
            >
              {a.titulo}
            </span>
            <span
              className="font-sans"
              style={{ fontSize: 10.5, lineHeight: 1.45, color: 'var(--color-terciario)' }}
            >
              {a.detalhe}
            </span>
          </span>
        </Link>
      ))}
    </div>
  )
}

function ListaDeLancamentos({
  titulo,
  itens,
  href,
  rotuloAcao,
  vazio,
  tom,
}: {
  titulo: string
  itens: LancamentoGerencial[]
  href: string
  rotuloAcao: string
  vazio: string
  tom: Tom
}) {
  return (
    <Cartao>
      <CabecalhoCartao
        titulo={titulo}
        acao={<LinkSecundario href={href} altura={30}>{rotuloAcao}</LinkSecundario>}
      />
      {itens.length === 0 ? (
        <VazioInterno texto={vazio} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {itens.map((l) => (
            <span
              key={l.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '58px minmax(0,1fr) auto',
                gap: 10,
                alignItems: 'center',
                padding: '8px 0',
                borderTop: '1px solid var(--color-borda-sutil)',
              }}
            >
              <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
                {l.venceEm ? diaCurtoPt(l.venceEm) : '—'}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
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
                  {l.descricao}
                </span>
                <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
                  {l.categoria}
                </span>
              </span>
              <span className="font-mono" style={{ fontSize: 11.5, color: COR[tom] }}>
                {brl(l.valor - l.recebido)}
              </span>
            </span>
          ))}
        </div>
      )}
    </Cartao>
  )
}

function LinhaResumo({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string
  valor: number
  destaque?: boolean
}) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        padding: '7px 0',
        borderTop: '1px solid var(--color-borda-sutil)',
      }}
    >
      <span
        className="font-sans"
        style={{
          fontSize: destaque ? 12 : 11.5,
          fontWeight: destaque ? 600 : 400,
          color: destaque ? 'var(--color-corrente)' : 'var(--color-secundario)',
        }}
      >
        {rotulo}
      </span>
      <span
        className="font-mono"
        style={{
          fontSize: destaque ? 15 : 12.5,
          fontWeight: destaque ? 600 : 400,
          color: valor < 0 ? COR.erro : destaque ? COR.ok : 'var(--color-tinta)',
        }}
      >
        {brl(valor)}
      </span>
    </span>
  )
}
