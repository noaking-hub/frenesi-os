'use client'

import { useMemo, useState, useTransition } from 'react'

import { Modal } from '@/components/erp/Modal'
import { COR, type Tom } from '@/components/erp/tokens'
import {
  ROTULO_ESTADO_OCORRENCIA,
  ROTULO_OCORRENCIA,
  brl,
  diasAlemDoPrazo,
  ocorrenciaAberta,
  plural,
  resumirOcorrencias,
} from '@/domain'
import type { EstadoOcorrencia, Ocorrencia, TipoOcorrencia } from '@/domain'

import { BotaoFicha, Nota } from '../FichaDoPedido'
import {
  Aba,
  BotaoFiltro,
  BotaoIcone,
  Busca,
  CaixaSeletor,
  CardMetrica,
  Dupla,
  Faixa,
  IcAlerta,
  IcCaixaFechada,
  IcCheque,
  IcExportar,
  IcKebab,
  IcLixeira,
  IcRelogioAlerta,
  IcXCirculo,
  ItemMenu,
  Menu,
  Pilula,
} from '../PedidosCliente'

import { moverOcorrencia, registrarOcorrencia, varrerParados } from './actions'

/**
 * Ocorrências de entrega — o que travou na mão da transportadora.
 *
 * Mesmas peças de Todos os pedidos, e é a última tela do módulo a receber o
 * padrão. O centro aqui é a FILA DE COBRANÇA: cada linha é um chamado com a
 * transportadora, e mudar o estado (com o telefone na orelha) é a ação mais
 * frequente — por isso o select mora na própria linha.
 */

const TOM_TIPO: Record<TipoOcorrencia, Tom> = {
  extravio: 'erro',
  avaria: 'erro',
  'entrega-nao-efetuada': 'erro',
  'sem-movimentacao': 'erro',
  atraso: 'atencao',
  'endereco-insuficiente': 'atencao',
}

const TOM_ESTADO: Record<EstadoOcorrencia, Tom> = {
  aberta: 'erro',
  'aguardando-cliente': 'atencao',
  'em-indenizacao': 'info',
  resolvida: 'ok',
}

const TIPOS: TipoOcorrencia[] = [
  'sem-movimentacao',
  'atraso',
  'extravio',
  'avaria',
  'endereco-insuficiente',
  'entrega-nao-efetuada',
]

const ESTADOS: EstadoOcorrencia[] = ['aberta', 'aguardando-cliente', 'em-indenizacao', 'resolvida']

type Fila =
  | 'Todas'
  | 'Abertas'
  | 'Aguardando cliente'
  | 'Além do prazo'
  | 'Em indenização'
  | 'Resolvidas'

const FILAS: Fila[] = [
  'Todas',
  'Abertas',
  'Aguardando cliente',
  'Além do prazo',
  'Em indenização',
  'Resolvidas',
]

export function OcorrenciasCliente({
  ocorrencias,
  ligado,
}: {
  ocorrencias: Ocorrencia[]
  ligado: boolean
}) {
  const [fila, setFila] = useState<Fila>('Todas')
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState<'Todos' | TipoOcorrencia>('Todos')
  const [menuLinha, setMenuLinha] = useState<string | null>(null)
  const [ancoraMenu, setAncoraMenu] = useState<{ x: number; y: number } | null>(null)

  const [registrando, setRegistrando] = useState(false)
  const [resolvendo, setResolvendo] = useState<string | null>(null)

  // Espelho local do que já foi gravado, para o select não voltar ao estado
  // antigo no intervalo entre a gravação e a revalidação da rota.
  const [estados, setEstados] = useState<Record<string, EstadoOcorrencia>>({})
  const [recado, setRecado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const estadoDe = (o: Ocorrencia): EstadoOcorrencia => estados[o.id] ?? o.estado

  const avisar = (texto: string) => {
    setErro(null)
    setRecado(texto)
  }

  const mover = (o: Ocorrencia, novo: EstadoOcorrencia, desfecho = '') => {
    setErro(null)
    setRecado(null)
    if (!ligado) {
      setErro('Sem o Supabase configurado a mudança não seria gravada em lugar nenhum.')
      return
    }
    iniciar(async () => {
      const r = await moverOcorrencia(o.id, novo, '', desfecho)
      if (!r.ok) return setErro(r.erro)
      setEstados((s) => ({ ...s, [o.id]: novo }))
      setResolvendo(null)
      if (novo === 'resolvida') avisar(`${o.id} resolvida — desfecho registrado.`)
    })
  }

  const varrer = () => {
    setErro(null)
    setRecado(null)
    iniciar(async () => {
      const r = await varrerParados()
      if (!r.ok) return setErro(r.erro)
      avisar(
        r.novas === 0
          ? 'Nenhum pedido novo parado nos últimos 90 dias — a fila já está completa.'
          : `${r.novas} ocorrência(s) aberta(s) para pedidos em trânsito há mais de 15 dias.`,
      )
    })
  }

  const registrar = (dados: { pedidoId: string; tipo: TipoOcorrencia; acao: string; prazoDias: number }) => {
    setErro(null)
    setRecado(null)
    if (!ligado) {
      setErro('Sem o Supabase configurado a ocorrência não seria gravada em lugar nenhum.')
      return
    }
    iniciar(async () => {
      const r = await registrarOcorrencia(dados)
      if (!r.ok) return setErro(r.erro)
      setRegistrando(false)
      avisar(`Ocorrência ${r.id} aberta para o pedido ${dados.pedidoId}.`)
    })
  }

  // ── recortes ─────────────────────────────────────────────────────────────

  const PREDICADO: Record<Fila, (o: Ocorrencia) => boolean> = {
    Todas: () => true,
    Abertas: (o) => estadoDe(o) !== 'resolvida',
    'Aguardando cliente': (o) => estadoDe(o) === 'aguardando-cliente',
    'Além do prazo': (o) => estadoDe(o) !== 'resolvida' && diasAlemDoPrazo(o) > 0,
    'Em indenização': (o) => estadoDe(o) === 'em-indenizacao',
    Resolvidas: (o) => estadoDe(o) === 'resolvida',
  }

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return ocorrencias.filter((o) => {
      if (!PREDICADO[fila](o)) return false
      if (tipo !== 'Todos' && o.tipo !== tipo) return false
      if (!termo) return true
      return [o.id, o.pedidoId, o.cliente, o.destino, o.rastreio, o.transportadora, o.acao]
        .join(' ')
        .toLowerCase()
        .includes(termo)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocorrencias, fila, tipo, busca, estados])

  const contarFila = (f: Fila) => ocorrencias.filter(PREDICADO[f]).length
  const filtroSujo = fila !== 'Todas' || tipo !== 'Todos' || busca.trim() !== ''
  const limpar = () => {
    setFila('Todas')
    setTipo('Todos')
    setBusca('')
  }

  const emResolucao = resolvendo ? (ocorrencias.find((o) => o.id === resolvendo) ?? null) : null

  // O resumo usa o estado ESPELHADO, senão o cartão discorda da linha logo
  // depois de mover uma ocorrência.
  const resumo = useMemo(
    () => resumirOcorrencias(ocorrencias.map((o) => ({ ...o, estado: estadoDe(o) }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ocorrencias, estados],
  )
  const nIndenizacao = contarFila('Em indenização')
  const nResolvidas = contarFila('Resolvidas')

  const metricas = [
    {
      label: 'Ocorrências abertas',
      valor: String(resumo.abertas),
      hint: `de ${ocorrencias.length} registradas`,
      tom: 'erro' as Tom,
      corNumero: resumo.abertas ? COR.erro : undefined,
      icone: <IcAlerta />,
      fila: 'Abertas' as Fila,
    },
    {
      label: 'Aguardando cliente',
      valor: String(resumo.aguardandoCliente),
      hint: 'dependem de uma resposta para andar',
      tom: 'atencao' as Tom,
      corNumero: resumo.aguardandoCliente ? COR.atencao : undefined,
      icone: <IcRelogioAlerta />,
      fila: 'Aguardando cliente' as Fila,
    },
    {
      label: 'Além do prazo',
      valor: String(resumo.atrasadas),
      hint: resumo.atrasadas
        ? `${plural(resumo.mediaAtraso, 'dia', 'dias')} de atraso em média`
        : 'todas dentro do prazo da transportadora',
      tom: 'erro' as Tom,
      corNumero: resumo.atrasadas ? COR.erro : undefined,
      icone: <IcXCirculo />,
      fila: 'Além do prazo' as Fila,
    },
    {
      label: 'Em indenização',
      valor: String(nIndenizacao),
      hint: 'extravio ou avaria em ressarcimento',
      tom: 'info' as Tom,
      icone: <IcCaixaFechada />,
      fila: 'Em indenização' as Fila,
    },
    {
      label: 'Resolvidas',
      valor: String(nResolvidas),
      hint: 'reenvio, indenização ou entrega concluída',
      tom: 'ok' as Tom,
      corNumero: nResolvidas ? COR.ok : undefined,
      icone: <IcCheque />,
      fila: 'Resolvidas' as Fila,
    },
    {
      label: 'Valor parado',
      valor: brl(resumo.valorParado),
      hint: 'nos pedidos com ocorrência aberta',
      tom: 'ouro' as Tom,
      corNumero: resumo.valorParado > 0 ? COR.ouro : undefined,
      icone: <IcExportar />,
      fila: null,
    },
  ]

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
        <CaixaSeletor rotulo="Tipo" valor={tipo} aoMudar={(v) => setTipo(v as typeof tipo)}>
          <option value="Todos">Todos</option>
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {ROTULO_OCORRENCIA[t]}
            </option>
          ))}
        </CaixaSeletor>

        <span style={{ flex: 1 }} />

        <BotaoFiltro desabilitado={!filtroSujo} aoClicar={limpar}>
          <IcLixeira /> Limpar filtros
        </BotaoFiltro>
        <BotaoFiltro desabilitado={pendente || !ligado} aoClicar={varrer}>
          {pendente ? 'Varrendo…' : 'Varrer pedidos parados'}
        </BotaoFiltro>
        <BotaoFiltro destaque aoClicar={() => setRegistrando(true)}>
          + Registrar ocorrência
        </BotaoFiltro>
      </div>

      <TabelaOcorrencias
        itens={filtradas}
        ligado={ligado}
        pendente={pendente}
        menuLinha={menuLinha}
        ancoraMenu={ancoraMenu}
        setMenuLinha={setMenuLinha}
        setAncoraMenu={setAncoraMenu}
        estadoDe={estadoDe}
        aoMover={(o, novo) => {
          // Fechar sem dizer o desfecho apaga o motivo justamente do caso que
          // alguém vai querer reler daqui a três meses — a resolução passa
          // pelo modal.
          if (novo === 'resolvida') setResolvendo(o.id)
          else mover(o, novo)
        }}
        aoAvisar={avisar}
        aoErro={setErro}
        vazio={
          filtroSujo
            ? 'Nenhuma ocorrência encontrada com estes filtros.'
            : 'Nenhuma ocorrência registrada. A varredura abre sozinha as de pedido parado; extravio e avaria entram pelo registro manual.'
        }
      />

      <Nota>
        A varredura abre ocorrência para pedido em trânsito há mais de 15 dias sem entrega
        confirmada, dentro dos últimos 90 dias — é o que dá para afirmar sem a transportadora
        integrada. Extravio e avaria continuam sendo registro manual, porque só quem falou com a
        transportadora sabe.
      </Nota>

      {registrando && (
        <ModalRegistrar
          pendente={pendente}
          aoConfirmar={registrar}
          aoFechar={() => setRegistrando(false)}
        />
      )}

      {emResolucao && (
        <ModalDesfecho
          ocorrencia={emResolucao}
          pendente={pendente}
          aoConfirmar={(desfecho) => mover(emResolucao, 'resolvida', desfecho)}
          aoFechar={() => setResolvendo(null)}
        />
      )}
    </div>
  )
}

// ── tabela ─────────────────────────────────────────────────────────────────

const GRADE =
  '96px minmax(150px,1fr) 160px 150px 104px minmax(190px,1.25fr) 168px 34px'

const COLUNAS = [
  'Nº',
  'Pedido e cliente',
  'Tipo',
  'Transportadora',
  'Valor',
  'Ação necessária',
  'Estado',
  '',
]

function TabelaOcorrencias({
  itens,
  ligado,
  pendente,
  menuLinha,
  ancoraMenu,
  setMenuLinha,
  setAncoraMenu,
  estadoDe,
  aoMover,
  aoAvisar,
  aoErro,
  vazio,
}: {
  itens: Ocorrencia[]
  ligado: boolean
  pendente: boolean
  menuLinha: string | null
  ancoraMenu: { x: number; y: number } | null
  setMenuLinha: (id: string | null) => void
  setAncoraMenu: (a: { x: number; y: number } | null) => void
  estadoDe: (o: Ocorrencia) => EstadoOcorrencia
  aoMover: (o: Ocorrencia, novo: EstadoOcorrencia) => void
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
      <div className="tabela-grade">
      <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 330px)', minHeight: 200 }}>
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
            {COLUNAS.map((t, i) => (
              <span
                key={`${t}-${i}`}
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

          {itens.map((o) => {
            const estado = estadoDe(o)
            const alem = diasAlemDoPrazo(o)
            const aberta = estado !== 'resolvida'
            return (
              <div
                key={o.id}
                data-linha={o.id}
                className="hover:bg-[rgba(239,209,140,.04)]"
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRADE,
                  gap: 10,
                  alignItems: 'center',
                  padding: '8px 14px',
                  borderTop: '1px solid var(--color-borda-sutil)',
                  borderLeft: `2px solid ${aberta ? (alem ? COR.erro : COR.atencao) : 'transparent'}`,
                }}
              >
                <Dupla
                  principal={
                    <span className="font-mono" style={{ fontSize: 11.5, fontWeight: 700, color: COR.ouro }}>
                      {o.id}
                    </span>
                  }
                  secundaria={o.abertura}
                />

                <Dupla principal={o.cliente} secundaria={`${o.pedidoId} · ${o.destino}`} />

                <Dupla
                  principal={
                    <span style={{ color: COR[TOM_TIPO[o.tipo]], fontWeight: 600 }}>
                      {ROTULO_OCORRENCIA[o.tipo]}
                    </span>
                  }
                  secundaria={
                    alem
                      ? `${plural(alem, 'dia', 'dias')} além do prazo`
                      : 'dentro do prazo da transportadora'
                  }
                />

                <Dupla
                  principal={o.transportadora || '—'}
                  secundaria={
                    <span className="font-mono" style={{ fontSize: 10, color: 'rgba(239,209,140,.5)' }}>
                      {o.rastreio || 'sem código'}
                    </span>
                  }
                />

                <Dupla
                  principal={
                    <span className="font-mono" style={{ fontSize: 11 }}>
                      {brl(o.valor)}
                    </span>
                  }
                  secundaria={`aberta há ${plural(o.dias, 'dia', 'dias')}`}
                />

                <span
                  className="font-sans"
                  style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--color-secundario)', textWrap: 'pretty' }}
                >
                  {o.acao}
                </span>

                {/* Trocar o estado é a ação principal desta tela: quem
                    acompanha chamado de transportadora muda o estado o tempo
                    todo — por isso o select mora na linha. */}
                <span style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                  <Pilula tom={TOM_ESTADO[estado]}>{ROTULO_ESTADO_OCORRENCIA[estado]}</Pilula>
                  <select
                    value={estado}
                    disabled={pendente || !ligado}
                    onChange={(e) => aoMover(o, e.target.value as EstadoOcorrencia)}
                    className="font-sans"
                    style={{
                      height: 26,
                      padding: '0 8px',
                      border: '1px solid rgba(255,255,255,.11)',
                      background: 'rgba(255,255,255,.03)',
                      borderRadius: 7,
                      color: 'var(--color-corrente)',
                      fontSize: 10.5,
                      outline: 0,
                      opacity: pendente ? 0.5 : 1,
                      cursor: ligado ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {ESTADOS.map((e) => (
                      <option key={e} value={e}>
                        {ROTULO_ESTADO_OCORRENCIA[e]}
                      </option>
                    ))}
                  </select>
                </span>

                <span style={{ display: 'flex', alignItems: 'center' }}>
                  <BotaoIcone
                    rotulo={`Ações de ${o.id}`}
                    menuAberto={menuLinha === o.id}
                    aoClicar={(e) => {
                      const r = e.currentTarget.getBoundingClientRect()
                      setAncoraMenu({ x: r.right, y: r.bottom })
                      setMenuLinha(menuLinha === o.id ? null : o.id)
                    }}
                  >
                    <IcKebab />
                  </BotaoIcone>
                  {menuLinha === o.id && ancoraMenu && (
                    <Menu fixo={ancoraMenu} aoFechar={() => setMenuLinha(null)}>
                      {o.rastreio && (
                        <ItemMenu
                          aoClicar={() => {
                            copiar(o.rastreio, 'Código de rastreio')
                            setMenuLinha(null)
                          }}
                        >
                          Copiar rastreio
                        </ItemMenu>
                      )}
                      <ItemMenu
                        aoClicar={() => {
                          copiar(o.pedidoId, 'Número do pedido')
                          setMenuLinha(null)
                        }}
                      >
                        Copiar nº do pedido
                      </ItemMenu>
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
          Uma ocorrência por cartão, com o select de estado no rodapé — mudar
          o estado é a ação principal da tela e continua a um toque. */}
      <div className="tabela-cartoes" style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
        {itens.length === 0 && (
          <p
            className="font-sans"
            style={{ padding: '40px 20px', textAlign: 'center', fontSize: 12, color: 'var(--color-terciario)' }}
          >
            {vazio}
          </p>
        )}
        {itens.map((o) => {
          const estado = estadoDe(o)
          const alem = diasAlemDoPrazo(o)
          const aberta = estado !== 'resolvida'
          return (
            <div
              key={o.id}
              data-linha={o.id}
              style={{
                padding: '12px 14px',
                borderTop: '1px solid var(--color-borda-sutil)',
                borderLeft: `2px solid ${aberta ? (alem ? COR.erro : COR.atencao) : 'transparent'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="font-mono" style={{ fontSize: 12, fontWeight: 700, color: COR.ouro }}>
                  {o.id}
                </span>
                <span style={{ marginLeft: 'auto' }}>
                  <Pilula tom={TOM_ESTADO[estado]}>{ROTULO_ESTADO_OCORRENCIA[estado]}</Pilula>
                </span>
              </div>

              <div style={{ paddingTop: 7 }}>
                <Dupla principal={o.cliente} secundaria={`${o.pedidoId} · ${o.destino}`} />
              </div>
              <div style={{ paddingTop: 6 }}>
                <Dupla
                  principal={
                    <span style={{ color: COR[TOM_TIPO[o.tipo]], fontWeight: 600 }}>
                      {ROTULO_OCORRENCIA[o.tipo]}
                    </span>
                  }
                  secundaria={
                    alem
                      ? `${plural(alem, 'dia', 'dias')} além do prazo`
                      : 'dentro do prazo da transportadora'
                  }
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 8 }}>
                <Dupla
                  principal={o.transportadora || '—'}
                  secundaria={
                    <span className="font-mono" style={{ fontSize: 10, color: 'rgba(239,209,140,.5)' }}>
                      {o.rastreio || 'sem código'}
                    </span>
                  }
                />
                <Dupla
                  principal={
                    <span className="font-mono" style={{ fontSize: 11 }}>{brl(o.valor)}</span>
                  }
                  secundaria={`aberta há ${plural(o.dias, 'dia', 'dias')}`}
                />
              </div>

              <p
                className="font-sans"
                style={{ margin: 0, paddingTop: 8, fontSize: 11, lineHeight: 1.45, color: 'var(--color-secundario)' }}
              >
                {o.acao}
              </p>

              <div style={{ paddingTop: 9 }}>
                <select
                  value={estado}
                  disabled={pendente || !ligado}
                  onChange={(e) => aoMover(o, e.target.value as EstadoOcorrencia)}
                  className="font-sans"
                  style={{
                    height: 32,
                    width: '100%',
                    padding: '0 8px',
                    border: '1px solid rgba(255,255,255,.11)',
                    background: 'rgba(255,255,255,.03)',
                    borderRadius: 7,
                    color: 'var(--color-corrente)',
                    fontSize: 11,
                    outline: 0,
                    opacity: pendente ? 0.5 : 1,
                    cursor: ligado ? 'pointer' : 'not-allowed',
                  }}
                >
                  {ESTADOS.map((e) => (
                    <option key={e} value={e}>
                      {ROTULO_ESTADO_OCORRENCIA[e]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── modais ─────────────────────────────────────────────────────────────────

/** Registro manual — extravio e avaria só entram por quem falou com a transportadora. */
function ModalRegistrar({
  pendente,
  aoConfirmar,
  aoFechar,
}: {
  pendente: boolean
  aoConfirmar: (dados: { pedidoId: string; tipo: TipoOcorrencia; acao: string; prazoDias: number }) => void
  aoFechar: () => void
}) {
  const [pedidoId, setPedidoId] = useState('')
  const [tipo, setTipo] = useState<TipoOcorrencia>('sem-movimentacao')
  const [acao, setAcao] = useState('Cobrar posição da transportadora')
  const [prazo, setPrazo] = useState('5')
  const [aviso, setAviso] = useState<string | null>(null)

  const campo = {
    height: 34,
    padding: '0 10px',
    border: '1px solid rgba(255,255,255,.14)',
    borderRadius: 8,
    background: 'rgba(255,255,255,.04)',
    color: 'var(--color-corrente)',
    fontSize: 12.5,
    outline: 0,
  } as const

  const confirmar = () => {
    if (!pedidoId.trim()) {
      setAviso('Informe o número do pedido.')
      return
    }
    const prazoDias = Number(prazo)
    if (!Number.isFinite(prazoDias) || prazoDias <= 0) {
      setAviso('Informe o prazo em dias para a próxima posição.')
      return
    }
    setAviso(null)
    aoConfirmar({ pedidoId: pedidoId.trim(), tipo, acao: acao.trim(), prazoDias })
  }

  return (
    <Modal titulo="Registrar ocorrência" largura={480} padding={0} aoFechar={aoFechar}>
      <CabecalhoModal titulo="Registrar ocorrência" aoFechar={aoFechar} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13, padding: '16px 20px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <RotuloModal>Número do pedido</RotuloModal>
          <input
            value={pedidoId}
            onChange={(e) => setPedidoId(e.target.value)}
            placeholder="YP-…"
            className="font-mono focus:border-ouro/50"
            style={campo}
          />
        </label>
        <CaixaSeletor rotulo="Tipo da ocorrência" valor={tipo} aoMudar={(v) => setTipo(v as TipoOcorrencia)}>
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {ROTULO_OCORRENCIA[t]}
            </option>
          ))}
        </CaixaSeletor>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <RotuloModal>O que fazer agora</RotuloModal>
          <input
            value={acao}
            onChange={(e) => setAcao(e.target.value)}
            className="font-sans focus:border-ouro/50"
            style={campo}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 160 }}>
          <RotuloModal>Prazo para posição (dias)</RotuloModal>
          <input
            value={prazo}
            onChange={(e) => setPrazo(e.target.value)}
            inputMode="numeric"
            className="font-mono focus:border-ouro/50"
            style={{ ...campo, textAlign: 'right' }}
          />
        </label>
        {aviso && (
          <span className="font-sans" style={{ fontSize: 11.5, color: COR.erro }}>
            {aviso}
          </span>
        )}
      </div>
      <RodapeModal
        pendente={pendente}
        textoConfirmar={pendente ? 'Gravando…' : 'Abrir ocorrência'}
        aoConfirmar={confirmar}
        aoFechar={aoFechar}
      />
    </Modal>
  )
}

/** O desfecho é a memória do caso — resolver sem contar como terminou apaga
    o motivo justamente do caso que alguém vai reler daqui a três meses. */
function ModalDesfecho({
  ocorrencia: o,
  pendente,
  aoConfirmar,
  aoFechar,
}: {
  ocorrencia: Ocorrencia
  pendente: boolean
  aoConfirmar: (desfecho: string) => void
  aoFechar: () => void
}) {
  const [desfecho, setDesfecho] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  return (
    <Modal titulo={`Resolver ${o.id}`} largura={480} padding={0} aoFechar={aoFechar}>
      <CabecalhoModal titulo={`Resolver ${o.id}`} aoFechar={aoFechar} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 20px' }}>
        <Nota>
          {`${ROTULO_OCORRENCIA[o.tipo]} do pedido ${o.pedidoId} · ${o.cliente}. Como o caso terminou?`}
        </Nota>
        <textarea
          value={desfecho}
          onChange={(e) => setDesfecho(e.target.value)}
          placeholder="Ex.: pacote localizado e entregue em 15/08 · indenização paga pela transportadora · reenvio feito no pedido YP-…"
          rows={4}
          className="font-sans focus:border-ouro/50"
          style={{
            padding: '10px 12px',
            border: '1px solid rgba(255,255,255,.14)',
            borderRadius: 8,
            background: 'rgba(255,255,255,.04)',
            color: 'var(--color-corrente)',
            fontSize: 12.5,
            lineHeight: 1.55,
            outline: 0,
            resize: 'vertical',
          }}
        />
        {aviso && (
          <span className="font-sans" style={{ fontSize: 11.5, color: COR.erro }}>
            {aviso}
          </span>
        )}
      </div>
      <RodapeModal
        pendente={pendente}
        textoConfirmar={pendente ? 'Gravando…' : 'Resolver ocorrência'}
        aoConfirmar={() => {
          if (!desfecho.trim()) {
            setAviso('Conte como o caso terminou — é a memória da ocorrência.')
            return
          }
          setAviso(null)
          aoConfirmar(desfecho.trim())
        }}
        aoFechar={aoFechar}
      />
    </Modal>
  )
}

// ── peças dos modais ───────────────────────────────────────────────────────

function CabecalhoModal({ titulo, aoFechar }: { titulo: string; aoFechar: () => void }) {
  return (
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
        {titulo}
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
  )
}

function RodapeModal({
  pendente,
  textoConfirmar,
  aoConfirmar,
  aoFechar,
}: {
  pendente: boolean
  textoConfirmar: string
  aoConfirmar: () => void
  aoFechar: () => void
}) {
  return (
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
      <BotaoFicha primario desabilitado={pendente} aoClicar={aoConfirmar}>
        {textoConfirmar}
      </BotaoFicha>
    </div>
  )
}

function RotuloModal({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
      {children}
    </span>
  )
}
