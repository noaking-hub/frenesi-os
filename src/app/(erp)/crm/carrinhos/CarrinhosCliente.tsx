'use client'

import { useRouter } from 'next/navigation'

import { useMemo, useState, useTransition } from 'react'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, TituloSecao } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import type { CarrinhoYampi } from '@/data/yampi-crm'
import { brl, plural } from '@/domain'
import type { MetricasRecuperacao } from '@/domain'

import { enviarEmailsCarrinho } from './actions'

type Carrinho = CarrinhoYampi & { whatsapp: string | null }

type Periodo = 'Últimos 7 dias' | 'Últimos 30 dias' | 'Todos'
const PERIODOS: { rotulo: Periodo; dias: number | null }[] = [
  { rotulo: 'Últimos 7 dias', dias: 7 },
  { rotulo: 'Últimos 30 dias', dias: 30 },
  { rotulo: 'Todos', dias: null },
]

type Ordem = 'Mais recentes' | 'Maior valor'
const ORDENS: Ordem[] = ['Mais recentes', 'Maior valor']

type Prioridade = 'Alta' | 'Média' | 'Baixa'
const TOM_PRIORIDADE: Record<Prioridade, Tom> = { Alta: 'erro', Média: 'atencao', Baixa: 'neutro' }

/**
 * Prioridade = valor × recência. Quem abandonou há pouco ainda está com o
 * perfume na cabeça; carrinho de semanas atrás é histórico, não fila — por
 * isso um carrinho caro mas velho não grita "alta".
 */
function prioridadeDe(valor: number, horas: number): Prioridade {
  if (valor >= 150 && horas <= 72) return 'Alta'
  if (horas <= 7 * 24) return 'Média'
  return 'Baixa'
}

function tempoDesde(horas: number): string {
  if (!Number.isFinite(horas)) return 'sem data'
  if (horas < 1) return 'menos de 1 h'
  if (horas < 48) return plural(Math.round(horas), 'hora', 'horas')
  return plural(Math.round(horas / 24), 'dia', 'dias')
}

export function CarrinhosCliente({
  carrinhos,
  ultimoEnvio,
  emailPronto,
  recuperacao,
}: {
  carrinhos: Carrinho[]
  /** carrinho_id → ISO do último e-mail de recuperação enviado. */
  ultimoEnvio: Record<string, string>
  emailPronto: boolean
  /** O placar da recuperação automática — cards de 30 dias + desempenho. */
  recuperacao: MetricasRecuperacao | null
}) {
  const [periodo, setPeriodo] = useState<Periodo>('Últimos 30 dias')
  const [ordem, setOrdem] = useState<Ordem>('Mais recentes')
  const [soComContato, setSoComContato] = useState(false)
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [enviandoId, setEnviandoId] = useState<string | null>(null)
  const [enviando, iniciarTransicao] = useTransition()
  const router = useRouter()

  const resumoDoResultado = (r: {
    enviados: number
    jaContatados: number
    semEmail: number
    descadastrados: number
    falhas: { quem: string; erro: string }[]
  }) => {
    const partes = [
      `${plural(r.enviados, 'e-mail enviado', 'e-mails enviados')}`,
      r.jaContatados ? `${r.jaContatados} já contatados nos últimos 7 dias (pulados)` : '',
      r.descadastrados ? `${r.descadastrados} cancelaram a inscrição (pulados)` : '',
      r.semEmail ? `${r.semEmail} sem e-mail` : '',
    ].filter(Boolean)
    return r.falhas.length
      ? {
          tom: 'erro' as const,
          texto: `${partes.join(' · ')} · falhas: ${r.falhas.slice(0, 3).map((f) => `${f.quem} (${f.erro})`).join(' · ')}${r.falhas.length > 3 ? ` e mais ${r.falhas.length - 3}` : ''}`,
        }
      : { tom: 'ok' as const, texto: partes.join(' · ') }
  }

  const enviar = (ids: string[], forcar = false) =>
    iniciarTransicao(async () => {
      setAviso(null)
      // Reenvio pontual sem cupom — cupom é assunto dos toques automáticos,
      // configurados em Configurações → Notificações.
      const r = await enviarEmailsCarrinho(ids, null, forcar)
      setEnviandoId(null)
      if (!r.ok) {
        setAviso({ tom: 'erro', texto: r.erro })
        return
      }
      setAviso(
        resumoDoResultado({
          enviados: r.resultado.enviados.length,
          jaContatados: r.resultado.jaContatados,
          semEmail: r.resultado.semEmail,
          descadastrados: r.resultado.descadastrados,
          falhas: r.resultado.falhas,
        }),
      )
      router.refresh()
    })



  // O instante de referência é fixado por render de lista, não por linha —
  // horas é derivado uma vez e reutilizado por filtro, ordenação e badge.
  const linhas = useMemo(() => {
    const agora = Date.now()
    return carrinhos.map((c) => {
      const horas = c.abandonadoEm
        ? (agora - new Date(c.abandonadoEm).getTime()) / 3_600_000
        : Infinity
      return { ...c, horas, prioridade: prioridadeDe(c.valor, horas) }
    })
  }, [carrinhos])

  const dias = PERIODOS.find((p) => p.rotulo === periodo)?.dias ?? null
  const visiveis = linhas
    .filter((c) => (dias === null ? true : c.horas <= dias * 24))
    .filter((c) => (soComContato ? Boolean(c.whatsapp) : true))
    .sort((a, b) => (ordem === 'Maior valor' ? b.valor - a.valor : a.horas - b.horas))

  const valorTotal = visiveis.reduce((a, c) => a + c.valor, 0)
  const alta = visiveis.filter((c) => c.prioridade === 'Alta')
  const comContato = visiveis.filter((c) => c.whatsapp || c.email)

  const kpis: Kpi[] = [
    {
      label: 'Carrinhos no período',
      valor: String(visiveis.length),
      hint: `${carrinhos.length} no checkout ao todo`,
    },
    {
      label: 'Valor em jogo',
      valor: brl(valorTotal),
      hint: visiveis.length ? `Ticket médio ${brl(valorTotal / visiveis.length)}` : 'Nada no período',
      tom: 'ouro',
    },
    {
      label: 'Prioridade alta',
      valor: String(alta.length),
      hint: 'Caros e recentes — mensagem primeiro',
      tom: alta.length ? 'atencao' : 'ok',
    },
    {
      label: 'Com contato',
      valor: visiveis.length ? `${comContato.length} de ${visiveis.length}` : '—',
      hint: 'Deixaram WhatsApp ou e-mail',
      tom: comContato.length ? 'ok' : 'neutro',
    },
    // O resultado da recuperação, não só o funil: e-mail que virou pedido
    // pago do mesmo endereço em até 7 dias conta como recuperado.
    ...(recuperacao
      ? ([
          {
            label: 'E-mails enviados · 30d',
            valor: String(recuperacao.enviados),
            hint: `${recuperacao.contatados} carrinho(s) contatado(s)`,
          },
          {
            label: 'Carrinhos recuperados · 30d',
            valor: String(recuperacao.recuperados),
            hint: recuperacao.contatados
              ? `${Math.round((recuperacao.recuperados / recuperacao.contatados) * 100)}% dos contatados viraram pedido pago em até 7 dias`
              : 'Nenhum contatado no período',
            tom: recuperacao.recuperados ? 'ok' : 'neutro',
          },
          {
            label: 'Receita recuperada · 30d',
            valor: brl(recuperacao.receita),
            hint: 'Pedidos pagos após o toque de recuperação',
            tom: recuperacao.receita ? 'ouro' : 'neutro',
          },
        ] as Kpi[])
      : []),
  ]

  const colunas: Coluna<(typeof visiveis)[number]>[] = [
    {
      chave: 'cliente',
      titulo: 'Cliente',
      largura: 'minmax(0,220px)',
      render: (c) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span
            className="font-sans"
            style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.25, color: 'var(--color-corrente)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {c.cliente ?? 'Visitante sem cadastro'}
          </span>
          <span className="font-mono" style={{ fontSize: 10, lineHeight: 1.3, color: 'rgba(242,237,227,.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.email ?? (c.telefone ? `+${c.telefone}` : 'sem contato')}
          </span>
        </span>
      ),
    },
    {
      chave: 'itens',
      titulo: 'Carrinho',
      largura: 'minmax(0,1fr)',
      render: (c) => (
        <span
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.4, color: 'rgba(242,237,227,.65)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {c.itens.length ? c.itens.join(' · ') : 'Itens não informados pela Yampi'}
        </span>
      ),
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      largura: '104px',
      alinhamento: 'right',
      render: (c) => (
        <span className="font-mono" style={{ fontWeight: 500, fontSize: 12.5, lineHeight: 1, color: 'var(--color-ouro)', whiteSpace: 'nowrap' }}>
          {brl(c.valor)}
        </span>
      ),
    },
    {
      chave: 'quando',
      titulo: 'Abandonado há',
      largura: '108px',
      alinhamento: 'right',
      render: (c) => (
        <span className="font-mono" style={{ fontSize: 11, lineHeight: 1, color: 'rgba(242,237,227,.55)', whiteSpace: 'nowrap' }}>
          {tempoDesde(c.horas)}
        </span>
      ),
    },
    {
      chave: 'prioridade',
      titulo: 'Prioridade',
      largura: '86px',
      render: (c) => <Badge tom={TOM_PRIORIDADE[c.prioridade]}>{c.prioridade}</Badge>,
    },
    {
      chave: 'acao',
      titulo: 'Recuperar',
      largura: '138px',
      render: (c) => {
        const enviadoEm = ultimoEnvio[c.id]
        const diasEnvio = enviadoEm
          ? Math.floor((Date.now() - new Date(enviadoEm).getTime()) / 86_400_000)
          : null
        if (!c.whatsapp && !c.email) {
          return (
            <span className="font-sans" style={{ fontSize: 10.5, color: 'rgba(242,237,227,.35)' }}>
              sem contato
            </span>
          )
        }
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start' }}>
            <span style={{ display: 'flex', gap: 6 }}>
              {c.whatsapp && (
                <a
                  href={c.whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:bg-[rgba(92,158,112,.24)] font-sans"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 28,
                    padding: '0 11px',
                    background: 'rgba(92,158,112,.14)',
                    color: COR.ok,
                    fontWeight: 600,
                    fontSize: 10.5,
                    lineHeight: 1,
                    borderRadius: 7,
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  WhatsApp
                </a>
              )}
              {emailPronto && c.email && (
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => {
                    if (
                      diasEnvio !== null &&
                      diasEnvio < 7 &&
                      !window.confirm(
                        `Este carrinho já recebeu e-mail há ${plural(diasEnvio, 'dia', 'dias')}. Enviar de novo mesmo assim?`,
                      )
                    ) {
                      return
                    }
                    setEnviandoId(c.id)
                    enviar([c.id], true)
                  }}
                  className="hover:border-ouro/40 font-sans"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 28,
                    padding: '0 11px',
                    border: '1px solid rgba(239,209,140,.3)',
                    background: 'rgba(239,209,140,.07)',
                    color: COR.ouro,
                    fontWeight: 600,
                    fontSize: 10.5,
                    lineHeight: 1,
                    borderRadius: 7,
                    cursor: enviando ? 'wait' : 'pointer',
                    opacity: enviando && enviandoId !== c.id ? 0.5 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {enviando && enviandoId === c.id ? 'Enviando…' : 'E-mail'}
                </button>
              )}
            </span>
            {diasEnvio !== null && (
              <span className="font-sans" style={{ fontSize: 9.5, lineHeight: 1.25, color: 'rgba(242,237,227,.4)', whiteSpace: 'nowrap' }}>
                {diasEnvio === 0 ? 'e-mail enviado hoje' : `e-mail há ${plural(diasEnvio, 'dia', 'dias')}`}
              </span>
            )}
          </span>
        )
      },
    },
  ]

  // O alvo do envio em massa: quem está no recorte, tem e-mail e não foi
  // contatado nos últimos 7 dias.

  const chip = (ativo: boolean): React.CSSProperties => ({
    height: 31,
    padding: '0 13px',
    border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.09)'}`,
    background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
    color: ativo ? COR.ouro : 'rgba(242,237,227,.6)',
    fontWeight: 600,
    fontSize: 11,
    lineHeight: 1,
    borderRadius: 'var(--radius-pill)',
    cursor: 'pointer',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <TituloSecao tamanho={16}>Carrinhos abandonados</TituloSecao>
        <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)' }}>
          Lidos ao vivo da Yampi · carrinho recuperado sai da lista sozinho
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        {PERIODOS.map((p) => {
          const contagem =
            p.dias === null
              ? linhas.length
              : linhas.filter((c) => c.horas <= p.dias! * 24).length
          return (
            <button
              key={p.rotulo}
              type="button"
              onClick={() => setPeriodo(p.rotulo)}
              className="hover:border-ouro/40 font-sans"
              style={chip(periodo === p.rotulo)}
            >
              {`${p.rotulo} · ${contagem}`}
            </button>
          )
        })}
        <span aria-hidden style={{ width: 1, height: 20, background: 'var(--color-borda)' }} />
        <button
          type="button"
          onClick={() => setSoComContato((v) => !v)}
          className="hover:border-ouro/40 font-sans"
          style={chip(soComContato)}
        >
          Só com WhatsApp
        </button>
        <div style={{ flex: 1 }} />
        {ORDENS.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOrdem(o)}
            className="hover:border-ouro/40 font-sans"
            style={chip(ordem === o)}
          >
            {o}
          </button>
        ))}
      </div>

      {aviso && (
        <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: aviso.tom === 'ok' ? COR.ok : COR.erro, textWrap: 'pretty' }}>
          {aviso.texto}
        </span>
      )}

      {recuperacao && recuperacao.semanas.some((s) => s.enviados > 0) && (
        <DesempenhoRecuperacao metricas={recuperacao} />
      )}

      <Tabela
        colunas={colunas}
        itens={visiveis}
        chaveDe={(c) => c.id}
        bandeiraDe={(c) => (c.prioridade === 'Alta' ? 'erro' : null)}
        vazio={
          <div style={{ padding: '28px 18px', textAlign: 'center' }}>
            <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
              Nenhum carrinho abandonado nesse recorte — troque o período ou os filtros.
            </span>
          </div>
        }
      />
    </div>
  )
}

const pctDe = (parte: number, todo: number): string =>
  todo > 0 ? `${Math.round((parte / todo) * 100)}%` : '—'

const ORDINAL = ['1º toque', '2º toque', '3º toque', '4º toque']

function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

/**
 * O placar da automação: qual toque fecha venda, se o cupom muda a taxa e o
 * ritmo semanal. Só leitura — o envio em si roda sozinho pelas regras de
 * Configurações → Notificações.
 */
function DesempenhoRecuperacao({ metricas }: { metricas: MetricasRecuperacao }) {
  const rotuloBloco: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    color: 'rgba(242,237,227,.45)',
  }
  const celula: React.CSSProperties = { fontSize: 11, lineHeight: 1.3, color: 'rgba(242,237,227,.72)' }
  const numero: React.CSSProperties = { fontSize: 11, lineHeight: 1.3, whiteSpace: 'nowrap', color: 'rgba(242,237,227,.72)' }

  const maiorSemana = Math.max(1, ...metricas.semanas.map((s) => s.enviados))
  const { com, sem } = metricas.cupom

  return (
    <section
      className="card-ouro"
      style={{ borderRadius: 14, padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <TituloSecao tamanho={13.5}>Desempenho da recuperação</TituloSecao>
        <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
          Os envios rodam sozinhos — aqui é o placar: conversão = pedido pago do mesmo e-mail em até 7 dias após o toque
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px 26px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span className="font-sans" style={rotuloBloco}>Conversão por toque</span>
          {metricas.porToque.map((t) => (
            <span key={t.toque} style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto', gap: 10, alignItems: 'baseline' }}>
              <span className="font-sans" style={{ ...celula, fontWeight: 600, color: 'var(--color-corrente)' }}>
                {ORDINAL[t.toque - 1] ?? `${t.toque}º toque`}
              </span>
              <span className="font-sans" style={celula}>
                {`${plural(t.enviados, 'envio', 'envios')} · ${plural(t.conversoes, 'conversão', 'conversões')}`}
              </span>
              <span className="font-mono" style={{ ...numero, color: t.conversoes ? COR.ouro : 'rgba(242,237,227,.4)' }}>
                {pctDe(t.conversoes, t.enviados)}
              </span>
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span className="font-sans" style={rotuloBloco}>Efeito do cupom · 30d</span>
          {([
            ['Com cupom', com],
            ['Sem cupom', sem],
          ] as const).map(([rotulo, b]) => (
            <span key={rotulo} style={{ display: 'grid', gridTemplateColumns: '76px 1fr auto', gap: 10, alignItems: 'baseline' }}>
              <span className="font-sans" style={{ ...celula, fontWeight: 600, color: 'var(--color-corrente)' }}>{rotulo}</span>
              <span className="font-sans" style={celula}>
                {b.contatados
                  ? `${plural(b.contatados, 'carrinho contatado', 'carrinhos contatados')} · ${b.recuperados} recuperado${b.recuperados === 1 ? '' : 's'}`
                  : 'nenhum carrinho nesse grupo'}
              </span>
              <span className="font-mono" style={{ ...numero, color: b.recuperados ? COR.ouro : 'rgba(242,237,227,.4)' }}>
                {pctDe(b.recuperados, b.contatados)}
              </span>
            </span>
          ))}
          <span className="font-sans" style={{ fontSize: 9.5, lineHeight: 1.4, color: 'rgba(242,237,227,.38)', textWrap: 'pretty' }}>
            Compare as taxas antes de concluir — grupo pequeno oscila à toa.
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="font-sans" style={rotuloBloco}>Semana a semana</span>
          <span className="font-sans" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.4)' }}>
            <span style={{ color: 'rgba(242,237,227,.55)' }}>■</span> envios{' '}
            <span style={{ color: COR.ouro }}>■</span> conversões
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, alignItems: 'end' }}>
          {metricas.semanas.map((s) => (
            <div key={s.inicio} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <span className="font-mono" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.55)', whiteSpace: 'nowrap' }}>
                {s.enviados ? `${s.enviados} · ${s.conversoes}` : '—'}
              </span>
              <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 52, width: '100%', justifyContent: 'center' }}>
                <span
                  aria-hidden
                  style={{
                    width: 12,
                    height: Math.max(s.enviados ? 3 : 1, Math.round((s.enviados / maiorSemana) * 52)),
                    background: 'rgba(242,237,227,.28)',
                    borderRadius: 2,
                  }}
                />
                <span
                  aria-hidden
                  style={{
                    width: 12,
                    height: Math.max(s.conversoes ? 3 : 1, Math.round((s.conversoes / maiorSemana) * 52)),
                    background: s.conversoes ? COR.ouro : 'rgba(239,209,140,.14)',
                    borderRadius: 2,
                  }}
                />
              </div>
              <span className="font-mono" style={{ fontSize: 9, color: 'rgba(242,237,227,.4)', whiteSpace: 'nowrap' }}>
                {diaMes(s.inicio)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

