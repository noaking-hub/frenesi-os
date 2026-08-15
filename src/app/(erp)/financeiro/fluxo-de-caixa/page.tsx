import Link from 'next/link'

import { Cartao, CabecalhoCartao, LinhaResumo, VazioInterno } from '@/components/erp/Cartao'
import { BarraProporcao, BarrasFluxo, LegendaGrafico, PALETA_CATEGORIA } from '@/components/erp/Graficos'
import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, EstadoVazio, Rotulo, Valor } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { carregarFluxo } from '@/data/financeiro'
import { brl, diaCurtoPt, plural, situacaoDe } from '@/domain'

/**
 * Fluxo de caixa — o dia em que o dinheiro acaba, se acabar.
 *
 * O número que importa aqui não é o saldo do fim do período: é o MENOR saldo
 * do caminho. Terminar o mês positivo não ajuda quem não tem dinheiro no dia
 * 23, e é esse ponto que a tela precisa antecipar enquanto ainda dá para
 * antecipar um recebimento ou negociar um prazo.
 *
 * O horizonte vem da URL (`?dias=`) para o alerta da Visão Financeira poder
 * abrir a janela que ele acusou.
 */
export const dynamic = 'force-dynamic'

const HORIZONTES = [15, 30, 60, 90]

export default async function FluxoDeCaixa({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>
}) {
  const { dias } = await searchParams
  const horizonte = HORIZONTES.includes(Number(dias)) ? Number(dias) : 30
  const f = await carregarFluxo(horizonte)

  if (f.semBanco) {
    return (
      <EstadoVazio
        titulo="Fluxo de caixa indisponível"
        instrucao="O Supabase precisa estar configurado para projetar entradas e saídas."
      />
    )
  }

  const p = f.projecao
  const saldoHoje = f.contas.reduce((a, c) => a + c.saldoDisponivel, 0)
  const entradas = p.dias.reduce((a, d) => a + d.entradas, 0)
  const saidas = p.dias.reduce((a, d) => a + d.saidas, 0)

  const saidasPorCategoria = f.porCategoria.filter((c) => c.tipo === 'saida').slice(0, 8)
  const entradasPorCategoria = f.porCategoria.filter((c) => c.tipo === 'entrada').slice(0, 6)
  const maiorSaida = Math.max(1, ...saidasPorCategoria.map((c) => c.valor))
  const maiorEntrada = Math.max(1, ...entradasPorCategoria.map((c) => c.valor))

  const kpis: Kpi[] = [
    {
      label: 'Caixa hoje',
      valor: brl(saldoHoje),
      hint: plural(f.contas.length, 'conta somada', 'contas somadas'),
      tom: saldoHoje > 0 ? 'ok' : 'erro',
    },
    {
      label: 'Entradas previstas',
      valor: brl(p.entradasPrevistas),
      hint: `Ainda não realizadas, dentro de ${horizonte} dias`,
      tom: 'ok',
    },
    {
      label: 'Saídas previstas',
      valor: brl(p.saidasPrevistas),
      hint: `Compromissos com vencimento em até ${horizonte} dias`,
      tom: 'erro',
    },
    {
      label: `Saldo em ${horizonte} dias`,
      valor: brl(p.saldoFinal),
      hint: 'Caixa de hoje somado a tudo que está previsto',
      tom: p.saldoFinal < 0 ? 'erro' : 'ouro',
    },
    {
      label: 'Menor saldo do caminho',
      valor: brl(p.menorSaldo),
      hint: p.menorSaldoEm
        ? `Acontece em ${diaCurtoPt(p.menorSaldoEm)} — é este o ponto de risco`
        : 'O caixa não cai abaixo do saldo atual',
      tom: p.menorSaldo < 0 ? 'erro' : p.risco === 'medio' ? 'atencao' : 'ok',
    },
    {
      label: 'Cobertura de caixa',
      valor: f.cobertura === null ? '—' : `${f.cobertura} dias`,
      hint:
        f.cobertura === null
          ? 'Sem saídas no período para calcular o ritmo'
          : 'Quanto o caixa de hoje aguenta no ritmo atual de saída',
      tom: f.cobertura !== null && f.cobertura < 30 ? 'atencao' : 'neutro',
    },
  ]

  const barras = p.dias.map((d) => ({
    rotulo: diaCurtoPt(d.dia),
    entrada: d.entradas,
    saida: d.saidas,
    saldo: d.saldo,
    previsto: !d.realizado,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      {p.diasAteNegativar !== null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '15px 18px',
            border: '1px solid rgba(194,90,80,.35)',
            borderRadius: 12,
            background: 'rgba(194,90,80,.07)',
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="font-sans" style={{ fontWeight: 600, fontSize: 12.5, color: COR.erro }}>
              {`O caixa fica negativo em ${p.diasAteNegativar} ${p.diasAteNegativar === 1 ? 'dia' : 'dias'}`}
            </span>
            <span
              className="font-sans"
              style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--color-secundario)', textWrap: 'pretty' }}
            >
              {`Chega a ${brl(p.menorSaldo)} em ${p.menorSaldoEm ? diaCurtoPt(p.menorSaldoEm) : '—'}. Antecipar um recebimento ou renegociar um vencimento resolve enquanto ainda há prazo.`}
            </span>
          </span>
        </div>
      )}

      <Cartao>
        <CabecalhoCartao
          titulo="Projeção dia a dia"
          nota="Barras cheias já aconteceram; listradas são previsão"
          acao={
            <span style={{ display: 'inline-flex', gap: 6 }}>
              {HORIZONTES.map((h) => (
                <Link
                  key={h}
                  href={`/financeiro/fluxo-de-caixa?dias=${h}`}
                  className="font-sans hover:border-ouro/40 hover:text-ouro"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: 28,
                    padding: '0 11px',
                    border: `1px solid ${h === horizonte ? 'rgba(239,209,140,.42)' : 'rgba(255,255,255,.1)'}`,
                    background: h === horizonte ? 'rgba(239,209,140,.08)' : 'transparent',
                    color: h === horizonte ? COR.ouro : 'var(--color-secundario)',
                    fontWeight: 600,
                    fontSize: 10.5,
                    borderRadius: 7,
                    textDecoration: 'none',
                  }}
                >
                  {`${h} dias`}
                </Link>
              ))}
            </span>
          }
        />
        <LegendaGrafico
          itens={[
            { cor: '#5FA97A', rotulo: 'Entradas' },
            { cor: '#E06D6D', rotulo: 'Saídas' },
            { cor: '#EFD18C', rotulo: 'Saldo acumulado' },
          ]}
        />
        {barras.length > 0 ? (
          <BarrasFluxo dados={barras} altura={250} />
        ) : (
          <VazioInterno texto="Nenhum movimento previsto no período." />
        )}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))',
            gap: 12,
            paddingTop: 6,
            borderTop: '1px solid var(--color-borda-sutil)',
          }}
        >
          <Metrica rotulo="Total de entradas" valor={brl(entradas)} tom={COR.ok} />
          <Metrica rotulo="Total de saídas" valor={brl(saidas)} tom={COR.erro} />
          <Metrica
            rotulo="Resultado de caixa"
            valor={brl(entradas - saidas)}
            tom={entradas - saidas < 0 ? COR.erro : COR.ok}
          />
          <Metrica
            rotulo="Risco do período"
            valor={p.risco === 'alto' ? 'Alto' : p.risco === 'medio' ? 'Médio' : 'Baixo'}
            tom={p.risco === 'alto' ? COR.erro : p.risco === 'medio' ? COR.atencao : COR.ok}
          />
        </div>
      </Cartao>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px,1fr))', gap: 14 }}>
        <Cartao>
          <CabecalhoCartao titulo="O que mais vai sair" nota={`Vencimentos até ${diaCurtoPt(f.ate)}`} />
          {saidasPorCategoria.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {saidasPorCategoria.map((c, i) => (
                <span key={c.categoria} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
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
                    maximo={maiorSaida}
                    cor={PALETA_CATEGORIA[i % PALETA_CATEGORIA.length]}
                    altura={5}
                  />
                </span>
              ))}
            </div>
          ) : (
            <VazioInterno texto="Nenhuma saída prevista no período." />
          )}
        </Cartao>

        <Cartao>
          <CabecalhoCartao titulo="De onde vem o dinheiro" nota={`Recebimentos até ${diaCurtoPt(f.ate)}`} />
          {entradasPorCategoria.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {entradasPorCategoria.map((c) => (
                <span key={c.categoria} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
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
                    <Valor tamanho={12} peso={400} tom="ok">
                      {brl(c.valor)}
                    </Valor>
                  </span>
                  <BarraProporcao valor={c.valor} maximo={maiorEntrada} cor="#5FA97A" altura={5} />
                </span>
              ))}
            </div>
          ) : (
            <VazioInterno texto="Nenhum recebimento previsto no período." />
          )}
        </Cartao>

        <Cartao>
          <CabecalhoCartao titulo="Saldo por conta" nota="Ponto de partida da projeção" />
          {f.contas.map((c) => (
            <LinhaResumo key={c.id} rotulo={c.nome} nota={c.banco} valor={brl(c.saldoDisponivel)} />
          ))}
          <LinhaResumo rotulo="Caixa total hoje" valor={brl(saldoHoje)} destaque />
        </Cartao>
      </div>

      <Cartao>
        <CabecalhoCartao
          titulo="Agenda do período"
          nota="Cada compromisso na ordem em que o dinheiro precisa estar lá"
        />
        {f.compromissos.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {f.compromissos.map((l) => {
              const situacao = situacaoDe(l, f.de)
              return (
                <span
                  key={l.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '64px minmax(0,1fr) 140px 116px 110px',
                    gap: 12,
                    alignItems: 'center',
                    padding: '9px 0',
                    borderTop: '1px solid var(--color-borda-sutil)',
                  }}
                >
                  <Valor tamanho={11} peso={400} tom={situacao === 'vencido' ? 'erro' : undefined}>
                    {l.venceEm ? diaCurtoPt(l.venceEm) : '—'}
                  </Valor>
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
                  <span
                    className="font-sans"
                    style={{
                      fontSize: 10.5,
                      color: 'var(--color-terciario)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {l.categoria}
                  </span>
                  <span style={{ justifySelf: 'start' }}>
                    <Badge tom={situacao === 'vencido' ? 'erro' : l.tipo === 'entrada' ? 'ok' : 'neutro'}>
                      {situacao === 'vencido' ? 'Vencido' : l.tipo === 'entrada' ? 'Entra' : 'Sai'}
                    </Badge>
                  </span>
                  <span style={{ justifySelf: 'end' }}>
                    <Valor tamanho={12} tom={l.tipo === 'entrada' ? 'ok' : 'erro'}>
                      {`${l.tipo === 'entrada' ? '+' : '−'} ${brl(l.valor - l.recebido)}`}
                    </Valor>
                  </span>
                </span>
              )
            })}
          </div>
        ) : (
          <VazioInterno texto="Nenhum compromisso com vencimento no período." />
        )}
      </Cartao>
    </div>
  )
}

function Metrica({ rotulo, valor, tom }: { rotulo: string; valor: string; tom: string }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <Rotulo>{rotulo}</Rotulo>
      <span className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: tom }}>
        {valor}
      </span>
    </span>
  )
}
