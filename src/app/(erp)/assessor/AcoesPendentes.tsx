'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { CONTORNO, Etiqueta, Ico, TINTA, VELADO, type TomUi } from '@/components/erp/ui'
import { brl } from '@/domain'

/**
 * O cartão de aprovação — §8.1 do escopo.
 *
 * Ele mostra, antes de qualquer gravação: o que muda, quantos registros, quanto
 * dinheiro, os efeitos colaterais previsíveis e se dá para desfazer. E mostra
 * uma AMOSTRA dos registros, porque aprovar "23 movimentos" sem ver nenhum é
 * aprovar no escuro — e é assim que erro em massa acontece.
 *
 * O relógio de validade fica visível de propósito. Entre a prévia e o clique o
 * ERP anda; quando o prazo vence, o botão desliga em vez de executar sobre um
 * estado que já mudou.
 */

export interface AcaoNaTela {
  id: string
  ferramenta: string
  risco: 'A' | 'B' | 'C' | 'D'
  validaAte: string
  previa: {
    titulo: string
    linhas: { rotulo: string; valor: string }[]
    amostra?: { descricao: string; valor: number; nota?: string }[]
    efeitos?: string[]
    reversivel: boolean
  } | null
}

const TOM_DO_RISCO: Record<AcaoNaTela['risco'], TomUi> = {
  A: 'info',
  B: 'atencao',
  C: 'erro',
  D: 'erro',
}

const ROTULO_DO_RISCO: Record<AcaoNaTela['risco'], string> = {
  A: 'Baixo risco · reversível',
  B: 'Médio risco · confirmação',
  C: 'Alto risco · confirmação reforçada',
  D: 'Proibido',
}

export function AcoesPendentes({
  acoes,
  conversaId,
  escritaLiberada,
}: {
  acoes: AcaoNaTela[]
  conversaId: string | null
  escritaLiberada: boolean
}) {
  if (acoes.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {acoes.map((a) => (
        <Cartao key={a.id} acao={a} conversaId={conversaId} escritaLiberada={escritaLiberada} />
      ))}
    </div>
  )
}

function Cartao({
  acao,
  conversaId,
  escritaLiberada,
}: {
  acao: AcaoNaTela
  conversaId: string | null
  escritaLiberada: boolean
}) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<'aprovar' | 'cancelar' | null>(null)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  const [restante, setRestante] = useState(() => sobra(acao.validaAte))

  useEffect(() => {
    const t = setInterval(() => setRestante(sobra(acao.validaAte)), 1000)
    return () => clearInterval(t)
  }, [acao.validaAte])

  const expirou = restante <= 0
  const tom = TOM_DO_RISCO[acao.risco]
  const p = acao.previa

  async function decidir(decisao: 'aprovar' | 'cancelar') {
    setOcupado(decisao)
    try {
      const r = await fetch('/api/assessor/acoes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: acao.id, decisao, conversaId }),
      })
      const dados = (await r.json()) as { ok?: boolean; recibo?: string; erro?: string }
      setResultado({
        ok: Boolean(dados.ok),
        texto: dados.erro ?? dados.recibo ?? 'Sem resposta do servidor.',
      })
      if (dados.ok) router.refresh()
    } catch (e) {
      setResultado({ ok: false, texto: e instanceof Error ? e.message : String(e) })
    } finally {
      setOcupado(null)
    }
  }

  if (resultado) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '13px 14px',
          borderRadius: 12,
          border: `1px solid ${CONTORNO[resultado.ok ? 'ok' : 'erro']}`,
          background: VELADO[resultado.ok ? 'ok' : 'erro'],
        }}
      >
        <span style={{ color: TINTA[resultado.ok ? 'ok' : 'erro'], flex: 'none', marginTop: 1 }}>
          <Ico n={resultado.ok ? 'check-circulo' : 'x-circulo'} tamanho={15} />
        </span>
        <span
          className="font-sans"
          style={{ fontSize: 12, lineHeight: 1.5, color: 'rgba(242,237,227,.8)', textWrap: 'pretty' }}
        >
          {resultado.texto}
        </span>
      </div>
    )
  }

  return (
    <article
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 11,
        padding: '14px 15px',
        borderRadius: 13,
        border: `1px solid ${CONTORNO[tom]}`,
        background: VELADO[tom],
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ color: TINTA[tom], display: 'grid', placeItems: 'center' }}>
          <Ico n="escudo" tamanho={16} />
        </span>
        <span
          className="font-display"
          style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-tinta)' }}
        >
          {p?.titulo ?? acao.ferramenta}
        </span>
        <span
          className="font-sans"
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '.09em',
            textTransform: 'uppercase',
            color: TINTA[tom],
          }}
        >
          {ROTULO_DO_RISCO[acao.risco]}
        </span>
        <div style={{ flex: 1, minWidth: 4 }} />
        <span
          className="font-mono"
          style={{ fontSize: 11, color: expirou ? TINTA.erro : 'rgba(242,237,227,.42)' }}
        >
          {expirou ? 'expirada' : `expira em ${formatar(restante)}`}
        </span>
      </div>

      {p && (
        <>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {p.linhas.map((l) => (
              <span key={l.rotulo} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Etiqueta>{l.rotulo}</Etiqueta>
                <span
                  className="font-sans"
                  style={{ fontSize: 12, color: 'rgba(242,237,227,.82)' }}
                >
                  {l.valor}
                </span>
              </span>
            ))}
          </div>

          {p.amostra && p.amostra.length > 0 && (
            <details>
              <summary
                className="font-sans hover:text-ouro"
                style={{
                  cursor: 'pointer',
                  listStyle: 'none',
                  fontSize: 11,
                  color: 'rgba(242,237,227,.45)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Ico n="olho" tamanho={12} />
                Ver os registros afetados
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                {p.amostra.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'baseline',
                      padding: '6px 9px',
                      borderRadius: 7,
                      background: 'rgba(0,0,0,.18)',
                    }}
                  >
                    <span
                      className="font-sans"
                      style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: 'rgba(242,237,227,.72)' }}
                    >
                      {r.descricao}
                      {r.nota && (
                        <span style={{ color: 'rgba(242,237,227,.38)' }}> — {r.nota}</span>
                      )}
                    </span>
                    <span className="font-mono" style={{ fontSize: 11.5, color: 'var(--color-corrente)' }}>
                      {brl(r.valor)}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {p.efeitos && p.efeitos.length > 0 && (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 5, margin: 0, padding: 0 }}>
              {p.efeitos.map((t, i) => (
                <li key={i} style={{ display: 'flex', gap: 7, listStyle: 'none' }}>
                  <span
                    aria-hidden
                    style={{
                      width: 4,
                      height: 4,
                      marginTop: 6,
                      flex: 'none',
                      transform: 'rotate(45deg)',
                      background: TINTA[tom],
                      opacity: 0.65,
                    }}
                  />
                  <span
                    className="font-sans"
                    style={{ fontSize: 11, lineHeight: 1.45, color: 'rgba(242,237,227,.6)', textWrap: 'pretty' }}
                  >
                    {t}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <span className="font-sans" style={{ fontSize: 10.5, color: 'rgba(242,237,227,.4)' }}>
          {/* O escopo §13 manda dizer quando NÃO dá para desfazer. Dizer o
              contrário também ajuda: quem sabe que é reversível decide mais rápido. */}
          {p?.reversivel ? 'Esta ação pode ser desfeita depois.' : 'Esta ação NÃO pode ser desfeita.'}
        </span>
        <div style={{ flex: 1, minWidth: 4 }} />
        <button
          type="button"
          onClick={() => decidir('cancelar')}
          disabled={ocupado !== null}
          className="font-sans hover:border-ouro/40 hover:text-ouro"
          style={{
            height: 32,
            padding: '0 14px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,.11)',
            background: 'transparent',
            color: 'var(--color-secundario)',
            fontSize: 11,
            fontWeight: 600,
            cursor: ocupado ? 'wait' : 'pointer',
          }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => decidir('aprovar')}
          disabled={ocupado !== null || expirou || !escritaLiberada}
          title={
            !escritaLiberada
              ? 'A escrita do Gerente está desligada nas configurações.'
              : expirou
                ? 'A prévia expirou. Peça uma nova.'
                : undefined
          }
          className="botao-ouro font-sans hover:brightness-[1.07]"
          style={{
            height: 32,
            padding: '0 16px',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 700,
            boxShadow: 'var(--shadow-ouro)',
            cursor: ocupado || expirou || !escritaLiberada ? 'not-allowed' : 'pointer',
            opacity: ocupado || expirou || !escritaLiberada ? 0.45 : 1,
          }}
        >
          {ocupado === 'aprovar' ? 'Executando…' : 'Aprovar e executar'}
        </button>
      </div>

      {!escritaLiberada && (
        <span className="font-sans" style={{ fontSize: 10.5, color: TINTA.atencao }}>
          A escrita do Gerente está desligada. Ligue em Meu Assessor → Configurações para aprovar.
        </span>
      )}
    </article>
  )
}

function sobra(validaAte: string): number {
  return new Date(validaAte).getTime() - Date.now()
}

function formatar(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
