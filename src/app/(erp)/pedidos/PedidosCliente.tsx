'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { COR, FUNDO, BORDA, type Tom } from '@/components/erp/tokens'
import {
  PRAZO_EXPEDICAO_DIAS,
  ROTULO_LOGISTICO,
  brl,
  ehOcorrencia,
  paginaDeRastreio,
  paradoDemais,
  servicoLegivel,
  slaDeEntrega,
  slaDeExpedicao,
  statusOperacional,
  type Pedido,
  type SituacaoLogistica,
  type SituacaoPedido,
  type Sla,
  type StatusDevolucao,
} from '@/domain'

import { atualizarRastreamento, confirmarEntregaEmMaos, marcarEmProducao } from './actions'
import {
  FichaDoPedido,
  IcAtualizar,
  IcCheck,
  IcCopiar,
  IcEnviar,
  IcExterno,
  dataHora,
} from './FichaDoPedido'

/**
 * O módulo de Pedidos no desenho do mockup: cartões que medem e filtram,
 * filas com contador, barra de ações em massa sempre à vista, e a linha
 * respondendo transportadora + status + código + prazo sem abrir nada.
 *
 * As três dimensões de status são guardadas separadas (financeiro,
 * operacional, logístico), como o escopo exige. A coluna Status mostra a MAIS
 * INFORMATIVA das três para aquele pedido — regra em `statusOperacional`, no
 * domínio, com testes.
 */

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

/** Um pedido com tudo que a tela precisa já calculado, uma vez. */
interface Viva {
  p: Pedido
  sla: Sla
  log: SituacaoLogistica
  devolucao: StatusDevolucao
  status: ReturnType<typeof statusOperacional>
  divergencia: string | null
}

export type Fila =
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
  // Entrega local fica de fora: não há envio a aguardar — a fila dela é o
  // filtro de transportadora e o próprio badge "Entrega local".
  'Aguardando envio': (v) =>
    !v.p.entregaLocal &&
    (v.p.situacao === 'pago' || v.p.situacao === 'faturado' || v.p.situacao === 'em_producao'),
  'Em trânsito': (v) => v.log.status === 'em-transito' || v.log.status === 'postado',
  'Saiu para entrega': (v) => v.log.status === 'saiu-para-entrega',
  Entregues: (v) => v.p.situacao === 'entregue' || v.log.status === 'entregue',
  'Com ocorrência': (v) => ehOcorrencia(v.log.status) || paradoDemais(v.log),
  Devoluções: (v) => v.log.status === 'devolucao',
}

const PERIODOS: { rotulo: string; dias: number }[] = [
  { rotulo: 'Últimos 7 dias', dias: 7 },
  { rotulo: 'Últimos 30 dias', dias: 30 },
  { rotulo: 'Últimos 90 dias', dias: 90 },
  { rotulo: 'Todo o histórico', dias: 0 },
]

const ROTULO_SITUACAO_FILTRO: Record<SituacaoPedido, string> = {
  pago: 'Pago',
  em_producao: 'Em produção',
  faturado: 'Faturado',
  enviado: 'Enviado',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
}

export function PedidosCliente({ itens, filaInicial }: { itens: Linha[]; filaInicial?: Fila }) {
  const [fila, setFila] = useState<Fila>(filaInicial ?? 'Todos')
  const [busca, setBusca] = useState('')
  const [dias, setDias] = useState(30)
  const [canal, setCanal] = useState('Todos')
  const [transportadora, setTransportadora] = useState('Todas')
  const [situacao, setSituacao] = useState<'Todas' | SituacaoPedido>('Todas')
  // Filtros do popover "Mais filtros" — cada um vem do escopo.
  const [comRastreio, setComRastreio] = useState<'todos' | 'com' | 'sem'>('todos')
  const [soDivergencia, setSoDivergencia] = useState(false)
  const [soEmAtraso, setSoEmAtraso] = useState(false)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [exportarAberto, setExportarAberto] = useState(false)

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [aberto, setAberto] = useState<string | null>(null)
  const [menuLinha, setMenuLinha] = useState<string | null>(null)
  // Canto do gatilho do kebab, em coordenadas de viewport: o menu da linha é
  // `position: fixed` para escapar do overflow da tabela e flutuar sobre a
  // ficha — um absoluto seria cortado nas últimas linhas.
  const [ancoraMenu, setAncoraMenu] = useState<{ x: number; y: number } | null>(null)
  const [recado, setRecado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const vivas = useMemo<Viva[]>(
    () =>
      itens.map((i) => {
        const sla = slaDeExpedicao(i.pedido)
        return {
          p: i.pedido,
          sla,
          log: i.logistica,
          devolucao: i.devolucao,
          status: statusOperacional({
            situacao: i.pedido.situacao,
            slaEmAtraso: sla.estado === 'em-atraso',
            log: i.logistica,
            entregaLocal: i.pedido.entregaLocal,
          }),
          divergencia: divergenciaDe(i.pedido, i.logistica),
        }
      }),
    [itens],
  )

  // O período recorta ANTES de tudo: cartão, aba e tabela falam da mesma
  // janela, senão o número do cartão nunca bate com a lista.
  const { doPeriodo, doAnterior } = useMemo(() => janelas(vivas, dias), [vivas, dias])

  const canais = useMemo(
    () => ['Todos', ...Array.from(new Set(vivas.map((v) => v.p.canal))).sort()],
    [vivas],
  )
  const transportadoras = useMemo(
    () => [
      'Todas',
      ...Array.from(
        new Set(vivas.map((v) => v.p.transportadora).filter(Boolean) as string[]),
      ).sort(),
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
      if (
        transportadora !== 'Todas' &&
        transportadora !== 'Entrega local' &&
        v.p.transportadora !== transportadora
      ) {
        return false
      }
      if (comRastreio === 'com' && !v.p.rastreio) return false
      if (comRastreio === 'sem' && v.p.rastreio) return false
      if (soDivergencia && !v.divergencia) return false
      if (soEmAtraso && !(v.sla.estado === 'em-atraso' && !v.p.entregaLocal)) return false
      if (!termo) return true
      // Busca global: ninguém precisa saber em qual campo o dado mora.
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
  }, [doPeriodo, fila, canal, situacao, transportadora, comRastreio, soDivergencia, soEmAtraso, busca])

  const contarFila = (f: Fila) => doPeriodo.filter(PREDICADO[f]).length
  const metricas = useMemo(() => calcularMetricas(doPeriodo, doAnterior), [doPeriodo, doAnterior])

  const extrasAtivos =
    Number(comRastreio !== 'todos') + Number(soDivergencia) + Number(soEmAtraso)
  const filtroSujo =
    fila !== 'Todos' ||
    canal !== 'Todos' ||
    transportadora !== 'Todas' ||
    situacao !== 'Todas' ||
    extrasAtivos > 0 ||
    busca.trim() !== ''

  const limpar = () => {
    setFila('Todos')
    setCanal('Todos')
    setTransportadora('Todas')
    setSituacao('Todas')
    setComRastreio('todos')
    setSoDivergencia(false)
    setSoEmAtraso(false)
    setBusca('')
  }

  const alternar = (id: string) =>
    setSelecionados((s) => {
      const novo = new Set(s)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })

  const todosMarcados = filtrados.length > 0 && filtrados.every((v) => selecionados.has(v.p.id))
  const marcarTodos = () =>
    setSelecionados(todosMarcados ? new Set() : new Set(filtrados.map((v) => v.p.id)))

  const abertoAgora = aberto ? (vivas.find((v) => v.p.id === aberto) ?? null) : null
  // As ações em massa agem sobre a INTERSEÇÃO seleção ∩ lista visível: um
  // pedido marcado e depois escondido pelo filtro não pode ser atingido por
  // um botão que o operador não está vendo.
  const selecionadosVivos = filtrados.filter((v) => selecionados.has(v.p.id))
  const nSelecionados = selecionadosVivos.length

  // ── ações em massa ───────────────────────────────────────────────────────

  const avisar = (texto: string) => {
    setErro(null)
    setRecado(texto)
  }

  const releituraEmMassa = () => {
    setErro(null)
    setRecado(null)
    const ids = selecionadosVivos.map((v) => v.p.id)
    iniciar(async () => {
      const r = await atualizarRastreamento(ids)
      if (!r.ok) return setErro(r.erro)
      avisar(
        `${r.consultados} código(s) consultado(s) · ${r.eventos} ocorrência(s) nova(s).` +
          (r.aviso ? ` ${r.aviso}` : ''),
      )
    })
  }

  const producaoEmMassa = () => {
    setErro(null)
    setRecado(null)
    const ids = selecionadosVivos.map((v) => v.p.id)
    iniciar(async () => {
      const r = await marcarEmProducao(ids)
      if (!r.ok) return setErro(r.erro)
      setSelecionados(new Set())
      avisar(
        `${r.marcados} pedido(s) em produção.` +
          (r.recusados.length
            ? ` De fora: ${r.recusados
                .slice(0, 3)
                .map((x) => `${x.pedido} (${x.motivo})`)
                .join('; ')}${r.recusados.length > 3 ? ` e mais ${r.recusados.length - 3}` : ''}.`
            : ''),
      )
    })
  }

  const entregarEmMassa = () => {
    setErro(null)
    setRecado(null)
    const alvos = selecionadosVivos.filter((v) => v.p.entregaLocal && v.p.situacao !== 'entregue')
    if (alvos.length === 0) {
      return setErro('Nenhum pedido de entrega local pendente entre os selecionados.')
    }
    iniciar(async () => {
      let ok = 0
      let ml = 0
      let naLoja = 0
      const falhas: string[] = []
      for (const v of alvos) {
        const r = await confirmarEntregaEmMaos(v.p.id)
        if (r.ok) {
          ok++
          ml += r.mlConsumido
          if (r.shopify?.startsWith('entrega marcada')) naLoja++
        } else falhas.push(v.p.id)
      }
      setSelecionados(new Set())
      avisar(
        `${ok} entrega(s) confirmada(s) · ${ml.toFixed(1).replace('.', ',')} ml baixados.` +
          (naLoja ? ` ${naLoja} marcada(s) também na Shopify.` : '') +
          (falhas.length ? ` Recusados: ${falhas.join(', ')}.` : ''),
      )
    })
  }

  const copiarSelecionados = async (campo: 'id' | 'rastreio') => {
    const valores = selecionadosVivos
      .map((v) => (campo === 'id' ? v.p.id : v.p.rastreio))
      .filter(Boolean) as string[]
    if (!valores.length) return setErro('Nada para copiar na seleção.')
    try {
      await navigator.clipboard.writeText(valores.join('\n'))
      avisar(`${valores.length} ${campo === 'id' ? 'número(s)' : 'código(s)'} copiado(s).`)
    } catch {
      setErro('O navegador não liberou a área de transferência.')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      {/* ── cartões ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))',
          gap: 10,
        }}
      >
        {metricas.map((m) => {
          const estado = { fila, situacao, soDivergencia, soEmAtraso }
          const ativo = m.ativo?.(estado) ?? false
          const aplicar = m.aplicar
          return (
            <CardMetrica
              key={m.label}
              label={m.label}
              valor={m.valor}
              hint={m.hint}
              hintTom={m.hintTom}
              tom={m.tom}
              corNumero={m.corNumero}
              icone={m.icone}
              ativo={ativo}
              aoClicar={
                aplicar
                  ? () =>
                      aplicar({
                        setFila,
                        setSituacao,
                        setSoDivergencia,
                        setSoEmAtraso,
                        ativo,
                      })
                  : undefined
              }
            />
          )
        })}
      </div>

      {erro && <Faixa tom="erro" texto={erro} aoFechar={() => setErro(null)} />}
      {recado && <Faixa tom="ok" texto={recado} aoFechar={() => setRecado(null)} />}

      {/* ── filas ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {FILAS.map((f) => (
          <Aba key={f} ativo={f === fila} contagem={contarFila(f)} aoClicar={() => setFila(f)}>
            {f}
          </Aba>
        ))}
      </div>

      {/* ── filtros ─────────────────────────────────────────────────────── */}
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
        <BotaoFiltro
          ativo={filtrosAbertos || extrasAtivos > 0}
          aoClicar={() => setFiltrosAbertos((v) => !v)}
        >
          <IcFunil /> Filtros{extrasAtivos ? ` · ${extrasAtivos}` : ''} <Caret />
        </BotaoFiltro>

        <Busca valor={busca} aoMudar={setBusca} />

        <CaixaSeletor rotulo="Período" valor={String(dias)} aoMudar={(v) => setDias(Number(v))}>
          {PERIODOS.map((p) => (
            <option key={p.dias} value={p.dias}>
              {p.rotulo}
            </option>
          ))}
        </CaixaSeletor>
        <CaixaSeletor
          rotulo="Status"
          valor={situacao}
          aoMudar={(v) => setSituacao(v as typeof situacao)}
        >
          <option value="Todas">Todos</option>
          {(Object.keys(ROTULO_SITUACAO_FILTRO) as SituacaoPedido[]).map((s) => (
            <option key={s} value={s}>
              {ROTULO_SITUACAO_FILTRO[s]}
            </option>
          ))}
        </CaixaSeletor>
        <CaixaSeletor rotulo="Canal" valor={canal} aoMudar={setCanal}>
          {canais.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </CaixaSeletor>
        <CaixaSeletor rotulo="Transportadora" valor={transportadora} aoMudar={setTransportadora}>
          {transportadoras.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </CaixaSeletor>

        <BotaoFiltro ativo={extrasAtivos > 0} aoClicar={() => setFiltrosAbertos((v) => !v)}>
          <IcLinhas /> Mais filtros
        </BotaoFiltro>

        <span style={{ flex: 1 }} />

        <BotaoFiltro desabilitado={!filtroSujo} aoClicar={limpar}>
          <IcLixeira /> Limpar filtros
        </BotaoFiltro>
        <span style={{ position: 'relative' }}>
          <BotaoFiltro destaque aoClicar={() => setExportarAberto((v) => !v)}>
            <IcExportar /> Exportar
            <span
              aria-hidden
              style={{ width: 1, height: 16, background: 'rgba(239,209,140,.35)' }}
            />
            <Caret />
          </BotaoFiltro>
          {exportarAberto && (
            <Menu aoFechar={() => setExportarAberto(false)}>
              <ItemMenu
                aoClicar={() => {
                  baixarCsv(filtrados)
                  setExportarAberto(false)
                }}
              >
                Lista filtrada ({filtrados.length})
              </ItemMenu>
              <ItemMenu
                desabilitado={nSelecionados === 0}
                aoClicar={() => {
                  baixarCsv(selecionadosVivos)
                  setExportarAberto(false)
                }}
              >
                Selecionados ({nSelecionados})
              </ItemMenu>
            </Menu>
          )}
        </span>

        {filtrosAbertos && (
          <PopoverFiltros aoFechar={() => setFiltrosAbertos(false)}>
            <CaixaSeletor
              rotulo="Rastreio"
              valor={comRastreio}
              aoMudar={(v) => setComRastreio(v as typeof comRastreio)}
            >
              <option value="todos">Com e sem código</option>
              <option value="com">Só com código</option>
              <option value="sem">Só sem código</option>
            </CaixaSeletor>
            <Alternador
              rotulo="Só pedidos com divergência"
              ligado={soDivergencia}
              aoMudar={setSoDivergencia}
            />
            <Alternador
              rotulo="Só fora do prazo de expedição"
              ligado={soEmAtraso}
              aoMudar={setSoEmAtraso}
            />
            <span>
              <BotaoFiltro aoClicar={() => setFiltrosAbertos(false)}>Fechar</BotaoFiltro>
            </span>
          </PopoverFiltros>
        )}
      </div>

      {/* ── ações em massa — sempre à vista, como no mockup ─────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          padding: '9px 12px',
          border: `1px solid ${nSelecionados ? 'rgba(239,209,140,.3)' : 'var(--color-borda)'}`,
          borderRadius: 'var(--radius-card)',
          background: nSelecionados ? 'rgba(239,209,140,.05)' : 'var(--color-mesa)',
        }}
      >
        <label
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        >
          <Caixa
            marcada={todosMarcados}
            mista={!todosMarcados && nSelecionados > 0}
            aoMarcar={marcarTodos}
            rotulo="Selecionar todos"
          />
          <span className="font-sans" style={{ fontSize: 11.5, color: 'rgba(242,237,227,.7)' }}>
            Selecionar todos ({filtrados.length})
          </span>
        </label>
        {nSelecionados > 0 && (
          <span
            className="font-sans"
            style={{
              padding: '3px 9px',
              borderRadius: 999,
              background: 'rgba(255,255,255,.07)',
              border: '1px solid rgba(255,255,255,.14)',
              color: 'rgba(242,237,227,.75)',
              fontSize: 10.5,
              fontWeight: 600,
            }}
          >
            {nSelecionados} selecionado{nSelecionados > 1 ? 's' : ''}
          </span>
        )}
        <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,.1)' }} />
        <BotaoMassa
          icone={<IcFrasco />}
          desabilitado={pendente || nSelecionados === 0}
          aoClicar={producaoEmMassa}
        >
          Marcar em produção
        </BotaoMassa>
        <BotaoMassa
          icone={<IcCheck />}
          desabilitado={pendente || nSelecionados === 0}
          aoClicar={entregarEmMassa}
        >
          Confirmar entrega em mãos
        </BotaoMassa>
        <BotaoMassa
          icone={<IcAtualizar />}
          desabilitado={pendente || nSelecionados === 0}
          aoClicar={releituraEmMassa}
        >
          {pendente ? 'Consultando…' : 'Atualizar rastreamento'}
        </BotaoMassa>
        <BotaoMassa
          icone={<IcEnviar />}
          desabilitado
          titulo="Os avisos ao cliente estão desligados até o sistema rodar 100%."
          aoClicar={() => {}}
        >
          Enviar rastreio ao cliente
        </BotaoMassa>
        <span style={{ position: 'relative' }}>
          <BotaoMassa
            desabilitado={nSelecionados === 0}
            aoClicar={() => setMenuLinha(menuLinha === '__massa' ? null : '__massa')}
          >
            ⋯ Mais ações <Caret />
          </BotaoMassa>
          {menuLinha === '__massa' && (
            <Menu aoFechar={() => setMenuLinha(null)}>
              <ItemMenu
                aoClicar={() => {
                  copiarSelecionados('id')
                  setMenuLinha(null)
                }}
              >
                Copiar números dos pedidos
              </ItemMenu>
              <ItemMenu
                aoClicar={() => {
                  copiarSelecionados('rastreio')
                  setMenuLinha(null)
                }}
              >
                Copiar códigos de rastreio
              </ItemMenu>
              <ItemMenu
                aoClicar={() => {
                  baixarCsv(selecionadosVivos)
                  setMenuLinha(null)
                }}
              >
                Exportar selecionados (CSV)
              </ItemMenu>
            </Menu>
          )}
        </span>
      </div>

      {/* ── tabela ──────────────────────────────────────────────────────── */}
      <TabelaPedidos
        itens={filtrados}
        selecionados={selecionados}
        aberto={aberto}
        menuLinha={menuLinha}
        ancoraMenu={ancoraMenu}
        setMenuLinha={setMenuLinha}
        setAncoraMenu={setAncoraMenu}
        aoMarcar={alternar}
        aoAbrir={(id) => setAberto(id)}
        aoAvisar={avisar}
        aoErro={setErro}
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
          aoRecado={avisar}
          aoErro={setErro}
        />
      )}
    </div>
  )
}

// ── tabela ─────────────────────────────────────────────────────────────────

/**
 * Tabela própria, e não a compartilhada do ERP: a linha carrega checkbox e
 * botões — e a compartilhada transforma a linha clicável num `<button>`.
 * Botão dentro de botão é HTML inválido; o navegador desmonta e o clique cai
 * no lugar errado.
 */
const GRADE =
  '26px 150px minmax(140px,1fr) 80px 62px 88px 92px 138px minmax(205px,1.2fr) 110px 60px'

const COLUNAS = [
  'Pedido',
  'Cliente',
  'Data',
  'Canal',
  'Valor',
  'Pagamento',
  'Status operacional',
  'Envio',
  'Prazo / SLA',
  'Ações',
]

function TabelaPedidos({
  itens,
  selecionados,
  aberto,
  menuLinha,
  ancoraMenu,
  setMenuLinha,
  setAncoraMenu,
  aoMarcar,
  aoAbrir,
  aoAvisar,
  aoErro,
  vazio,
}: {
  itens: Viva[]
  selecionados: Set<string>
  aberto: string | null
  menuLinha: string | null
  ancoraMenu: { x: number; y: number } | null
  setMenuLinha: (id: string | null) => void
  setAncoraMenu: (a: { x: number; y: number } | null) => void
  aoMarcar: (id: string) => void
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
      {/* Rolagem interna: é ela que faz o cabeçalho sticky funcionar — preso
          a um contêiner que só rola na horizontal, ele nunca grudava — e que
          impede 612 linhas de esticarem a página inteira. No celular esta
          grade some e entram os cartões logo abaixo. */}
      <div className="tabela-grade">
      <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 330px)', minHeight: 220 }}>
        <div style={{ minWidth: 1280 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: GRADE,
              gap: 10,
              alignItems: 'center',
              padding: '9px 14px',
              // Cor SÓLIDA, não o token translúcido: o cabeçalho é sticky e as
              // linhas rolam por baixo dele — com fundo a 3% de opacidade, os
              // textos das duas camadas se sobrepunham na tela.
              background: '#161617',
              borderBottom: '1px solid var(--color-borda)',
              position: 'sticky',
              top: 0,
              zIndex: 2,
            }}
          >
            <span aria-hidden />
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
                  textAlign: t === 'Valor' ? 'right' : 'left',
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
              }}
            >
              {vazio}
            </p>
          )}

          {itens.map((v) => {
            const marcado = selecionados.has(v.p.id)
            const emFoco = aberto === v.p.id
            const link = v.p.rastreioUrl ?? paginaDeRastreio(v.p.transportadora, v.p.rastreio)
            const atualizado = dataHora(v.log.desde) ?? dataHora(v.p.rastreioLidoEm)

            return (
              <div
                key={v.p.id}
                data-linha={v.p.id}
                tabIndex={0}
                onClick={() => aoAbrir(v.p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target === e.currentTarget) aoAbrir(v.p.id)
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
                  background: emFoco
                    ? 'rgba(239,209,140,.08)'
                    : marcado
                      ? 'rgba(239,209,140,.07)'
                      : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <span onClick={(e) => e.stopPropagation()}>
                  <Caixa
                    marcada={marcado}
                    aoMarcar={() => aoMarcar(v.p.id)}
                    rotulo={`Selecionar ${v.p.id}`}
                  />
                </span>

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
                      {v.p.id}
                      {(marcado || emFoco) && (
                        <span aria-hidden style={{ fontSize: 9, color: COR.ouro }}>
                          ★
                        </span>
                      )}
                    </span>
                  }
                  secundaria={v.divergencia ?? ''}
                  tomSecundaria="erro"
                />

                <Dupla principal={v.p.cliente} secundaria={v.p.destino || '—'} />

                <span
                  className="font-mono"
                  style={{ fontSize: 10.5, color: 'rgba(242,237,227,.72)', whiteSpace: 'nowrap' }}
                >
                  {dataHora(v.p.compradoEm) ?? v.p.data}
                </span>
                <span className="font-sans" style={{ fontSize: 11, color: 'rgba(242,237,227,.72)' }}>
                  {v.p.canal}
                </span>
                <span
                  className="font-mono"
                  style={{ fontSize: 11.5, textAlign: 'right', display: 'block', whiteSpace: 'nowrap' }}
                >
                  {brl(v.p.valor)}
                </span>

                <Pilula tom={TOM_PAGAMENTO[v.p.pagamento]}>
                  {ROTULO_PAGAMENTO[v.p.pagamento]}
                </Pilula>
                <Pilula tom={v.status.tom}>{v.status.rotulo}</Pilula>

                <Dupla
                  principal={nomeDoEnvio(v)}
                  secundaria={
                    v.p.rastreio
                      ? `${v.p.rastreio}${atualizado ? ` · Atualizado: ${atualizado}` : ''}`
                      : v.p.entregaLocal
                        ? 'Motoboy · sem código'
                        : 'Sem código'
                  }
                />

                <CelulaPrazo v={v} />

                <span
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}
                >
                  <BotaoIcone rotulo={`Abrir ${v.p.id}`} aoClicar={() => aoAbrir(v.p.id)}>
                    <IcOlho />
                  </BotaoIcone>
                  <BotaoIcone
                    rotulo={`Ações de ${v.p.id}`}
                    menuAberto={menuLinha === v.p.id}
                    aoClicar={(e) => {
                      const r = e.currentTarget.getBoundingClientRect()
                      setAncoraMenu({ x: r.right, y: r.bottom })
                      setMenuLinha(menuLinha === v.p.id ? null : v.p.id)
                    }}
                  >
                    <IcKebab />
                  </BotaoIcone>
                  {menuLinha === v.p.id && ancoraMenu && (
                    <Menu fixo={ancoraMenu} aoFechar={() => setMenuLinha(null)}>
                      <ItemMenu
                        aoClicar={() => {
                          aoAbrir(v.p.id)
                          setMenuLinha(null)
                        }}
                      >
                        Abrir ficha
                      </ItemMenu>
                      <ItemMenu
                        aoClicar={() => {
                          copiar(v.p.id, 'Número do pedido')
                          setMenuLinha(null)
                        }}
                      >
                        Copiar nº do pedido
                      </ItemMenu>
                      {v.p.rastreio && (
                        <ItemMenu
                          aoClicar={() => {
                            copiar(v.p.rastreio as string, 'Código de rastreio')
                            setMenuLinha(null)
                          }}
                        >
                          Copiar rastreio
                        </ItemMenu>
                      )}
                      {link && (
                        <ItemMenu
                          aoClicar={() => {
                            window.open(link, '_blank', 'noreferrer')
                            setMenuLinha(null)
                          }}
                        >
                          Abrir no site da transportadora
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
      </div>

      {/* ── Cartões do celular ─────────────────────────────────────────────
          Um pedido por cartão: número + valor no topo, cliente, as duas
          pílulas de estado, envio e prazo. Data e canal ficam de fora — no
          dedo, o que decide é estado e prazo; o resto mora na ficha. */}
      <div className="tabela-cartoes" style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
        {itens.length === 0 && (
          <p
            className="font-sans"
            style={{ padding: '40px 20px', textAlign: 'center', fontSize: 12, color: 'var(--color-terciario)' }}
          >
            {vazio}
          </p>
        )}
        {itens.map((v) => {
          const marcado = selecionados.has(v.p.id)
          const emFoco = aberto === v.p.id
          return (
            <div
              key={v.p.id}
              data-linha={v.p.id}
              tabIndex={0}
              onClick={() => aoAbrir(v.p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target === e.currentTarget) aoAbrir(v.p.id)
              }}
              style={{
                padding: '12px 14px',
                borderTop: '1px solid var(--color-borda-sutil)',
                borderLeft: `2px solid ${emFoco ? COR.ouro : 'transparent'}`,
                background: emFoco
                  ? 'rgba(239,209,140,.08)'
                  : marcado
                    ? 'rgba(239,209,140,.07)'
                    : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span onClick={(e) => e.stopPropagation()}>
                  <Caixa
                    marcada={marcado}
                    aoMarcar={() => aoMarcar(v.p.id)}
                    rotulo={`Selecionar ${v.p.id}`}
                  />
                </span>
                <span
                  className="font-mono"
                  style={{ fontSize: 12, fontWeight: 700, color: COR.ouro, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {v.p.id}
                </span>
                <span className="font-mono" style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {brl(v.p.valor)}
                </span>
              </div>

              <div style={{ paddingTop: 7 }}>
                <Dupla principal={v.p.cliente} secundaria={v.p.destino || '—'} />
              </div>
              {v.divergencia && (
                <div className="font-sans" style={{ paddingTop: 4, fontSize: 10.5, color: COR.erro }}>
                  {v.divergencia}
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 9 }}>
                <Pilula tom={TOM_PAGAMENTO[v.p.pagamento]}>{ROTULO_PAGAMENTO[v.p.pagamento]}</Pilula>
                <Pilula tom={v.status.tom}>{v.status.rotulo}</Pilula>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 9 }}>
                <Dupla
                  principal={nomeDoEnvio(v)}
                  secundaria={
                    v.p.rastreio
                      ? v.p.rastreio
                      : v.p.entregaLocal
                        ? 'Motoboy · sem código'
                        : 'Sem código'
                  }
                />
                <CelulaPrazo v={v} />
              </div>
            </div>
          )
        })}
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

/**
 * "J&T Express — Em trânsito", como o mockup escreve a coluna Envio.
 *
 * O status aqui é o LOGÍSTICO, nunca o operacional: "Em atraso" pertence à
 * coluna de prazo — repetido aqui, vira ruído em dose dupla.
 */
function nomeDoEnvio(v: Viva): string {
  if (v.p.entregaLocal) {
    return `Entrega local — ${v.p.situacao === 'entregue' ? 'Entregue' : 'Aguardando confirmação'}`
  }
  if (!v.p.rastreio && !v.p.transportadora) return 'Sem rastreio'
  const nome =
    v.p.transportadora ?? servicoLegivel(v.p.servicoFrete) ?? 'Não identificada'
  return `${nome} — ${ROTULO_LOGISTICO[v.log.status]}`
}

/** Prazo em duas linhas: o estado em cima, a data que o explica embaixo. */
function CelulaPrazo({ v }: { v: Viva }) {
  const TOM_SLA: Record<Sla['estado'], Tom> = {
    hoje: 'atencao',
    amanha: 'ouro',
    'em-atraso': 'erro',
    entregue: 'ok',
    'sem-previsao': 'neutro',
    'em-dia': 'neutro',
  }

  if (v.p.entregaLocal && v.p.situacao !== 'entregue') {
    return <Dupla principal={<span style={{ color: COR.atencao }}>Entrega local</span>} secundaria="confirmar em mãos" />
  }

  // Depois do despacho a régua troca de dono: o prazo passa a ser o que a
  // TRANSPORTADORA cotou, contado da postagem. Antes disso, vale as 72 h de
  // expedição da operação.
  if (v.p.situacao === 'enviado') {
    const entrega = slaDeEntrega({
      situacao: v.p.situacao,
      entregueEm: v.p.entregueEm,
      postadoEm: v.log.primeiroEvento,
      prazoDias: v.p.prazoEntregaDias,
      prometidoEm: v.p.entregaPrevistaEm,
    })
    const TOM_ENTREGA: Record<typeof entrega.estado, Tom> = {
      entregue: 'ok',
      'no-prazo': 'neutro',
      'vence-hoje': 'atencao',
      atrasado: 'erro',
      'sem-previsao': 'neutro',
    }
    return (
      <Dupla
        principal={
          <span style={{ color: COR[TOM_ENTREGA[entrega.estado]] }}>{entrega.rotulo}</span>
        }
        secundaria={
          entrega.estado === 'sem-previsao'
            ? 'sem promessa nem cotação'
            : v.p.entregaPrevistaEm
              ? 'prometida no checkout'
              : v.p.prazoEntregaDias
                ? `${v.p.prazoEntregaDias} dias da postagem`
                : ''
        }
      />
    )
  }

  const vencimento = dataVencimento(v.p.compradoEm)
  const secundaria = v.sla.estado === 'entregue' ? '' : (vencimento ?? '')

  return (
    <Dupla
      principal={
        <span style={{ color: COR[TOM_SLA[v.sla.estado]] }}>{v.sla.rotulo}</span>
      }
      secundaria={secundaria}
    />
  )
}

/**
 * dd/MM do vencimento do prazo de expedição (compra + 2 dias).
 *
 * No MESMO calendário do SLA (`slaDeExpedicao` conta dias em baldes UTC):
 * formatar em São Paulo aqui faria a data da segunda linha discordar do
 * estado da primeira para toda compra feita depois das 21h.
 */
function dataVencimento(compradoEm: string, prazoDias = PRAZO_EXPEDICAO_DIAS): string | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(compradoEm)) return null
  const t = Date.parse(compradoEm)
  if (!Number.isFinite(t)) return null
  const dia = Math.floor(t / 86_400_000) + prazoDias
  return new Date(dia * 86_400_000).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })
}

// ── cartões ────────────────────────────────────────────────────────────────

interface EstadoFiltros {
  fila: Fila
  situacao: 'Todas' | SituacaoPedido
  soDivergencia: boolean
  soEmAtraso: boolean
}

interface AcoesFiltro {
  setFila: (f: Fila) => void
  setSituacao: (s: 'Todas' | SituacaoPedido) => void
  setSoDivergencia: (v: boolean) => void
  setSoEmAtraso: (v: boolean) => void
  ativo: boolean
}

interface Metrica {
  label: string
  valor: string
  hint: ReactNode
  hintTom?: Tom
  /** Tom do ícone. */
  tom: Tom
  /** Cor do NÚMERO — no mockup a maioria é branca; só a exceção grita. */
  corNumero?: string
  icone: ReactNode
  aplicar?: (a: AcoesFiltro) => void
  ativo?: (e: EstadoFiltros) => boolean
}

export function CardMetrica({
  label,
  valor,
  hint,
  hintTom,
  tom,
  icone,
  ativo,
  aoClicar,
  corNumero,
}: {
  label: string
  valor: string
  hint: ReactNode
  hintTom?: Tom
  tom: Tom
  corNumero?: string
  icone: ReactNode
  ativo: boolean
  aoClicar?: () => void
}) {
  const conteudo = (
    <>
      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span
          className="font-sans"
          style={{
            flex: 1,
            fontWeight: 600,
            fontSize: 8.5,
            letterSpacing: '.11em',
            textTransform: 'uppercase',
            color: 'var(--color-terciario)',
            lineHeight: 1.3,
            // Duas linhas reservadas em todos: quando um título quebra
            // ("Cancelados / reembolsados"), os números continuam alinhados.
            minHeight: 22,
          }}
        >
          {label}
        </span>
        <span style={{ color: COR[tom], opacity: 0.7, flex: 'none' }}>{icone}</span>
      </span>
      <span
        className="font-mono"
        style={{
          fontWeight: 500,
          fontSize: 23,
          lineHeight: 1,
          color: corNumero ?? 'var(--color-tinta)',
        }}
      >
        {valor}
      </span>
      <span
        className="font-sans"
        style={{
          fontSize: 9.5,
          lineHeight: 1.35,
          color: hintTom ? COR[hintTom] : 'var(--color-terciario)',
          textWrap: 'pretty',
        }}
      >
        {hint}
      </span>
    </>
  )

  const estilo = {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    padding: '12px 13px',
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
 * Variação contra a janela anterior de MESMO tamanho, com o percentual em
 * verde como no mockup. Quando a base é pequena demais, a porcentagem mente
 * ("+1533%" sobre 3 pedidos) — aí o cartão diz o número absoluto, que é o que
 * a comparação realmente sabe.
 */
export function delta(agora: number, antes: number, comparavel: boolean): ReactNode {
  if (!comparavel) return 'no período selecionado'
  if (antes === 0) return agora === 0 ? 'sem movimento no período' : 'sem base de comparação'
  const pct = Math.round(((agora - antes) / antes) * 100)
  if (Math.abs(pct) > 300) return `vs ${antes} no período anterior`
  return (
    <>
      <span style={{ color: pct >= 0 ? COR.ok : COR.erro, fontWeight: 600 }}>
        {pct > 0 ? '+' : ''}
        {pct}%
      </span>{' '}
      vs período anterior
    </>
  )
}

function calcularMetricas(atual: Viva[], anterior: Viva[]): Metrica[] {
  const comparavel = anterior.length > 0
  const conta = (lista: Viva[], f: (v: Viva) => boolean) => lista.filter(f).length

  const aguardando = (v: Viva) => PREDICADO['Aguardando envio'](v)
  const enviados = (v: Viva) => v.p.situacao === 'enviado'
  const entregues = (v: Viva) => v.p.situacao === 'entregue'
  const cancelados = (v: Viva) => v.p.situacao === 'cancelado' || v.p.pagamento === 'cancelado'
  const atrasados = (v: Viva) => v.sla.estado === 'em-atraso' && !v.p.entregaLocal
  const divergentes = (v: Viva) => Boolean(v.divergencia)

  const nAguardando = conta(atual, aguardando)
  const foraDoPrazo = conta(atual, (v) => aguardando(v) && atrasados(v))
  const nDivergentes = conta(atual, divergentes)
  const nAtrasados = conta(atual, atrasados)
  const valor = atual.reduce((s, v) => s + v.p.valor, 0)

  return [
    {
      label: 'Pedidos no período',
      valor: String(atual.length),
      hint: (
        <>
          {brl(valor)} · {delta(atual.length, anterior.length, comparavel)}
        </>
      ),
      tom: 'ouro',
      icone: <IcCaixaFechada />,
    },
    {
      label: 'Aguardando expedição',
      valor: String(nAguardando),
      hint: foraDoPrazo ? `${foraDoPrazo} fora do prazo` : 'todos dentro do prazo',
      hintTom: foraDoPrazo ? 'erro' : undefined,
      tom: 'ouro',
      corNumero: COR.ouro,
      icone: <IcRelogio />,
      aplicar: (a) => a.setFila(a.ativo ? 'Todos' : 'Aguardando envio'),
      ativo: (e) => e.fila === 'Aguardando envio',
    },
    {
      label: 'Com divergência',
      valor: String(nDivergentes),
      hint: nDivergentes ? 'requer conferência' : 'nada a conferir',
      tom: 'erro',
      corNumero: nDivergentes ? COR.erro : undefined,
      icone: <IcAlerta />,
      aplicar: (a) => a.setSoDivergencia(!a.ativo),
      ativo: (e) => e.soDivergencia,
    },
    {
      label: 'Enviados',
      valor: String(conta(atual, enviados)),
      hint: delta(conta(atual, enviados), conta(anterior, enviados), comparavel),
      tom: 'info',
      icone: <IcCaminhao />,
      aplicar: (a) => a.setSituacao(a.ativo ? 'Todas' : 'enviado'),
      ativo: (e) => e.situacao === 'enviado',
    },
    {
      label: 'Entregues',
      valor: String(conta(atual, entregues)),
      hint: delta(conta(atual, entregues), conta(anterior, entregues), comparavel),
      tom: 'ok',
      corNumero: COR.ok,
      icone: <IcCheque />,
      aplicar: (a) => a.setFila(a.ativo ? 'Todos' : 'Entregues'),
      ativo: (e) => e.fila === 'Entregues',
    },
    {
      label: 'Cancelados / reembolsados',
      valor: String(conta(atual, cancelados)),
      hint: delta(conta(atual, cancelados), conta(anterior, cancelados), comparavel),
      tom: 'neutro',
      icone: <IcXCirculo />,
      aplicar: (a) => a.setSituacao(a.ativo ? 'Todas' : 'cancelado'),
      ativo: (e) => e.situacao === 'cancelado',
    },
    {
      label: 'Em atraso',
      valor: String(nAtrasados),
      hint: 'prazo de expedição vencido',
      hintTom: nAtrasados ? 'erro' : undefined,
      tom: 'erro',
      corNumero: nAtrasados ? COR.erro : undefined,
      icone: <IcRelogioAlerta />,
      aplicar: (a) => a.setSoEmAtraso(!a.ativo),
      ativo: (e) => e.soEmAtraso,
    },
  ]
}

// ── regras da tela ─────────────────────────────────────────────────────────

/**
 * O que exige conferência humana: cada linha é uma contradição entre duas
 * fontes que deveriam concordar. Divergência silenciosa é a pior espécie —
 * o pedido parece normal e só aparece quando o cliente cobra.
 */
function divergenciaDe(p: Pedido, log: SituacaoLogistica): string | null {
  if (p.pagamento === 'divergente') return 'Valor recebido divergente'
  if (p.situacao === 'enviado' && !p.rastreio && !p.entregaLocal) {
    return 'Enviado sem código de rastreio'
  }
  if (log.status === 'entregue' && p.situacao !== 'entregue') {
    return 'Transportadora entregou, ERP não baixou'
  }
  if (p.situacao === 'entregue' && !p.entregueEm) return 'Entregue sem data de entrega'
  return null
}

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
    'Status operacional',
    'Transportadora',
    'Rastreio',
    'Ultima atualizacao',
    'Prazo',
    'Divergencia',
  ]
  const escapa = (s: string) => `"${s.replace(/"/g, '""')}"`
  const linhas = itens.map((v) =>
    [
      v.p.id,
      dataHora(v.p.compradoEm) ?? v.p.data,
      v.p.cliente,
      v.p.cpf,
      v.p.email,
      v.p.destino,
      v.p.canal,
      v.p.valor.toFixed(2).replace('.', ','),
      ROTULO_PAGAMENTO[v.p.pagamento],
      v.status.rotulo,
      v.p.entregaLocal ? 'Entrega local' : (v.p.transportadora ?? ''),
      v.p.rastreio ?? '',
      v.log.desde ? (dataHora(v.log.desde) ?? '') : '',
      v.sla.rotulo,
      v.divergencia ?? '',
    ]
      .map((c) => escapa(String(c)))
      .join(';'),
  )

  // BOM + ponto e vírgula: sem isso o Excel brasileiro quebra acento e joga a
  // linha inteira numa célula só.
  const csv = '﻿' + [cabecalho.join(';'), ...linhas].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── peças ──────────────────────────────────────────────────────────────────

export function Aba({
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

export function Busca({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  return (
    <label
      className="focus-within:border-ouro/45"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flex: '1 1 230px',
        minWidth: 200,
        height: 38,
        padding: '0 12px',
        border: '1px solid rgba(255,255,255,.09)',
        background: 'rgba(255,255,255,.03)',
        borderRadius: 9,
      }}
    >
      <IcLupa />
      <input
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder="Pedido, cliente, CPF, rastreio, produto…"
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

/** Dropdown do mockup: caixa com o rótulo pequeno DENTRO, valor embaixo. */
export function CaixaSeletor({
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
    <label
      className="hover:border-ouro/30"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        padding: '5px 10px 4px',
        border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 9,
        background: 'rgba(255,255,255,.02)',
        cursor: 'pointer',
      }}
    >
      <span
        className="font-sans"
        style={{
          fontSize: 8,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          color: 'var(--color-terciario)',
        }}
      >
        {rotulo}
      </span>
      <select
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="font-sans"
        style={{
          border: 0,
          outline: 0,
          background: 'transparent',
          color: 'var(--color-corrente)',
          fontSize: 11.5,
          fontWeight: 600,
          cursor: 'pointer',
          maxWidth: 170,
        }}
      >
        {children}
      </select>
    </label>
  )
}

export function BotaoFiltro({
  children,
  destaque,
  ativo,
  desabilitado,
  aoClicar,
}: {
  children: ReactNode
  destaque?: boolean
  ativo?: boolean
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
        opacity: desabilitado ? 0.38 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        height: 38,
        padding: '0 13px',
        borderRadius: 9,
        border: destaque
          ? '1px solid rgba(239,209,140,.5)'
          : `1px solid ${ativo ? 'rgba(239,209,140,.4)' : 'rgba(255,255,255,.11)'}`,
        background: destaque
          ? 'rgba(239,209,140,.14)'
          : ativo
            ? 'rgba(239,209,140,.07)'
            : 'transparent',
        color: destaque || ativo ? COR.ouro : 'rgba(242,237,227,.78)',
        fontWeight: 600,
        fontSize: 11.5,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

export function BotaoMassa({
  children,
  icone,
  desabilitado,
  titulo,
  aoClicar,
}: {
  children: ReactNode
  icone?: ReactNode
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
      className={desabilitado ? 'font-sans' : 'font-sans hover:border-ouro/35'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        height: 31,
        padding: '0 12px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,.11)',
        background: 'transparent',
        color: 'rgba(242,237,227,.78)',
        fontWeight: 600,
        fontSize: 11,
        cursor: desabilitado ? 'not-allowed' : 'pointer',
        opacity: desabilitado ? 0.4 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {icone}
      {children}
    </button>
  )
}

export function BotaoIcone({
  children,
  rotulo,
  menuAberto,
  aoClicar,
}: {
  children: ReactNode
  rotulo: string
  /** Presente quando o botão abre um menu; alimenta o aria-expanded. */
  menuAberto?: boolean
  aoClicar: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-label={rotulo}
      aria-haspopup={menuAberto === undefined ? undefined : 'menu'}
      aria-expanded={menuAberto}
      title={rotulo}
      className="hover:border-ouro/45 hover:text-ouro"
      style={{
        width: 26,
        height: 26,
        display: 'grid',
        placeItems: 'center',
        border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 7,
        background: 'transparent',
        color: 'rgba(242,237,227,.65)',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {children}
    </button>
  )
}

export function Caixa({
  marcada,
  mista,
  aoMarcar,
  rotulo,
}: {
  marcada: boolean
  /** Seleção parcial: nem tudo, nem nada. */
  mista?: boolean
  aoMarcar: () => void
  rotulo: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mista ? 'mixed' : marcada}
      aria-label={rotulo}
      onClick={aoMarcar}
      className="hover:border-ouro/50"
      style={{
        width: 16,
        height: 16,
        display: 'grid',
        placeItems: 'center',
        border: `1px solid ${marcada ? 'rgba(239,209,140,.6)' : 'rgba(255,255,255,.22)'}`,
        borderRadius: 4,
        background: marcada ? 'rgba(239,209,140,.18)' : 'transparent',
        color: COR.ouro,
        fontSize: 10,
        lineHeight: 1,
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {marcada ? '✓' : mista ? '–' : ''}
    </button>
  )
}

export function Pilula({ tom, children }: { tom: Tom; children: ReactNode }) {
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

export function Dupla({
  principal,
  secundaria,
  tomSecundaria,
}: {
  principal: ReactNode
  secundaria?: ReactNode
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
          color: 'var(--color-corrente)',
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
            color:
              tomSecundaria && tomSecundaria !== 'neutro'
                ? COR[tomSecundaria]
                : 'var(--color-terciario)',
          }}
        >
          {secundaria}
        </span>
      ) : null}
    </span>
  )
}

/** Popover dos filtros extras — fecha fora/Esc como qualquer flutuante. */
export function PopoverFiltros({ children, aoFechar }: { children: ReactNode; aoFechar: () => void }) {
  const ref = useFecharFora(aoFechar)
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Mais filtros"
      data-camada="menu"
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        left: 12,
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        width: 300,
        padding: '15px 16px',
        borderRadius: 12,
        border: '1px solid rgba(239,209,140,.25)',
        background: 'linear-gradient(170deg,#17161A,#111112)',
        boxShadow: 'var(--shadow-modal)',
      }}
    >
      {children}
    </div>
  )
}

/**
 * Fecha um flutuante ao clicar fora ou apertar Esc.
 *
 * O clique-fora ouve `pointerdown` em CAPTURA: as células da tabela usam
 * `stopPropagation` para o clique não abrir a ficha, e isso engolia o clique
 * antes de ele chegar ao `document` — o menu ficava aberto para sempre. A fase
 * de captura roda antes de qualquer handler do React, então nada a suprime. E
 * como fecha ANTES do clique do próximo gatilho processar, trocar de menu
 * passa a ser um clique só, não dois.
 */
export function useFecharFora(aoFechar: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const aoTocar = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) aoFechar()
    }
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    document.addEventListener('pointerdown', aoTocar, true)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('pointerdown', aoTocar, true)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aoFechar])
  return ref
}

/**
 * Menu suspenso. `fixo` ancora por coordenada de viewport — é o que permite ao
 * menu de uma linha escapar do contêiner com overflow da tabela (que cortaria
 * um absoluto) e flutuar ACIMA da ficha aberta.
 */
export function Menu({
  children,
  direita,
  fixo,
  aoFechar,
}: {
  children: ReactNode
  direita?: boolean
  /** Canto superior-direito do gatilho, em coordenadas de viewport. */
  fixo?: { x: number; y: number }
  aoFechar: () => void
}) {
  const ref = useFecharFora(aoFechar)

  const posicao: React.CSSProperties = fixo
    ? {
        position: 'fixed',
        top: Math.min(fixo.y + 5, window.innerHeight - 230),
        left: Math.max(8, fixo.x - 210),
        zIndex: 80,
      }
    : {
        position: 'absolute',
        top: 'calc(100% + 5px)',
        ...(direita ? { right: 0 } : { left: 0 }),
        zIndex: 40,
      }

  const corpo = (
    <div
      ref={ref}
      role="menu"
      data-camada="menu"
      style={{
        ...posicao,
        display: 'flex',
        flexDirection: 'column',
        width: 210,
        padding: 5,
        borderRadius: 10,
        border: '1px solid rgba(239,209,140,.25)',
        background: 'linear-gradient(170deg,#1A191D,#121113)',
        boxShadow: 'var(--shadow-modal)',
      }}
    >
      {children}
    </div>
  )

  // O menu por coordenada vai por PORTAL para o `body`: dentro da árvore da
  // tabela, qualquer ancestral com transform/filter (a animação de entrada da
  // página, por exemplo) vira o referencial do `fixed` e o menu aparece
  // espremido no canto da tela — foi exatamente o defeito em produção.
  return fixo ? createPortal(<span className="erp">{corpo}</span>, document.body) : corpo
}

export function ItemMenu({
  children,
  desabilitado,
  aoClicar,
}: {
  children: ReactNode
  desabilitado?: boolean
  aoClicar: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={aoClicar}
      disabled={desabilitado}
      className={desabilitado ? 'font-sans' : 'font-sans hover:bg-[rgba(239,209,140,.08)]'}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '8px 11px',
        border: 0,
        borderRadius: 7,
        background: 'transparent',
        color: desabilitado ? 'rgba(242,237,227,.3)' : 'rgba(242,237,227,.82)',
        fontSize: 11.5,
        fontWeight: 500,
        cursor: desabilitado ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

/** Interruptor pequeno do popover de filtros. */
export function Alternador({
  rotulo,
  ligado,
  aoMudar,
}: {
  rotulo: string
  ligado: boolean
  aoMudar: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      onClick={() => aoMudar(!ligado)}
      className="font-sans"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        border: 0,
        background: 'transparent',
        padding: 0,
        cursor: 'pointer',
        color: 'rgba(242,237,227,.8)',
        fontSize: 11.5,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 30,
          height: 17,
          borderRadius: 999,
          padding: 2,
          background: ligado ? 'rgba(239,209,140,.5)' : 'rgba(255,255,255,.14)',
          display: 'flex',
          justifyContent: ligado ? 'flex-end' : 'flex-start',
          transition: 'background .15s ease',
        }}
      >
        <span style={{ width: 13, height: 13, borderRadius: 999, background: '#F2EDE3' }} />
      </span>
      {rotulo}
    </button>
  )
}

export function Faixa({
  tom,
  texto,
  aoFechar,
}: {
  tom: Tom
  texto: string
  /** Sem `aoFechar` a faixa não tem botão: estado permanente não se fecha. */
  aoFechar?: () => void
}) {
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
      {aoFechar && (
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
      )}
    </div>
  )
}

// ── ícones ─────────────────────────────────────────────────────────────────

export function Svg({ children, tamanho = 14 }: { children: ReactNode; tamanho?: number }) {
  return (
    <svg
      aria-hidden
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flex: 'none' }}
    >
      {children}
    </svg>
  )
}

export const IcCaixaFechada = () => (
  <Svg>
    <path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16z" />
    <path d="M3.5 8 12 12.5 20.5 8" />
    <path d="M12 12.5V20.5" />
  </Svg>
)
export const IcRelogio = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7v5.2l3.2 1.9" />
  </Svg>
)
export const IcAlerta = () => (
  <Svg>
    <path d="M12 4.5 21 19.5H3z" />
    <path d="M12 10v4" />
    <path d="M12 17h.01" />
  </Svg>
)
export const IcCaminhao = () => (
  <Svg>
    <path d="M2.5 7.5h10v9h-10z" />
    <path d="M12.5 11h4l3 3v2.5h-7z" />
    <circle cx="6.5" cy="18" r="1.7" />
    <circle cx="16.5" cy="18" r="1.7" />
  </Svg>
)
export const IcCheque = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.4 12.2 2.5 2.4 4.7-4.9" />
  </Svg>
)
export const IcXCirculo = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m9.2 9.2 5.6 5.6" />
    <path d="m14.8 9.2-5.6 5.6" />
  </Svg>
)
export const IcRelogioAlerta = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7v5.2l3.2 1.9" />
    <path d="M19.4 4.6 4.6 19.4" />
  </Svg>
)
export const IcLupa = () => (
  <span style={{ color: 'var(--color-terciario)' }}>
    <Svg tamanho={13}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </Svg>
  </span>
)
export const IcFunil = () => (
  <Svg tamanho={13}>
    <path d="M4 5h16l-6.5 7.5V19l-3-1.6v-4.9z" />
  </Svg>
)
export const IcLinhas = () => (
  <Svg tamanho={13}>
    <path d="M4 7h16" />
    <path d="M7 12h10" />
    <path d="M10 17h4" />
  </Svg>
)
export const IcLixeira = () => (
  <Svg tamanho={13}>
    <path d="M4.5 7h15" />
    <path d="M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7" />
    <path d="M6.5 7 7.4 20h9.2l.9-13" />
  </Svg>
)
export const IcExportar = () => (
  <Svg tamanho={13}>
    <path d="M12 3v11" />
    <path d="m7.5 9.5 4.5 4.5 4.5-4.5" />
    <path d="M4 20h16" />
  </Svg>
)
export const IcOlho = () => (
  <Svg tamanho={13}>
    <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.6" />
  </Svg>
)
export const IcKebab = () => (
  <Svg tamanho={13}>
    <circle cx="12" cy="5.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="18.5" r="1.1" fill="currentColor" stroke="none" />
  </Svg>
)
export const IcFrasco = () => (
  <Svg tamanho={13}>
    <path d="M9.5 3.5h5" />
    <path d="M10.5 3.5v3h3v-3" />
    <path d="M10.5 6.5C7.5 7.6 5.5 10.4 5.5 13.7c0 3.8 2.9 6.8 6.5 6.8s6.5-3 6.5-6.8c0-3.3-2-6.1-5-7.2" />
  </Svg>
)
export const Caret = () => (
  <Svg tamanho={11}>
    <path d="m6 9.5 6 6 6-6" />
  </Svg>
)
