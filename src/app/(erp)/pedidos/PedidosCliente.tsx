'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'

import { COR, FUNDO, BORDA, type Tom } from '@/components/erp/tokens'
import {
  ROTULO_LOGISTICO,
  ROTULO_SITUACAO,
  brl,
  ehOcorrencia,
  paradoDemais,
  slaDeExpedicao,
  type EstadoSla,
  type Pedido,
  type SituacaoLogistica,
  type SituacaoPedido,
  type Sla,
  type StatusDevolucao,
  type StatusLogistico,
} from '@/domain'

import { atualizarRastreamento, confirmarEntregaEmMaos } from './actions'
import { FichaDoPedido, dataHora } from './FichaDoPedido'

/**
 * O módulo de Pedidos como painel de expedição.
 *
 * A regra que organiza a tela inteira está no escopo: ao abrir, o operador
 * precisa identificar em segundos o que exige ação. Daí as três camadas —
 * cartões que FILTRAM ao clique, filas com contador, e uma linha que já traz
 * transportadora, código e prazo sem exigir que o pedido seja aberto.
 *
 * As três dimensões de status coexistem, e é de propósito: um pedido pode
 * estar Pago no financeiro, Enviado na operação e em Tentativa de entrega na
 * logística ao mesmo tempo. Reduzir isso a uma coluna só perderia justamente
 * o pedido que precisa de atenção.
 */

const TOM_SITUACAO: Record<SituacaoPedido, Tom> = {
  pago: 'info',
  em_producao: 'ouro',
  faturado: 'ouro',
  enviado: 'info',
  entregue: 'ok',
  cancelado: 'neutro',
}

const TOM_LOGISTICO: Record<StatusLogistico, Tom> = {
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

const TOM_SLA: Record<EstadoSla, Tom> = {
  hoje: 'atencao',
  amanha: 'ouro',
  'em-atraso': 'erro',
  entregue: 'ok',
  'sem-previsao': 'neutro',
  'em-dia': 'neutro',
}

const TOM_PAGAMENTO: Record<Pedido['pagamento'], Tom> = {
  pago: 'ok',
  pendente: 'atencao',
  divergente: 'erro',
  cancelado: 'neutro',
}

const ROTULO_PAGAMENTO: Record<Pedido['pagamento'], string> = {
  pago: 'Pago',
  pendente: 'Aguardando',
  divergente: 'Divergente',
  cancelado: 'Cancelado',
}

export interface Linha {
  pedido: Pedido
  devolucao: StatusDevolucao
  logistica: SituacaoLogistica
}

/** Um pedido com tudo que a tela precisa dele já calculado. */
interface Viva {
  p: Pedido
  sla: Sla
  log: SituacaoLogistica
  devolucao: StatusDevolucao
  /** Exige conferência: valor, status ou integração fora do lugar. */
  divergencia: string | null
}

type Fila =
  | 'Todos'
  | 'Aguardando envio'
  | 'Em trânsito'
  | 'Saiu para entrega'
  | 'Entregues'
  | 'Com ocorrência'
  | 'Devoluções'

const FILAS: Fila[] = [
  'Todos',
  'Aguardando envio',
  'Em trânsito',
  'Saiu para entrega',
  'Entregues',
  'Com ocorrência',
  'Devoluções',
]

const PREDICADO: Record<Fila, (v: Viva) => boolean> = {
  Todos: () => true,
  'Aguardando envio': (v) => v.p.situacao === 'pago' || v.p.situacao === 'faturado' || v.p.situacao === 'em_producao',
  'Em trânsito': (v) => v.log.status === 'em-transito' || v.log.status === 'postado',
  'Saiu para entrega': (v) => v.log.status === 'saiu-para-entrega',
  Entregues: (v) => v.p.situacao === 'entregue' || v.log.status === 'entregue',
  'Com ocorrência': (v) => ehOcorrencia(v.log.status) || paradoDemais(v.log),
  Devoluções: (v) => v.log.status === 'devolucao',
}

/** Janelas do filtro de período, em dias. `0` = tudo. */
const PERIODOS: { rotulo: string; dias: number }[] = [
  { rotulo: 'Últimos 7 dias', dias: 7 },
  { rotulo: 'Últimos 30 dias', dias: 30 },
  { rotulo: 'Últimos 90 dias', dias: 90 },
  { rotulo: 'Todo o histórico', dias: 0 },
]

export function PedidosCliente({ itens }: { itens: Linha[] }) {
  const [fila, setFila] = useState<Fila>('Todos')
  const [busca, setBusca] = useState('')
  const [dias, setDias] = useState(30)
  const [canal, setCanal] = useState('Todos')
  const [transportadora, setTransportadora] = useState('Todas')
  const [situacao, setSituacao] = useState<'Todas' | SituacaoPedido>('Todas')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [aberto, setAberto] = useState<string | null>(null)
  const [recado, setRecado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const vivas = useMemo<Viva[]>(
    () =>
      itens.map((i) => ({
        p: i.pedido,
        sla: slaDeExpedicao(i.pedido),
        log: i.logistica,
        devolucao: i.devolucao,
        divergencia: divergenciaDe(i.pedido, i.logistica),
      })),
    [itens],
  )

  // O período recorta ANTES de tudo: cartão, aba e tabela precisam falar da
  // mesma janela, senão o número do cartão nunca bate com o que a lista mostra.
  const { doPeriodo, doAnterior } = useMemo(() => janelas(vivas, dias), [vivas, dias])

  const canais = useMemo(
    () => ['Todos', ...Array.from(new Set(vivas.map((v) => v.p.canal))).sort()],
    [vivas],
  )
  const transportadoras = useMemo(
    () => [
      'Todas',
      ...Array.from(new Set(vivas.map((v) => v.p.transportadora).filter(Boolean) as string[])).sort(),
      'Entrega local',
    ],
    [vivas],
  )

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return doPeriodo.filter((v) => {
      if (!PREDICADO[fila](v)) return false
      if (canal !== 'Todos' && v.p.canal !== canal) return false
      if (situacao !== 'Todas' && v.p.situacao !== situacao) return false
      if (transportadora === 'Entrega local' && !v.p.entregaLocal) return false
      if (transportadora !== 'Todas' && transportadora !== 'Entrega local' && v.p.transportadora !== transportadora) {
        return false
      }
      if (!termo) return true
      // Busca global: o escopo pede que ninguém precise saber em qual campo o
      // dado está guardado.
      return [
        v.p.id,
        v.p.cliente,
        v.p.email,
        v.p.cpf,
        v.p.telefone,
        v.p.destino,
        v.p.rastreio ?? '',
        v.p.transportadora ?? '',
        v.p.itens.map((i) => i.perfume).join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(termo)
    })
  }, [doPeriodo, fila, canal, situacao, transportadora, busca])

  const contarFila = (f: Fila) => doPeriodo.filter(PREDICADO[f]).length
  const metricas = useMemo(() => calcularMetricas(doPeriodo, doAnterior), [doPeriodo, doAnterior])

  const filtroSujo =
    fila !== 'Todos' ||
    canal !== 'Todos' ||
    transportadora !== 'Todas' ||
    situacao !== 'Todas' ||
    busca.trim() !== ''

  const limpar = () => {
    setFila('Todos')
    setCanal('Todos')
    setTransportadora('Todas')
    setSituacao('Todas')
    setBusca('')
  }

  const alternar = (id: string) =>
    setSelecionados((s) => {
      const novo = new Set(s)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })

  const todosVisiveisMarcados = filtrados.length > 0 && filtrados.every((v) => selecionados.has(v.p.id))
  const marcarTodos = () =>
    setSelecionados(todosVisiveisMarcados ? new Set() : new Set(filtrados.map((v) => v.p.id)))

  const abertoAgora = aberto ? vivas.find((v) => v.p.id === aberto) ?? null : null

  const releituraEmMassa = () => {
    setErro(null)
    setRecado(null)
    const ids = [...selecionados]
    iniciar(async () => {
      const r = await atualizarRastreamento(ids)
      if (!r.ok) return setErro(r.erro)
      setRecado(
        `${r.consultados} código(s) consultado(s) · ${r.eventos} ocorrência(s) nova(s).` +
          (r.aviso ? ` ${r.aviso}` : ''),
      )
    })
  }

  const entregarEmMassa = () => {
    setErro(null)
    setRecado(null)
    const alvos = filtrados.filter((v) => selecionados.has(v.p.id) && v.p.entregaLocal && v.p.situacao !== 'entregue')
    if (alvos.length === 0) {
      return setErro('Nenhum pedido de entrega local pendente entre os selecionados.')
    }
    iniciar(async () => {
      let ok = 0
      let ml = 0
      const falhas: string[] = []
      for (const v of alvos) {
        const r = await confirmarEntregaEmMaos(v.p.id)
        if (r.ok) {
          ok++
          ml += r.mlConsumido
        } else falhas.push(v.p.id)
      }
      setSelecionados(new Set())
      // Feedback individual do que não passou — o escopo exige, e é o que
      // impede alguém de achar que os 12 foram quando 3 falharam.
      setRecado(
        `${ok} entrega(s) confirmada(s) · ${ml.toFixed(1).replace('.', ',')} ml baixados.` +
          (falhas.length ? ` Recusados: ${falhas.join(', ')}.` : ''),
      )
    })
  }

  const exportar = () => {
    const alvos = selecionados.size ? filtrados.filter((v) => selecionados.has(v.p.id)) : filtrados
    baixarCsv(alvos)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          display: 'grid',
          // Sete cartões numa faixa só em 1440 px e acima, que é onde a
          // operação trabalha; abaixo disso eles quebram sem esmagar o número.
          gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))',
          gap: 9,
        }}
      >
        {metricas.map((m) => (
          <CardMetrica
            key={m.label}
            {...m}
            ativo={m.fila ? fila === m.fila : false}
            aoClicar={m.fila ? () => setFila((f) => (f === m.fila ? 'Todos' : (m.fila as Fila))) : undefined}
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
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          flexWrap: 'wrap',
          padding: '11px 13px',
          border: '1px solid var(--color-borda)',
          borderRadius: 'var(--radius-card)',
          background: 'var(--color-mesa)',
        }}
      >
        <Busca valor={busca} aoMudar={setBusca} />
        <Seletor rotulo="Período" valor={String(dias)} aoMudar={(v) => setDias(Number(v))}>
          {PERIODOS.map((p) => (
            <option key={p.dias} value={p.dias}>
              {p.rotulo}
            </option>
          ))}
        </Seletor>
        <Seletor rotulo="Situação" valor={situacao} aoMudar={(v) => setSituacao(v as typeof situacao)}>
          <option value="Todas">Todas</option>
          {(Object.keys(ROTULO_SITUACAO) as SituacaoPedido[]).map((s) => (
            <option key={s} value={s}>
              {ROTULO_SITUACAO[s]}
            </option>
          ))}
        </Seletor>
        <Seletor rotulo="Canal" valor={canal} aoMudar={setCanal}>
          {canais.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Seletor>
        <Seletor rotulo="Transportadora" valor={transportadora} aoMudar={setTransportadora}>
          {transportadoras.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Seletor>
        <span style={{ flex: 1 }} />
        {filtroSujo && (
          <Botao aoClicar={limpar}>Limpar filtros</Botao>
        )}
        <Botao destaque aoClicar={exportar}>
          Exportar{' '}
          {selecionados.size
            ? `${selecionados.size} selecionado${selecionados.size > 1 ? 's' : ''}`
            : String(filtrados.length)}
        </Botao>
      </div>

      {selecionados.size > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            flexWrap: 'wrap',
            padding: '10px 13px',
            border: '1px solid rgba(239,209,140,.28)',
            borderRadius: 'var(--radius-card)',
            background: 'rgba(239,209,140,.05)',
          }}
        >
          <span className="font-sans" style={{ fontSize: 11.5, fontWeight: 600, color: COR.ouro }}>
            {selecionados.size} selecionado{selecionados.size > 1 ? 's' : ''}
          </span>
          <Botao aoClicar={() => setSelecionados(new Set())}>Limpar seleção</Botao>
          <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,.12)' }} />
          <Botao desabilitado={pendente} aoClicar={releituraEmMassa}>
            {pendente ? 'Consultando…' : 'Atualizar rastreamento'}
          </Botao>
          <Botao desabilitado={pendente} aoClicar={entregarEmMassa}>
            Confirmar entrega em mãos
          </Botao>
          <Botao
            desabilitado
            titulo="Os avisos ao cliente estão desligados até o sistema rodar 100%."
            aoClicar={() => {}}
          >
            Enviar rastreio ao cliente
          </Botao>
        </div>
      )}

      <TabelaPedidos
        itens={filtrados}
        selecionados={selecionados}
        todosMarcados={todosVisiveisMarcados}
        aoMarcarTodos={marcarTodos}
        aoMarcar={alternar}
        aoAbrir={(id) => setAberto(id)}
        vazio={
          filtroSujo
            ? 'Nenhum pedido encontrado com estes filtros.'
            : 'Nenhum pedido nesta janela de período.'
        }
      />

      {abertoAgora && (
        <FichaDoPedido
          pedido={abertoAgora.p}
          sla={abertoAgora.sla}
          logistica={abertoAgora.log}
          devolucao={abertoAgora.devolucao}
          aoFechar={() => setAberto(null)}
          aoRecado={setRecado}
          aoErro={setErro}
        />
      )}
    </div>
  )
}

// ── tabela ─────────────────────────────────────────────────────────────────

/**
 * Tabela própria, e não a compartilhada do ERP.
 *
 * Duas coisas desta tela não existem em nenhuma outra: a coluna de seleção e a
 * de ações. Ambas põem um botão DENTRO da linha — e a tabela compartilhada
 * transforma a linha inteira num `<button>` quando ela é clicável. Botão dentro
 * de botão é HTML inválido: o navegador desmonta a estrutura e o clique passa
 * a cair no lugar errado.
 */
const GRADE =
  '26px 148px minmax(136px,1fr) 76px 72px 90px 96px 104px minmax(198px,1.15fr) 116px 34px'

/** Um título por coluna depois da caixa de seleção — a última fica sem. */
const COLUNAS = [
  'Pedido',
  'Cliente',
  'Data',
  'Canal',
  'Valor',
  'Pagamento',
  'Status',
  'Envio',
  'Prazo / SLA',
  '',
]

function TabelaPedidos({
  itens,
  selecionados,
  todosMarcados,
  aoMarcarTodos,
  aoMarcar,
  aoAbrir,
  vazio,
}: {
  itens: Viva[]
  selecionados: Set<string>
  todosMarcados: boolean
  aoMarcarTodos: () => void
  aoMarcar: (id: string) => void
  aoAbrir: (id: string) => void
  vazio: string
}) {
  return (
    <section
      style={{
        background: 'var(--color-mesa)',
        border: '1px solid var(--color-borda)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 1240 }}>
          <div
            role="row"
            style={{
              display: 'grid',
              gridTemplateColumns: GRADE,
              gap: 10,
              alignItems: 'center',
              padding: '10px 16px',
              background: 'var(--color-cabecalho)',
              borderBottom: '1px solid var(--color-borda)',
              // O cabeçalho acompanha a rolagem: em 300 linhas, saber que a
              // quarta coluna é "valor" não pode exigir voltar ao topo.
              position: 'sticky',
              top: 0,
              zIndex: 2,
            }}
          >
            <Caixa marcada={todosMarcados} aoMarcar={aoMarcarTodos} rotulo="Selecionar todos" />
            {COLUNAS.map((t, i) => (
              <Cabecalho key={t || `c${i}`} alinharDireita={t === 'Valor'}>
                {t}
              </Cabecalho>
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
              }}
            >
              {vazio}
            </p>
          )}

          {itens.map((v) => {
            const marcado = selecionados.has(v.p.id)
            const atencao =
              v.sla.estado === 'em-atraso' || ehOcorrencia(v.log.status) || Boolean(v.divergencia)
            return (
              <div
                key={v.p.id}
                role="row"
                className="hover:bg-[rgba(239,209,140,.035)]"
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRADE,
                  gap: 10,
                  alignItems: 'center',
                  padding: '10px 16px',
                  borderTop: '1px solid var(--color-borda-sutil)',
                  borderLeft: `2px solid ${atencao ? COR.erro : 'transparent'}`,
                  background: marcado ? 'rgba(239,209,140,.06)' : 'transparent',
                }}
              >
                <Caixa marcada={marcado} aoMarcar={() => aoMarcar(v.p.id)} rotulo={`Selecionar ${v.p.id}`} />

                <Dupla
                  principal={
                    <span className="font-mono" style={{ fontSize: 11.5, fontWeight: 600 }}>
                      {v.p.id}
                    </span>
                  }
                  secundaria={v.divergencia ?? (v.p.entregaLocal ? 'Entrega local' : '')}
                  tomSecundaria={v.divergencia ? 'erro' : 'neutro'}
                />

                <Dupla principal={v.p.cliente} secundaria={v.p.destino || '—'} />

                <span className="font-sans" style={{ fontSize: 11, color: 'rgba(242,237,227,.72)' }}>
                  {v.p.data}
                </span>
                <span className="font-sans" style={{ fontSize: 11, color: 'rgba(242,237,227,.72)' }}>
                  {v.p.canal}
                </span>
                <span
                  className="font-mono"
                  style={{ fontSize: 11.5, textAlign: 'right', display: 'block' }}
                >
                  {brl(v.p.valor)}
                </span>

                <Pilula tom={TOM_PAGAMENTO[v.p.pagamento]}>{ROTULO_PAGAMENTO[v.p.pagamento]}</Pilula>
                <Pilula tom={TOM_SITUACAO[v.p.situacao]}>{ROTULO_SITUACAO[v.p.situacao]}</Pilula>

                {/* Envio traz as quatro coisas que o escopo pede na linha:
                    transportadora, status logístico, código e quando foi a
                    última leitura. */}
                <Dupla
                  principal={`${transportadoraDe(v.p)} — ${ROTULO_LOGISTICO[v.log.status]}`}
                  tomPrincipal={TOM_LOGISTICO[v.log.status]}
                  secundaria={rodapeDoEnvio(v)}
                />

                <Dupla
                  principal={<span style={{ color: COR[TOM_SLA[v.sla.estado]] }}>{v.sla.rotulo}</span>}
                  secundaria={
                    paradoDemais(v.log) ? `Parado há ${v.log.horasSemAtualizacao} h` : ''
                  }
                  tomSecundaria="atencao"
                />

                <button
                  type="button"
                  onClick={() => aoAbrir(v.p.id)}
                  aria-label={`Abrir ${v.p.id}`}
                  title="Abrir ficha do pedido"
                  className="hover:border-ouro/45"
                  style={{
                    width: 30,
                    height: 28,
                    border: '1px solid rgba(255,255,255,.1)',
                    borderRadius: 7,
                    background: 'transparent',
                    color: 'rgba(242,237,227,.7)',
                    cursor: 'pointer',
                    fontSize: 12,
                    lineHeight: 1,
                  }}
                >
                  ↗
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <footer
        style={{
          padding: '9px 16px',
          borderTop: '1px solid var(--color-borda-sutil)',
          background: 'var(--color-cabecalho)',
        }}
      >
        <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
          {itens.length} pedido{itens.length === 1 ? '' : 's'} na lista
        </span>
      </footer>
    </section>
  )
}

// ── peças ──────────────────────────────────────────────────────────────────

interface Metrica {
  label: string
  valor: string
  hint: string
  tom: Tom
  icone: ReactNode
  fila?: Fila
}

function CardMetrica({
  label,
  valor,
  hint,
  tom,
  icone,
  ativo,
  aoClicar,
}: Metrica & { ativo: boolean; aoClicar?: () => void }) {
  const conteudo = (
    <>
      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span
          className="font-sans"
          style={{
            flex: 1,
            fontWeight: 600,
            fontSize: 9,
            letterSpacing: '.11em',
            textTransform: 'uppercase',
            color: 'var(--color-terciario)',
            lineHeight: 1.3,
          }}
        >
          {label}
        </span>
        <span style={{ color: COR[tom], opacity: 0.75, flex: 'none' }}>{icone}</span>
      </span>
      <span
        className="font-mono"
        style={{ fontWeight: 500, fontSize: 22, lineHeight: 1, color: COR[tom] }}
      >
        {valor}
      </span>
      <span
        className="font-sans"
        style={{ fontSize: 9.5, lineHeight: 1.35, color: 'var(--color-terciario)', textWrap: 'pretty' }}
      >
        {hint}
      </span>
    </>
  )

  const estilo = {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    padding: '13px 14px',
    minWidth: 0,
    textAlign: 'left' as const,
    border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'var(--color-borda)'}`,
    borderRadius: 'var(--radius-card)',
    background: ativo ? 'rgba(239,209,140,.06)' : 'var(--color-mesa)',
  }

  if (!aoClicar) return <div style={estilo}>{conteudo}</div>
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={ativo}
      className="hover:border-ouro/40"
      style={{ ...estilo, cursor: 'pointer' }}
    >
      {conteudo}
    </button>
  )
}

function Aba({
  children,
  ativo,
  contagem,
  aoClicar,
}: {
  children: ReactNode
  ativo: boolean
  contagem: number
  aoClicar: () => void
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className="font-sans hover:border-ouro/40"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        height: 31,
        padding: '0 13px',
        border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.09)'}`,
        background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
        color: ativo ? COR.ouro : 'rgba(242,237,227,.6)',
        fontWeight: 600,
        fontSize: 11,
        borderRadius: 'var(--radius-pill)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
      <span className="font-mono" style={{ fontSize: 10, opacity: 0.6 }}>
        {contagem}
      </span>
    </button>
  )
}

function Busca({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  return (
    <label
      className="focus-within:border-ouro/45"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flex: '1 1 280px',
        minWidth: 220,
        height: 33,
        padding: '0 12px',
        border: '1px solid rgba(255,255,255,.09)',
        background: 'rgba(255,255,255,.03)',
        borderRadius: 8,
      }}
    >
      <span aria-hidden style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
        ⌕
      </span>
      <input
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder="Pedido, cliente, CPF, telefone, rastreio, produto, cidade"
        className="font-sans"
        style={{
          flex: 1,
          minWidth: 0,
          border: 0,
          outline: 0,
          background: 'transparent',
          color: 'var(--color-corrente)',
          fontSize: 12,
          lineHeight: 1,
        }}
      />
    </label>
  )
}

function Seletor({
  rotulo,
  valor,
  aoMudar,
  children,
}: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  children: ReactNode
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span
        className="font-sans"
        style={{
          fontSize: 8.5,
          letterSpacing: '.11em',
          textTransform: 'uppercase',
          color: 'var(--color-terciario)',
        }}
      >
        {rotulo}
      </span>
      <select
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="font-sans hover:border-ouro/35"
        style={{
          height: 28,
          padding: '0 8px',
          border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 7,
          background: 'rgba(255,255,255,.03)',
          color: 'var(--color-corrente)',
          fontSize: 11.5,
          cursor: 'pointer',
        }}
      >
        {children}
      </select>
    </label>
  )
}

function Botao({
  children,
  destaque,
  desabilitado,
  titulo,
  aoClicar,
}: {
  children: ReactNode
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
      className={desabilitado ? undefined : 'font-sans hover:brightness-110'}
      style={{
        height: 30,
        padding: '0 12px',
        borderRadius: 8,
        border: destaque ? '1px solid rgba(239,209,140,.42)' : '1px solid rgba(255,255,255,.11)',
        background: destaque ? 'rgba(239,209,140,.1)' : 'transparent',
        color: destaque ? COR.ouro : 'rgba(242,237,227,.78)',
        fontWeight: 600,
        fontSize: 11,
        cursor: desabilitado ? 'not-allowed' : 'pointer',
        opacity: desabilitado ? 0.42 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

function Caixa({
  marcada,
  aoMarcar,
  rotulo,
}: {
  marcada: boolean
  aoMarcar: () => void
  rotulo: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={marcada}
      aria-label={rotulo}
      onClick={aoMarcar}
      className="hover:border-ouro/50"
      style={{
        width: 16,
        height: 16,
        display: 'grid',
        placeItems: 'center',
        border: `1px solid ${marcada ? 'rgba(239,209,140,.6)' : 'rgba(255,255,255,.2)'}`,
        borderRadius: 4,
        background: marcada ? 'rgba(239,209,140,.16)' : 'transparent',
        color: COR.ouro,
        fontSize: 10,
        lineHeight: 1,
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {marcada ? '✓' : ''}
    </button>
  )
}

function Cabecalho({ children, alinharDireita }: { children: ReactNode; alinharDireita?: boolean }) {
  return (
    <span
      className="font-sans"
      style={{
        fontWeight: 600,
        fontSize: 9,
        lineHeight: 1,
        letterSpacing: '.12em',
        textTransform: 'uppercase',
        color: 'var(--color-terciario)',
        textAlign: alinharDireita ? 'right' : 'left',
      }}
    >
      {children}
    </span>
  )
}

function Pilula({ tom, children }: { tom: Tom; children: ReactNode }) {
  return (
    <span
      className="font-sans"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifySelf: 'start',
        height: 21,
        padding: '0 8px',
        borderRadius: 6,
        background: FUNDO[tom],
        border: `1px solid ${BORDA[tom]}`,
        color: COR[tom],
        fontSize: 10,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {children}
    </span>
  )
}

function Dupla({
  principal,
  secundaria,
  tomPrincipal,
  tomSecundaria,
}: {
  principal: ReactNode
  secundaria?: ReactNode
  tomPrincipal?: Tom
  tomSecundaria?: Tom
}) {
  const corte = {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    display: 'block',
  }
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span
        className="font-sans"
        style={{
          ...corte,
          fontWeight: 600,
          fontSize: 11.5,
          lineHeight: 1.3,
          color: tomPrincipal ? COR[tomPrincipal] : 'var(--color-corrente)',
        }}
      >
        {principal}
      </span>
      {secundaria ? (
        <span
          className="font-sans"
          style={{
            ...corte,
            fontSize: 10,
            lineHeight: 1.3,
            color: tomSecundaria && tomSecundaria !== 'neutro' ? COR[tomSecundaria] : 'var(--color-terciario)',
          }}
        >
          {secundaria}
        </span>
      ) : null}
    </span>
  )
}

function Faixa({ tom, texto, aoFechar }: { tom: Tom; texto: string; aoFechar: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 13px',
        border: `1px solid ${BORDA[tom]}`,
        borderRadius: 'var(--radius-card)',
        background: FUNDO[tom],
      }}
    >
      <span
        className="font-sans"
        style={{ flex: 1, fontSize: 11.5, lineHeight: 1.5, color: COR[tom], textWrap: 'pretty' }}
      >
        {texto}
      </span>
      <button
        type="button"
        onClick={aoFechar}
        aria-label="Fechar aviso"
        style={{
          border: 0,
          background: 'transparent',
          color: COR[tom],
          cursor: 'pointer',
          fontSize: 11,
          lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  )
}

// ── regras da tela ─────────────────────────────────────────────────────────

/**
 * O que exige conferência humana.
 *
 * Nenhuma destas é opinião: cada uma é uma contradição entre duas fontes que
 * deveriam concordar. Divergência silenciosa é a pior espécie — o pedido
 * parece normal na lista e só aparece quando o cliente cobra.
 */
/**
 * O nome curto da transportadora para a coluna Envio.
 *
 * "Transportadora não identificada" é honesto mas não cabe: com o status ao
 * lado, o texto é cortado justamente onde estava a informação nova.
 */
function transportadoraDe(p: Pedido): string {
  if (p.entregaLocal) return 'Entrega local'
  return p.transportadora ?? 'Não identificada'
}

/** Código e horário da última leitura — sem travessão sobrando quando não há. */
function rodapeDoEnvio(v: Viva): string {
  if (!v.p.rastreio) return v.p.entregaLocal ? 'Motoboy · sem código' : 'Sem código'
  const quando = v.log.desde ? dataHora(v.log.desde) : null
  return quando && quando !== '—' ? `${v.p.rastreio} · ${quando}` : v.p.rastreio
}

function divergenciaDe(p: Pedido, log: SituacaoLogistica): string | null {
  if (p.pagamento === 'divergente') return 'Valor recebido divergente'
  if (p.situacao === 'enviado' && !p.rastreio && !p.entregaLocal) return 'Enviado sem código de rastreio'
  if (log.status === 'entregue' && p.situacao !== 'entregue') return 'Transportadora entregou, ERP não baixou'
  if (p.situacao === 'entregue' && !p.entregueEm) return 'Entregue sem data de entrega'
  return null
}

function janelas(vivas: Viva[], dias: number): { doPeriodo: Viva[]; doAnterior: Viva[] } {
  if (dias <= 0) return { doPeriodo: vivas, doAnterior: [] }
  const agora = Date.now()
  const inicio = agora - dias * 86_400_000
  const inicioAnterior = inicio - dias * 86_400_000
  const doPeriodo: Viva[] = []
  const doAnterior: Viva[] = []
  for (const v of vivas) {
    const t = Date.parse(v.p.compradoEm)
    if (!Number.isFinite(t)) continue
    if (t >= inicio) doPeriodo.push(v)
    else if (t >= inicioAnterior) doAnterior.push(v)
  }
  return { doPeriodo, doAnterior }
}

/**
 * A variação contra a janela anterior de MESMO tamanho.
 *
 * Sem período de comparação — "todo o histórico" — não há variação a mostrar, e
 * o cartão diz o que o número é em vez de inventar uma seta.
 */
function delta(agora: number, antes: number, comparavel: boolean): string {
  if (!comparavel) return 'no período selecionado'
  if (antes === 0) return agora === 0 ? 'sem movimento no período' : 'sem base de comparação'
  const pct = Math.round(((agora - antes) / antes) * 100)
  const sinal = pct > 0 ? '+' : ''
  return `${sinal}${pct}% vs período anterior`
}

function calcularMetricas(atual: Viva[], anterior: Viva[]): Metrica[] {
  const comparavel = anterior.length > 0
  const conta = (lista: Viva[], f: (v: Viva) => boolean) => lista.filter(f).length

  const aguardando = (v: Viva) => PREDICADO['Aguardando envio'](v)
  const enviados = (v: Viva) => v.p.situacao === 'enviado'
  const entregues = (v: Viva) => v.p.situacao === 'entregue'
  const cancelados = (v: Viva) => v.p.situacao === 'cancelado' || v.p.pagamento === 'cancelado'
  const atrasados = (v: Viva) => v.sla.estado === 'em-atraso'
  const divergentes = (v: Viva) => Boolean(v.divergencia)

  const foraDoPrazo = conta(atual, (v) => aguardando(v) && atrasados(v))
  const valor = atual.reduce((s, v) => s + v.p.valor, 0)

  return [
    {
      label: 'Pedidos no período',
      valor: String(atual.length),
      hint: `${brl(valor)} · ${delta(atual.length, anterior.length, comparavel)}`,
      tom: 'ouro',
      icone: <IcCaixa />,
    },
    {
      label: 'Aguardando expedição',
      valor: String(conta(atual, aguardando)),
      hint: foraDoPrazo ? `${foraDoPrazo} fora do prazo` : 'todos dentro do prazo',
      tom: conta(atual, aguardando) ? 'ouro' : 'neutro',
      icone: <IcRelogio />,
      fila: 'Aguardando envio',
    },
    {
      label: 'Com divergência',
      valor: String(conta(atual, divergentes)),
      hint: conta(atual, divergentes) ? 'requer conferência' : 'nada a conferir',
      tom: conta(atual, divergentes) ? 'erro' : 'ok',
      icone: <IcAlerta />,
    },
    {
      label: 'Enviados',
      valor: String(conta(atual, enviados)),
      hint: delta(conta(atual, enviados), conta(anterior, enviados), comparavel),
      tom: 'info',
      icone: <IcCaminhao />,
    },
    {
      label: 'Entregues',
      valor: String(conta(atual, entregues)),
      hint: delta(conta(atual, entregues), conta(anterior, entregues), comparavel),
      tom: 'ok',
      icone: <IcCheque />,
      fila: 'Entregues',
    },
    {
      label: 'Com ocorrência',
      valor: String(conta(atual, (v) => PREDICADO['Com ocorrência'](v))),
      hint: 'tentativa, retirada, extravio ou parado',
      tom: conta(atual, (v) => PREDICADO['Com ocorrência'](v)) ? 'atencao' : 'ok',
      icone: <IcExclamacao />,
      fila: 'Com ocorrência',
    },
    {
      label: 'Em atraso',
      valor: String(conta(atual, atrasados)),
      hint: 'prazo de expedição vencido',
      tom: conta(atual, atrasados) ? 'erro' : 'ok',
      icone: <IcRelogioAlerta />,
    },
  ]
}

/**
 * CSV para planilha brasileira: separador ponto e vírgula e BOM.
 *
 * Sem o BOM o Excel em português lê UTF-8 como Latin-1 e todo acento vira
 * caractere quebrado; com vírgula como separador, ele joga a linha inteira
 * numa célula só.
 */
function baixarCsv(itens: Viva[]) {
  const cabecalho = [
    'Pedido',
    'Data',
    'Cliente',
    'CPF',
    'E-mail',
    'Cidade/UF',
    'Canal',
    'Valor',
    'Pagamento',
    'Situacao',
    'Transportadora',
    'Rastreio',
    'Status logistico',
    'Ultima atualizacao',
    'Prazo',
    'Divergencia',
  ]
  const escapa = (s: string) => `"${s.replace(/"/g, '""')}"`
  const linhas = itens.map((v) =>
    [
      v.p.id,
      v.p.data,
      v.p.cliente,
      v.p.cpf,
      v.p.email,
      v.p.destino,
      v.p.canal,
      v.p.valor.toFixed(2).replace('.', ','),
      ROTULO_PAGAMENTO[v.p.pagamento],
      ROTULO_SITUACAO[v.p.situacao],
      v.p.entregaLocal ? 'Entrega local' : (v.p.transportadora ?? ''),
      v.p.rastreio ?? '',
      ROTULO_LOGISTICO[v.log.status],
      v.log.desde ? dataHora(v.log.desde) : '',
      v.sla.rotulo,
      v.divergencia ?? '',
    ]
      .map((c) => escapa(String(c)))
      .join(';'),
  )

  const csv = '﻿' + [cabecalho.join(';'), ...linhas].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── ícones dos cartões ─────────────────────────────────────────────────────

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block' }}
    >
      {children}
    </svg>
  )
}

const IcCaixa = () => (
  <Svg>
    <path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16z" />
    <path d="M3.5 8 12 12.5 20.5 8" />
    <path d="M12 12.5V20.5" />
  </Svg>
)
const IcRelogio = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7v5.2l3.2 1.9" />
  </Svg>
)
const IcAlerta = () => (
  <Svg>
    <path d="M12 4.5 21 19.5H3z" />
    <path d="M12 10v4" />
    <path d="M12 17h.01" />
  </Svg>
)
const IcCaminhao = () => (
  <Svg>
    <path d="M2.5 7.5h10v9h-10z" />
    <path d="M12.5 11h4l3 3v2.5h-7z" />
    <circle cx="6.5" cy="18" r="1.7" />
    <circle cx="16.5" cy="18" r="1.7" />
  </Svg>
)
const IcCheque = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.4 12.2 2.5 2.4 4.7-4.9" />
  </Svg>
)
const IcExclamacao = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.8v4.6" />
    <path d="M12 16h.01" />
  </Svg>
)
const IcRelogioAlerta = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7v5.2l3.2 1.9" />
    <path d="M19.4 4.6 4.6 19.4" />
  </Svg>
)
