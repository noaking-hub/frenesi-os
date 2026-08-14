'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'

import { COR, type Tom } from '@/components/erp/tokens'
import {
  ROTULO_LOGISTICO,
  brl,
  ehOcorrencia,
  paginaDeRastreio,
  paradoDemais,
  resumirEvento,
  servicoLegivel,
  slaDeExpedicao,
  type Pedido,
  type SituacaoLogistica,
  type StatusDevolucao,
  type StatusLogistico,
} from '@/domain'

import { atualizarRastreamento } from '../actions'
import {
  FichaDoPedido,
  IcAtualizar,
  IcCheck,
  IcCopiar,
  IcEnviar,
  TOM_LOGISTICO,
  dataHora,
} from '../FichaDoPedido'
import {
  Aba,
  BotaoFiltro,
  BotaoIcone,
  BotaoMassa,
  Busca,
  Caixa,
  CaixaSeletor,
  CardMetrica,
  Caret,
  Dupla,
  Faixa,
  IcCaixaFechada,
  IcCaminhao,
  IcCheque,
  IcExportar,
  IcKebab,
  IcLixeira,
  IcOlho,
  IcRelogioAlerta,
  ItemMenu,
  Menu,
  Pilula,
  Svg,
  delta,
} from '../PedidosCliente'

import { baixarNaShopify, testarAvisoDeEnvio } from './actions'

/**
 * Rastreamento e entregas — a vida do pedido DEPOIS da expedição.
 *
 * Mesma fonte de dados e mesmas peças da tela de Todos os pedidos, de
 * propósito: as duas nunca podem discordar sobre um pedido. O que muda é o
 * recorte — aqui só entra o que já tem código, já saiu ou é entrega local —
 * e o foco: transportadora, último evento, objeto parado, e a baixa na
 * Shopify, que é o fecho do ciclo que a Yampi não faz.
 */

export interface Linha {
  pedido: Pedido
  devolucao: StatusDevolucao
  logistica: SituacaoLogistica
}

interface Viva {
  p: Pedido
  log: SituacaoLogistica
  devolucao: StatusDevolucao
  aguardaBaixa: boolean
}

type Fila =
  | 'Todos'
  | 'Aguardando postagem'
  | 'Em trânsito'
  | 'Saiu para entrega'
  | 'Entregues'
  | 'Com ocorrência'
  | 'Aguardando baixa'
  | 'Entrega local'

const FILAS: Fila[] = [
  'Todos',
  'Aguardando postagem',
  'Em trânsito',
  'Saiu para entrega',
  'Entregues',
  'Com ocorrência',
  'Aguardando baixa',
  'Entrega local',
]

const PREDICADO: Record<Fila, (v: Viva) => boolean> = {
  Todos: () => true,
  // Código emitido e nenhum escaneamento ainda: a etiqueta existe, o objeto
  // não andou — ou o despacho registrado sem código nenhum.
  'Aguardando postagem': (v) =>
    !v.p.entregaLocal &&
    v.p.situacao !== 'entregue' &&
    (v.log.status === 'etiqueta' || (v.p.situacao === 'enviado' && !v.p.rastreio)),
  'Em trânsito': (v) => v.log.status === 'em-transito' || v.log.status === 'postado',
  'Saiu para entrega': (v) => v.log.status === 'saiu-para-entrega',
  Entregues: (v) => v.p.situacao === 'entregue' || v.log.status === 'entregue',
  'Com ocorrência': (v) => ehOcorrencia(v.log.status) || paradoDemais(v.log),
  'Aguardando baixa': (v) => v.aguardaBaixa,
  'Entrega local': (v) => v.p.entregaLocal,
}

const PERIODOS: { rotulo: string; dias: number }[] = [
  { rotulo: 'Últimos 7 dias', dias: 7 },
  { rotulo: 'Últimos 30 dias', dias: 30 },
  { rotulo: 'Últimos 90 dias', dias: 90 },
  { rotulo: 'Todo o histórico', dias: 0 },
]

export function EnviosCliente({
  itens,
  shopifyLigada,
  avisosLigados,
  emailDoOperador,
}: {
  itens: Linha[]
  shopifyLigada: boolean
  avisosLigados: boolean
  emailDoOperador: string | null
}) {
  const [fila, setFila] = useState<Fila>('Todos')
  const [busca, setBusca] = useState('')
  const [dias, setDias] = useState(30)
  const [transportadora, setTransportadora] = useState('Todas')
  const [statusLog, setStatusLog] = useState<'Todos' | StatusLogistico>('Todos')
  const [exportarAberto, setExportarAberto] = useState(false)

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [aberto, setAberto] = useState<string | null>(null)
  const [menuLinha, setMenuLinha] = useState<string | null>(null)
  const [ancoraMenu, setAncoraMenu] = useState<{ x: number; y: number } | null>(null)
  // Baixas confirmadas nesta sessão — evita a linha piscar de volta enquanto a
  // revalidação da rota não chega.
  const [baixados, setBaixados] = useState<Set<string>>(new Set())
  const [recado, setRecado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const vivas = useMemo<Viva[]>(
    () =>
      itens.map((i) => {
        const jaBaixado = Boolean(i.pedido.entregaShopifyEm) || baixados.has(i.pedido.id)
        return {
          p: i.pedido,
          log: i.logistica,
          devolucao: i.devolucao,
          aguardaBaixa:
            i.pedido.situacao === 'entregue' && Boolean(i.pedido.shopifyNumero) && !jaBaixado,
        }
      }),
    [itens, baixados],
  )

  const { doPeriodo, doAnterior } = useMemo(() => {
    if (dias <= 0) return { doPeriodo: vivas, doAnterior: [] as Viva[] }
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
  }, [vivas, dias])

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
      if (transportadora === 'Entrega local' && !v.p.entregaLocal) return false
      if (
        transportadora !== 'Todas' &&
        transportadora !== 'Entrega local' &&
        v.p.transportadora !== transportadora
      ) {
        return false
      }
      if (statusLog !== 'Todos' && v.log.status !== statusLog) return false
      if (!termo) return true
      return [
        v.p.id,
        v.p.cliente,
        v.p.destino,
        v.p.rastreio ?? '',
        v.p.transportadora ?? '',
        v.log.original ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(termo)
    })
  }, [doPeriodo, fila, transportadora, statusLog, busca])

  const contarFila = (f: Fila) => doPeriodo.filter(PREDICADO[f]).length
  const filaDeBaixa = doPeriodo.filter((v) => v.aguardaBaixa)

  const filtroSujo =
    fila !== 'Todos' || transportadora !== 'Todas' || statusLog !== 'Todos' || busca.trim() !== ''
  const limpar = () => {
    setFila('Todos')
    setTransportadora('Todas')
    setStatusLog('Todos')
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

  const selecionadosVivos = filtrados.filter((v) => selecionados.has(v.p.id))
  const nSelecionados = selecionadosVivos.length
  const abertoAgora = aberto ? (vivas.find((v) => v.p.id === aberto) ?? null) : null

  const avisar = (texto: string) => {
    setErro(null)
    setRecado(texto)
  }

  // ── ações ────────────────────────────────────────────────────────────────

  const baixar = (ids: string[]) => {
    setErro(null)
    setRecado(null)
    iniciar(async () => {
      const r = await baixarNaShopify(ids)
      if (!r.ok) return setErro(r.erro)
      const x = r.resultado
      const falhou = new Set([...x.ignorados.map((i) => i.pedido), ...x.semEspelho, ...x.restantes, ...x.semEvento])
      setBaixados((s) => {
        const novo = new Set(s)
        for (const id of ids) if (!falhou.has(id)) novo.add(id)
        return novo
      })
      setSelecionados(new Set())
      avisar(
        [
          `${x.entregues} entrega(s) marcada(s) na Shopify · ${x.fechados} pedido(s) fechado(s).`,
          x.jaEnviados.length ? `${x.jaEnviados.length} já estavam baixados na loja.` : '',
          x.semEvento.length
            ? `${x.semEvento.length} com envio na loja mas SEM a entrega marcada — o app da Shopify precisa do escopo write_fulfillments (Conferir permissões, em Todos os pedidos → Ferramentas, mostra o que falta).`
            : '',
          x.vinculados ? `${x.vinculados} pedido(s) ganharam o número da Shopify nesta rodada.` : '',
          x.semEspelho.length
            ? `${x.semEspelho.length} sem par na Shopify (ex.: ${x.semEspelho.slice(0, 3).join(', ')}).`
            : '',
          x.restantes.length
            ? `${x.restantes.length} ficaram para a próxima rodada — o tempo da função acabou antes.`
            : '',
          ...x.ignorados.slice(0, 4).map((i) => `${i.pedido}: ${i.motivo}`),
        ]
          .filter(Boolean)
          .join(' '),
      )
    })
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

  const baixarSelecionados = () => {
    const alvos = selecionadosVivos.filter((v) => v.aguardaBaixa).map((v) => v.p.id)
    if (!alvos.length) return setErro('Nenhum pedido aguardando baixa entre os selecionados.')
    baixar(alvos)
  }

  const copiarRastreios = async () => {
    const codigos = selecionadosVivos.map((v) => v.p.rastreio).filter(Boolean) as string[]
    if (!codigos.length) return setErro('Nenhum código de rastreio na seleção.')
    try {
      await navigator.clipboard.writeText(codigos.join('\n'))
      avisar(`${codigos.length} código(s) copiado(s).`)
    } catch {
      setErro('O navegador não liberou a área de transferência.')
    }
  }

  const metricas = useMemo(() => {
    const comparavel = doAnterior.length > 0
    const conta = (lista: Viva[], f: (v: Viva) => boolean) => lista.filter(f).length
    const entregues = (v: Viva) => PREDICADO.Entregues(v)
    const parados = (v: Viva) => paradoDemais(v.log)
    const nOcorrencia = contarFila('Com ocorrência')
    const nParados = conta(doPeriodo, parados)
    const nBaixa = filaDeBaixa.length
    return [
      {
        label: 'Envios no período',
        valor: String(doPeriodo.length),
        hint: (
          <>
            {brl(doPeriodo.reduce((s, v) => s + v.p.valor, 0))} ·{' '}
            {delta(doPeriodo.length, doAnterior.length, comparavel)}
          </>
        ),
        tom: 'ouro' as Tom,
        icone: <IcCaixaFechada />,
      },
      {
        label: 'Em trânsito',
        valor: String(contarFila('Em trânsito')),
        hint: 'postado ou em transferência',
        tom: 'info' as Tom,
        icone: <IcCaminhao />,
        fila: 'Em trânsito' as Fila,
      },
      {
        label: 'Saiu para entrega',
        valor: String(contarFila('Saiu para entrega')),
        hint: 'com o entregador agora',
        tom: 'ouro' as Tom,
        corNumero: contarFila('Saiu para entrega') ? COR.ouro : undefined,
        icone: <IcRota />,
        fila: 'Saiu para entrega' as Fila,
      },
      {
        label: 'Entregues',
        valor: String(conta(doPeriodo, entregues)),
        hint: delta(conta(doPeriodo, entregues), conta(doAnterior, entregues), comparavel),
        tom: 'ok' as Tom,
        corNumero: COR.ok,
        icone: <IcCheque />,
        fila: 'Entregues' as Fila,
      },
      {
        label: 'Com ocorrência',
        valor: String(nOcorrencia),
        hint: 'tentativa, retirada, extravio ou devolução',
        tom: 'erro' as Tom,
        corNumero: nOcorrencia ? COR.erro : undefined,
        icone: <IcExclama />,
        fila: 'Com ocorrência' as Fila,
      },
      {
        label: 'Parados há 72 h+',
        valor: String(nParados),
        hint: 'sem escaneamento novo da transportadora',
        tom: 'atencao' as Tom,
        corNumero: nParados ? COR.atencao : undefined,
        icone: <IcRelogioAlerta />,
        fila: 'Com ocorrência' as Fila,
      },
      {
        label: 'Aguardando baixa',
        valor: String(nBaixa),
        hint: 'entregue na Yampi, aberto na Shopify',
        tom: 'ouro' as Tom,
        corNumero: nBaixa ? COR.ouro : undefined,
        icone: <IcLoja />,
        fila: 'Aguardando baixa' as Fila,
      },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doPeriodo, doAnterior, filaDeBaixa.length])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      <FaixaIntegracoes
        shopifyLigada={shopifyLigada}
        avisosLigados={avisosLigados}
        emailPadrao={emailDoOperador}
      />

      {/* ── cartões ─────────────────────────────────────────────────────── */}
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
            aoClicar={
              m.fila ? () => setFila(fila === m.fila ? 'Todos' : (m.fila as Fila)) : undefined
            }
          />
        ))}
      </div>

      {erro && <Faixa tom="erro" texto={erro} aoFechar={() => setErro(null)} />}
      {recado && <Faixa tom="ok" texto={recado} aoFechar={() => setRecado(null)} />}

      {/* Fila de baixa: entregue na Yampi, aberto na loja — um clique fecha. */}
      {filaDeBaixa.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 13px',
            borderRadius: 'var(--radius-card)',
            background: 'rgba(92,158,112,.06)',
            border: '1px solid rgba(92,158,112,.24)',
          }}
        >
          <span
            aria-hidden
            className="animate-[fr-pulse_2.4s_ease-in-out_infinite]"
            style={{ width: 7, height: 7, borderRadius: 999, background: COR.ok, flex: 'none' }}
          />
          <span
            className="font-sans"
            style={{ flex: 1, fontSize: 11.5, lineHeight: 1.5, color: 'rgba(242,237,227,.85)' }}
          >
            {filaDeBaixa.length === 1
              ? `O pedido ${filaDeBaixa[0].p.id} foi entregue na Yampi e continua aberto na Shopify.`
              : `${filaDeBaixa.length} pedidos entregues na Yampi continuam abertos na Shopify.`}
          </span>
          <BotaoFiltro
            destaque
            desabilitado={pendente || !shopifyLigada}
            aoClicar={() => baixar(filaDeBaixa.map((v) => v.p.id))}
          >
            {pendente ? 'Baixando…' : 'Marcar entregues na Shopify'}
          </BotaoFiltro>
        </div>
      )}

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
        <Busca valor={busca} aoMudar={setBusca} />
        <CaixaSeletor rotulo="Período" valor={String(dias)} aoMudar={(v) => setDias(Number(v))}>
          {PERIODOS.map((p) => (
            <option key={p.dias} value={p.dias}>
              {p.rotulo}
            </option>
          ))}
        </CaixaSeletor>
        <CaixaSeletor
          rotulo="Status logístico"
          valor={statusLog}
          aoMudar={(v) => setStatusLog(v as typeof statusLog)}
        >
          <option value="Todos">Todos</option>
          {(Object.keys(ROTULO_LOGISTICO) as StatusLogistico[]).map((s) => (
            <option key={s} value={s}>
              {ROTULO_LOGISTICO[s]}
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

        <span style={{ flex: 1 }} />

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
      </div>

      {/* ── ações em massa ──────────────────────────────────────────────── */}
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
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
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
          icone={<IcAtualizar />}
          desabilitado={pendente || nSelecionados === 0}
          aoClicar={releituraEmMassa}
        >
          {pendente ? 'Consultando…' : 'Atualizar rastreamento'}
        </BotaoMassa>
        <BotaoMassa
          icone={<IcCheck />}
          desabilitado={pendente || nSelecionados === 0 || !shopifyLigada}
          aoClicar={baixarSelecionados}
        >
          Marcar entregues na Shopify
        </BotaoMassa>
        <BotaoMassa
          icone={<IcCopiar />}
          desabilitado={nSelecionados === 0}
          aoClicar={copiarRastreios}
        >
          Copiar rastreios
        </BotaoMassa>
        <BotaoMassa
          icone={<IcEnviar />}
          desabilitado
          titulo="Os avisos ao cliente estão desligados até o sistema rodar 100%."
          aoClicar={() => {}}
        >
          Enviar rastreio ao cliente
        </BotaoMassa>
      </div>

      {/* ── tabela ──────────────────────────────────────────────────────── */}
      <TabelaEnvios
        itens={filtrados}
        selecionados={selecionados}
        aberto={aberto}
        menuLinha={menuLinha}
        ancoraMenu={ancoraMenu}
        setMenuLinha={setMenuLinha}
        setAncoraMenu={setAncoraMenu}
        pendente={pendente}
        shopifyLigada={shopifyLigada}
        aoMarcar={alternar}
        aoAbrir={setAberto}
        aoBaixar={(id) => baixar([id])}
        aoAvisar={avisar}
        aoErro={setErro}
        vazio={
          filtroSujo
            ? 'Nenhum envio encontrado com estes filtros.'
            : 'Nenhum envio nesta janela de período.'
        }
      />

      {abertoAgora && (
        <FichaDoPedido
          pedido={abertoAgora.p}
          sla={slaDeExpedicao(abertoAgora.p)}
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

const GRADE =
  '26px 148px minmax(140px,1fr) 148px 128px 128px minmax(210px,1.25fr) 148px 60px'

const COLUNAS = [
  'Pedido',
  'Cliente',
  'Transportadora',
  'Código',
  'Status logístico',
  'Último evento',
  'Shopify',
  'Ações',
]

function TabelaEnvios({
  itens,
  selecionados,
  aberto,
  menuLinha,
  ancoraMenu,
  setMenuLinha,
  setAncoraMenu,
  pendente,
  shopifyLigada,
  aoMarcar,
  aoAbrir,
  aoBaixar,
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
  pendente: boolean
  shopifyLigada: boolean
  aoMarcar: (id: string) => void
  aoAbrir: (id: string) => void
  aoBaixar: (id: string) => void
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
        <div style={{ minWidth: 1280 }}>
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
            const quando = dataHora(v.log.desde) ?? dataHora(v.p.rastreioLidoEm)

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
                  secundaria={dataHora(v.p.compradoEm) ?? v.p.data}
                />

                <Dupla principal={v.p.cliente} secundaria={v.p.destino || '—'} />

                <Dupla
                  principal={
                    v.p.entregaLocal ? 'Entrega local' : (v.p.transportadora ?? 'Não identificada')
                  }
                  secundaria={
                    v.p.entregaLocal ? 'Motoboy' : (servicoLegivel(v.p.servicoFrete) ?? v.p.gateway)
                  }
                />

                {v.p.rastreio ? (
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 10.5,
                      color: 'rgba(242,237,227,.8)',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {v.p.rastreio}
                  </span>
                ) : (
                  <span className="font-mono" style={{ fontSize: 10.5, color: 'rgba(242,237,227,.35)' }}>
                    Sem código
                  </span>
                )}

                <Pilula tom={TOM_LOGISTICO[v.log.status]}>{ROTULO_LOGISTICO[v.log.status]}</Pilula>

                {/* O evento CRU da transportadora, resumido — é ele que o
                    atendimento lê para o cliente; a tradução fica no badge. */}
                <Dupla
                  principal={v.log.original ? resumirEvento(v.log.original) : '—'}
                  secundaria={quando ? `Atualizado: ${quando}` : 'Sem leitura ainda'}
                />

                <span onClick={(e) => e.stopPropagation()}>
                  {v.p.entregaShopifyEm || (!v.aguardaBaixa && v.p.situacao === 'entregue' && v.p.shopifyNumero) ? (
                    <Pilula tom="ok">Baixado na loja</Pilula>
                  ) : v.aguardaBaixa ? (
                    <button
                      type="button"
                      onClick={() => aoBaixar(v.p.id)}
                      disabled={pendente || !shopifyLigada}
                      className="font-sans hover:bg-[rgba(239,209,140,.18)]"
                      style={{
                        height: 26,
                        padding: '0 10px',
                        border: '1px solid rgba(239,209,140,.35)',
                        background: 'rgba(239,209,140,.09)',
                        color: COR.ouro,
                        fontWeight: 600,
                        fontSize: 10.5,
                        borderRadius: 7,
                        cursor: pendente ? 'wait' : 'pointer',
                        whiteSpace: 'nowrap',
                        opacity: shopifyLigada ? 1 : 0.4,
                      }}
                    >
                      Marcar entregue
                    </button>
                  ) : !v.p.shopifyNumero ? (
                    <Pilula tom="neutro">Sem par na loja</Pilula>
                  ) : (
                    <Pilula tom="neutro">Aberto na loja</Pilula>
                  )}
                </span>

                <span
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
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
                      {v.aguardaBaixa && shopifyLigada && (
                        <ItemMenu
                          aoClicar={() => {
                            aoBaixar(v.p.id)
                            setMenuLinha(null)
                          }}
                        >
                          Marcar entregue na Shopify
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

      <footer
        style={{
          padding: '9px 16px',
          borderTop: '1px solid var(--color-borda-sutil)',
          background: 'var(--color-cabecalho)',
        }}
      >
        <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
          {itens.length} envio{itens.length === 1 ? '' : 's'} na lista · a varredura de rastreio
          roda de hora em hora no servidor
        </span>
      </footer>
    </section>
  )
}

// ── integrações e aviso de envio ───────────────────────────────────────────

/**
 * O estado das integrações numa linha, com o ensaio do aviso de envio.
 *
 * O teste manda para UM endereço, com [TESTE] no assunto, usando pedidos
 * reais — e não grava no log, para não consumir o direito do cliente de
 * receber o aviso quando o módulo ligar.
 */
function FaixaIntegracoes({
  shopifyLigada,
  avisosLigados,
  emailPadrao,
}: {
  shopifyLigada: boolean
  avisosLigados: boolean
  emailPadrao: string | null
}) {
  const [testeAberto, setTesteAberto] = useState(false)
  const [email, setEmail] = useState(emailPadrao ?? '')
  const [recado, setRecado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)

  const testar = () => {
    setEnviando(true)
    setRecado(null)
    void testarAvisoDeEnvio(email)
      .then((r) => {
        if (!r.ok) return setRecado({ tom: 'erro', texto: r.erro })
        setRecado({
          tom: 'ok',
          texto: r.falhas.length
            ? `Falhou: ${r.falhas.join(' · ')}`
            : `${r.enviados} aviso(s) de teste enviado(s) para ${email} — chegam com [TESTE] no assunto.`,
        })
      })
      .finally(() => setEnviando(false))
  }

  const Chip = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
    <span
      className="font-sans"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(242,237,227,.6)' }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: ok ? COR.ok : COR.atencao,
        }}
      />
      {children}
    </span>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', minHeight: 30 }}>
        <Chip ok>Yampi — rastreio e entrega</Chip>
        <Chip ok={shopifyLigada}>
          {shopifyLigada ? 'Shopify — pronta para a baixa' : 'Shopify — sem credencial'}
        </Chip>
        <Chip ok={avisosLigados}>
          {avisosLigados ? 'Avisos ao cliente ligados' : 'Avisos ao cliente desligados'}
        </Chip>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setTesteAberto((v) => !v)}
          className="font-sans hover:text-ouro"
          style={{
            border: 0,
            background: 'transparent',
            padding: 0,
            fontSize: 10,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: 'rgba(242,237,227,.4)',
            cursor: 'pointer',
          }}
        >
          {testeAberto ? '− Testar aviso de envio' : '+ Testar aviso de envio'}
        </button>
      </div>

      {testeAberto && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            flexWrap: 'wrap',
            padding: '10px 12px',
            border: '1px solid var(--color-borda)',
            borderRadius: 'var(--radius-card)',
            background: 'var(--color-mesa)',
          }}
        >
          <span className="font-sans" style={{ fontSize: 11, color: 'rgba(242,237,227,.6)' }}>
            Manda o e-mail real de aviso, com pedidos reais, só para você:
          </span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className="font-sans focus:border-ouro/45"
            style={{
              height: 30,
              padding: '0 10px',
              minWidth: 220,
              border: '1px solid rgba(255,255,255,.12)',
              borderRadius: 8,
              background: 'rgba(255,255,255,.03)',
              color: 'var(--color-corrente)',
              fontSize: 11.5,
              outline: 0,
            }}
          />
          <BotaoFiltro destaque desabilitado={enviando || !email.includes('@')} aoClicar={testar}>
            {enviando ? 'Enviando…' : 'Enviar teste'}
          </BotaoFiltro>
          {recado && (
            <span
              className="font-sans"
              style={{ fontSize: 11, color: recado.tom === 'ok' ? COR.ok : COR.erro }}
            >
              {recado.texto}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ── csv ────────────────────────────────────────────────────────────────────

function baixarCsv(itens: Viva[]) {
  const cabecalho = [
    'Pedido',
    'Data',
    'Cliente',
    'Cidade/UF',
    'Transportadora',
    'Servico',
    'Rastreio',
    'Status logistico',
    'Ultimo evento',
    'Atualizado em',
    'Shopify',
  ]
  const escapa = (s: string) => `"${s.replace(/"/g, '""')}"`
  const linhas = itens.map((v) =>
    [
      v.p.id,
      dataHora(v.p.compradoEm) ?? v.p.data,
      v.p.cliente,
      v.p.destino,
      v.p.entregaLocal ? 'Entrega local' : (v.p.transportadora ?? ''),
      servicoLegivel(v.p.servicoFrete) ?? '',
      v.p.rastreio ?? '',
      ROTULO_LOGISTICO[v.log.status],
      v.log.original ? resumirEvento(v.log.original) : '',
      v.log.desde ? (dataHora(v.log.desde) ?? '') : '',
      v.p.entregaShopifyEm ? 'Baixado' : v.aguardaBaixa ? 'Aguardando baixa' : v.p.shopifyNumero ? 'Aberto' : 'Sem par',
    ]
      .map((c) => escapa(String(c)))
      .join(';'),
  )
  const csv = '﻿' + [cabecalho.join(';'), ...linhas].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `envios-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── ícones próprios desta tela ─────────────────────────────────────────────

const IcRota = () => (
  <Svg>
    <circle cx="6" cy="18" r="2.2" />
    <circle cx="18" cy="6" r="2.2" />
    <path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" />
  </Svg>
)
const IcExclama = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.8v4.6" />
    <path d="M12 16h.01" />
  </Svg>
)
const IcLoja = () => (
  <Svg>
    <path d="M4 9.5 5.5 4h13L20 9.5" />
    <path d="M4 9.5a2.6 2.6 0 0 0 5.3 0 2.6 2.6 0 0 0 5.4 0 2.6 2.6 0 0 0 5.3 0" />
    <path d="M5.5 12v8h13v-8" />
    <path d="M9.5 20v-5h5v5" />
  </Svg>
)
