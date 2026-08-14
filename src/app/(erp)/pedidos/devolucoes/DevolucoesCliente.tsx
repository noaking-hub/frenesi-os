'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'

import { Modal, PainelInferior } from '@/components/erp/Modal'
import { BORDA, COR, FAIXA, FUNDO, type Tom } from '@/components/erp/tokens'
import {
  PASSOS_DEVOLUCAO,
  acoesDisponiveis,
  brl,
  emAberto,
  etapaDe,
  triarDevolucao,
  volume,
  type EstadoLacre,
  type ItemAferido,
  type StatusSolicitacao,
  type TipoSolicitacao,
  type VarianteMl,
} from '@/domain'

import {
  Bloco,
  BotaoFicha,
  Campo,
  Nota,
  Selo,
} from '../FichaDoPedido'
import {
  Aba,
  BotaoFiltro,
  BotaoIcone,
  Busca,
  CaixaSeletor,
  CardMetrica,
  Caret,
  Dupla,
  Faixa,
  IcCaixaFechada,
  IcCaminhao,
  IcCheque,
  IcExportar,
  IcFrasco,
  IcKebab,
  IcLixeira,
  IcOlho,
  IcRelogio,
  IcXCirculo,
  ItemMenu,
  Menu,
  Pilula,
  delta,
} from '../PedidosCliente'

import { conferirDevolucao, moverSolicitacao } from './actions'
import type { SolicitacaoErp } from '@/data/fixtures'

/**
 * Devoluções — a triagem do que o cliente abriu no portal.
 *
 * Mesmas peças da tela de Todos os pedidos, de propósito: cartões, filas,
 * busca, tabela e ficha ancorada. O que muda é o objeto — aqui a linha é uma
 * SOLICITAÇÃO, não um pedido — e o centro de gravidade: a conferência física
 * do volume, que é o que decide se a devolução é aceita.
 */

const TOM_STATUS: Record<StatusSolicitacao, Tom> = {
  Nova: 'ouro',
  'Em análise': 'info',
  'Aguardando fotos': 'atencao',
  Aprovada: 'ok',
  Recusada: 'erro',
  'Aguardando postagem': 'atencao',
  'Em trânsito reverso': 'info',
  Recebida: 'ouro',
  Concluída: 'ok',
}

type Fila = 'Todas' | 'Novas' | 'Em análise' | 'Aguardando reverso' | 'A conferir' | 'Encerradas'

const FILAS: Fila[] = ['Todas', 'Novas', 'Em análise', 'Aguardando reverso', 'A conferir', 'Encerradas']

const RESOLUCOES = ['Reembolso integral', 'Troca por outro perfume', 'Cupom + 10% de bônus']

const PERIODOS: { rotulo: string; dias: number }[] = [
  { rotulo: 'Últimos 7 dias', dias: 7 },
  { rotulo: 'Últimos 30 dias', dias: 30 },
  { rotulo: 'Últimos 90 dias', dias: 90 },
  { rotulo: 'Todo o histórico', dias: 0 },
]

const TIPOS: ('Todos' | TipoSolicitacao)[] = ['Todos', 'Arrependimento', 'Defeito', 'Erro de envio']

interface Decisao {
  status?: StatusSolicitacao
  resolucao?: string
  reverso?: string
}

export function DevolucoesCliente({
  solicitacoes,
  ligado,
}: {
  solicitacoes: SolicitacaoErp[]
  ligado: boolean
}) {
  const [fila, setFila] = useState<Fila>('Todas')
  const [busca, setBusca] = useState('')
  // Devolução é rara: o padrão é o histórico inteiro, para a tela nunca
  // parecer vazia com uma solicitação de 40 dias atrás ainda em aberto.
  const [dias, setDias] = useState(0)
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]>('Todos')
  const [exportarAberto, setExportarAberto] = useState(false)

  const [aberto, setAberto] = useState<string | null>(null)
  const [menuLinha, setMenuLinha] = useState<string | null>(null)
  const [ancoraMenu, setAncoraMenu] = useState<{ x: number; y: number } | null>(null)
  const [conferindo, setConferindo] = useState<string | null>(null)

  // Espelho local do que já foi gravado, para a ficha não voltar ao estado
  // antigo no intervalo entre a gravação e a revalidação da rota.
  const [decisoes, setDecisoes] = useState<Record<string, Decisao>>({})
  const [recado, setRecado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const statusDe = (d: SolicitacaoErp): StatusSolicitacao => decisoes[d.id]?.status ?? d.status
  const reversoDe = (d: SolicitacaoErp): string => decisoes[d.id]?.reverso ?? d.reverso

  const avisar = (texto: string) => {
    setErro(null)
    setRecado(texto)
  }

  const gravar = (d: SolicitacaoErp, patch: Decisao, recadoOk?: string) => {
    setErro(null)
    setRecado(null)
    // A resolução é escolha de tela — não muda nada no banco até a conclusão.
    if (!patch.status && !patch.reverso) {
      setDecisoes((s) => ({ ...s, [d.id]: { ...s[d.id], ...patch } }))
      return
    }
    if (!ligado) {
      setErro('Sem o Supabase configurado a decisão não seria gravada em lugar nenhum.')
      return
    }
    iniciar(async () => {
      const r = await moverSolicitacao(d.id, patch.status ?? statusDe(d), '', patch.reverso ?? '')
      if (!r.ok) return setErro(r.erro)
      setDecisoes((s) => ({ ...s, [d.id]: { ...s[d.id], ...patch } }))
      if (recadoOk) avisar(recadoOk)
    })
  }

  const conferir = (
    d: SolicitacaoErp,
    itens: { perfume: string; variante: VarianteMl; medidoMl: number; observacao: string }[],
    lacre: EstadoLacre,
  ) => {
    setErro(null)
    setRecado(null)
    if (!ligado) {
      setErro('Sem o Supabase configurado a conferência não seria gravada em lugar nenhum.')
      return
    }
    iniciar(async () => {
      const r = await conferirDevolucao(d.id, itens, lacre)
      if (!r.ok) return setErro(r.erro)
      setDecisoes((s) => ({ ...s, [d.id]: { ...s[d.id], status: 'Recebida' } }))
      setConferindo(null)
      avisar(`Conferência de ${d.id} registrada — a triagem na ficha decide o desfecho.`)
    })
  }

  // ── recortes ─────────────────────────────────────────────────────────────

  const PREDICADO: Record<Fila, (d: SolicitacaoErp) => boolean> = {
    Todas: () => true,
    Novas: (d) => statusDe(d) === 'Nova',
    'Em análise': (d) => statusDe(d) === 'Em análise' || statusDe(d) === 'Aguardando fotos',
    'Aguardando reverso': (d) =>
      statusDe(d) === 'Aprovada' ||
      statusDe(d) === 'Aguardando postagem' ||
      statusDe(d) === 'Em trânsito reverso',
    'A conferir': (d) => statusDe(d) === 'Recebida',
    Encerradas: (d) => !emAberto(statusDe(d)),
  }

  const { doPeriodo, doAnterior } = useMemo(() => {
    if (dias <= 0) return { doPeriodo: solicitacoes, doAnterior: [] as SolicitacaoErp[] }
    const agora = Date.now()
    const inicio = agora - dias * 86_400_000
    const inicioAnterior = inicio - dias * 86_400_000
    const doPeriodo: SolicitacaoErp[] = []
    const doAnterior: SolicitacaoErp[] = []
    for (const d of solicitacoes) {
      const t = Date.parse(d.abertaEmIso)
      if (!Number.isFinite(t)) continue
      if (t >= inicio) doPeriodo.push(d)
      else if (t >= inicioAnterior) doAnterior.push(d)
    }
    return { doPeriodo, doAnterior }
  }, [solicitacoes, dias])

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return doPeriodo.filter((d) => {
      if (!PREDICADO[fila](d)) return false
      if (tipo !== 'Todos' && d.tipo !== tipo) return false
      if (!termo) return true
      return [d.id, d.pedidoId, d.cliente, d.destino, d.motivo, d.email, reversoDe(d)]
        .join(' ')
        .toLowerCase()
        .includes(termo)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doPeriodo, fila, tipo, busca, decisoes])

  const contarFila = (f: Fila) => doPeriodo.filter(PREDICADO[f]).length
  const abertaAgora = aberto ? (solicitacoes.find((d) => d.id === aberto) ?? null) : null
  const emConferencia = conferindo ? (solicitacoes.find((d) => d.id === conferindo) ?? null) : null

  const filtroSujo = fila !== 'Todas' || tipo !== 'Todos' || busca.trim() !== '' || dias !== 0
  const limpar = () => {
    setFila('Todas')
    setTipo('Todos')
    setBusca('')
    setDias(0)
  }

  // ── cartões ──────────────────────────────────────────────────────────────

  const metricas = useMemo(() => {
    const comparavel = doAnterior.length > 0
    const nNovas = contarFila('Novas')
    const nAnalise = contarFila('Em análise')
    const nReverso = contarFila('Aguardando reverso')
    const nConferir = contarFila('A conferir')
    const nConcluidas = doPeriodo.filter((d) => statusDe(d) === 'Concluída').length
    const valorAberto = doPeriodo
      .filter((d) => emAberto(statusDe(d)))
      .reduce((s, d) => s + d.valor, 0)
    return [
      {
        label: 'Devoluções no período',
        valor: String(doPeriodo.length),
        hint: delta(doPeriodo.length, doAnterior.length, comparavel),
        tom: 'ouro' as Tom,
        icone: <IcCaixaFechada />,
      },
      {
        label: 'Novas',
        valor: String(nNovas),
        hint: 'abertas no portal, sem análise',
        tom: 'ouro' as Tom,
        corNumero: nNovas ? COR.ouro : undefined,
        icone: <IcRelogio />,
        fila: 'Novas' as Fila,
      },
      {
        label: 'Em análise',
        valor: String(nAnalise),
        hint: 'aguardando decisão da operação',
        tom: 'info' as Tom,
        icone: <IcOlho />,
        fila: 'Em análise' as Fila,
      },
      {
        label: 'Aguardando reverso',
        valor: String(nReverso),
        hint: 'aprovada, etiqueta ou trânsito de volta',
        tom: 'atencao' as Tom,
        icone: <IcCaminhao />,
        fila: 'Aguardando reverso' as Fila,
      },
      {
        label: 'A conferir',
        valor: String(nConferir),
        hint: 'pacote recebido, volume por medir',
        tom: 'ouro' as Tom,
        corNumero: nConferir ? COR.ouro : undefined,
        icone: <IcFrasco />,
        fila: 'A conferir' as Fila,
      },
      {
        label: 'Concluídas',
        valor: String(nConcluidas),
        hint: 'resolvidas com o cliente',
        tom: 'ok' as Tom,
        corNumero: nConcluidas ? COR.ok : undefined,
        icone: <IcCheque />,
        fila: 'Encerradas' as Fila,
      },
      {
        label: 'Valor em devolução',
        valor: brl(valorAberto),
        hint: 'em aberto, ainda não resolvido',
        tom: 'erro' as Tom,
        corNumero: valorAberto > 0 ? COR.erro : undefined,
        icone: <IcXCirculo />,
      },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doPeriodo, doAnterior, decisoes])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))',
          gap: 10,
        }}
      >
        {metricas.map((m) => (
          <CardMetrica
            key={m.label}
            label={m.label}
            valor={m.valor}
            hint={m.hint}
            tom={m.tom}
            corNumero={m.corNumero}
            icone={m.icone}
            ativo={m.fila ? fila === m.fila : false}
            aoClicar={m.fila ? () => setFila(fila === m.fila ? 'Todas' : (m.fila as Fila)) : undefined}
          />
        ))}
      </div>

      {erro && <Faixa tom="erro" texto={erro} aoFechar={() => setErro(null)} />}
      {recado && <Faixa tom="ok" texto={recado} aoFechar={() => setRecado(null)} />}

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {FILAS.map((f) => (
          <Aba key={f} ativo={f === fila} contagem={contarFila(f)} aoClicar={() => setFila(f)}>
            {f}
          </Aba>
        ))}
      </div>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          padding: '10px 12px',
          border: '1px solid var(--color-borda)',
          borderRadius: 'var(--radius-card)',
          background: 'var(--color-mesa)',
        }}
      >
        <Busca valor={busca} aoMudar={setBusca} />
        <CaixaSeletor rotulo="Período" valor={String(dias)} aoMudar={(v) => setDias(Number(v))}>
          {PERIODOS.map((p) => (
            <option key={p.dias} value={p.dias}>
              {p.rotulo}
            </option>
          ))}
        </CaixaSeletor>
        <CaixaSeletor rotulo="Tipo" valor={tipo} aoMudar={(v) => setTipo(v as (typeof TIPOS)[number])}>
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </CaixaSeletor>

        <span style={{ flex: 1 }} />

        <a
          href="/devolucoes"
          target="_blank"
          rel="noreferrer"
          className="font-sans hover:border-ouro/40"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            height: 38,
            padding: '0 13px',
            border: '1px solid rgba(255,255,255,.11)',
            borderRadius: 9,
            color: 'rgba(242,237,227,.78)',
            fontWeight: 600,
            fontSize: 11.5,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Abrir portal do cliente
        </a>
        <BotaoFiltro desabilitado={!filtroSujo} aoClicar={limpar}>
          <IcLixeira /> Limpar filtros
        </BotaoFiltro>
        <span style={{ position: 'relative' }}>
          <BotaoFiltro destaque aoClicar={() => setExportarAberto((v) => !v)}>
            <IcExportar /> Exportar
            <span aria-hidden style={{ width: 1, height: 16, background: 'rgba(239,209,140,.35)' }} />
            <Caret />
          </BotaoFiltro>
          {exportarAberto && (
            <Menu direita aoFechar={() => setExportarAberto(false)}>
              <ItemMenu
                aoClicar={() => {
                  baixarCsv(filtradas, statusDe, reversoDe)
                  setExportarAberto(false)
                }}
              >
                Lista filtrada ({filtradas.length})
              </ItemMenu>
              <ItemMenu
                aoClicar={() => {
                  baixarCsv(solicitacoes, statusDe, reversoDe)
                  setExportarAberto(false)
                }}
              >
                Todas as devoluções ({solicitacoes.length})
              </ItemMenu>
            </Menu>
          )}
        </span>
      </div>

      <TabelaDevolucoes
        itens={filtradas}
        aberto={aberto}
        menuLinha={menuLinha}
        ancoraMenu={ancoraMenu}
        setMenuLinha={setMenuLinha}
        setAncoraMenu={setAncoraMenu}
        statusDe={statusDe}
        reversoDe={reversoDe}
        aoAbrir={setAberto}
        aoAvisar={avisar}
        aoErro={setErro}
        vazio={
          filtroSujo
            ? 'Nenhuma devolução encontrada com estes filtros.'
            : 'Nenhuma devolução aberta ainda. Quando um cliente abrir uma solicitação no portal, ela aparece aqui na hora.'
        }
      />

      {abertaAgora && (
        <FichaDevolucao
          solicitacao={abertaAgora}
          status={statusDe(abertaAgora)}
          reverso={reversoDe(abertaAgora)}
          resolucao={decisoes[abertaAgora.id]?.resolucao ?? RESOLUCOES[0]}
          pendente={pendente}
          aoGravar={(patch, recadoOk) => gravar(abertaAgora, patch, recadoOk)}
          aoConferir={() => setConferindo(abertaAgora.id)}
          aoFechar={() => setAberto(null)}
          aoAvisar={avisar}
          aoErro={setErro}
        />
      )}

      {emConferencia && (
        <ModalConferencia
          solicitacao={emConferencia}
          pendente={pendente}
          aoConfirmar={(itens, lacre) => conferir(emConferencia, itens, lacre)}
          aoFechar={() => setConferindo(null)}
        />
      )}
    </div>
  )
}

// ── tabela ─────────────────────────────────────────────────────────────────

const GRADE =
  '128px 84px minmax(150px,1fr) 118px minmax(190px,1.2fr) 92px 148px 138px 120px 60px'

const COLUNAS = [
  'Protocolo',
  'Pedido',
  'Cliente',
  'Tipo',
  'Motivo declarado',
  'Valor',
  'Prazo',
  'Status',
  'Reverso',
  'Ações',
]

function TabelaDevolucoes({
  itens,
  aberto,
  menuLinha,
  ancoraMenu,
  setMenuLinha,
  setAncoraMenu,
  statusDe,
  reversoDe,
  aoAbrir,
  aoAvisar,
  aoErro,
  vazio,
}: {
  itens: SolicitacaoErp[]
  aberto: string | null
  menuLinha: string | null
  ancoraMenu: { x: number; y: number } | null
  setMenuLinha: (id: string | null) => void
  setAncoraMenu: (a: { x: number; y: number } | null) => void
  statusDe: (d: SolicitacaoErp) => StatusSolicitacao
  reversoDe: (d: SolicitacaoErp) => string
  aoAbrir: (id: string) => void
  aoAvisar: (texto: string) => void
  aoErro: (texto: string) => void
  vazio: string
}) {
  const copiar = async (texto: string, rotulo: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      aoAvisar(`${rotulo} copiado.`)
    } catch {
      aoErro('O navegador não liberou a área de transferência.')
    }
  }

  return (
    <section
      style={{
        background: 'var(--color-mesa)',
        border: '1px solid var(--color-borda)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
      }}
    >
      <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 330px)', minHeight: 220 }}>
        <div style={{ minWidth: 1240 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: GRADE,
              gap: 10,
              alignItems: 'center',
              padding: '9px 14px',
              background: '#161617',
              borderBottom: '1px solid var(--color-borda)',
              position: 'sticky',
              top: 0,
              zIndex: 2,
            }}
          >
            {COLUNAS.map((t) => (
              <span
                key={t}
                className="font-sans"
                style={{
                  fontWeight: 600,
                  fontSize: 8.5,
                  lineHeight: 1.2,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: 'var(--color-terciario)',
                }}
              >
                {t}
              </span>
            ))}
          </div>

          {itens.length === 0 && (
            <p
              className="font-sans"
              style={{
                padding: '46px 20px',
                textAlign: 'center',
                fontSize: 12,
                color: 'var(--color-terciario)',
                textWrap: 'pretty',
              }}
            >
              {vazio}
            </p>
          )}

          {itens.map((d) => {
            const status = statusDe(d)
            const reverso = reversoDe(d)
            const emFoco = aberto === d.id
            return (
              <div
                key={d.id}
                data-linha={d.id}
                tabIndex={0}
                onClick={() => aoAbrir(d.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target === e.currentTarget) aoAbrir(d.id)
                }}
                className="hover:bg-[rgba(239,209,140,.04)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-ouro/50"
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRADE,
                  gap: 10,
                  alignItems: 'center',
                  padding: '6px 14px',
                  borderTop: '1px solid var(--color-borda-sutil)',
                  borderLeft: `2px solid ${emFoco ? COR.ouro : 'transparent'}`,
                  background: emFoco ? 'rgba(239,209,140,.08)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <Dupla
                  principal={
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: COR.ouro,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      {d.id}
                      {emFoco && (
                        <span aria-hidden style={{ fontSize: 9, color: COR.ouro }}>
                          ★
                        </span>
                      )}
                    </span>
                  }
                  secundaria={`aberta ${d.abertura}`}
                />

                <span className="font-mono" style={{ fontSize: 10.5, color: 'rgba(242,237,227,.8)' }}>
                  {d.pedidoId}
                </span>

                <Dupla principal={d.cliente} secundaria={d.destino || '—'} />

                <span className="font-sans" style={{ fontSize: 11, color: 'rgba(242,237,227,.75)' }}>
                  {d.tipo}
                </span>

                <Dupla principal={d.motivo} secundaria={d.comentario} />

                <span className="font-mono" style={{ fontSize: 11, color: 'rgba(242,237,227,.85)' }}>
                  {brl(d.valor)}
                </span>

                <span
                  className="font-sans"
                  style={{
                    fontSize: 10.5,
                    lineHeight: 1.35,
                    color: d.prazoOk ? COR.ok : COR.atencao,
                  }}
                >
                  {d.prazo}
                </span>

                <Pilula tom={TOM_STATUS[status]}>{status}</Pilula>

                {reverso ? (
                  <span className="font-mono" style={{ fontSize: 10.5, color: 'rgba(242,237,227,.8)', overflowWrap: 'anywhere' }}>
                    {reverso}
                  </span>
                ) : (
                  <span className="font-mono" style={{ fontSize: 10.5, color: 'rgba(242,237,227,.35)' }}>
                    Não gerado
                  </span>
                )}

                <span
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <BotaoIcone rotulo={`Abrir ${d.id}`} aoClicar={() => aoAbrir(d.id)}>
                    <IcOlho />
                  </BotaoIcone>
                  <BotaoIcone
                    rotulo={`Ações de ${d.id}`}
                    menuAberto={menuLinha === d.id}
                    aoClicar={(e) => {
                      const r = e.currentTarget.getBoundingClientRect()
                      setAncoraMenu({ x: r.right, y: r.bottom })
                      setMenuLinha(menuLinha === d.id ? null : d.id)
                    }}
                  >
                    <IcKebab />
                  </BotaoIcone>
                  {menuLinha === d.id && ancoraMenu && (
                    <Menu fixo={ancoraMenu} aoFechar={() => setMenuLinha(null)}>
                      <ItemMenu
                        aoClicar={() => {
                          aoAbrir(d.id)
                          setMenuLinha(null)
                        }}
                      >
                        Abrir ficha
                      </ItemMenu>
                      <ItemMenu
                        aoClicar={() => {
                          copiar(d.id, 'Protocolo')
                          setMenuLinha(null)
                        }}
                      >
                        Copiar protocolo
                      </ItemMenu>
                      {reverso && (
                        <ItemMenu
                          aoClicar={() => {
                            copiar(reverso, 'Código reverso')
                            setMenuLinha(null)
                          }}
                        >
                          Copiar reverso
                        </ItemMenu>
                      )}
                    </Menu>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── ficha ──────────────────────────────────────────────────────────────────

function FichaDevolucao({
  solicitacao: d,
  status,
  reverso,
  resolucao,
  pendente,
  aoGravar,
  aoConferir,
  aoFechar,
  aoAvisar,
  aoErro,
}: {
  solicitacao: SolicitacaoErp
  status: StatusSolicitacao
  reverso: string
  resolucao: string
  pendente: boolean
  aoGravar: (patch: Decisao, recadoOk?: string) => void
  aoConferir: () => void
  aoFechar: () => void
  aoAvisar: (texto: string) => void
  aoErro: (texto: string) => void
}) {
  const triagem = triarDevolucao(d.itens, d.tipo, d.lacre)
  const acoes = acoesDisponiveis(status, Boolean(reverso))
  const etapa = etapaDe(status)
  const artigo = d.gateway === 'Frenet' ? 'na' : 'no'
  const tomTriagem: Tom =
    d.itens.length === 0 ? 'neutro' : triagem.severidade === 'erro' ? 'erro' : triagem.severidade === 'atencao' ? 'atencao' : 'ok'

  const copiar = async (texto: string, rotulo: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      aoAvisar(`${rotulo} copiado.`)
    } catch {
      aoErro('O navegador não liberou a área de transferência.')
    }
  }

  return (
    <PainelInferior titulo={`Devolução ${d.id}`} altura="52vh" aoFechar={aoFechar}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 13,
          padding: '13px 26px',
          borderBottom: '1px solid var(--color-borda-sutil)',
          flex: 'none',
        }}
      >
        <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
          Devolução
        </span>
        <span
          className="font-mono"
          style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ouro)', letterSpacing: '.02em' }}
        >
          {d.id}
        </span>
        <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
          {`pedido ${d.pedidoId}`}
        </span>
        <Selo tom={TOM_STATUS[status]}>{status}</Selo>
        <span style={{ flex: 1 }} />
        <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ouro)' }}>
          {brl(d.valor)}
        </span>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar ficha"
          className="hover:border-ouro/40"
          style={{
            width: 28,
            height: 28,
            border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 999,
            background: 'transparent',
            color: 'var(--color-terciario)',
            cursor: 'pointer',
            lineHeight: 1,
            fontSize: 11,
          }}
        >
          ✕
        </button>
      </header>

      {/* A régua do fluxo: solicitação → análise → reverso → recebimento →
          resolução. A recusa pinta a etapa corrente de erro em vez de fingir
          progresso. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${PASSOS_DEVOLUCAO.length},1fr)`,
          gap: 10,
          padding: '10px 26px',
          borderBottom: '1px solid var(--color-borda-sutil)',
          flex: 'none',
        }}
      >
        {PASSOS_DEVOLUCAO.map((p, i) => {
          const tom: Tom = i < etapa ? 'ok' : i === etapa ? (status === 'Recusada' ? 'erro' : 'ouro') : 'neutro'
          return (
            <span key={p} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span
                style={{
                  height: 3,
                  borderRadius: 2,
                  display: 'block',
                  background:
                    i < etapa
                      ? 'rgba(127,192,149,.5)'
                      : i === etapa
                        ? status === 'Recusada'
                          ? 'rgba(194,90,80,.5)'
                          : 'rgba(239,209,140,.5)'
                        : 'rgba(255,255,255,.08)',
                }}
              />
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    flex: 'none',
                    background: i <= etapa ? COR[tom] : 'rgba(255,255,255,.12)',
                  }}
                />
                <span
                  className="font-sans"
                  style={{
                    fontWeight: 600,
                    fontSize: 10,
                    lineHeight: 1.3,
                    color: i <= etapa ? 'var(--color-corrente)' : 'rgba(242,237,227,.35)',
                  }}
                >
                  {p}
                </span>
              </span>
            </span>
          )
        })}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 26px 20px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(178px, 1fr))',
            gap: '16px 20px',
            alignItems: 'start',
          }}
        >
          <Bloco titulo="Solicitação">
            <Campo rotulo="Protocolo" valor={d.id} mono ouro />
            <Campo rotulo="Pedido" valor={d.pedidoId} mono />
            <Campo rotulo="Aberta" valor={`${d.abertura} · portal do cliente`} />
            <Campo rotulo="Tipo" valor={d.tipo} />
            <Campo rotulo="Prazo" valor={d.prazo} cor={d.prazoOk ? COR.ok : COR.atencao} />
          </Bloco>

          <Bloco titulo="Cliente">
            <span
              className="font-sans"
              style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-corrente)' }}
            >
              {d.cliente || '—'}
            </span>
            <Campo rotulo="Identificação no portal" valor={d.identificacao} />
            <Campo rotulo="Telefone" valor={d.telefone} />
            <Campo rotulo="E-mail" valor={d.email} />
            <Campo rotulo="Cidade / UF" valor={d.destino} />
          </Bloco>

          <Bloco titulo="Motivo declarado" largo>
            <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span
                className="font-sans"
                style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.35, color: 'var(--color-corrente)' }}
              >
                {d.motivo}
              </span>
              {d.comentario && (
                <p
                  className="font-sans"
                  style={{
                    margin: 0,
                    padding: '10px 13px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,.028)',
                    borderLeft: '2px solid rgba(239,209,140,.35)',
                    fontSize: 11.5,
                    lineHeight: 1.55,
                    color: 'rgba(242,237,227,.78)',
                  }}
                >
                  {d.comentario}
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
                  {`Itens marcados no portal (${(d.itensSolicitados ?? []).length})`}
                </span>
                {(d.itensSolicitados ?? []).length === 0 ? (
                  <Nota>O portal não registrou a lista de itens desta solicitação.</Nota>
                ) : (
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(d.itensSolicitados ?? []).map((i) => (
                      <span
                        key={i}
                        className="font-sans"
                        style={{
                          padding: '4px 9px',
                          borderRadius: 999,
                          border: '1px solid rgba(255,255,255,.12)',
                          background: 'rgba(255,255,255,.03)',
                          fontSize: 10.5,
                          color: 'rgba(242,237,227,.8)',
                        }}
                      >
                        {i}
                      </span>
                    ))}
                  </span>
                )}
                {/* Booleans, não arquivos: o portal confirma que a foto foi
                    tirada, mas ainda não recebe upload — fingir galeria aqui
                    seria mentir. */}
                <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)', marginTop: 4 }}>
                  Fotos confirmadas pelo cliente
                </span>
                {d.fotos.length === 0 ? (
                  <Nota>Nenhuma foto confirmada — peça mais fotos antes de decidir.</Nota>
                ) : (
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {d.fotos.map((f) => (
                      <span
                        key={f}
                        className="font-sans"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 9px',
                          borderRadius: 999,
                          border: `1px solid ${BORDA.ok}`,
                          background: FUNDO.ok,
                          fontSize: 10.5,
                          color: COR.ok,
                        }}
                      >
                        ✓ {f}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </div>
          </Bloco>

          <Bloco titulo="Logística reversa" largo>
            <Campo rotulo="Plataforma da etiqueta de ida" valor={`${d.gateway} · ${d.etiquetaIda || '—'}`} mono />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
                Código reverso
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                <span
                  className="font-mono"
                  style={{
                    fontSize: 11.5,
                    fontWeight: reverso ? 700 : 400,
                    color: reverso ? COR.ouro : 'rgba(242,237,227,.45)',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {reverso || 'Não gerado'}
                </span>
                {reverso && (
                  <button
                    type="button"
                    onClick={() => copiar(reverso, 'Código reverso')}
                    aria-label="Copiar código reverso"
                    className="hover:text-ouro"
                    style={{
                      border: 0,
                      background: 'transparent',
                      color: 'var(--color-terciario)',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: 10.5,
                    }}
                  >
                    copiar
                  </button>
                )}
              </span>
            </div>
            {/* Honestidade: o sistema NÃO envia e-mail nenhum por enquanto —
                regra do cliente até o ERP rodar 100%. A ficha diz isso em vez
                de alegar "instruções enviadas". */}
            <Campo rotulo="Aviso ao cliente" valor="Desligado até o sistema rodar 100%" />
            <Campo rotulo="Contato" valor={d.telefone} mono />
          </Bloco>

          <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 11,
                padding: '14px 16px',
                borderRadius: 13,
                background: tomTriagem === 'neutro' ? 'rgba(255,255,255,.025)' : FAIXA[tomTriagem],
                border: `1px solid ${tomTriagem === 'neutro' ? 'var(--color-borda)' : BORDA[tomTriagem]}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    flex: 'none',
                    transform: 'rotate(45deg)',
                    background: COR[tomTriagem],
                  }}
                />
                <span
                  className="font-sans"
                  style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.35, color: tomTriagem === 'neutro' ? 'var(--color-corrente)' : COR[tomTriagem] }}
                >
                  {d.itens.length === 0 ? 'Conferência pendente — o volume medido decide' : triagem.titulo}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-secundario)' }}>
                    Lacre:{' '}
                    <span
                      style={{
                        fontWeight: 600,
                        color: d.lacre === 'intacto' ? COR.ok : d.lacre === 'violado' ? COR.erro : COR.atencao,
                      }}
                    >
                      {d.lacre === 'intacto' ? 'intacto' : d.lacre === 'violado' ? 'violado' : 'rompido no transporte'}
                    </span>
                  </span>
                  {/* Critério interno: existe aqui, nunca no portal do cliente. */}
                  <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-secundario)' }}>
                    Tolerância: 10% abaixo do fracionado
                  </span>
                </span>
              </div>

              {d.itens.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    background: 'rgba(255,255,255,.06)',
                    borderRadius: 10,
                    overflow: 'hidden',
                  }}
                >
                  {d.itens.map((item) => (
                    <LinhaAferida key={`${item.perfume}-${item.variante}`} item={item} />
                  ))}
                </div>
              )}

              <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--color-secundario)' }}>
                {d.itens.length === 0
                  ? 'O pacote ainda não foi conferido. Quando ele chegar, registre o volume medido de cada item — é a medição que sustenta aprovar, trocar ou recusar.'
                  : triagem.mensagem}
              </span>
            </div>
          </div>
        </div>
      </div>

      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          flexWrap: 'wrap',
          padding: '12px 26px',
          borderTop: '1px solid var(--color-borda-sutil)',
          background: 'rgba(0,0,0,.22)',
          flex: 'none',
        }}
      >
        {acoes.emAnalise &&
          (triagem.bloqueado ? (
            <BotaoRecusa
              destaque
              desabilitado={pendente}
              aoClicar={() => aoGravar({ status: 'Recusada' }, `${d.id} recusada — produto fora da política.`)}
            >
              Recusar · produto utilizado
            </BotaoRecusa>
          ) : (
            <BotaoFicha
              primario
              desabilitado={pendente}
              aoClicar={() => aoGravar({ status: 'Aprovada' }, `${d.id} aprovada — gere o reverso ${artigo} ${d.gateway}.`)}
            >
              {pendente ? 'Gravando…' : 'Aprovar devolução'}
            </BotaoFicha>
          ))}
        {acoes.emAnalise && (
          <BotaoFicha
            desabilitado={pendente || status === 'Aguardando fotos'}
            aoClicar={() => aoGravar({ status: 'Aguardando fotos' }, `${d.id} marcada como aguardando fotos.`)}
          >
            Pedir mais fotos
          </BotaoFicha>
        )}
        {acoes.emAnalise && !triagem.bloqueado && (
          <BotaoRecusa
            desabilitado={pendente}
            aoClicar={() => aoGravar({ status: 'Recusada' }, `${d.id} recusada.`)}
          >
            Recusar
          </BotaoRecusa>
        )}

        {acoes.podeGerarReverso && (
          <BotaoFicha
            primario
            desabilitado={pendente}
            aoClicar={() =>
              // O reverso deriva da etiqueta de ida — mesma plataforma, mesmo
              // radical — até a emissão automática entrar no escopo.
              aoGravar(
                { reverso: `RV${d.etiquetaIda.slice(-7)}`, status: 'Aguardando postagem' },
                `Reverso gerado ${artigo} ${d.gateway} para ${d.id}. Informe o cliente pelo canal de atendimento.`,
              )
            }
          >
            {pendente ? 'Gravando…' : `Gerar reverso ${artigo} ${d.gateway}`}
          </BotaoFicha>
        )}

        {acoes.podeReceber && (
          <BotaoFicha primario desabilitado={pendente} aoClicar={aoConferir}>
            Registrar recebimento e conferir
          </BotaoFicha>
        )}

        {acoes.podeConcluir && (
          <>
            <BotaoFicha
              primario
              desabilitado={pendente}
              aoClicar={() =>
                aoGravar({ status: 'Concluída' }, `${d.id} concluída com ${resolucao.toLowerCase()}.`)
              }
            >
              {pendente ? 'Gravando…' : `Concluir com ${resolucao.toLowerCase()}`}
            </BotaoFicha>
            <CaixaSeletor rotulo="Resolução" valor={resolucao} aoMudar={(v) => aoGravar({ resolucao: v })}>
              {RESOLUCOES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </CaixaSeletor>
          </>
        )}

        {acoes.encerrada && (
          <Nota>
            {status === 'Concluída'
              ? 'Devolução encerrada. A resolução acordada com o cliente está registrada acima.'
              : 'Devolução recusada. Nada mais a fazer aqui — o pedido segue o fluxo normal.'}
          </Nota>
        )}

        <span style={{ flex: 1 }} />
        <BotaoFicha aoClicar={() => copiar(d.id, 'Protocolo')}>Copiar protocolo</BotaoFicha>
      </footer>
    </PainelInferior>
  )
}

/** O botão destrutivo do rodapé — vermelho onde o BotaoFicha seria ouro. */
function BotaoRecusa({
  children,
  destaque,
  desabilitado,
  aoClicar,
}: {
  children: ReactNode
  /** Preenchido: quando a recusa é a ação recomendada pela triagem. */
  destaque?: boolean
  desabilitado?: boolean
  aoClicar: () => void
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitado}
      className={desabilitado ? 'font-sans' : 'font-sans hover:brightness-110'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        height: 33,
        padding: '0 14px',
        borderRadius: 9,
        border: destaque ? '1px solid rgba(194,90,80,.6)' : '1px solid rgba(194,90,80,.32)',
        background: destaque ? 'var(--color-erro)' : 'transparent',
        color: destaque ? '#FFF6F4' : 'var(--color-erro-claro)',
        fontWeight: destaque ? 700 : 600,
        fontSize: 11.5,
        cursor: desabilitado ? 'not-allowed' : 'pointer',
        opacity: desabilitado ? 0.4 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

// ── conferência ────────────────────────────────────────────────────────────

/**
 * O modal da bancada: o pacote chegou, mede-se o volume de cada item.
 *
 * Substitui os `window.prompt` — a medição é o número que decide a devolução
 * inteira, e merecia mais que uma caixa de texto do navegador.
 */
function ModalConferencia({
  solicitacao: d,
  pendente,
  aoConfirmar,
  aoFechar,
}: {
  solicitacao: SolicitacaoErp
  pendente: boolean
  aoConfirmar: (
    itens: { perfume: string; variante: VarianteMl; medidoMl: number; observacao: string }[],
    lacre: EstadoLacre,
  ) => void
  aoFechar: () => void
}) {
  const itens = d.itensSolicitados ?? []
  const [medidos, setMedidos] = useState<string[]>(() => itens.map(() => ''))
  const [obs, setObs] = useState<string[]>(() => itens.map(() => ''))
  const [lacre, setLacre] = useState<EstadoLacre>('intacto')
  const [aviso, setAviso] = useState<string | null>(null)

  const varianteDe = (item: string): VarianteMl =>
    Number(item.match(/(\d+)\s*ml/i)?.[1] ?? 0) as VarianteMl

  const confirmar = () => {
    if (itens.length === 0) {
      setAviso('Esta devolução não tem itens registrados — confira o cadastro antes de receber.')
      return
    }
    const lidos: { perfume: string; variante: VarianteMl; medidoMl: number; observacao: string }[] = []
    for (let i = 0; i < itens.length; i++) {
      const medidoMl = Number(medidos[i].replace(',', '.'))
      if (medidos[i].trim() === '' || !Number.isFinite(medidoMl) || medidoMl < 0) {
        setAviso(`Informe o volume medido de "${itens[i]}" em ml.`)
        return
      }
      lidos.push({
        perfume: itens[i].split(' · ')[0],
        variante: varianteDe(itens[i]),
        medidoMl,
        observacao: obs[i].trim(),
      })
    }
    setAviso(null)
    aoConfirmar(lidos, lacre)
  }

  return (
    <Modal titulo={`Conferência de ${d.id}`} largura={560} padding={0} aoFechar={aoFechar}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '15px 20px',
          borderBottom: '1px solid var(--color-borda-sutil)',
        }}
      >
        <span className="font-sans" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-corrente)' }}>
          Conferência do pacote
        </span>
        <span className="font-mono" style={{ fontSize: 11.5, fontWeight: 700, color: COR.ouro }}>
          {d.id}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar"
          className="hover:border-ouro/40"
          style={{
            width: 26,
            height: 26,
            border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 999,
            background: 'transparent',
            color: 'var(--color-terciario)',
            cursor: 'pointer',
            fontSize: 10.5,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 20px' }}>
        <Nota>
          Meça o volume que restou em cada frasco. É a medição — não a declaração do cliente — que
          decide se a devolução é aceita.
        </Nota>

        {itens.length === 0 && (
          <Nota>Esta devolução não tem itens registrados — confira o cadastro antes de receber.</Nota>
        )}

        {itens.map((item, i) => (
          <div
            key={item}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) 96px',
              gap: '6px 12px',
              alignItems: 'center',
              padding: '11px 13px',
              borderRadius: 10,
              border: '1px solid var(--color-borda)',
              background: 'rgba(255,255,255,.02)',
            }}
          >
            <span className="font-sans" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-corrente)' }}>
              {item}
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                value={medidos[i]}
                onChange={(e) => setMedidos((s) => s.map((v, j) => (j === i ? e.target.value : v)))}
                inputMode="decimal"
                placeholder={String(varianteDe(item) || '')}
                className="font-mono focus:border-ouro/50"
                style={{
                  width: 58,
                  height: 30,
                  padding: '0 8px',
                  border: '1px solid rgba(255,255,255,.14)',
                  borderRadius: 7,
                  background: 'rgba(255,255,255,.04)',
                  color: 'var(--color-corrente)',
                  fontSize: 12,
                  outline: 0,
                  textAlign: 'right',
                }}
              />
              <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
                ml
              </span>
            </label>
            <input
              value={obs[i]}
              onChange={(e) => setObs((s) => s.map((v, j) => (j === i ? e.target.value : v)))}
              placeholder="Observação (opcional) — frasco trincado, lacre rompido…"
              className="font-sans focus:border-ouro/50"
              style={{
                gridColumn: '1 / -1',
                height: 28,
                padding: '0 9px',
                border: '1px solid rgba(255,255,255,.09)',
                borderRadius: 7,
                background: 'transparent',
                color: 'rgba(242,237,227,.8)',
                fontSize: 11,
                outline: 0,
              }}
            />
          </div>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <CaixaSeletor rotulo="Lacre / recrave" valor={lacre} aoMudar={(v) => setLacre(v as EstadoLacre)}>
            <option value="intacto">Intacto</option>
            <option value="rompido-no-transporte">Rompido no transporte</option>
            <option value="violado">Violado</option>
          </CaixaSeletor>
          <Nota>O estado do lacre entra na triagem junto com o volume.</Nota>
        </div>

        {aviso && (
          <span className="font-sans" style={{ fontSize: 11.5, color: COR.erro }}>
            {aviso}
          </span>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 9,
          padding: '12px 20px',
          borderTop: '1px solid var(--color-borda-sutil)',
          background: 'rgba(0,0,0,.22)',
        }}
      >
        <BotaoFicha aoClicar={aoFechar}>Cancelar</BotaoFicha>
        <BotaoFicha primario desabilitado={pendente || itens.length === 0} aoClicar={confirmar}>
          {pendente ? 'Gravando…' : 'Registrar conferência'}
        </BotaoFicha>
      </div>
    </Modal>
  )
}

// ── aferição ───────────────────────────────────────────────────────────────

/**
 * Uma linha de aferição: silhueta do frasco com o nível medido, barra de
 * proporção e veredito. O frasco de 15 ml é visivelmente maior que o de 8 ml,
 * e o tracejado marca até onde o volume fracionado deveria chegar.
 */
function LinhaAferida({ item }: { item: ItemAferido }) {
  const tom: Tom = item.dentroDaTolerancia ? 'ok' : 'erro'
  const corpoW = item.frasco === 8 ? 17 : 25
  const corpoH = item.frasco === 8 ? 30 : 46
  const gargaloW = item.frasco === 8 ? 7 : 9
  const gargaloH = item.frasco === 8 ? 5 : 7
  // Quanto do frasco o volume fracionado ocupa quando cheio.
  const ocupa = Math.round((item.variante / item.frasco) * 100)

  return (
    <span
      style={{
        display: 'grid',
        gridTemplateColumns: '38px minmax(0,1fr) 150px',
        gap: 14,
        alignItems: 'end',
        padding: '12px 13px',
        background: '#121114',
      }}
    >
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          height: 74,
          justifyContent: 'flex-end',
        }}
      >
        <span
          aria-hidden
          style={{
            width: gargaloW,
            height: gargaloH,
            border: '1px solid rgba(255,255,255,.14)',
            borderBottom: 0,
            borderRadius: '2px 2px 0 0',
            background: 'rgba(255,255,255,.05)',
            display: 'block',
          }}
        />
        <span
          aria-hidden
          style={{
            width: corpoW,
            height: corpoH,
            borderRadius: '2px 2px 3px 3px',
            border: '1px solid rgba(255,255,255,.14)',
            background: 'rgba(255,255,255,.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              height: `${ocupa}%`,
              borderTop: '1px dashed rgba(239,209,140,.5)',
              background: 'rgba(239,209,140,.1)',
            }}
          >
            <span
              style={{
                display: 'block',
                height: `${Math.min(100, item.pct)}%`,
                background: COR[tom],
                opacity: 0.5,
              }}
            />
          </span>
        </span>
        <span
          className="font-mono"
          style={{ fontWeight: 500, fontSize: 8, letterSpacing: '.04em', color: 'var(--color-terciario)' }}
        >
          {`${item.frasco} ml`}
        </span>
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
          <span
            className="font-sans"
            style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.25, color: 'var(--color-corrente)' }}
          >
            {item.perfume}
          </span>
          <span
            className="font-sans"
            style={{
              fontSize: 10,
              lineHeight: 1.25,
              letterSpacing: '.05em',
              textTransform: 'uppercase',
              color: 'rgba(239,209,140,.6)',
            }}
          >
            {`${item.variante} ml fracionado · frasco ${item.frasco} ml`}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              flex: 1,
              minWidth: 80,
              height: 5,
              borderRadius: 3,
              background: 'rgba(255,255,255,.08)',
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                display: 'block',
                height: '100%',
                width: `${Math.min(100, item.pct)}%`,
                background: COR[tom],
              }}
            />
          </span>
          <span
            className="font-sans"
            style={{ fontSize: 10, lineHeight: 1.25, color: 'var(--color-terciario)', whiteSpace: 'nowrap' }}
          >
            {`mínimo ${volume(item.minimoMl)}`}
          </span>
        </span>
        {item.observacao && (
          <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.3, color: 'var(--color-terciario)' }}>
            {item.observacao}
          </span>
        )}
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        <span className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: COR[tom] }}>
          {volume(item.medidoMl)}
        </span>
        <span
          className="font-sans"
          style={{ fontWeight: 500, fontSize: 9.5, lineHeight: 1.3, color: COR[tom], textAlign: 'right' }}
        >
          {item.dentroDaTolerancia
            ? 'Dentro da tolerância'
            : `Abaixo do mínimo · falta ${volume(item.faltaMl)}`}
        </span>
      </span>
    </span>
  )
}

// ── exportação ─────────────────────────────────────────────────────────────

function baixarCsv(
  itens: SolicitacaoErp[],
  statusDe: (d: SolicitacaoErp) => StatusSolicitacao,
  reversoDe: (d: SolicitacaoErp) => string,
) {
  const cabecalho = [
    'Protocolo',
    'Pedido',
    'Cliente',
    'Cidade/UF',
    'Tipo',
    'Motivo',
    'Valor',
    'Status',
    'Aberta em',
    'Reverso',
    'Lacre',
  ]
  const escapa = (s: string) => `"${s.replace(/"/g, '""')}"`
  const linhas = itens.map((d) =>
    [
      d.id,
      d.pedidoId,
      d.cliente,
      d.destino,
      d.tipo,
      d.motivo,
      d.valor.toFixed(2).replace('.', ','),
      statusDe(d),
      d.abertura,
      reversoDe(d),
      d.lacre,
    ]
      .map((c) => escapa(String(c)))
      .join(';'),
  )
  const csv = '﻿' + [cabecalho.join(';'), ...linhas].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `devolucoes-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
