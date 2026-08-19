'use client'

import { useState, useTransition } from 'react'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, TituloSecao } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR } from '@/components/erp/tokens'
import type { PainelDaCuradoria } from '@/data/quiz'
import { brl, iniciaisDe, plural } from '@/domain'

import { curadoriaDoGerente } from './actions'

/**
 * CRM → Curadoria Olfativa.
 *
 * Três perguntas, nesta ordem: o quiz está trazendo gente? o que essa gente
 * quer? e isso vira dinheiro? A ficha individual fecha o ciclo: perfil
 * declarado, curadoria por DNA olfativo (perfil × catálogo espelhado do quiz,
 * com o porquê de cada escolha) e o Gerente IA compondo o texto por cima.
 */

const dataBr = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })

const OURO_GRADIENTE = 'linear-gradient(90deg, #8A6D2F, #EFD18C)'

const MICRO: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: '.16em',
  textTransform: 'uppercase',
  color: 'rgba(239,209,140,.55)',
}

/** O cartão-padrão do módulo: título serifado + fio dourado que esvai. */
function Cartao({
  titulo,
  apoio,
  children,
  semRespiro,
}: {
  titulo: string
  apoio?: string
  children: React.ReactNode
  semRespiro?: boolean
}) {
  return (
    <section
      className="card-ouro"
      style={{ borderRadius: 16, padding: semRespiro ? '18px 20px 12px' : '18px 20px', display: 'flex', flexDirection: 'column', gap: 13 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <TituloSecao tamanho={15}>{titulo}</TituloSecao>
          {apoio && (
            <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)' }}>
              {apoio}
            </span>
          )}
        </div>
        <span aria-hidden style={{ height: 1, background: 'linear-gradient(90deg, rgba(239,209,140,.45), rgba(239,209,140,.05) 60%, transparent)' }} />
      </div>
      {children}
    </section>
  )
}

/** Barra fina com preenchimento dourado em degradê — a régua visual da tela. */
function BarraOuro({ fracao, altura = 6 }: { fracao: number; altura?: number }) {
  return (
    <span style={{ display: 'block', height: altura, borderRadius: 99, background: 'rgba(255,255,255,.055)', overflow: 'hidden' }}>
      <span
        style={{
          display: 'block',
          width: `${Math.max(3, Math.min(100, Math.round(fracao * 100)))}%`,
          height: '100%',
          borderRadius: 99,
          background: OURO_GRADIENTE,
          boxShadow: '0 0 8px rgba(239,209,140,.25)',
        }}
      />
    </span>
  )
}

type Lead = PainelDaCuradoria['leadsRecentes'][number]

export function CuradoriaCliente({ painel }: { painel: PainelDaCuradoria }) {
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const lead = painel.leadsRecentes.find((l) => `${l.email}-${l.quando}` === selecionado) ?? null

  const kpis: Kpi[] = [
    { label: 'Interações no quiz', valor: String(painel.interacoes), hint: 'cliques em recomendações' },
    {
      label: 'Leads capturados',
      valor: String(painel.leads),
      hint: 'deixaram e-mail pelo cupom',
      tom: painel.leads ? 'ok' : 'neutro',
    },
    {
      label: 'Viraram clientes',
      valor: String(painel.viraramClientes),
      hint: painel.leads ? `${Math.round((painel.viraramClientes / painel.leads) * 100)}% dos leads` : 'nenhum lead ainda',
    },
    {
      label: 'Cupons usados',
      valor: painel.leads ? `${painel.cuponsUsados} de ${painel.leads}` : '—',
      hint: 'CURA10 em pedido pago',
      tom: painel.cuponsUsados ? 'ok' : 'neutro',
    },
    {
      label: 'Receita via cupom',
      valor: brl(painel.receitaViaCupom),
      hint: 'o pedido usou o código — atribuição certa',
      tom: painel.receitaViaCupom ? 'ouro' : 'neutro',
    },
    {
      label: 'Receita pós-resposta',
      valor: brl(painel.receitaPorJanela),
      hint: 'pedidos pagos do mesmo e-mail depois do quiz',
    },
  ]

  const maiorPerfume = Math.max(1, ...painel.topPerfumes.map((p) => p.cliques))
  const maiorDia = Math.max(1, ...painel.cliquesPorDia.map((d) => d.qtd))

  const colunas: Coluna<Lead>[] = [
    {
      chave: 'email',
      titulo: 'Lead',
      largura: 'minmax(0,1fr)',
      render: (l) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span
            aria-hidden
            className="font-display"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              border: '1px solid rgba(239,209,140,.4)',
              background: 'radial-gradient(circle at 30% 25%, rgba(239,209,140,.22), rgba(239,209,140,.05))',
              color: COR.ouro,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {iniciaisDe(l.email.split('@')[0].replace(/[._]/g, ' '))}
          </span>
          <span className="font-mono" style={{ fontSize: 11.5, color: 'var(--color-corrente)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {l.email}
          </span>
        </span>
      ),
    },
    {
      chave: 'quando',
      titulo: 'Quando',
      largura: '84px',
      alinhamento: 'right',
      render: (l) => (
        <span className="font-mono" style={{ fontSize: 11, color: 'rgba(242,237,227,.55)' }}>{dataBr(l.quando)}</span>
      ),
    },
    {
      chave: 'cupom',
      titulo: 'Cupom',
      largura: '148px',
      render: (l) =>
        l.cupom ? (
          <span className="font-mono" style={{ fontSize: 11, letterSpacing: '.04em', color: l.cupomUsado ? COR.ok : 'rgba(239,209,140,.75)' }}>
            {l.cupom}
          </span>
        ) : (
          <span style={{ color: 'rgba(242,237,227,.3)' }}>—</span>
        ),
    },
    {
      chave: 'estado',
      titulo: 'Situação',
      largura: '140px',
      render: (l) =>
        l.cupomUsado ? (
          <Badge tom="ok">comprou com cupom</Badge>
        ) : l.virouCliente ? (
          <Badge tom="ouro">é cliente</Badge>
        ) : (
          <Badge tom="neutro">lead</Badge>
        ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      {painel.desviados.length > 0 && (
        <span
          className="font-sans"
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            border: '1px solid rgba(230,180,80,.35)',
            background: 'rgba(230,180,80,.08)',
            color: COR.atencao,
            fontSize: 11.5,
            lineHeight: 1.5,
            textWrap: 'pretty',
          }}
        >
          {`${plural(painel.desviados.length, 'cupom usado', 'cupons usados')} por e-mail diferente do dono: `}
          {painel.desviados.slice(0, 3).map((d) => `${d.cupom} (${d.pedido})`).join(' · ')}
          {' — o código é de uso único, mas padrão repetido é farming.'}
        </span>
      )}

      <div className="empilha-1100" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16, alignItems: 'start' }}>
        <Cartao titulo="Perfumes mais desejados" apoio="cliques nas recomendações do quiz — o sinal de demanda">
          {painel.topPerfumes.length === 0 ? (
            <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
              Nenhum clique registrado ainda.
            </span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {painel.topPerfumes.map((p, i) => (
                <div key={p.nome} style={{ display: 'grid', gridTemplateColumns: '30px minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}>
                  <span
                    className="font-display"
                    style={{ fontSize: 17, fontWeight: 600, color: i < 3 ? COR.ouro : 'rgba(242,237,227,.3)', fontVariantNumeric: 'tabular-nums' }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                    <span
                      className="font-sans"
                      style={{ fontSize: 12, lineHeight: 1.3, color: 'var(--color-corrente)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {p.nome}
                    </span>
                    <BarraOuro fracao={p.cliques / maiorPerfume} altura={5} />
                  </span>
                  <span className="font-mono" style={{ fontSize: 11.5, color: 'rgba(242,237,227,.6)', whiteSpace: 'nowrap' }}>
                    {p.cliques}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Cartao>

        <Cartao titulo="Perfil olfativo do público" apoio="o que as respostas dizem, pergunta a pergunta">
          {painel.perfil.length === 0 ? (
            <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
              As respostas ainda não trazem perfil legível.
            </span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {painel.perfil.map((p) => {
                const total = Math.max(1, p.valores.reduce((a, v) => a + v.qtd, 0))
                return (
                  <div key={p.pergunta} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span className="font-sans" style={MICRO}>{p.pergunta.replace(/_/g, ' ')}</span>
                    {p.valores.map((v) => (
                      <div key={v.valor} style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: 10, alignItems: 'center' }}>
                        <span className="font-sans" style={{ fontSize: 11.5, color: 'rgba(242,237,227,.78)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {v.valor.replace(/_/g, ' ')}
                        </span>
                        <BarraOuro fracao={v.qtd / total} altura={5} />
                        <span className="font-mono" style={{ fontSize: 10.5, color: 'rgba(242,237,227,.55)', whiteSpace: 'nowrap' }}>
                          {`${Math.round((v.qtd / total) * 100)}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </Cartao>
      </div>

      {painel.cliquesPorDia.length > 0 && (
        <Cartao titulo="Ritmo do quiz" apoio="interações por dia · últimos 30 dias" semRespiro>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 86, overflowX: 'auto', paddingBottom: 4 }}>
            {painel.cliquesPorDia.map((d) => (
              <div key={d.dia} title={`${dataBr(d.dia)} · ${plural(d.qtd, 'interação', 'interações')}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 26 }}>
                <span className="font-mono" style={{ fontSize: 9, color: 'rgba(239,209,140,.7)' }}>{d.qtd}</span>
                <span
                  aria-hidden
                  style={{
                    width: 16,
                    height: Math.max(4, Math.round((d.qtd / maiorDia) * 54)),
                    background: 'linear-gradient(180deg, #EFD18C, rgba(138,109,47,.65))',
                    borderRadius: '4px 4px 2px 2px',
                    boxShadow: '0 0 10px rgba(239,209,140,.18)',
                  }}
                />
                <span className="font-mono" style={{ fontSize: 8.5, color: 'rgba(242,237,227,.45)', whiteSpace: 'nowrap' }}>
                  {dataBr(d.dia).slice(0, 5)}
                </span>
              </div>
            ))}
          </div>
        </Cartao>
      )}

      <div className="empilha-1100" style={{ display: 'grid', gridTemplateColumns: lead ? 'minmax(0,1fr) 380px' : '1fr', gap: 16, alignItems: 'start' }}>
        <Tabela
          colunas={colunas}
          itens={painel.leadsRecentes}
          chaveDe={(l) => `${l.email}-${l.quando}`}
          aoClicar={(l) =>
            setSelecionado(selecionado === `${l.email}-${l.quando}` ? null : `${l.email}-${l.quando}`)
          }
          selecionadoDe={(l) => `${l.email}-${l.quando}` === selecionado}
          cabecalho={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px', borderBottom: '1px solid var(--color-borda)', flexWrap: 'wrap' }}>
              <TituloSecao tamanho={13}>Leads recentes</TituloSecao>
              <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
                clique num lead para abrir a assinatura olfativa dele
              </span>
            </div>
          }
          vazio={
            <div style={{ padding: '24px 18px', textAlign: 'center' }}>
              <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
                Nenhum lead ainda — eles aparecem aqui assim que alguém deixar o e-mail no quiz.
              </span>
            </div>
          }
        />

        {lead && <FichaDoLead lead={lead} aoFechar={() => setSelecionado(null)} />}
      </div>
    </div>
  )
}

/** A ficha individual: assinatura olfativa, afinidade e a curadoria do Gerente. */
function FichaDoLead({ lead, aoFechar }: { lead: Lead; aoFechar: () => void }) {
  const [ia, setIa] = useState<{ texto?: string; erro?: string } | null>(null)
  const [consultando, iniciar] = useTransition()

  const porPergunta = new Map<string, string[]>()
  for (const [pergunta, valor] of lead.perfil) {
    porPergunta.set(pergunta, [...(porPergunta.get(pergunta) ?? []), valor])
  }

  const pedirAoGerente = () =>
    iniciar(async () => {
      setIa(null)
      const r = await curadoriaDoGerente(lead.email)
      setIa(r.ok ? { texto: r.texto } : { erro: r.erro })
    })

  return (
    <section
      className="card-ouro"
      style={{ borderRadius: 16, padding: '20px 21px', display: 'flex', flexDirection: 'column', gap: 15, borderColor: 'rgba(239,209,140,.3)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          aria-hidden
          className="font-display"
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            border: '1px solid rgba(239,209,140,.5)',
            background: 'radial-gradient(circle at 30% 25%, rgba(239,209,140,.3), rgba(239,209,140,.06))',
            color: COR.ouro,
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          {iniciaisDe(lead.email.split('@')[0].replace(/[._]/g, ' '))}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
          <TituloSecao tamanho={15}>Assinatura olfativa</TituloSecao>
          <span className="font-mono" style={{ fontSize: 10, color: 'rgba(242,237,227,.5)', wordBreak: 'break-all' }}>
            {lead.email}
          </span>
        </span>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar ficha"
          className="font-sans hover:brightness-150"
          style={{ border: 0, background: 'transparent', color: 'rgba(242,237,227,.4)', fontSize: 15, cursor: 'pointer', padding: 2, alignSelf: 'flex-start' }}
        >
          ×
        </button>
      </div>

      <span aria-hidden style={{ height: 1, background: 'linear-gradient(90deg, rgba(239,209,140,.45), rgba(239,209,140,.05) 60%, transparent)' }} />

      {lead.perfil.length === 0 ? (
        <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.55, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
          Este lead deixou o e-mail sem o perfil de respostas.
        </span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...porPergunta.entries()].map(([pergunta, valores]) => (
            <div key={pergunta} style={{ display: 'grid', gridTemplateColumns: '76px 1fr', gap: 10, alignItems: 'baseline' }}>
              <span className="font-sans" style={MICRO}>{pergunta.replace(/_/g, ' ')}</span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {valores.map((v) => (
                  <span
                    key={v}
                    className="font-sans"
                    style={{
                      padding: '4px 11px',
                      border: '1px solid rgba(239,209,140,.4)',
                      background: 'linear-gradient(135deg, rgba(239,209,140,.13), rgba(239,209,140,.04))',
                      color: COR.ouro,
                      fontSize: 11,
                      lineHeight: 1.2,
                      borderRadius: 'var(--radius-pill)',
                    }}
                  >
                    {v.replace(/_/g, ' ')}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}

      {lead.clicadosNaSessao.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.07)' }}>
          <span className="font-sans" style={MICRO}>Clicou no quiz</span>
          {lead.clicadosNaSessao.map((p) => (
            <span key={p} className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.4, color: 'var(--color-corrente)' }}>
              {p}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.07)' }}>
        <span className="font-sans" style={MICRO}>Curadoria por DNA olfativo</span>
        {lead.curadoria.length === 0 ? (
          <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.55, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
            {lead.perfil.length === 0
              ? 'Sem perfil de respostas não há cruzamento possível.'
              : 'Nenhum perfume do catálogo casa o suficiente com este perfil — ou o espelho do catálogo ainda não rodou (sincronização de vendas).'}
          </span>
        ) : (
          lead.curadoria.map((e, i) => (
            <div key={e.nome} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr)', gap: 9, alignItems: 'start' }}>
              <span className="font-display" style={{ fontSize: 14, fontWeight: 600, color: i === 0 ? COR.ouro : 'rgba(242,237,227,.35)', lineHeight: 1.4 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.3, color: 'var(--color-corrente)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                    {e.nome}
                    {e.marca && <span style={{ color: 'rgba(242,237,227,.45)' }}>{` · ${e.marca}`}</span>}
                  </span>
                  <span className="font-mono" style={{ fontSize: 10.5, color: COR.ouro, whiteSpace: 'nowrap' }}>
                    {`${Math.round(e.afinidade * 100)}%`}
                  </span>
                </span>
                <BarraOuro fracao={e.afinidade} altura={4} />
                {e.casaEm.length > 0 && (
                  <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <span className="font-sans" style={{ ...MICRO, fontSize: 8.5 }}>combina em</span>
                    {e.casaEm.map((c) => (
                      <span
                        key={c}
                        className="font-sans"
                        style={{
                          padding: '2px 8px',
                          border: '1px solid rgba(239,209,140,.3)',
                          background: 'rgba(239,209,140,.07)',
                          color: 'rgba(239,209,140,.85)',
                          fontSize: 9.5,
                          lineHeight: 1.3,
                          borderRadius: 'var(--radius-pill)',
                        }}
                      >
                        {c.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </div>
          ))
        )}
      </div>

      {lead.recomendacoes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.07)' }}>
          <span className="font-sans" style={MICRO}>Afinidade com outros perfis</span>
          {lead.recomendacoes.map((r, i) => (
            <div key={r.nome} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) auto', gap: 9, alignItems: 'center' }}>
              <span className="font-display" style={{ fontSize: 14, fontWeight: 600, color: i === 0 ? COR.ouro : 'rgba(242,237,227,.35)' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.3, color: 'var(--color-corrente)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.nome}
                </span>
                <BarraOuro fracao={r.afinidade} altura={4} />
              </span>
              <span className="font-mono" style={{ fontSize: 10.5, color: COR.ouro, whiteSpace: 'nowrap' }}>
                {`${Math.round(r.afinidade * 100)}%`}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="font-sans" style={MICRO}>Curadoria do Gerente</span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            disabled={consultando || lead.perfil.length === 0}
            onClick={pedirAoGerente}
            className="botao-ouro font-sans hover:brightness-110"
            style={{
              height: 32,
              padding: '0 15px',
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: '.04em',
              borderRadius: 9,
              cursor: consultando ? 'wait' : 'pointer',
              opacity: consultando || lead.perfil.length === 0 ? 0.6 : 1,
            }}
          >
            {consultando ? 'Compondo…' : '✦ Curar com IA'}
          </button>
        </div>

        {ia?.erro && (
          <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: COR.erro, textWrap: 'pretty' }}>
            {ia.erro}
          </span>
        )}
        {ia?.texto && (
          <div
            style={{
              padding: '13px 15px',
              borderRadius: 12,
              border: '1px solid rgba(239,209,140,.3)',
              background: 'linear-gradient(160deg, rgba(239,209,140,.08), rgba(239,209,140,.02))',
            }}
          >
            <p
              className="font-sans"
              style={{ margin: 0, fontSize: 11.5, lineHeight: 1.65, color: 'var(--color-corrente)', whiteSpace: 'pre-wrap', textWrap: 'pretty' }}
            >
              {ia.texto}
            </p>
          </div>
        )}
        {!ia && !consultando && (
          <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.5, color: 'rgba(242,237,227,.4)', textWrap: 'pretty' }}>
            O Gerente recebe a curadoria por DNA acima e compõe o texto no tom da marca —
            uma frase por perfume, pronta para enviar no WhatsApp.
          </span>
        )}
      </div>
    </section>
  )
}
