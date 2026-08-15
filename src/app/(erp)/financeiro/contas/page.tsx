import {
  AcaoPainel,
  Bolinha,
  Chip,
  ComTrilha,
  Etiqueta,
  Ferramentas,
  GradeIndicadores,
  Ico,
  Indicador,
  LinhaValor,
  Num,
  Painel,
  Pilha,
  TINTA,
  Vazio,
} from '@/components/erp/ui'
import { Mini, PALETA, RoscaLegenda } from '@/components/erp/Visualizacoes'
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
import type { ContaFinanceira, LancamentoGerencial } from '@/domain'

import { EditarConta, InformarSaldo, NovaConta, Transferir } from './Acoes'

/**
 * Contas e Caixas — onde o dinheiro está, e o quanto disso é confiável.
 *
 * A tela responde duas perguntas que andam juntas: quanto tem em cada lugar e
 * DE ONDE veio esse número. Um saldo lido pela API do banco e um saldo somado
 * pelo ERP a partir do extrato têm confiabilidades diferentes — mostrar os
 * dois com a mesma tipografia esconde exatamente o que decide se dá para
 * pagar o boleto hoje.
 */
export const dynamic = 'force-dynamic'

export default async function ContasECaixas() {
  const [contas, lancamentos] = await Promise.all([lerContas(), lerLancamentos()])

  if (contas.length === 0) {
    return (
      <Pilha>
      <Ferramentas direita={<NovaConta />} />
        <Painel>
          <Vazio
            icone="banco"
            texto="Nenhuma conta cadastrada. Cadastre a conta bancária e a carteira do gateway para o Financeiro ter onde somar."
          />
        </Painel>
      </Pilha>
    )
  }

  const ativas = contas.filter((c) => c.ativa)
  const consolidado = ativas.reduce((a, c) => a + c.saldoDisponivel, 0)
  const entradas30 = ativas.reduce((a, c) => a + c.entradas30d, 0)
  const saidas30 = ativas.reduce((a, c) => a + c.saidas30d, 0)
  const aLiquidar = ativas.reduce((a, c) => a + c.saldoALiquidar, 0)

  const vivos = lancamentos.filter((l) => !l.canceladoEm && saldoAberto(l) > 0)
  const comprometido = vivos
    .filter((l) => l.tipo === 'saida')
    .reduce((a, l) => a + saldoAberto(l), 0)

  const conectadas = ativas.filter((c) => c.origemSaldo === 'api').length
  const agora = Date.now()

  const divergentes = ativas
    .map((c) => ({ conta: c, dif: divergenciaDeSaldo(c) }))
    .filter((x): x is { conta: ContaFinanceira; dif: number } => x.dif !== null && Math.abs(x.dif) > 0.05)

  const desatualizadas = ativas
    .map((c) => ({ conta: c, horas: horasDesdeSincronia(c, agora) }))
    .filter((x): x is { conta: ContaFinanceira; horas: number } => x.horas !== null && x.horas >= 24)

  // Movimento diário por conta, para a faixa de tendência de cada linha. Sai
  // dos lançamentos já baixados — é o único histórico que o ERP tem sem
  // guardar snapshot de saldo.
  const serie = serieDiariaPorConta(lancamentos)

  return (
    <Pilha gap={16}>
      <Ferramentas
        direita={
          <span style={{ display: 'inline-flex', gap: 9 }}>
            <Transferir contas={ativas} />
            <NovaConta />
          </span>
        }
      />

      <GradeIndicadores>
        <Indicador
          icone="carteira"
          tom="ouro"
          rotulo="Saldo consolidado"
          valor={brl(consolidado)}
          tomValor={consolidado > 0 ? 'ok' : 'erro'}
          nota={plural(ativas.length, 'conta ativa somada', 'contas ativas somadas')}
        />
        <Indicador
          icone="entrada"
          tom="ok"
          rotulo="Entradas em 30 dias"
          valor={brl(entradas30)}
          nota="Movimentos já baixados no período"
          tomNota="ok"
        />
        <Indicador
          icone="saida"
          tom="erro"
          rotulo="Saídas em 30 dias"
          valor={brl(saidas30)}
          nota="Movimentos já baixados no período"
          tomNota="erro"
        />
        <Indicador
          icone="cadeado"
          tom="atencao"
          rotulo="Comprometido"
          valor={brl(comprometido)}
          nota={
            consolidado > 0
              ? `${((comprometido / consolidado) * 100).toFixed(1).replace('.', ',')}% do saldo consolidado`
              : 'Contas a pagar em aberto'
          }
        />
        <Indicador
          icone="escudo"
          tom={consolidado - comprometido > 0 ? 'ok' : 'erro'}
          rotulo="Livre depois de pagar"
          valor={brl(consolidado - comprometido)}
          tomValor={consolidado - comprometido > 0 ? 'ok' : 'erro'}
          nota={
            consolidado > 0
              ? `${(((consolidado - comprometido) / consolidado) * 100).toFixed(1).replace('.', ',')}% do saldo consolidado`
              : 'Sem saldo para liquidar o que está aberto'
          }
        />
        <Indicador
          icone="elo"
          tom={conectadas === ativas.length ? 'ok' : 'info'}
          rotulo="Contas conectadas"
          valor={`${conectadas} de ${ativas.length}`}
          nota={
            conectadas === ativas.length
              ? 'Todos os saldos vêm de integração'
              : 'As demais dependem de saldo informado ou do extrato'
          }
          tomNota={conectadas === ativas.length ? 'ok' : 'neutro'}
        />
      </GradeIndicadores>

      <ComTrilha
        trilha={
          <>
            <Painel titulo="Movimentações rápidas" icone="ajustes">
              <Pilha gap={9}>
                <Transferir contas={ativas} />
                <AcaoPainel href="/financeiro/extrato">Conciliar extrato</AcaoPainel>
                <AcaoPainel href="/financeiro/lancamentos">Ver lançamentos da conta</AcaoPainel>
              </Pilha>
            </Painel>

            <Painel titulo="Distribuição do saldo" icone="pizza" tom="ciano">
              {consolidado > 0 ? (
                <>
                  <RoscaLegenda
                    fatias={ativas
                      .filter((c) => c.saldoDisponivel > 0)
                      .map((c, i) => ({
                        rotulo: c.nome,
                        valor: c.saldoDisponivel,
                        cor: c.cor ?? PALETA[i % PALETA.length],
                      }))}
                    total={consolidado}
                    legendaTotal="Caixa total"
                    formatar={brl}
                    tamanho={150}
                  />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      paddingTop: 10,
                      borderTop: '1px solid rgba(255,255,255,.05)',
                    }}
                  >
                    <Etiqueta>Total</Etiqueta>
                    <div style={{ flex: 1 }} />
                    <Num tamanho={13} tom="ouro">
                      {brl(consolidado)}
                    </Num>
                  </div>
                </>
              ) : (
                <Vazio icone="pizza" texto="Nenhuma conta com saldo positivo." />
              )}
            </Painel>

            <Painel
              titulo="Alertas das contas"
              icone="sino"
              tom={divergentes.length || desatualizadas.length ? 'atencao' : 'ok'}
            >
              {divergentes.length + desatualizadas.length === 0 ? (
                <Vazio icone="check-circulo" texto="Nenhuma conta pede atenção agora." />
              ) : (
                <Pilha gap={0}>
                  {divergentes.map(({ conta, dif }) => (
                    <LinhaValor
                      key={`d-${conta.id}`}
                      icone="alerta-circulo"
                      tomIcone="erro"
                      rotulo={`${conta.nome}: saldo divergente`}
                      nota="Informado não bate com o somado do extrato"
                      valor={`${dif > 0 ? '+' : '−'} ${brl(Math.abs(dif))}`}
                      tom="erro"
                    />
                  ))}
                  {desatualizadas.map(({ conta, horas }) => (
                    <LinhaValor
                      key={`s-${conta.id}`}
                      icone="relogio"
                      tomIcone="atencao"
                      rotulo={`${conta.nome} sem atualização`}
                      nota="O saldo exibido pode estar velho"
                      valor={`há ${horas} h`}
                      tom="atencao"
                    />
                  ))}
                </Pilha>
              )}
            </Painel>
          </>
        }
      >
        <Painel
          titulo="Contas e carteiras"
          icone="banco"
          nota="Cada saldo declara de onde veio"
          rodape={{
            nota: 'Mantenha as contas conectadas e revise os saldos: a divergência contra o extrato é sempre um lançamento faltando de um lado ou do outro.',
            link: { href: '/financeiro/extrato', texto: 'Abrir extrato' },
          }}
        >
          <Pilha gap={10}>
            {contas.map((c, i) => (
              <LinhaConta
                key={c.id}
                conta={c}
                contas={ativas}
                agora={agora}
                cor={c.cor ?? PALETA[i % PALETA.length]}
                serie={serie.get(c.id) ?? []}
                aLiquidarTotal={aLiquidar}
              />
            ))}
          </Pilha>
        </Painel>
      </ComTrilha>
    </Pilha>
  )
}

function LinhaConta({
  conta,
  contas,
  agora,
  cor,
  serie,
}: {
  conta: ContaFinanceira
  contas: ContaFinanceira[]
  agora: number
  cor: string
  serie: number[]
  aLiquidarTotal: number
}) {
  const horas = horasDesdeSincronia(conta, agora)
  const dif = divergenciaDeSaldo(conta)
  const fatia = concentracao(conta, contas)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1.5fr) 148px 150px 116px minmax(0,150px)',
        gap: 14,
        alignItems: 'center',
        padding: '14px 15px',
        border: '1px solid rgba(255,255,255,.06)',
        borderLeft: `3px solid ${conta.ativa ? cor : 'rgba(255,255,255,.08)'}`,
        borderRadius: 12,
        background: conta.ativa ? 'rgba(255,255,255,.014)' : 'transparent',
        opacity: conta.ativa ? 1 : 0.5,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span
          style={{
            width: 40,
            height: 40,
            flex: 'none',
            borderRadius: 11,
            display: 'grid',
            placeItems: 'center',
            background: `${cor}1F`,
            border: `1px solid ${cor}44`,
            color: cor,
          }}
        >
          <Ico n={conta.tipo.toLowerCase().includes('carteira') ? 'carteira' : conta.tipo.toLowerCase().includes('caixa') ? 'cofre' : 'banco'} tamanho={18} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span
              className="font-sans"
              style={{
                fontWeight: 600,
                fontSize: 13,
                color: 'rgba(242,237,227,.94)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {conta.nome}
            </span>
            {conta.principal && <Chip tom="ouro">Padrão</Chip>}
            {!conta.ativa && <Chip tom="neutro">Inativa</Chip>}
          </span>
          <span className="font-sans" style={{ fontSize: 10.5, color: 'rgba(242,237,227,.4)' }}>
            {[conta.tipo, conta.banco, conta.finalidade].filter(Boolean).join(' · ')}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <InformarSaldo conta={conta} />
            <EditarConta conta={conta} />
          </span>
        </span>
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Etiqueta>Saldo atual</Etiqueta>
        <Num tamanho={17} tom={conta.saldoDisponivel < 0 ? 'erro' : undefined}>
          {brl(conta.saldoDisponivel)}
        </Num>
        <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.36)' }}>
          {`${fatia.toFixed(1).replace('.', ',')}% do total`}
        </span>
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Etiqueta>Movimento 30 dias</Etiqueta>
        <Num tamanho={12} tom="ok" peso={500}>
          {`+ ${brl(conta.entradas30d)}`}
        </Num>
        <Num tamanho={12} tom="erro" peso={500}>
          {`− ${brl(conta.saidas30d)}`}
        </Num>
        {conta.saldoALiquidar > 0 && (
          <Num tamanho={10} tom="info" peso={400}>
            {`${brl(conta.saldoALiquidar)} a liquidar`}
          </Num>
        )}
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Etiqueta>Tendência</Etiqueta>
        <Mini valores={serie.length > 1 ? serie : [0, 0]} largura={104} altura={30} />
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        <Etiqueta>Origem do saldo</Etiqueta>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Bolinha
            cor={
              conta.origemSaldo === 'api'
                ? TINTA.ok
                : conta.origemSaldo === 'informado'
                  ? TINTA.ouro
                  : TINTA.neutro
            }
            tamanho={7}
          />
          <span
            className="font-sans"
            style={{
              fontSize: 11,
              color:
                conta.origemSaldo === 'api'
                  ? TINTA.ok
                  : conta.origemSaldo === 'informado'
                    ? TINTA.ouro
                    : 'rgba(242,237,227,.5)',
            }}
          >
            {ROTULO_ORIGEM_SALDO[conta.origemSaldo]}
          </span>
        </span>
        {horas !== null && (
          <span
            className="font-sans"
            style={{ fontSize: 10, color: horas >= 24 ? TINTA.atencao : 'rgba(242,237,227,.36)' }}
          >
            {horas < 1 ? 'lido agora há pouco' : `última leitura há ${horas} h`}
          </span>
        )}
        {dif !== null && Math.abs(dif) > 0.05 && (
          <Num tamanho={10} tom="erro" peso={400}>
            {`${dif > 0 ? '+' : '−'} ${brl(Math.abs(dif))} vs. extrato`}
          </Num>
        )}
      </span>
    </div>
  )
}

/**
 * Saldo acumulado dia a dia por conta, a partir das baixas.
 *
 * É uma reconstrução, não um histórico gravado: o ERP não guarda foto diária
 * de saldo. Serve para a forma da curva — subindo ou descendo —, e por isso a
 * faixa não tem escala nem eixo.
 */
function serieDiariaPorConta(lancamentos: LancamentoGerencial[]): Map<string, number[]> {
  const porConta = new Map<string, Map<string, number>>()
  for (const l of lancamentos) {
    if (!l.baixadoEm || l.canceladoEm) continue
    const dias = porConta.get(l.contaId) ?? new Map<string, number>()
    const delta = l.tipo === 'entrada' ? l.recebido : -l.recebido
    dias.set(l.baixadoEm, (dias.get(l.baixadoEm) ?? 0) + delta)
    porConta.set(l.contaId, dias)
  }

  const saida = new Map<string, number[]>()
  for (const [conta, dias] of porConta) {
    const ordenados = [...dias.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-30)
    let acumulado = 0
    saida.set(
      conta,
      ordenados.map(([, v]) => (acumulado += v)),
    )
  }
  return saida
}
