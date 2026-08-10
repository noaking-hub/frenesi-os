'use client'

import { useState, useTransition } from 'react'

import {
  Badge,
  BotaoOuro,
  BotaoSecundario,
  EstadoVazio,
  FaixaAlerta,
  Rotulo,
  TituloSecao,
  Valor,
} from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { brl, sugerirCategoria } from '@/domain'
import type { LinhaExtrato } from '@/domain'

import type { ConferenciaConta } from '@/data/extrato'

import {
  classificarLinha,
  diagnosticarGateway,
  ignorarLinha,
  importarExtratoCompleto,
  sondarExtratoCompleto,
  zerarFinanceiro,
  recasarExtrato,
  relerGateway,
  sincronizarGateway,
} from './actions'

const campo = {
  height: 32,
  padding: '0 10px',
  border: '1px solid rgba(255,255,255,.11)',
  background: 'rgba(255,255,255,.03)',
  borderRadius: 8,
  color: 'var(--color-corrente)',
  fontSize: 12.5,
  lineHeight: 1,
  outline: 0,
} as const

const mono = {
  fontSize: 10,
  lineHeight: 1.6,
  color: 'rgba(242,237,227,.55)',
  whiteSpace: 'pre-wrap',
  textWrap: 'pretty',
} as const

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

function diasAtras(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
}

interface Props {
  linhas: LinhaExtrato[]
  contas: ConferenciaConta[]
  categorias: { nome: string; natureza: string }[]
  gatewayLigado: boolean
}

/**
 * Extrato: a fila entre "o dinheiro se moveu" e "o ERP sabe o que foi".
 *
 * A tela tem uma ordem deliberada: primeiro de onde os fatos vêm (sincronizar
 * ou importar), depois a conferência de saldo — que é onde se descobre que o
 * ERP está atrasado —, e só então a fila de classificação. Quem abre a tela
 * pela primeira vez lê nessa ordem e entende o módulo.
 */
export function ExtratoCliente({ linhas, contas, categorias, gatewayLigado }: Props) {
  const [de, setDe] = useState(diasAtras(30))
  const [ate, setAte] = useState(hoje())
  const [relatorio, setRelatorio] = useState<string[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  // Categoria escolhida por linha. A sugestão entra como valor inicial e o
  // operador troca quando o palpite erra — palpite que não dá para corrigir
  // vira erro gravado.
  const [escolhas, setEscolhas] = useState<Record<string, string>>({})
  const chaveDe = (l: LinhaExtrato) => `${l.origem}:${l.chave}`

  const categoriaDe = (l: LinhaExtrato) =>
    escolhas[chaveDe(l)] ?? sugerirCategoria(l.descricao, l.tipo) ?? ''

  // A fila já chega filtrada do banco: só o que precisa de decisão. Crédito
  // de venda casado com pedido não entra — ele não tem categoria a escolher
  // (a receita do DRE vem do pedido) nem saldo a mover (o extrato já moveu).
  const pendentes = linhas
  const entradas = pendentes.filter((l) => l.tipo === 'entrada').reduce((a, l) => a + l.valor, 0)
  const saidas = pendentes.filter((l) => l.tipo === 'saida').reduce((a, l) => a + l.valor, 0)

  function rodar(acao: () => Promise<string[] | null>) {
    setErro(null)
    setRelatorio(null)
    iniciar(async () => {
      try {
        const linhasRelatorio = await acao()
        if (linhasRelatorio) setRelatorio(linhasRelatorio)
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e))
      }
    })
  }

  const colunas: Coluna<LinhaExtrato>[] = [
    {
      chave: 'quando',
      titulo: 'Data',
      largura: '92px',
      render: (l) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Valor tamanho={11.5} peso={400}>
            {l.ocorridoEm.split('-').reverse().join('/')}
          </Valor>
          <span className="font-mono" style={{ fontSize: 9, color: 'rgba(242,237,227,.3)' }}>
            {l.origem}
          </span>
        </span>
      ),
    },
    {
      chave: 'descricao',
      titulo: 'Movimento',
      largura: 'minmax(0,1fr)',
      render: (l) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span
            className="font-sans"
            style={{
              fontWeight: 500,
              fontSize: 12,
              lineHeight: 1.3,
              color: 'rgba(242,237,227,.85)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {l.descricao}
          </span>
          <span
            className="font-mono"
            style={{
              fontSize: 9.5,
              color: 'rgba(242,237,227,.32)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {[l.contaNome, l.contraparte, l.pedidoId].filter(Boolean).join(' · ')}
          </span>
        </span>
      ),
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      largura: '112px',
      alinhamento: 'right',
      render: (l) => (
        <Valor tamanho={12} tom={l.tipo === 'entrada' ? 'ok' : 'erro'}>
          {`${l.tipo === 'entrada' ? '+' : '−'} ${brl(l.valor)}`}
        </Valor>
      ),
    },
    {
      chave: 'categoria',
      titulo: 'Categoria',
      largura: '190px',
      render: (l) => (
        <select
          value={categoriaDe(l)}
          onChange={(e) => setEscolhas((v) => ({ ...v, [chaveDe(l)]: e.target.value }))}
          style={{ ...campo, height: 28, width: '100%', fontSize: 11.5 }}
        >
          <option value="">
            {l.tipo === 'entrada' ? 'Sem categoria (recebimento)' : 'Escolha a categoria'}
          </option>
          {categorias.map((c) => (
            <option key={c.nome} value={c.nome}>
              {c.nome}
            </option>
          ))}
        </select>
      ),
    },
    {
      chave: 'acao',
      titulo: '',
      largura: '188px',
      alinhamento: 'right',
      render: (l) => (
        <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <BotaoSecundario
            altura={28}
            onClick={() =>
              rodar(async () => {
                const r = await classificarLinha(l.origem, l.chave, categoriaDe(l), '')
                if (!r.ok) throw new Error(r.erro)
                return [`Lançamento ${r.lancamentoId} criado a partir de "${l.descricao}".`]
              })
            }
          >
            Classificar
          </BotaoSecundario>
          <BotaoSecundario
            altura={28}
            onClick={() =>
              rodar(async () => {
                const motivo = window.prompt(
                  'Por que esta linha não vira lançamento?\n(transferência entre contas próprias, aporte, estorno que se anula…)',
                )
                if (!motivo) return null
                const r = await ignorarLinha(l.origem, l.chave, motivo)
                if (!r.ok) throw new Error(r.erro)
                return [`"${l.descricao}" saiu da fila: ${motivo}`]
              })
            }
          >
            Dispensar
          </BotaoSecundario>
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── De onde vêm os fatos ─────────────────────────────────────── */}
      <section
        style={{
          background: 'var(--color-mesa)',
          border: '1px solid var(--color-borda)',
          borderRadius: 'var(--radius-card)',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <TituloSecao tamanho={14}>Trazer o movimento</TituloSecao>

        {/* Mercado Pago */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Rotulo>Mercado Pago · de</Rotulo>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={campo} />
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Rotulo>até</Rotulo>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={campo} />
          </span>
          <BotaoOuro
            altura={32}
            desabilitado={pendente || !gatewayLigado}
            onClick={() =>
              rodar(async () => {
                const r = await sincronizarGateway(de, ate)
                if (!r.ok) throw new Error(r.erro)
                const x = r.resultado
                return [
                  `${x.lidos} pagamento(s) lidos de ${x.periodo.de} a ${x.periodo.ate}.`,
                  `Extrato: ${x.novasLinhas} linha(s) nova(s), ${x.linhasRepetidas} já conhecida(s).`,
                  `Repasses: ${x.repassesConciliados} conciliado(s) agora, ${x.repassesJaConciliados} já estavam.`,
                  ...(Object.keys(x.criterios).length
                    ? [
                        `Casamento com pedidos: ${Object.entries(x.criterios)
                          .map(([k, v]) => `${v} por ${k}`)
                          .join(', ')}.`,
                      ]
                    : []),
                  ...(x.semPedido.length
                    ? [
                        `${x.semPedido.length} pagamento(s) aprovados sem pedido correspondente:`,
                        ...x.semPedido
                          .slice(0, 10)
                          .map((p) => `  · ${p.id} · ${brl(p.valor)} · ${p.quando} · ref "${p.referencia || '—'}"`),
                      ]
                    : []),
                  ...x.avisos.map((a) => `Atenção: ${a}`),
                ]
              })
            }
          >
            {pendente ? 'Lendo…' : 'Sincronizar gateway'}
          </BotaoOuro>
          <BotaoSecundario
            altura={32}
            desabilitado={pendente}
            onClick={() =>
              rodar(async () => {
                const r = await diagnosticarGateway(de, ate)
                if (!r.ok) throw new Error(r.erro)
                return [...r.passos, ...(r.amostra.length ? ['', 'Amostra:', ...r.amostra] : [])]
              })
            }
          >
            Diagnosticar
          </BotaoSecundario>
          <BotaoSecundario
            altura={32}
            desabilitado={pendente || !gatewayLigado}
            onClick={() =>
              rodar(async () => {
                // Reler existe porque a importação é idempotente: quando a
                // LEITURA estava errada, ressincronizar não conserta nada.
                if (
                  !window.confirm(
                    'Apagar as linhas do Mercado Pago que ainda não viraram lançamento e ler o período de novo?\n\nO que já foi classificado ou dispensado é preservado.',
                  )
                ) {
                  return null
                }
                const r = await relerGateway(de, ate)
                if (!r.ok) throw new Error(r.erro)
                const x = r.resultado
                return [
                  `${r.apagadas} linha(s) antigas apagadas.`,
                  `${x.lidos} pagamento(s) relidos · ${x.novasLinhas} linha(s) gravadas.`,
                  `${x.saidas} deles foram pagamentos NOSSOS (etiqueta de frete, por exemplo) e entraram como saída.`,
                  ...x.avisos.map((a) => `Atenção: ${a}`),
                ]
              })
            }
          >
            Reler do zero
          </BotaoSecundario>
          <BotaoOuro
            altura={32}
            desabilitado={pendente || !gatewayLigado}
            onClick={() =>
              rodar(async () => {
                const r = await importarExtratoCompleto(de, ate)
                if (!r.ok) throw new Error(r.erro)
                return r.linhas
              })
            }
          >
            {pendente ? 'Gerando relatório…' : 'Importar extrato completo'}
          </BotaoOuro>
          <BotaoSecundario
            altura={32}
            desabilitado={pendente || !gatewayLigado}
            onClick={() =>
              rodar(async () => {
                const r = await sondarExtratoCompleto()
                if (!r.ok) throw new Error(r.erro)
                return r.linhas
              })
            }
          >
            Sondar
          </BotaoSecundario>
          <BotaoSecundario
            altura={32}
            desabilitado={pendente}
            onClick={() =>
              rodar(async () => {
                if (
                  !window.confirm(
                    'Apagar TODO o extrato, os lançamentos que vieram dele e a conciliação dos repasses?\n\nPedidos e lançamentos digitados à mão não são tocados.',
                  )
                ) {
                  return null
                }
                const r = await zerarFinanceiro()
                if (!r.ok) throw new Error(r.erro)
                return r.linhas
              })
            }
          >
            Zerar financeiro
          </BotaoSecundario>
          <BotaoSecundario
            altura={32}
            desabilitado={pendente}
            onClick={() =>
              rodar(async () => {
                const r = await recasarExtrato()
                if (!r.ok) throw new Error(r.erro)
                return [
                  `${r.religadas} linha(s) ligadas a um pedido agora.`,
                  r.restantes
                    ? `${r.restantes} continuam sem pedido correspondente no ERP.`
                    : 'Nenhuma linha ficou órfã.',
                ]
              })
            }
          >
            Recasar com pedidos
          </BotaoSecundario>
          {!gatewayLigado && (
            <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
              Falta MERCADOPAGO_ACCESS_TOKEN no ambiente.
            </span>
          )}
        </div>

      </section>

      {erro && <FaixaAlerta tom="erro" texto={erro} />}

      {relatorio && (
        <section
          style={{
            background: 'var(--color-mesa)',
            border: '1px solid var(--color-borda)',
            borderRadius: 'var(--radius-card)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <TituloSecao tamanho={13}>O que aconteceu</TituloSecao>
          <pre className="font-mono" style={mono}>
            {relatorio.join('\n')}
          </pre>
        </section>
      )}

      {/* ── Conferência ──────────────────────────────────────────────── */}
      {contas.length > 0 && (
        <section
          style={{
            background: 'var(--color-mesa)',
            border: '1px solid var(--color-borda)',
            borderRadius: 'var(--radius-card)',
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <TituloSecao tamanho={14}>Saldo das contas</TituloSecao>
            <span
              className="font-sans"
              style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
            >
              O saldo vem do próprio gateway. A nossa leitura de pagamentos não vê saque nem
              transferência, então ela explica as vendas — não fecha o caixa.
            </span>
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {contas.map((c) => {
              // A diferença entre o saldo real e o que conseguimos ler é,
              // literalmente, o que saiu da conta sem passar por um pagamento
              // recebido: saque, transferência, Pix enviado, conta paga.
              const naoLido = c.saldoInformado === null
                ? null
                : Math.round((c.movimentoLido - c.saldoInformado) * 100) / 100
              return (
                <div
                  key={c.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) 140px 140px minmax(190px,auto)',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,.02)',
                    border: '1px solid rgba(255,255,255,.05)',
                  }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Valor tamanho={12}>{c.nome}</Valor>
                    <span className="font-mono" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.32)' }}>
                      {`${c.banco || '—'} · ${c.linhasLidas} linha(s) lida(s)`}
                    </span>
                  </span>

                  {/* Sem saldo informado, mostrar o movimento com rótulo de
                      saldo seria repetir o mesmo número com dois nomes — e foi
                      assim que R$ 83 mil passaram por saldo de uma conta com
                      R$ 10 mil. Melhor dizer que não sabemos. */}
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                    <Valor tamanho={13} tom={c.saldoInformado === null ? 'atencao' : 'ok'}>
                      {c.saldoInformado === null ? '—' : brl(c.saldoInformado)}
                    </Valor>
                    <span className="font-sans" style={{ fontSize: 9, color: 'rgba(242,237,227,.35)' }}>
                      {c.saldoInformado === null ? 'saldo não lido ainda' : 'saldo do gateway'}
                    </span>
                  </span>

                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                    <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.7)">
                      {brl(c.movimentoLido)}
                    </Valor>
                    <span className="font-sans" style={{ fontSize: 9, color: 'rgba(242,237,227,.35)' }}>
                      movimento que lemos
                    </span>
                  </span>

                  <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {naoLido !== null && Math.abs(naoLido) > 1 ? (
                      <Badge tom="info">{`${brl(naoLido)} saíram sem virar linha`}</Badge>
                    ) : c.aClassificar > 0 ? (
                      <Badge tom="atencao">{`${c.aClassificar} precisam de você`}</Badge>
                    ) : (
                      <Badge tom="ok">Em dia</Badge>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Fila ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <TituloSecao tamanho={16}>Precisam de você</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          {`Despesas a categorizar (${brl(saidas)}) e entradas sem pedido correspondente (${brl(entradas)}). As vendas casadas com pedido não aparecem aqui: não há o que decidir nelas.`}
        </span>
      </div>

      {pendentes.length === 0 ? (
        <EstadoVazio
          titulo="Nada na fila"
          instrucao="As vendas conciliam sozinhas. Só despesa sem categoria e entrada sem pedido aparecem aqui."
        />
      ) : (
        <Tabela
          colunas={colunas}
          itens={pendentes}
          chaveDe={chaveDe}
          bandeiraDe={(l) => (l.tipo === 'saida' && !categoriaDe(l) ? 'atencao' : null)}
          densidade="confortavel"
        />
      )}
    </div>
  )
}
