'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { BORDA, COR, FAIXA, FUNDO } from '@/components/erp/tokens'
import { Ico } from '@/components/erp/IconesUi'
import { blocosDaResposta, rotuloDaFerramenta } from '@/domain'

/**
 * A conversa com o Assessor.
 *
 * Estado local por um motivo prático: a resposta demora dezenas de segundos
 * quando o modelo consulta três ferramentas, e recarregar a página inteira ao
 * fim de cada pergunta perderia a rolagem e piscaria a tela. O banco continua
 * sendo a verdade — ao trocar de conversa, o que aparece é o que veio do
 * servidor, não o que ficou na memória da aba.
 */

export interface MensagemNaTela {
  id: number | string
  papel: 'usuario' | 'assessor'
  texto: string
  ferramentas: { nome: string; ms: number; erro?: string }[]
}

export interface ConversaNaLista {
  id: string
  titulo: string
  atualizadaEm: string
}

const SUGESTOES = [
  'Como foi o mês até agora comparado com o mês anterior?',
  'O que exige decisão minha hoje no financeiro?',
  'Que perfumes vão acabar antes de eu conseguir repor?',
  'Por que o faturado e o recebido líquido não batem no dia?',
]

export function Conversa({
  conversaId,
  inicial,
  conversas,
  configurado,
}: {
  conversaId: string | null
  inicial: MensagemNaTela[]
  conversas: ConversaNaLista[]
  configurado: boolean
}) {
  const router = useRouter()
  const [id, setId] = useState(conversaId)
  const [mensagens, setMensagens] = useState<MensagemNaTela[]>(inicial)
  const [rascunho, setRascunho] = useState('')
  const [pensando, setPensando] = useState(false)
  const fim = useRef<HTMLDivElement>(null)

  // Trocar de conversa pela lista lateral recarrega o histórico do servidor.
  useEffect(() => {
    setId(conversaId)
    setMensagens(inicial)
  }, [conversaId, inicial])

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensagens, pensando])

  async function perguntar(texto: string) {
    const pergunta = texto.trim()
    if (!pergunta || pensando) return
    setRascunho('')
    setMensagens((m) => [...m, { id: `local-${m.length}`, papel: 'usuario', texto: pergunta, ferramentas: [] }])
    setPensando(true)
    try {
      const r = await fetch('/api/assessor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pergunta, conversaId: id }),
      })
      const dados = (await r.json()) as {
        conversaId?: string
        texto?: string
        ferramentas?: MensagemNaTela['ferramentas']
        erro?: string
      }
      if (dados.conversaId && dados.conversaId !== id) setId(dados.conversaId)
      setMensagens((m) => [
        ...m,
        {
          id: `local-r-${m.length}`,
          papel: 'assessor',
          texto: dados.texto ?? `Não consegui responder: ${dados.erro ?? 'erro desconhecido'}`,
          ferramentas: dados.ferramentas ?? [],
        },
      ])
      // A lista lateral ganhou (ou renomeou) uma conversa: pede ao servidor.
      if (!id) router.refresh()
    } catch (e) {
      setMensagens((m) => [
        ...m,
        {
          id: `local-e-${m.length}`,
          papel: 'assessor',
          texto: `Não consegui responder: ${e instanceof Error ? e.message : String(e)}`,
          ferramentas: [],
        },
      ])
    } finally {
      setPensando(false)
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 232px',
        gap: 16,
        alignItems: 'start',
      }}
      className="empilha-1180"
    >
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--color-borda)',
          borderRadius: 14,
          background: '#0F0F10',
          minWidth: 0,
          height: 'calc(100vh - 210px)',
          minHeight: 460,
        }}
      >
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', minHeight: 0 }}>
          {mensagens.length === 0 ? (
            <Boasvindas configurado={configurado} aoEscolher={perguntar} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {mensagens.map((m) => (
                <Balao key={m.id} m={m} />
              ))}
            </div>
          )}
          {pensando && <Pensando />}
          <div ref={fim} />
        </div>

        <Compositor
          valor={rascunho}
          aoMudar={setRascunho}
          aoEnviar={() => perguntar(rascunho)}
          travado={pensando || !configurado}
          aviso={configurado ? null : 'Falta a variável ANTHROPIC_API_KEY no site.'}
        />
      </section>

      <ListaLateral conversas={conversas} atual={id} />
    </div>
  )
}

// ── Mensagem ───────────────────────────────────────────────────────────────

function Balao({ m }: { m: MensagemNaTela }) {
  const meu = m.papel === 'usuario'
  return (
    <div style={{ display: 'flex', justifyContent: meu ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: meu ? '76%' : '100%', minWidth: 0 }}>
        {!meu && m.ferramentas.length > 0 && <Consultou ferramentas={m.ferramentas} />}
        <div
          className="font-sans"
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: meu ? 'var(--color-tinta)' : 'rgba(242,237,227,.86)',
            background: meu ? 'rgba(255,255,255,.045)' : 'transparent',
            border: meu ? '1px solid var(--color-borda)' : 0,
            borderRadius: 12,
            padding: meu ? '11px 14px' : 0,
            textWrap: 'pretty',
          }}
        >
          {meu ? m.texto : <Resposta texto={m.texto} />}
        </div>
      </div>
    </div>
  )
}

/**
 * O que o Assessor consultou antes de responder.
 *
 * Não é enfeite: é a diferença entre "ele disse 26 pendências" e "ele leu a
 * Conciliação e ela disse 26". Sem essa linha o número vira palavra de honra.
 */
function Consultou({ ferramentas }: { ferramentas: MensagemNaTela['ferramentas'] }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 9 }}>
      {ferramentas.map((f, i) => (
        <span
          key={`${f.nome}-${i}`}
          className="font-sans"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '.04em',
            padding: '4px 8px',
            borderRadius: 'var(--radius-chip)',
            color: f.erro ? COR.erro : COR.info,
            background: f.erro ? FUNDO.erro : FUNDO.info,
            border: `1px solid ${BORDA[f.erro ? 'erro' : 'info']}`,
          }}
          title={f.erro ?? `${f.ms} ms`}
        >
          <Ico n={f.erro ? 'alerta' : 'check'} tamanho={11} />
          {rotuloDaFerramenta(f.nome)}
        </span>
      ))}
    </div>
  )
}

function Resposta({ texto }: { texto: string }) {
  const blocos = blocosDaResposta(texto)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {blocos.map((b, i) => {
        if (b.tipo === 'titulo') {
          return (
            <h3
              key={i}
              className="font-display"
              style={{
                margin: '4px 0 0',
                fontSize: 13.5,
                fontWeight: 600,
                color: 'var(--color-tinta)',
              }}
            >
              {b.texto}
            </h3>
          )
        }
        if (b.tipo === 'lista') {
          return (
            <ul key={i} style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {b.itens.map((item, j) => (
                <li key={j} style={{ display: 'flex', gap: 9, alignItems: 'baseline' }}>
                  <span
                    aria-hidden
                    style={{
                      width: 5,
                      height: 5,
                      flex: 'none',
                      transform: 'rotate(45deg)',
                      background: COR.ouro,
                      marginTop: 1,
                    }}
                  />
                  <span style={{ minWidth: 0 }}>
                    {item.map((t, k) => (
                      <Parte key={k} t={t} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i} style={{ margin: 0 }}>
            {b.partes.map((t, k) => (
              <Parte key={k} t={t} />
            ))}
          </p>
        )
      })}
    </div>
  )
}

function Parte({ t }: { t: { texto: string; forte: boolean } }) {
  return t.forte ? (
    <strong style={{ fontWeight: 600, color: 'var(--color-tinta)' }}>{t.texto}</strong>
  ) : (
    <>{t.texto}</>
  )
}

function Pensando() {
  return (
    <div
      className="font-sans"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        marginTop: 16,
        fontSize: 11.5,
        color: 'rgba(242,237,227,.42)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          transform: 'rotate(45deg)',
          background: COR.ouro,
          animation: 'fr-pulse 1.1s ease-in-out infinite',
        }}
      />
      Consultando o ERP…
    </div>
  )
}

// ── Entrada ────────────────────────────────────────────────────────────────

function Compositor({
  valor,
  aoMudar,
  aoEnviar,
  travado,
  aviso,
}: {
  valor: string
  aoMudar: (v: string) => void
  aoEnviar: () => void
  travado: boolean
  aviso: string | null
}) {
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,.06)', padding: '12px 14px 14px' }}>
      {aviso && (
        <p
          className="font-sans"
          style={{
            margin: '0 0 10px',
            fontSize: 11,
            color: COR.atencao,
            background: FAIXA.atencao,
            border: `1px solid ${BORDA.atencao}`,
            borderRadius: 10,
            padding: '8px 11px',
          }}
        >
          {aviso}
        </p>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <textarea
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          onKeyDown={(e) => {
            // Enter envia, Shift+Enter quebra linha: é o que a mão espera de
            // um campo de conversa.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              aoEnviar()
            }
          }}
          rows={2}
          placeholder="Pergunte sobre vendas, caixa, estoque ou conciliação…"
          className="font-sans"
          style={{
            flex: 1,
            minWidth: 0,
            resize: 'none',
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--color-tinta)',
            background: 'rgba(255,255,255,.03)',
            border: '1px solid var(--color-borda)',
            borderRadius: 11,
            padding: '10px 13px',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={aoEnviar}
          disabled={travado || !valor.trim()}
          className="font-sans"
          style={{
            flex: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 12,
            fontWeight: 600,
            padding: '11px 15px',
            borderRadius: 11,
            cursor: travado || !valor.trim() ? 'not-allowed' : 'pointer',
            opacity: travado || !valor.trim() ? 0.42 : 1,
            color: '#12100C',
            background: COR.ouro,
            border: 0,
          }}
        >
          <Ico n="enviar" tamanho={14} />
          Perguntar
        </button>
      </div>
    </div>
  )
}

function Boasvindas({
  configurado,
  aoEscolher,
}: {
  configurado: boolean
  aoEscolher: (t: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <h2
          className="font-display"
          style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--color-tinta)' }}
        >
          Pergunte sobre a operação.
        </h2>
        <p
          className="font-sans"
          style={{
            margin: 0,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: 'rgba(242,237,227,.5)',
            maxWidth: 560,
            textWrap: 'pretty',
          }}
        >
          O Assessor lê as mesmas telas que você — Dashboard, Financeiro, Conciliação, Extrato e
          Estoque — e responde com os números de lá. Ele não calcula nada por conta própria e não
          altera nada: nesta fase, só lê.
        </p>
      </div>

      {configurado && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 560 }}>
          {SUGESTOES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => aoEscolher(s)}
              className="font-sans hover:brightness-125"
              style={{
                textAlign: 'left',
                fontSize: 12.5,
                lineHeight: 1.45,
                color: 'rgba(242,237,227,.78)',
                background: 'rgba(255,255,255,.03)',
                border: '1px solid var(--color-borda)',
                borderRadius: 11,
                padding: '10px 13px',
                cursor: 'pointer',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Conversas anteriores ───────────────────────────────────────────────────

function ListaLateral({ conversas, atual }: { conversas: ConversaNaLista[]; atual: string | null }) {
  return (
    <aside
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        border: '1px solid var(--color-borda)',
        borderRadius: 14,
        background: '#0F0F10',
        padding: '14px 13px',
        minWidth: 0,
      }}
    >
      <a
        href="/assessor"
        className="font-sans hover:brightness-125"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          fontSize: 11.5,
          fontWeight: 600,
          padding: '9px 12px',
          borderRadius: 10,
          color: COR.ouro,
          background: FUNDO.ouro,
          border: `1px solid ${BORDA.ouro}`,
          textDecoration: 'none',
        }}
      >
        <Ico n="mais" tamanho={13} />
        Nova conversa
      </a>

      <span
        className="font-sans"
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          color: 'rgba(242,237,227,.3)',
          marginTop: 6,
        }}
      >
        Anteriores
      </span>

      {conversas.length === 0 ? (
        <span className="font-sans" style={{ fontSize: 11, color: 'rgba(242,237,227,.32)' }}>
          Nenhuma ainda.
        </span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          {conversas.map((c) => (
            <a
              key={c.id}
              href={`/assessor?c=${c.id}`}
              className="font-sans hover:brightness-125"
              style={{
                fontSize: 11.5,
                lineHeight: 1.35,
                padding: '8px 10px',
                borderRadius: 9,
                textDecoration: 'none',
                color: c.id === atual ? 'var(--color-tinta)' : 'rgba(242,237,227,.58)',
                background: c.id === atual ? 'rgba(255,255,255,.05)' : 'transparent',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={c.titulo}
            >
              {c.titulo}
            </a>
          ))}
        </div>
      )}
    </aside>
  )
}
