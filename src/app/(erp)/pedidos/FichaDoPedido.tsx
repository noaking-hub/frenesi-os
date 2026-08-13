'use client'

import { useEffect, useState, useTransition } from 'react'

import { GavetaInferior } from '@/components/erp/Modal'
import { Rotulo } from '@/components/erp/primitivos'
import { COR, FUNDO, BORDA, type Tom } from '@/components/erp/tokens'
import {
  ROTULO_LOGISTICO,
  ROTULO_SITUACAO,
  brl,
  ehOcorrencia,
  paginaDeRastreio,
  resumirEvento,
  statusDoEvento,
  type EventoTransportadora,
  type Pedido,
  type Sla,
  type SituacaoLogistica,
  type StatusDevolucao,
} from '@/domain'

import { atualizarRastreamento, confirmarEntregaEmMaos, linhaDoTempoDoPedido } from './actions'

/**
 * A ficha do pedido, na gaveta inferior de largura total.
 *
 * As cinco abas são as que o escopo exige. Rastreamento é a que ganha mais
 * espaço porque é a que o atendimento abre: responder "onde está meu pedido"
 * exige transportadora, código, última leitura e o histórico — quatro coisas
 * que num diálogo estreito virariam quatro rolagens.
 *
 * A linha do tempo chega por ação de servidor quando a gaveta abre. Trazê-la
 * junto da lista significaria transportar o histórico de 612 pedidos para
 * mostrar o de um.
 */

type Aba = 'Resumo' | 'Itens' | 'Pagamento' | 'Rastreamento' | 'Timeline'
const ABAS: Aba[] = ['Resumo', 'Itens', 'Pagamento', 'Rastreamento', 'Timeline']

const TOM_LOGISTICO: Record<string, Tom> = {
  'sem-rastreio': 'neutro',
  etiqueta: 'atencao',
  postado: 'info',
  'em-transito': 'info',
  'saiu-para-entrega': 'ouro',
  tentativa: 'erro',
  'aguardando-retirada': 'atencao',
  entregue: 'ok',
  devolucao: 'erro',
  extraviado: 'erro',
}

export interface FichaProps {
  pedido: Pedido
  sla: Sla
  logistica: SituacaoLogistica
  devolucao: StatusDevolucao
  aoFechar: () => void
  /** Recado para a faixa da tela de trás, já que a gaveta some ao confirmar. */
  aoRecado: (texto: string) => void
  aoErro: (texto: string) => void
}

export function FichaDoPedido({
  pedido,
  sla,
  logistica,
  devolucao,
  aoFechar,
  aoRecado,
  aoErro,
}: FichaProps) {
  const [aba, setAba] = useState<Aba>('Resumo')
  const [eventos, setEventos] = useState<EventoTransportadora[] | null>(null)
  const [pendente, iniciar] = useTransition()
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    let vivo = true
    setEventos(null)
    linhaDoTempoDoPedido(pedido.id).then((e) => {
      if (vivo) setEventos(e)
    })
    return () => {
      vivo = false
    }
  }, [pedido.id])

  const link = pedido.rastreioUrl ?? paginaDeRastreio(pedido.transportadora, pedido.rastreio)

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1600)
    } catch {
      aoErro('O navegador não liberou a área de transferência.')
    }
  }

  const releitura = () =>
    iniciar(async () => {
      const r = await atualizarRastreamento([pedido.id])
      if (!r.ok) return aoErro(r.erro)
      const novos = await linhaDoTempoDoPedido(pedido.id)
      setEventos(novos)
      aoRecado(
        r.eventos > 0
          ? `${r.eventos} ocorrência(s) nova(s) em ${pedido.id}.`
          : r.aviso ?? `Nenhuma ocorrência nova em ${pedido.id}.`,
      )
    })

  const entregar = () =>
    iniciar(async () => {
      const r = await confirmarEntregaEmMaos(pedido.id)
      if (!r.ok) return aoErro(r.erro)
      aoFechar()
      aoRecado(
        r.mlConsumido > 0
          ? `${pedido.id} entregue · ${r.mlConsumido.toFixed(1).replace('.', ',')} ml baixados do estoque.`
          : `${pedido.id} entregue. Nenhum ml baixado — os perfumes deste pedido estão fora do controle de estoque.`,
      )
    })

  return (
    <GavetaInferior titulo={`Pedido ${pedido.id}`} aoFechar={aoFechar}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '15px 24px',
          borderBottom: '1px solid var(--color-borda-sutil)',
        }}
      >
        <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
          Pedido
        </span>
        <span
          className="font-mono"
          style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ouro)' }}
        >
          {pedido.id}
        </span>
        <Selo tom={TOM_LOGISTICO[logistica.status] ?? 'neutro'}>
          {ROTULO_LOGISTICO[logistica.status]}
        </Selo>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar"
          className="hover:text-corrente"
          style={{
            width: 28,
            height: 28,
            border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 8,
            background: 'transparent',
            color: 'var(--color-terciario)',
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </header>

      <nav style={{ display: 'flex', gap: 4, padding: '10px 24px 0' }}>
        {ABAS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAba(a)}
            className="font-sans"
            style={{
              height: 32,
              padding: '0 12px',
              border: 0,
              borderBottom: `2px solid ${a === aba ? COR.ouro : 'transparent'}`,
              background: 'transparent',
              color: a === aba ? COR.ouro : 'rgba(242,237,227,.55)',
              fontWeight: 600,
              fontSize: 11.5,
              cursor: 'pointer',
            }}
          >
            {a}
          </button>
        ))}
      </nav>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px 20px' }}>
        {aba === 'Resumo' && (
          <Colunas>
            <Bloco titulo="Dados do pedido">
              <Campo rotulo="Pedido" valor={pedido.id} mono />
              <Campo rotulo="Data" valor={pedido.data} />
              <Campo rotulo="Canal" valor={pedido.canal} />
              <Campo rotulo="Valor do pedido" valor={brl(pedido.valor)} mono />
              <Campo rotulo="Situação" valor={ROTULO_SITUACAO[pedido.situacao]} />
              <Campo rotulo="Prazo de expedição" valor={sla.rotulo} />
            </Bloco>
            <Bloco titulo="Cliente">
              <Campo rotulo="Nome" valor={pedido.cliente} />
              <Campo rotulo="CPF" valor={pedido.cpf} mono />
              <Campo rotulo="Telefone" valor={pedido.telefone} />
              <Campo rotulo="E-mail" valor={pedido.email} />
              <Campo rotulo="Cidade / UF" valor={pedido.destino} />
            </Bloco>
            <Bloco titulo="Entrega">
              <Campo rotulo="Endereço" valor={pedido.rua} />
              <Campo rotulo="CEP" valor={pedido.cep} mono />
              <Campo rotulo="Cidade / UF" valor={pedido.destino} />
              <Campo
                rotulo="Tipo de entrega"
                valor={pedido.entregaLocal ? 'Entrega local (motoboy)' : 'Transportadora'}
              />
              <Campo
                rotulo="Entregue em"
                valor={pedido.entregueEm ? dataHora(pedido.entregueEm) : '—'}
              />
              <Campo rotulo="Janela de devolução" valor={devolucao.selo} />
            </Bloco>
            <Bloco titulo="Rastreamento">
              <Campo rotulo="Transportadora" valor={pedido.transportadora ?? 'Não identificada'} />
              <Campo rotulo="Serviço" valor={pedido.servicoFrete ?? '—'} />
              <Campo rotulo="Código" valor={pedido.rastreio ?? 'Ainda não emitido'} mono />
              <Campo rotulo="Status logístico" valor={ROTULO_LOGISTICO[logistica.status]} />
              <Campo
                rotulo="Última atualização"
                valor={logistica.desde ? dataHora(logistica.desde) : 'Sem evento'}
              />
              <Campo rotulo="Tentativas de entrega" valor={String(logistica.tentativas)} />
            </Bloco>
          </Colunas>
        )}

        {aba === 'Itens' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 720 }}>
            {pedido.itens.length === 0 && <Vazio>Este pedido não trouxe itens da Yampi.</Vazio>}
            {pedido.itens.map((i, n) => (
              <div
                key={`${i.perfume}-${n}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '11px 14px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,.03)',
                  border: '1px solid rgba(255,255,255,.06)',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    className="font-sans"
                    style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}
                  >
                    {i.perfume}
                  </span>
                  <span
                    className="font-sans"
                    style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}
                  >
                    {i.variante} ml
                  </span>
                </span>
                <span className="font-mono" style={{ fontSize: 12 }}>
                  {brl(i.preco)}
                </span>
              </div>
            ))}
          </div>
        )}

        {aba === 'Pagamento' && (
          <Colunas>
            <Bloco titulo="Pagamento">
              <Campo rotulo="Situação financeira" valor={rotuloPagamento(pedido.pagamento)} />
              <Campo rotulo="Canal" valor={pedido.canal} />
              <Campo rotulo="Gateway do frete" valor={pedido.gateway} />
            </Bloco>
            <Bloco titulo="Valores">
              <Campo rotulo="Valor do pedido" valor={brl(pedido.valor)} mono />
              <Campo rotulo="Frete" valor={brl(pedido.frete)} mono />
              <Campo rotulo="Cashback usado" valor={brl(pedido.cashback)} mono />
            </Bloco>
          </Colunas>
        )}

        {aba === 'Rastreamento' &&
          (pedido.entregaLocal ? (
            <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p
                className="font-sans"
                style={{ fontSize: 12, lineHeight: 1.6, color: 'rgba(242,237,227,.75)' }}
              >
                Entrega em mãos: não há transportadora nem código. Este pedido não é faturado, então
                a confirmação da entrega é o que fecha o ciclo — e é ela que baixa o ml do estoque.
              </p>
              {pedido.situacao !== 'entregue' && (
                <span>
                  <BotaoAcao destaque desabilitado={pendente} aoClicar={entregar}>
                    {pendente ? 'Confirmando…' : 'Confirmar entrega em mãos'}
                  </BotaoAcao>
                </span>
              )}
            </div>
          ) : (
            <Colunas>
              <Bloco titulo="Envio">
                <Campo rotulo="Transportadora" valor={pedido.transportadora ?? 'Não identificada'} />
                <Campo rotulo="Serviço" valor={pedido.servicoFrete ?? '—'} />
                <Campo rotulo="Código de rastreio" valor={pedido.rastreio ?? '—'} mono />
              </Bloco>
              <Bloco titulo="Situação logística">
                <Campo rotulo="Status" valor={ROTULO_LOGISTICO[logistica.status]} />
                <Campo rotulo="Último evento" valor={logistica.original ? resumirEvento(logistica.original) : '—'} />
                <Campo rotulo="Local" valor={logistica.local ?? '—'} />
                <Campo
                  rotulo="Sem atualização há"
                  valor={
                    logistica.horasSemAtualizacao === null
                      ? '—'
                      : `${logistica.horasSemAtualizacao} h`
                  }
                />
              </Bloco>
              <Bloco titulo="Consulta">
                <Campo
                  rotulo="Última consulta do ERP"
                  valor={pedido.rastreioLidoEm ? dataHora(pedido.rastreioLidoEm) : 'Nunca'}
                />
                <Campo rotulo="Ocorrências registradas" valor={String(eventos?.length ?? 0)} />
                <Campo
                  rotulo="Exige ação"
                  valor={ehOcorrencia(logistica.status) ? 'Sim' : 'Não'}
                />
              </Bloco>
            </Colunas>
          ))}

        {aba === 'Timeline' && (
          <div style={{ maxWidth: 760 }}>
            {eventos === null && <Vazio>Carregando a linha do tempo…</Vazio>}
            {eventos?.length === 0 && (
              <Vazio>
                {pedido.rastreio
                  ? 'A transportadora ainda não devolveu nenhuma ocorrência para este código.'
                  : 'Este pedido não tem código de rastreio.'}
              </Vazio>
            )}
            {eventos && eventos.length > 0 && (
              <ol style={{ display: 'flex', flexDirection: 'column', gap: 0, margin: 0, padding: 0 }}>
                {eventos.map((e, n) => {
                  const status = statusDoEvento(e.descricao)
                  const tom: Tom = status ? (TOM_LOGISTICO[status] ?? 'neutro') : 'neutro'
                  return (
                    <li
                      key={e.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '116px 16px 1fr',
                        gap: 12,
                        alignItems: 'start',
                        padding: '9px 0',
                      }}
                    >
                      <span
                        className="font-mono"
                        style={{ fontSize: 10.5, color: 'var(--color-terciario)', paddingTop: 2 }}
                      >
                        {e.quando ? dataHora(e.quando) : '—'}
                      </span>
                      <span
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 3,
                          paddingTop: 5,
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 999,
                            background: COR[tom],
                            flex: 'none',
                          }}
                        />
                        {n < eventos.length - 1 && (
                          <span style={{ flex: 1, width: 1, minHeight: 18, background: 'rgba(255,255,255,.1)' }} />
                        )}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span
                          className="font-sans"
                          style={{ display: 'block', fontSize: 12, fontWeight: 600 }}
                        >
                          {status ? ROTULO_LOGISTICO[status] : 'Ocorrência registrada'}
                        </span>
                        {/* A mensagem original fica logo abaixo do rótulo
                            normalizado — o escopo pede as duas, e é ela que o
                            atendimento lê para o cliente. */}
                        <span
                          className="font-sans"
                          style={{
                            display: 'block',
                            fontSize: 11,
                            lineHeight: 1.5,
                            color: 'var(--color-terciario)',
                            textWrap: 'pretty',
                          }}
                        >
                          {resumirEvento(e.descricao)}
                          {e.local ? ` · ${e.local}` : ''}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        )}
      </div>

      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          flexWrap: 'wrap',
          padding: '13px 24px',
          borderTop: '1px solid var(--color-borda-sutil)',
          background: 'rgba(0,0,0,.2)',
        }}
      >
        {!pedido.entregaLocal && (
          <BotaoAcao destaque desabilitado={pendente || !pedido.rastreio} aoClicar={releitura}>
            {pendente ? 'Consultando…' : 'Atualizar rastreamento'}
          </BotaoAcao>
        )}
        {pedido.rastreio && (
          <BotaoAcao aoClicar={() => copiar(pedido.rastreio as string)}>
            {copiado ? 'Copiado' : 'Copiar rastreio'}
          </BotaoAcao>
        )}
        <BotaoAcao aoClicar={() => copiar(pedido.id)}>Copiar nº do pedido</BotaoAcao>
        {/* O envio ao cliente fica visível e desligado de propósito: o botão
            existe no escopo, mas nenhum e-mail sai enquanto os avisos estiverem
            desligados. Esconder daria a impressão de funcionalidade ausente. */}
        <BotaoAcao
          desabilitado
          titulo="Os avisos ao cliente estão desligados até o sistema rodar 100%."
          aoClicar={() => {}}
        >
          Enviar rastreio ao cliente
        </BotaoAcao>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="font-sans hover:border-ouro/45"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 32,
              padding: '0 13px',
              border: '1px solid rgba(255,255,255,.12)',
              borderRadius: 8,
              color: 'rgba(242,237,227,.8)',
              fontSize: 11.5,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Ver no site da transportadora ↗
          </a>
        )}
        {pedido.entregaLocal && pedido.situacao !== 'entregue' && (
          <BotaoAcao destaque desabilitado={pendente} aoClicar={entregar}>
            {pendente ? 'Confirmando…' : 'Confirmar entrega em mãos'}
          </BotaoAcao>
        )}
      </footer>
    </GavetaInferior>
  )
}

// ── peças ──────────────────────────────────────────────────────────────────

function Colunas({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))',
        gap: 24,
        alignItems: 'start',
      }}
    >
      {children}
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0 }}>
      <Rotulo>{titulo}</Rotulo>
      {children}
    </section>
  )
}

function Campo({ rotulo, valor, mono }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
        {rotulo}
      </span>
      <span
        className={mono ? 'font-mono' : 'font-sans'}
        style={{
          fontSize: mono ? 11.5 : 12,
          color: 'rgba(242,237,227,.86)',
          overflowWrap: 'anywhere',
        }}
      >
        {valor || '—'}
      </span>
    </div>
  )
}

function Selo({ tom, children }: { tom: Tom; children: React.ReactNode }) {
  return (
    <span
      className="font-sans"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 21,
        padding: '0 9px',
        borderRadius: 999,
        background: FUNDO[tom],
        border: `1px solid ${BORDA[tom]}`,
        color: COR[tom],
        fontSize: 10,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
      {children}
    </p>
  )
}

function BotaoAcao({
  children,
  destaque,
  desabilitado,
  titulo,
  aoClicar,
}: {
  children: React.ReactNode
  destaque?: boolean
  desabilitado?: boolean
  titulo?: string
  aoClicar: () => void
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitado}
      title={titulo}
      className={desabilitado ? undefined : 'hover:brightness-110'}
      style={{
        height: 32,
        padding: '0 13px',
        borderRadius: 8,
        border: destaque ? '1px solid rgba(239,209,140,.45)' : '1px solid rgba(255,255,255,.12)',
        background: destaque ? 'rgba(239,209,140,.12)' : 'transparent',
        color: destaque ? COR.ouro : 'rgba(242,237,227,.8)',
        fontWeight: 600,
        fontSize: 11.5,
        cursor: desabilitado ? 'not-allowed' : 'pointer',
        opacity: desabilitado ? 0.42 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

function rotuloPagamento(p: Pedido['pagamento']): string {
  return { pago: 'Pago', pendente: 'Aguardando pagamento', divergente: 'Divergente', cancelado: 'Cancelado' }[p]
}

/** dd/MM HH:mm no fuso de São Paulo — é como a operação lê data. */
export function dataHora(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}
