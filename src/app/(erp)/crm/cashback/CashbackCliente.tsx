'use client'

import { useRouter } from 'next/navigation'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, BotaoOuro, BotaoSecundario, Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import type { CarteiraYampi, MovimentoCashback } from '@/data/cashback'
import {
  ROTULO_PERIODO,
  brl,
  diasAteVencer,
  naFaixa,
  plural,
  type FaixaVencimento,
  type MetricasCashback,
  type Periodo,
} from '@/domain'

import { enviarAvisoCashback, extratoDoCliente, metricasCashbackDoPeriodo } from './actions'

const dataHoraBr = (iso: string | null) =>
  iso
    ? new Date(iso.includes('T') || iso.includes('Z') ? iso : `${iso.replace(' ', 'T')}-03:00`).toLocaleString(
        'pt-BR',
        { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' },
      )
    : '—'

const dataBr = (iso: string | null) =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—'

const telefoneBr = (digitos: string | null) => {
  if (!digitos) return '—'
  const d = digitos.replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return digitos
}

const PERIODOS: Periodo[] = ['hoje', 'ontem', '7dias', 'mes', 'ano']

const FAIXAS: { chave: FaixaVencimento; rotulo: string }[] = [
  { chave: 'todos', rotulo: 'Todos' },
  { chave: '7', rotulo: 'Vence em 7 dias' },
  { chave: '15', rotulo: 'Vence em 15 dias' },
  { chave: '30', rotulo: 'Vence em 30 dias' },
  { chave: 'expirados', rotulo: 'Expirados' },
]

/** Urgência do vencimento vira cor: é por ela que a operação decide o dia. */
function tomDoVencimento(dias: number | null): Tom {
  if (dias === null) return 'neutro'
  if (dias < 0) return 'erro'
  if (dias <= 7) return 'atencao'
  if (dias <= 30) return 'ouro'
  return 'neutro'
}

/**
 * Gestão do cashback: quem tem saldo, quanto vence quando, e o aviso.
 *
 * Nada se lança aqui — crédito, resgate e expiração acontecem no checkout da
 * Yampi. O que esta tela dá é o que o checkout não dá: a fila de quem está
 * prestes a perder saldo, e um e-mail da marca para lembrar em um clique.
 */
export function CashbackCliente({
  carteiras,
  ultimaSincronizacao,
  metricasIniciais,
  periodoInicial,
}: {
  carteiras: CarteiraYampi[]
  ultimaSincronizacao: string | null
  metricasIniciais: MetricasCashback
  periodoInicial: Periodo
}) {
  const [periodo, setPeriodo] = useState<Periodo>(periodoInicial)
  const [metricas, setMetricas] = useState<MetricasCashback>(metricasIniciais)
  const [faixa, setFaixa] = useState<FaixaVencimento>('todos')
  const [busca, setBusca] = useState('')
  const [marcados, setMarcados] = useState<Record<string, boolean>>({})
  const [sincronizando, setSincronizando] = useState(false)
  const [progresso, setProgresso] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [extrato, setExtrato] = useState<{
    movimentos: MovimentoCashback[]
    saldo: number
    camposCrus: string[]
  } | null>(null)
  const [extratoErro, setExtratoErro] = useState<string | null>(null)
  const [lendoExtrato, setLendoExtrato] = useState(false)
  const [enviando, iniciarEnvio] = useTransition()
  const router = useRouter()

  const carteiraSel = carteiras.find((c) => c.customerId === selecionado) ?? null

  // O extrato é da carteira aberta: trocar de cliente relê ao vivo.
  useEffect(() => {
    if (!selecionado) return
    let atual = true
    setExtrato(null)
    setExtratoErro(null)
    setLendoExtrato(true)
    extratoDoCliente(selecionado)
      .then((r) => {
        if (!atual) return
        if (r.ok) setExtrato({ movimentos: r.movimentos, saldo: r.saldo, camposCrus: r.camposCrus })
        else setExtratoErro(r.erro)
      })
      .finally(() => {
        if (atual) setLendoExtrato(false)
      })
    return () => {
      atual = false
    }
  }, [selecionado])

  // Trocar o período refaz só as métricas — a lista de carteiras é a mesma.
  const trocarPeriodo = (p: Periodo) => {
    setPeriodo(p)
    void metricasCashbackDoPeriodo(p).then((r) => {
      if (r.ok) setMetricas(r.metricas)
    })
  }

  const termo = busca.trim().toLowerCase()
  const visiveis = useMemo(
    () =>
      carteiras
        .filter((c) => naFaixa(c, faixa))
        .filter(
          (c) =>
            !termo ||
            c.nome.toLowerCase().includes(termo) ||
            (c.email ?? '').toLowerCase().includes(termo) ||
            (c.telefone ?? '').includes(termo) ||
            dataBr(c.expiraEm).includes(termo),
        ),
    [carteiras, faixa, termo],
  )

  const saldoTotal = carteiras.reduce((a, c) => a + c.saldo, 0)
  const proximo = carteiras
    .map((c) => diasAteVencer(c.expiraEm))
    .filter((d): d is number => d !== null && d >= 0)
    .sort((a, b) => a - b)[0]

  const escolhidos = visiveis.filter((c) => marcados[c.customerId])

  const kpis: Kpi[] = [
    {
      label: 'Cashback gerado',
      valor: brl(metricas.gerado),
      hint: ROTULO_PERIODO[periodo],
      tom: 'ouro',
    },
    {
      label: 'Cashback utilizado',
      valor: brl(metricas.utilizado),
      hint: metricas.gerado > 0 ? `${Math.round((metricas.utilizado / metricas.gerado) * 100)}% do gerado` : 'sem uso no período',
    },
    {
      label: 'Pedidos com cashback',
      valor: String(metricas.pedidosComCashback),
      hint: `${metricas.percentualPedidos}% dos pedidos pagos do período`,
    },
    {
      label: 'Receita com cashback',
      valor: brl(metricas.receita),
      hint: metricas.tempoMedioDeUso !== null ? `crédito usado leva ~${metricas.tempoMedioDeUso} dias` : 'faturamento dos pedidos que geraram',
    },
    {
      label: 'Saldo em circulação',
      valor: brl(saldoTotal),
      hint: `${plural(carteiras.length, 'cliente com saldo', 'clientes com saldo')}`,
      tom: 'ok',
    },
    {
      label: 'Próximo vencimento',
      valor: proximo === undefined ? '—' : proximo === 0 ? 'hoje' : plural(proximo, 'dia', 'dias'),
      hint: ultimaSincronizacao ? `atualizado ${dataHoraBr(ultimaSincronizacao)}` : 'primeira leitura ao abrir',
      tom: proximo !== undefined && proximo <= 7 ? 'atencao' : 'neutro',
    },
  ]

  /**
   * A sincronização dispara SOZINHA ao abrir a tela quando o retrato tem mais
   * de 6 horas — e roda todo dia no cron. Não há botão: espelho que depende
   * de clique vive desatualizado. Quando algo falha, o motivo vai para o log
   * do servidor; aqui fica só o que a operação precisa fazer a respeito.
   */
  async function sincronizar() {
    setSincronizando(true)
    let pagina: number | null = 1
    let lidos = 0
    let comSaldoLidos = 0
    try {
      // O teto de rodadas subiu junto com a diminuição da fatia: cada
      // chamada agora faz menos trabalho, então são precisas mais delas para
      // percorrer as ~29 páginas de clientes.
      let rodadas = 0
      while (pagina !== null && rodadas < 300) {
        rodadas++
        setProgresso(`Atualizando saldos… ${lidos} carteiras lidas`)
        const resposta = await fetch('/api/crm/cashback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pagina }),
        })
        // A resposta é lida como TEXTO antes de virar JSON. Quando a
        // plataforma encerra a função, ela devolve HTML — e `resposta.json()`
        // estourava com "Unexpected token '<'", uma mensagem que não diz nada
        // a quem está olhando a tela.
        const cru = await resposta.text()
        let r: { ok: true; proximaPagina: number | null; lidos: number; comSaldo: number } | { ok: false; erro: string }
        try {
          r = JSON.parse(cru)
        } catch {
          setAviso({
            tom: 'erro',
            texto: `A atualização foi interrompida pelo servidor depois de ${lidos} carteiras. O que já foi lido está salvo — clique de novo para continuar de onde parou.`,
          })
          return
        }
        if (!r.ok) {
          setAviso({ tom: 'erro', texto: r.erro })
          return
        }
        lidos += r.lidos
        comSaldoLidos += r.comSaldo
        pagina = r.proximaPagina
      }
    } catch (e) {
      setAviso({
        tom: 'erro',
        texto: `A atualização parou no meio (${e instanceof Error ? e.message : String(e)}). O que já foi lido está salvo.`,
      })
    } finally {
      setSincronizando(false)
      setProgresso(null)
      router.refresh()
      void metricasCashbackDoPeriodo(periodo).then((r) => {
        if (r.ok) setMetricas(r.metricas)
      })
    }
  }

  const jaDisparou = useRef(false)
  useEffect(() => {
    if (jaDisparou.current) return
    const SEIS_HORAS = 6 * 60 * 60 * 1000
    const velho =
      !ultimaSincronizacao || Date.now() - new Date(ultimaSincronizacao).getTime() > SEIS_HORAS
    if (!velho) return
    jaDisparou.current = true
    void sincronizar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimaSincronizacao])

  function avisar(ids: string[]) {
    if (ids.length === 0) return
    iniciarEnvio(async () => {
      setAviso(null)
      const r = await enviarAvisoCashback(ids)
      if (!r.ok) {
        setAviso({ tom: 'erro', texto: r.erro })
        return
      }
      const x = r.resultado
      setMarcados({})
      setAviso({
        tom: x.falhas.length ? 'erro' : 'ok',
        texto: [
          `${plural(x.enviados, 'aviso enviado', 'avisos enviados')}.`,
          x.semEmail ? `${x.semEmail} sem e-mail cadastrado.` : '',
          x.descadastrados ? `${x.descadastrados} cancelaram a inscrição (pulados).` : '',
          ...x.falhas.slice(0, 3).map((f) => `${f.quem}: ${f.erro}`),
        ]
          .filter(Boolean)
          .join(' '),
      })
      router.refresh()
    })
  }

  const marcarTodos = (ligar: boolean) =>
    setMarcados(ligar ? Object.fromEntries(visiveis.map((c) => [c.customerId, true])) : {})

  const colunas: Coluna<CarteiraYampi>[] = [
    {
      chave: 'marca',
      titulo: (
        <input
          type="checkbox"
          checked={visiveis.length > 0 && escolhidos.length === visiveis.length}
          onChange={(e) => marcarTodos(e.target.checked)}
          aria-label="Selecionar todos"
          style={{ accentColor: COR.ouro, cursor: 'pointer' }}
        />
      ),
      largura: '34px',
      render: (c) => (
        <input
          type="checkbox"
          checked={Boolean(marcados[c.customerId])}
          onChange={(e) => setMarcados((s) => ({ ...s, [c.customerId]: e.target.checked }))}
          aria-label={`Selecionar ${c.nome}`}
          style={{ accentColor: COR.ouro, cursor: 'pointer' }}
        />
      ),
    },
    {
      chave: 'cliente',
      titulo: 'Cliente',
      largura: 'minmax(170px,1.3fr)',
      render: (c) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span className="font-sans" style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.25, color: 'var(--color-corrente)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.nome}
          </span>
          <span className="font-mono" style={{ fontSize: 10, lineHeight: 1.25, color: 'rgba(242,237,227,.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.email ?? `cliente ${c.customerId}`}
          </span>
        </span>
      ),
    },
    {
      chave: 'telefone',
      titulo: 'Telefone',
      largura: 'minmax(120px,.7fr)',
      render: (c) =>
        c.telefone ? (
          <a
            href={`https://wa.me/${c.telefone}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono hover:brightness-125"
            style={{ fontSize: 11, color: COR.ouro, textDecoration: 'none' }}
          >
            {telefoneBr(c.telefone)}
          </a>
        ) : (
          <span className="font-mono" style={{ fontSize: 11, color: 'rgba(242,237,227,.3)' }}>—</span>
        ),
    },
    {
      chave: 'saldo',
      titulo: 'Saldo',
      largura: 'minmax(92px,.6fr)',
      alinhamento: 'right',
      render: (c) => <Valor tamanho={12.5} tom="ouro">{brl(c.saldo)}</Valor>,
    },
    {
      chave: 'compra',
      titulo: 'Última compra',
      largura: 'minmax(100px,.6fr)',
      alinhamento: 'right',
      render: (c) => (
        <span className="font-mono" style={{ fontSize: 11, color: 'rgba(242,237,227,.55)' }}>
          {dataBr(c.ultimaCompra)}
        </span>
      ),
    },
    {
      chave: 'vence',
      titulo: 'Vence em',
      largura: 'minmax(120px,.75fr)',
      alinhamento: 'right',
      render: (c) => {
        const dias = diasAteVencer(c.expiraEm)
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end' }}>
            <span className="font-mono" style={{ fontSize: 10.5, color: 'rgba(242,237,227,.45)' }}>
              {dataBr(c.expiraEm)}
            </span>
            {dias !== null && (
              <Badge tom={tomDoVencimento(dias)}>
                {dias < 0 ? 'expirado' : dias === 0 ? 'hoje' : `${dias} d`}
              </Badge>
            )}
          </span>
        )
      },
    },
    {
      chave: 'aviso',
      titulo: 'Último aviso',
      largura: 'minmax(104px,.6fr)',
      alinhamento: 'right',
      render: (c) => (
        <span className="font-mono" style={{ fontSize: 10.5, color: c.avisoEm ? 'rgba(242,237,227,.55)' : 'rgba(242,237,227,.28)' }}>
          {c.avisoEm ? dataHoraBr(c.avisoEm).slice(0, 8) : '—'}
        </span>
      ),
    },
    {
      chave: 'acao',
      titulo: '',
      largura: '196px',
      alinhamento: 'right',
      // Duas ações explícitas em vez de linha-inteira-clicável: a linha
      // precisaria virar <button>, e botão dentro de botão é HTML inválido.
      render: (c) => (
        <span style={{ display: 'inline-flex', gap: 7, justifyContent: 'flex-end' }}>
          <BotaoSecundario
            altura={28}
            onClick={() => setSelecionado(c.customerId === selecionado ? null : c.customerId)}
          >
            {c.customerId === selecionado ? 'Fechar' : 'Extrato'}
          </BotaoSecundario>
          <BotaoSecundario
            altura={28}
            desabilitado={enviando || !c.email}
            onClick={() => avisar([c.customerId])}
          >
            {c.email ? 'Avisar' : 'Sem e-mail'}
          </BotaoSecundario>
        </span>
      ),
    },
  ]

  const chip = (ativo: boolean): React.CSSProperties => ({
    height: 30,
    padding: '0 13px',
    border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.1)'}`,
    background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
    color: ativo ? COR.ouro : 'rgba(242,237,227,.6)',
    fontWeight: 600,
    fontSize: 11,
    lineHeight: 1,
    borderRadius: 'var(--radius-pill)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {PERIODOS.map((p) => (
          <button key={p} type="button" onClick={() => trocarPeriodo(p)} className="hover:border-ouro/40 font-sans" style={chip(periodo === p)}>
            {ROTULO_PERIODO[p]}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {(sincronizando || progresso) && (
          <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
            {progresso ?? 'atualizando…'}
          </span>
        )}
      </div>

      <FaixaKpis kpis={kpis} />

      {aviso && (
        <span
          className="font-sans"
          style={{
            padding: '9px 13px',
            borderRadius: 10,
            border: `1px solid ${aviso.tom === 'ok' ? 'rgba(92,158,112,.3)' : 'rgba(194,90,80,.35)'}`,
            background: aviso.tom === 'ok' ? 'rgba(92,158,112,.1)' : 'rgba(194,90,80,.1)',
            color: aviso.tom === 'ok' ? COR.ok : COR.erro,
            fontSize: 11.5,
            lineHeight: 1.5,
            textWrap: 'pretty',
          }}
        >
          {aviso.texto}
        </span>
      )}

      <div className="empilha-1100" style={{ display: 'grid', gridTemplateColumns: selecionado ? 'minmax(0,1fr) 340px' : '1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {FAIXAS.map((f) => {
              const quantos = carteiras.filter((c) => naFaixa(c, f.chave)).length
              return (
                <button key={f.chave} type="button" onClick={() => setFaixa(f.chave)} className="hover:border-ouro/40 font-sans" style={chip(faixa === f.chave)}>
                  {`${f.rotulo} · ${quantos}`}
                </button>
              )
            })}
            <div style={{ flex: 1 }} />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente, e-mail, telefone ou data"
              className="font-sans focus:border-ouro/45"
              style={{
                height: 34,
                minWidth: 260,
                padding: '0 12px',
                border: '1px solid rgba(255,255,255,.12)',
                background: 'rgba(255,255,255,.04)',
                color: 'var(--color-corrente)',
                fontSize: 12,
                borderRadius: 8,
                outline: 'none',
              }}
            />
          </div>

          <Tabela
            colunas={colunas}
            itens={visiveis}
            chaveDe={(c) => c.customerId}
            bandeiraDe={(c) => {
              const dias = diasAteVencer(c.expiraEm)
              return dias !== null && dias <= 7 ? tomDoVencimento(dias) : null
            }}
            selecionadoDe={(c) => c.customerId === selecionado}
            cabecalho={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px', borderBottom: '1px solid var(--color-borda)', flexWrap: 'wrap' }}>
                <TituloSecao tamanho={13}>Clientes com cashback disponível</TituloSecao>
                <div style={{ flex: 1 }} />
                {escolhidos.length > 0 && (
                  <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
                    {plural(escolhidos.length, 'selecionado', 'selecionados')}
                  </span>
                )}
                <BotaoOuro
                  altura={30}
                  desabilitado={enviando || escolhidos.length === 0}
                  onClick={() => avisar(escolhidos.map((c) => c.customerId))}
                >
                  {enviando ? 'Enviando…' : 'Enviar avisos'}
                </BotaoOuro>
              </div>
            }
            rodape={
              <div style={{ padding: '11px 15px', borderTop: '1px solid var(--color-borda)' }}>
                <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
                  {`${visiveis.length} de ${plural(carteiras.length, 'carteira', 'carteiras')} · "Extrato" abre a carteira ao vivo na Yampi · o texto do aviso se edita em CRM → E-mails da marca`}
                </span>
              </div>
            }
            vazio={
              <span className="font-sans" style={{ fontSize: 12, color: 'var(--color-terciario)' }}>
                {carteiras.length === 0
                  ? 'Nenhum cliente com saldo — a leitura das carteiras roda ao abrir a tela e todo dia de madrugada.'
                  : 'Nada neste recorte — troque a faixa de vencimento ou limpe a busca.'}
              </span>
            }
          />
        </div>

        {carteiraSel && (
          <section className="card-ouro" style={{ borderRadius: 16, padding: '18px 19px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                <TituloSecao tamanho={14}>{carteiraSel.nome}</TituloSecao>
                <span className="font-mono" style={{ fontSize: 10, color: 'rgba(242,237,227,.45)', wordBreak: 'break-all' }}>
                  {carteiraSel.email ?? `cliente ${carteiraSel.customerId}`}
                </span>
              </span>
              <button type="button" onClick={() => setSelecionado(null)} aria-label="Fechar extrato" className="font-sans hover:brightness-150" style={{ border: 0, background: 'transparent', color: 'rgba(242,237,227,.4)', fontSize: 14, cursor: 'pointer', padding: 2 }}>
                ×
              </button>
            </div>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
              <Valor tamanho={19} tom="ouro">{brl(extrato?.saldo ?? carteiraSel.saldo)}</Valor>
              <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
                {extrato ? 'saldo ao vivo na Yampi' : 'saldo espelhado'}
              </span>
              {/* Espelho e leitura ao vivo discordando é notícia, não detalhe:
                  quer dizer que o cashback mudou depois do último retrato. */}
              {extrato && Math.abs(extrato.saldo - carteiraSel.saldo) >= 0.01 && (
                <span className="font-sans" style={{ fontSize: 10, color: COR.atencao }}>
                  {`espelho de ${brl(carteiraSel.saldo)} — atualiza na próxima leitura`}
                </span>
              )}
            </span>

            <Rotulo>Extrato · direto da Yampi</Rotulo>
            {lendoExtrato ? (
              <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
                lendo a carteira…
              </span>
            ) : extratoErro ? (
              <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: COR.erro, textWrap: 'pretty' }}>
                {extratoErro}
              </span>
            ) : extrato && extrato.movimentos.length === 0 ? (
              <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
                A Yampi devolveu o extrato vazio para esta carteira.
              </span>
            ) : extrato ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
                {extrato.movimentos.map((m, i) => (
                  <span key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,.028)', border: '1px solid rgba(255,255,255,.06)' }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <span className="font-mono" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.45)' }}>
                        {dataHoraBr(m.quando)}
                      </span>
                      <Valor tamanho={11.5} tom={m.vale ? 'ok' : 'neutro'}>
                        {`${m.valor >= 0 ? '+' : '−'} ${brl(Math.abs(m.valor))}`}
                      </Valor>
                    </span>
                    <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.4, color: 'rgba(242,237,227,.55)', textWrap: 'pretty' }}>
                      {m.descricao || m.rotulo}
                      {m.pedido ? ` · pedido ${m.pedido}` : ''}
                      {m.usado > 0 ? ` · ${brl(m.usado)} já usados` : ''}
                      {m.expiraEm ? ` · expira ${dataBr(m.expiraEm)}` : ''}
                      {m.vale ? '' : ' · não conta no saldo'}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
          </section>
        )}
      </div>
    </div>
  )
}
