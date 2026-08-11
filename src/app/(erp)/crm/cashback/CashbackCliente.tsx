'use client'

import { useRouter } from 'next/navigation'

import { useEffect, useMemo, useRef, useState } from 'react'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR } from '@/components/erp/tokens'
import type { CarteiraYampi, MovimentoCashback } from '@/data/cashback'
import { brl, plural } from '@/domain'

import { extratoDoCliente } from './actions'

const dataHoraBr = (iso: string | null) =>
  iso
    ? new Date(iso.includes('T') || iso.includes('Z') ? iso : `${iso.replace(' ', 'T')}-03:00`).toLocaleString(
        'pt-BR',
        { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' },
      )
    : '—'

/**
 * O espelho do cashback da Yampi: quem tem saldo, quanto, e o extrato da
 * carteira ao vivo. Nada se lança aqui — crédito, resgate e expiração
 * acontecem no checkout; esta tela é o retrato para a operação decidir quem
 * lembrar de usar o saldo.
 */
export function CashbackCliente({
  carteiras,
  ultimaSincronizacao,
}: {
  carteiras: CarteiraYampi[]
  ultimaSincronizacao: string | null
}) {
  const [busca, setBusca] = useState('')
  const [soComSaldo, setSoComSaldo] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [progresso, setProgresso] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [extrato, setExtrato] = useState<{ movimentos: MovimentoCashback[]; camposCrus: string[] } | null>(null)
  const [extratoErro, setExtratoErro] = useState<string | null>(null)
  const [lendoExtrato, setLendoExtrato] = useState(false)
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
        if (r.ok) setExtrato({ movimentos: r.movimentos, camposCrus: r.camposCrus })
        else setExtratoErro(r.erro)
      })
      .finally(() => {
        if (atual) setLendoExtrato(false)
      })
    return () => {
      atual = false
    }
  }, [selecionado])

  const termo = busca.trim().toLowerCase()
  const visiveis = useMemo(
    () =>
      carteiras
        .filter((c) => (soComSaldo ? c.saldo > 0 : true))
        .filter(
          (c) =>
            !termo || c.nome.toLowerCase().includes(termo) || (c.email ?? '').toLowerCase().includes(termo),
        ),
    [carteiras, soComSaldo, termo],
  )

  const comSaldo = carteiras.filter((c) => c.saldo > 0)
  const saldoTotal = comSaldo.reduce((a, c) => a + c.saldo, 0)

  const kpis: Kpi[] = [
    {
      label: 'Saldo em circulação',
      valor: brl(saldoTotal),
      hint: 'Espelhado das carteiras da Yampi',
      tom: 'ouro',
    },
    {
      label: 'Clientes com saldo',
      valor: String(comSaldo.length),
      hint: `${carteiras.length} carteiras espelhadas ao todo`,
    },
    {
      label: 'Maior carteira',
      valor: comSaldo[0] ? brl(comSaldo[0].saldo) : '—',
      hint: comSaldo[0] ? comSaldo[0].nome : 'Sem saldos ainda',
    },
    {
      label: 'Última sincronização',
      valor: ultimaSincronizacao ? dataHoraBr(ultimaSincronizacao).slice(0, 5) : 'Nunca',
      hint: ultimaSincronizacao
        ? dataHoraBr(ultimaSincronizacao)
        : 'A primeira leitura começa sozinha ao abrir',
      tom: ultimaSincronizacao ? 'ok' : 'atencao',
    },
  ]

  /** Varre as carteiras em rodadas — a rota devolve a página onde parou. */
  const sincronizar = async () => {
    setAviso(null)
    setSincronizando(true)
    let pagina: number | null = 1
    let lidos = 0
    let comSaldoLidos = 0
    try {
      let rodadas = 0
      while (pagina !== null && rodadas < 60) {
        rodadas++
        setProgresso(
          `Sincronizando… ${lidos} carteiras lidas${comSaldoLidos ? ` · ${comSaldoLidos} com saldo` : ''} (uma consulta por cliente — pode demorar alguns minutos)`,
        )
        const resposta = await fetch('/api/crm/cashback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pagina }),
        })
        const r = (await resposta.json()) as
          | { ok: true; proximaPagina: number | null; lidos: number; comSaldo: number }
          | { ok: false; erro: string }
        if (!r.ok) {
          setAviso({ tom: 'erro', texto: r.erro })
          return
        }
        lidos += r.lidos
        comSaldoLidos += r.comSaldo
        pagina = r.proximaPagina
      }
      setAviso({
        tom: 'ok',
        texto: `${plural(lidos, 'carteira sincronizada', 'carteiras sincronizadas')} · ${plural(comSaldoLidos, 'cliente com saldo', 'clientes com saldo')}.`,
      })
    } catch (e) {
      setAviso({
        tom: 'erro',
        texto: `A sincronização parou no meio (${e instanceof Error ? e.message : String(e)}). Clique de novo para continuar — o que já foi lido está salvo.`,
      })
    } finally {
      setSincronizando(false)
      setProgresso(null)
      router.refresh()
    }
  }

  /**
   * A sincronização dispara SOZINHA ao abrir a tela quando o retrato tem
   * mais de 6 horas (ou nunca rodou) — e roda todo dia no cron. Não há
   * botão: espelho que depende de clique vive desatualizado.
   */
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

  const colunas: Coluna<CarteiraYampi>[] = [
    {
      chave: 'cliente',
      titulo: 'Cliente',
      largura: 'minmax(160px,1fr)',
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
      chave: 'saldo',
      titulo: 'Saldo na carteira',
      largura: '132px',
      alinhamento: 'right',
      render: (c) => (
        <Valor tamanho={13.5} tom={c.saldo > 0 ? 'ouro' : 'rgba(242,237,227,.35)'}>
          {brl(c.saldo)}
        </Valor>
      ),
    },
    {
      chave: 'atualizado',
      titulo: 'Espelhado em',
      largura: '128px',
      alinhamento: 'right',
      render: (c) => (
        <span className="font-mono" style={{ fontSize: 10.5, color: 'rgba(242,237,227,.45)', whiteSpace: 'nowrap' }}>
          {dataHoraBr(c.atualizadoEm)}
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <section className="card-ouro" style={{ borderRadius: 14, padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 220 }}>
            <TituloSecao tamanho={13.5}>Espelho das carteiras da Yampi</TituloSecao>
            <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
              O cashback nasce, é usado e expira no checkout da Yampi — aqui é o retrato. Ele se
              atualiza sozinho: todo dia de madrugada no agendador e ao abrir esta tela quando o
              retrato passa de 6 horas. O extrato de cada cliente abre ao vivo, ao clicar.
            </span>
          </div>
          {sincronizando && (
            <span className="font-sans" style={{ fontWeight: 600, fontSize: 11, color: COR.ouro, whiteSpace: 'nowrap' }}>
              Sincronizando agora…
            </span>
          )}
        </div>
        {progresso && (
          <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: COR.ouro, textWrap: 'pretty' }}>
            {progresso}
          </span>
        )}
        {aviso && (
          <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: aviso.tom === 'ok' ? COR.ok : COR.erro, textWrap: 'pretty' }}>
            {aviso.texto}
          </span>
        )}
      </section>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setSoComSaldo((v) => !v)}
          className="hover:border-ouro/40 font-sans"
          style={{
            height: 31,
            padding: '0 13px',
            border: `1px solid ${soComSaldo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.09)'}`,
            background: soComSaldo ? 'rgba(239,209,140,.09)' : 'transparent',
            color: soComSaldo ? COR.ouro : 'rgba(242,237,227,.6)',
            fontWeight: 600,
            fontSize: 11,
            lineHeight: 1,
            borderRadius: 'var(--radius-pill)',
            cursor: 'pointer',
          }}
        >
          {`Só com saldo · ${comSaldo.length}`}
        </button>
        <div style={{ flex: 1 }} />
        <label className="focus-within:border-ouro/45" style={{ display: 'flex', alignItems: 'center', gap: 9, width: 300, height: 34, padding: '0 12px', border: '1px solid rgba(255,255,255,.09)', background: 'rgba(255,255,255,.03)', borderRadius: 9 }}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail" className="font-sans" style={{ flex: 1, border: 0, outline: 0, background: 'transparent', color: 'var(--color-corrente)', fontSize: 12, lineHeight: 1 }} />
        </label>
      </div>

      <div className="empilha-1180" style={{ display: 'grid', gridTemplateColumns: carteiraSel ? 'minmax(0,1fr) 340px' : 'minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <Tabela
          colunas={colunas}
          itens={visiveis}
          chaveDe={(c) => c.customerId}
          aoClicar={(c) => setSelecionado((atual) => (atual === c.customerId ? null : c.customerId))}
          selecionadoDe={(c) => c.customerId === selecionado}
          vazio={
            <div style={{ padding: '28px 18px', textAlign: 'center' }}>
              <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
                {carteiras.length === 0
                  ? 'Nenhuma carteira espelhada ainda — a primeira sincronização está rodando (acompanhe o progresso ali em cima).'
                  : 'Nada nesse recorte — desligue o “Só com saldo” ou limpe a busca.'}
              </span>
            </div>
          }
          rodape={
            <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
              <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
                {`${visiveis.length} de ${plural(carteiras.length, 'carteira', 'carteiras')} · clique para abrir o extrato ao vivo`}
              </span>
            </div>
          }
        />

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
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
              <Valor tamanho={19} tom="ouro">{brl(carteiraSel.saldo)}</Valor>
              <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
                saldo espelhado
              </span>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto', paddingRight: 4 }}>
                {extrato.movimentos.map((m, i) => (
                  <span key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,.028)', border: '1px solid rgba(255,255,255,.06)' }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <span className="font-mono" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.45)' }}>
                        {dataHoraBr(m.quando)}
                      </span>
                      <Valor tamanho={11.5} tom={m.valor >= 0 ? 'ok' : 'erro'}>
                        {`${m.valor >= 0 ? '+' : '−'} ${brl(Math.abs(m.valor))}`}
                      </Valor>
                    </span>
                    <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.4, color: 'rgba(242,237,227,.55)', textWrap: 'pretty' }}>
                      {m.rotulo}
                      {m.descricao ? ` · ${m.descricao}` : ''}
                      {m.expiraEm ? ` · expira ${dataHoraBr(m.expiraEm).slice(0, 8)}` : ''}
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
