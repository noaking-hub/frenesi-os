'use client'

import { useMemo, useRef, useState, useTransition } from 'react'

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
  classificarRecebimentos,
  diagnosticarBanco,
  diagnosticarGateway,
  ignorarLinha,
  importarOfx,
  recasarExtrato,
  relerGateway,
  sincronizarBanco,
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
  bancoLigado: boolean
  faltaNoBanco: string[]
}

/**
 * Extrato: a fila entre "o dinheiro se moveu" e "o ERP sabe o que foi".
 *
 * A tela tem uma ordem deliberada: primeiro de onde os fatos vêm (sincronizar
 * ou importar), depois a conferência de saldo — que é onde se descobre que o
 * ERP está atrasado —, e só então a fila de classificação. Quem abre a tela
 * pela primeira vez lê nessa ordem e entende o módulo.
 */
export function ExtratoCliente({
  linhas,
  contas,
  categorias,
  gatewayLigado,
  bancoLigado,
  faltaNoBanco,
}: Props) {
  const [de, setDe] = useState(diasAtras(30))
  const [ate, setAte] = useState(hoje())
  const [contaOfx, setContaOfx] = useState(contas[0]?.id ?? 'sicoob')
  const [relatorio, setRelatorio] = useState<string[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const arquivoRef = useRef<HTMLInputElement>(null)

  // Categoria escolhida por linha. A sugestão entra como valor inicial e o
  // operador troca quando o palpite erra — palpite que não dá para corrigir
  // vira erro gravado.
  const [escolhas, setEscolhas] = useState<Record<string, string>>({})
  const chaveDe = (l: LinhaExtrato) => `${l.origem}:${l.chave}`

  const categoriaDe = (l: LinhaExtrato) =>
    escolhas[chaveDe(l)] ?? sugerirCategoria(l.descricao, l.tipo) ?? ''

  const pendentes = useMemo(() => linhas.filter((l) => !l.lancamentoId && !l.ignorado), [linhas])
  // Entrada já casada com um pedido é o crédito daquela venda: não há
  // categoria a escolher, porque a receita do DRE vem do pedido. Clicar 141
  // vezes para dizer "sim, é venda" não é conferência, é digitação — e depois
  // de vinte linhas ninguém lê mais o que está aprovando.
  const recebimentosDeVenda = useMemo(
    () => pendentes.filter((l) => l.tipo === 'entrada' && l.pedidoId),
    [pendentes],
  )
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

        {/* Banco */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Rotulo>Banco · arquivo OFX</Rotulo>
            <input
              ref={arquivoRef}
              type="file"
              accept=".ofx,.OFX,text/plain,application/x-ofx"
              style={{ ...campo, height: 32, paddingTop: 6, fontSize: 11 }}
            />
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Rotulo>na conta</Rotulo>
            <select value={contaOfx} onChange={(e) => setContaOfx(e.target.value)} style={campo}>
              {contas.length === 0 && <option value="sicoob">Sicoob (será criada)</option>}
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </span>
          <BotaoOuro
            altura={32}
            desabilitado={pendente}
            onClick={() =>
              rodar(async () => {
                const arquivo = arquivoRef.current?.files?.[0]
                if (!arquivo) throw new Error('Escolha o arquivo .ofx exportado do internet banking.')
                const dados = new FormData()
                dados.set('arquivo', arquivo)
                dados.set('conta', contaOfx)
                const r = await importarOfx(dados)
                if (!r.ok) throw new Error(r.erro)
                const x = r.resultado
                return [
                  `${x.lidas} lançamento(s) lidos do arquivo (banco ${x.banco || '—'}, conta ${x.conta || '—'}).`,
                  `${x.novas} nova(s), ${x.repetidas} já estavam no extrato.`,
                  ...x.avisos.map((a) => `Atenção: ${a}`),
                ]
              })
            }
          >
            Importar OFX
          </BotaoOuro>
          {bancoLigado && (
            <BotaoSecundario
              altura={32}
              desabilitado={pendente}
              onClick={() =>
                rodar(async () => {
                  const agora = new Date()
                  const r = await sincronizarBanco(agora.getMonth() + 1, agora.getFullYear())
                  if (!r.ok) throw new Error(r.erro)
                  return [`${r.lidas} lançamento(s) lidos da API do Sicoob: ${r.novas} novo(s), ${r.repetidas} repetido(s).`]
                })
              }
            >
              Sincronizar Sicoob
            </BotaoSecundario>
          )}
          <BotaoSecundario
            altura={32}
            desabilitado={pendente}
            onClick={() =>
              rodar(async () => {
                const agora = new Date()
                const r = await diagnosticarBanco(agora.getMonth() + 1, agora.getFullYear())
                if (!r.ok) throw new Error(r.erro)
                return [...r.passos, ...(r.amostra.length ? ['', 'Amostra:', ...r.amostra] : [])]
              })
            }
          >
            Diagnosticar banco
          </BotaoSecundario>
        </div>

        {faltaNoBanco.length > 0 && (
          <div
            className="font-sans"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              fontSize: 10.5,
              lineHeight: 1.6,
              color: 'var(--color-terciario)',
              textWrap: 'pretty',
            }}
          >
            <span>
              A API do Sicoob exige certificado digital emitido pela cooperativa e liberação dos escopos
              — o que ainda falta no ambiente:
            </span>
            {faltaNoBanco.map((f) => (
              <span key={f} className="font-mono" style={{ fontSize: 10, paddingLeft: 10 }}>
                {`· ${f}`}
              </span>
            ))}
            <span>
              Até o certificado sair, o OFX do internet banking traz exatamente os mesmos lançamentos,
              com identificador próprio, e cai nesta mesma tabela.
            </span>
          </div>
        )}
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
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <TituloSecao tamanho={14}>Saldo do ERP contra o extrato</TituloSecao>
            <span
              className="font-sans"
              style={{ fontSize: 10.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
            >
              A diferença entre as duas colunas é a fila de classificação — o saldo do ERP só anda
              quando a linha vira lançamento.
            </span>
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {contas.map((c) => {
              const diferenca = Math.round((c.saldoExtrato - c.saldo) * 100) / 100
              return (
                <div
                  key={c.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) 120px 120px minmax(200px,auto)',
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
                  <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.7)">
                    {brl(c.saldo)}
                  </Valor>
                  <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.7)">
                    {brl(c.saldoExtrato)}
                  </Valor>
                  <span style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>
                    {c.aClassificar > 0 ? (
                      <Badge tom="atencao">{`${c.aClassificar} a classificar · ${brl(Math.abs(diferenca))}`}</Badge>
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
        <TituloSecao tamanho={16}>A classificar</TituloSecao>
        <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
          {`${brl(entradas)} de entradas e ${brl(saidas)} de saídas esperando virar lançamento`}
        </span>
        <div style={{ flex: 1 }} />
        {recebimentosDeVenda.length > 0 && (
          <BotaoOuro
            altura={32}
            desabilitado={pendente}
            onClick={() =>
              rodar(async () => {
                const r = await classificarRecebimentos(recebimentosDeVenda[0].contaId)
                if (!r.ok) throw new Error(r.erro)
                return [
                  `${r.feitas} crédito(s) de venda viraram lançamento.`,
                  'Ficaram na fila as entradas sem pedido casado e todas as saídas — são as que precisam de decisão.',
                ]
              })
            }
          >
            {`Classificar ${recebimentosDeVenda.length} crédito(s) de venda`}
          </BotaoOuro>
        )}
      </div>

      {pendentes.length === 0 ? (
        <EstadoVazio
          titulo="Nada na fila"
          instrucao={
            linhas.length === 0
              ? 'Sincronize o Mercado Pago ou importe o OFX do banco para trazer o movimento.'
              : 'Todo movimento lido já virou lançamento ou foi dispensado.'
          }
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
