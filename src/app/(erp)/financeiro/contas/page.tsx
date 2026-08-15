import { Cartao, CabecalhoCartao, VazioInterno } from '@/components/erp/Cartao'
import { BarraProporcao, PALETA_CATEGORIA, Rosca } from '@/components/erp/Graficos'
import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, EstadoVazio, LinkSecundario, Rotulo, Valor } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { lerContas, lerLancamentos } from '@/data/financeiro'
import {
  brl,
  concentracao,
  divergenciaDeSaldo,
  horasDesdeSincronia,
  plural,
  ROTULO_ORIGEM_SALDO,
  saldoAberto,
} from '@/domain'
import type { ContaFinanceira } from '@/domain'

import { EditarConta, InformarSaldo, NovaConta, Transferir } from './Acoes'

/**
 * Contas e caixas — onde o dinheiro está, e o quanto disso é confiável.
 *
 * A tela responde duas perguntas que o mockup pede juntas: quanto tem em cada
 * lugar e DE ONDE veio esse número. Um saldo lido pela API do banco e um
 * saldo somado pelo ERP a partir do extrato têm confiabilidades diferentes, e
 * mostrar os dois com a mesma tipografia esconde exatamente a informação que
 * decide se dá para pagar o boleto hoje.
 */
export const dynamic = 'force-dynamic'

export default async function Contas() {
  const [contas, lancamentos] = await Promise.all([lerContas(), lerLancamentos()])

  if (contas.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <EstadoVazio
          titulo="Nenhuma conta cadastrada"
          instrucao="Cadastre a conta bancária e a carteira do gateway para o Financeiro ter onde somar."
        />
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <NovaConta />
        </div>
      </div>
    )
  }

  const ativas = contas.filter((c) => c.ativa)
  const disponivel = ativas.reduce((a, c) => a + c.saldoDisponivel, 0)
  const aLiquidar = ativas.reduce((a, c) => a + c.saldoALiquidar, 0)
  const bloqueado = ativas.reduce((a, c) => a + c.saldoBloqueado, 0)

  const vivos = lancamentos.filter((l) => !l.canceladoEm && saldoAberto(l) > 0)
  const comprometido = vivos
    .filter((l) => l.tipo === 'saida')
    .reduce((a, l) => a + saldoAberto(l), 0)

  const divergentes = ativas
    .map((c) => ({ conta: c, dif: divergenciaDeSaldo(c) }))
    .filter((x): x is { conta: ContaFinanceira; dif: number } => x.dif !== null && Math.abs(x.dif) > 0.05)

  const agora = Date.now()

  const kpis: Kpi[] = [
    {
      label: 'Caixa disponível',
      valor: brl(disponivel),
      hint: plural(ativas.length, 'conta ativa', 'contas ativas'),
      tom: disponivel > 0 ? 'ok' : 'erro',
    },
    {
      label: 'A liquidar',
      valor: brl(aLiquidar),
      hint: 'Vendas já aprovadas que o gateway ainda não creditou',
      tom: 'info',
    },
    {
      label: 'Bloqueado',
      valor: brl(bloqueado),
      hint: bloqueado > 0 ? 'Retido por chargeback ou garantia' : 'Nada retido',
      tom: bloqueado > 0 ? 'atencao' : 'neutro',
    },
    {
      label: 'Comprometido',
      valor: brl(comprometido),
      hint: 'Contas a pagar ainda em aberto',
      tom: 'atencao',
    },
    {
      label: 'Livre depois de pagar',
      valor: brl(disponivel - comprometido),
      hint: 'O que sobra se tudo que está em aberto for pago',
      tom: disponivel - comprometido > 0 ? 'ok' : 'erro',
    },
    {
      label: 'Contas divergentes',
      valor: String(divergentes.length).padStart(2, '0'),
      hint: divergentes.length
        ? `${brl(divergentes.reduce((a, d) => a + Math.abs(d.dif), 0))} de diferença contra o extrato`
        : 'Saldo informado bate com o calculado',
      tom: divergentes.length ? 'erro' : 'ok',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 14 }}>
        <Cartao>
          <CabecalhoCartao
            titulo="Contas e carteiras"
            nota="Cada saldo diz de onde veio"
            acao={
              <span style={{ display: 'inline-flex', gap: 8 }}>
                <NovaConta />
                <Transferir contas={ativas} />
              </span>
            }
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {contas.map((c) => (
              <CartaoConta key={c.id} conta={c} contas={ativas} agora={agora} />
            ))}
          </div>
        </Cartao>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Cartao>
            <CabecalhoCartao titulo="Concentração do caixa" nota="Onde o dinheiro está parado" />
            {disponivel > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                <Rosca
                  fatias={ativas
                    .filter((c) => c.saldoDisponivel > 0)
                    .map((c, i) => ({
                      rotulo: c.nome,
                      valor: c.saldoDisponivel,
                      cor: c.cor ?? PALETA_CATEGORIA[i % PALETA_CATEGORIA.length],
                    }))}
                  tamanho={182}
                  legendaTotal="Caixa total"
                  valorTotal={brl(disponivel)}
                />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%' }}>
                  {ativas
                    .filter((c) => c.saldoDisponivel > 0)
                    .map((c, i) => (
                      <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          aria-hidden
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            flex: 'none',
                            background: c.cor ?? PALETA_CATEGORIA[i % PALETA_CATEGORIA.length],
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
                          {c.nome}
                        </span>
                        <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
                          {`${concentracao(c, ativas).toFixed(1).replace('.', ',')}%`}
                        </span>
                      </span>
                    ))}
                </span>
              </div>
            ) : (
              <VazioInterno texto="Nenhuma conta com saldo positivo." />
            )}
          </Cartao>

          {divergentes.length > 0 && (
            <Cartao>
              <CabecalhoCartao
                titulo="Divergências de saldo"
                acao={<LinkSecundario href="/financeiro/extrato" altura={28}>Ver extrato</LinkSecundario>}
              />
              <span
                className="font-sans"
                style={{ fontSize: 10.5, lineHeight: 1.55, color: 'var(--color-terciario)', textWrap: 'pretty' }}
              >
                A diferença entre o saldo informado e o que o ERP somou do extrato é sempre um
                lançamento faltando de um lado ou do outro.
              </span>
              {divergentes.map(({ conta, dif }) => (
                <span
                  key={conta.id}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '8px 0',
                    borderTop: '1px solid var(--color-borda-sutil)',
                  }}
                >
                  <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-corrente)' }}>
                    {conta.nome}
                  </span>
                  <Valor tamanho={12.5} tom={dif > 0 ? 'atencao' : 'erro'}>
                    {`${dif > 0 ? '+' : '−'} ${brl(Math.abs(dif))}`}
                  </Valor>
                </span>
              ))}
            </Cartao>
          )}
        </div>
      </div>
    </div>
  )
}

function CartaoConta({
  conta,
  contas,
  agora,
}: {
  conta: ContaFinanceira
  contas: ContaFinanceira[]
  agora: number
}) {
  const horas = horasDesdeSincronia(conta, agora)
  const dif = divergenciaDeSaldo(conta)
  const fatia = concentracao(conta, contas)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1.4fr) repeat(3, minmax(0,1fr))',
        gap: 14,
        alignItems: 'center',
        padding: '14px 15px',
        border: `1px solid ${conta.ativa ? 'var(--color-borda-sutil)' : 'rgba(255,255,255,.05)'}`,
        borderLeft: `3px solid ${conta.cor ?? (conta.principal ? COR.ouro : 'transparent')}`,
        borderRadius: 12,
        background: conta.ativa ? 'rgba(255,255,255,.015)' : 'transparent',
        opacity: conta.ativa ? 1 : 0.55,
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span
            className="font-sans"
            style={{
              fontWeight: 600,
              fontSize: 12.5,
              color: 'var(--color-corrente)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {conta.nome}
          </span>
          {conta.principal && <Badge tom="ouro">Principal</Badge>}
          {!conta.ativa && <Badge tom="neutro">Inativa</Badge>}
        </span>
        <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
          {[conta.banco, conta.tipo, conta.finalidade].filter(Boolean).join(' · ')}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            className="font-sans"
            style={{
              fontSize: 9.5,
              color:
                conta.origemSaldo === 'api'
                  ? COR.ok
                  : conta.origemSaldo === 'informado'
                    ? COR.ouro
                    : 'var(--color-terciario)',
            }}
          >
            {ROTULO_ORIGEM_SALDO[conta.origemSaldo]}
          </span>
          {horas !== null && (
            <span
              className="font-sans"
              style={{ fontSize: 9.5, color: horas >= 24 ? COR.atencao : 'var(--color-terciario)' }}
            >
              {horas < 1 ? 'lido agora há pouco' : `há ${horas} h`}
            </span>
          )}
          <InformarSaldo conta={conta} />
          <EditarConta conta={conta} />
        </span>
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Rotulo>Disponível</Rotulo>
        <Valor tamanho={16} peso={500} tom={conta.saldoDisponivel < 0 ? 'erro' : undefined}>
          {brl(conta.saldoDisponivel)}
        </Valor>
        <BarraProporcao valor={fatia} maximo={100} cor={conta.cor ?? '#EFD18C'} altura={4} />
        <span className="font-sans" style={{ fontSize: 9.5, color: 'var(--color-terciario)' }}>
          {`${fatia.toFixed(1).replace('.', ',')}% do caixa`}
        </span>
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Rotulo>A liquidar</Rotulo>
        <Valor tamanho={13} peso={400} tom="info">
          {brl(conta.saldoALiquidar)}
        </Valor>
        {conta.saldoBloqueado > 0 && (
          <span className="font-mono" style={{ fontSize: 10, color: COR.atencao }}>
            {`${brl(conta.saldoBloqueado)} bloqueado`}
          </span>
        )}
        {dif !== null && Math.abs(dif) > 0.05 && (
          <span className="font-mono" style={{ fontSize: 10, color: COR.erro }}>
            {`${dif > 0 ? '+' : '−'} ${brl(Math.abs(dif))} vs. extrato`}
          </span>
        )}
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Rotulo>Últimos 30 dias</Rotulo>
        <span className="font-mono" style={{ fontSize: 11.5, color: COR.ok }}>
          {`+ ${brl(conta.entradas30d)}`}
        </span>
        <span className="font-mono" style={{ fontSize: 11.5, color: COR.erro }}>
          {`− ${brl(conta.saidas30d)}`}
        </span>
      </span>
    </div>
  )
}
