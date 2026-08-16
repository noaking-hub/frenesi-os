'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

import { BaixarCsv } from '@/components/erp/BaixarCsv'
import { CONTORNO, Etiqueta, Ico, TINTA, VELADO } from '@/components/erp/ui'
import { blocosDaResposta, ROTULO_DO_MARCADOR, rotuloDaFerramenta } from '@/domain'

/**
 * O assistente contextual — §3.2 do escopo.
 *
 * Ele existe para responder a pergunta que nasce OLHANDO uma tela: "por que
 * este pedido está divergente?", "como este preço afeta a margem?". O escopo é
 * explícito em duas exigências, e as duas são de confiança:
 *
 * 1. O contexto da tela é oferecido AUTOMATICAMENTE — sem isso, a pessoa
 *    precisa repetir o identificador que já está na frente dela.
 * 2. E ele é VISÍVEL E REMOVÍVEL. Um contexto implícito que o usuário não vê é
 *    um contexto que ele não pode corrigir: a resposta viria enviesada por uma
 *    tela que ele nem estava olhando, e ninguém conseguiria explicar por quê.
 *
 * O painel não tem motor próprio. Ele chama a mesma rota da Central, com a
 * mesma auditoria — só muda a forma de entrar.
 */

const ROTULOS: [RegExp, string][] = [
  [/^\/$/, 'Dashboard'],
  [/^\/assessor\/classificacao/, 'Fila de classificação'],
  [/^\/assessor\/alertas/, 'Alertas do Gerente'],
  [/^\/assessor/, 'Meu Assessor'],
  [/^\/financeiro\/conciliacao/, 'Conciliação'],
  [/^\/financeiro\/lancamentos/, 'Lançamentos'],
  [/^\/financeiro\/extrato/, 'Extrato'],
  [/^\/financeiro\/fluxo/, 'Fluxo de caixa'],
  [/^\/financeiro\/dre/, 'DRE'],
  [/^\/financeiro/, 'Visão Financeira'],
  [/^\/pedidos\/envios/, 'Envios'],
  [/^\/pedidos/, 'Pedidos'],
  [/^\/estoque/, 'Estoque'],
  [/^\/produtos/, 'Produtos'],
  [/^\/envase/, 'Fila de envase'],
  [/^\/crm/, 'CRM'],
  [/^\/relatorios/, 'Relatórios'],
]

function rotuloDaTela(caminho: string): string {
  return ROTULOS.find(([r]) => r.test(caminho))?.[1] ?? 'ERP'
}

interface Fala {
  papel: 'usuario' | 'assessor'
  texto: string
  ferramentas?: {
    nome: string
    ms?: number
    erro?: string
    argumentos?: Record<string, unknown>
    linhas?: number
  }[]
}

export function AssistenteContextual() {
  const caminho = usePathname()
  const [aberto, setAberto] = useState(false)
  const [usarContexto, setUsarContexto] = useState(true)
  const [pergunta, setPergunta] = useState('')
  const [falas, setFalas] = useState<Fala[]>([])
  const [pensando, setPensando] = useState(false)
  // A conversa do painel é UMA só enquanto ele estiver aberto. Sem guardar o
  // id, cada pergunta abria uma conversa nova: o histórico do ERP virava uma
  // pilha de conversas de duas mensagens, e o painel não lembrava do que tinha
  // acabado de responder — o mesmo esquecimento que o WhatsApp tinha.
  const [conversaId, setConversaId] = useState<string | null>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const fim = useRef<HTMLDivElement>(null)

  // A Central já é a conversa inteira; abrir o painel por cima dela seria dois
  // campos de pergunta na mesma tela disputando o mesmo clique.
  const naCentral = caminho === '/assessor'

  useEffect(() => {
    function atalho(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setAberto((v) => !v)
      }
      if (e.key === 'Escape') setAberto(false)
    }
    window.addEventListener('keydown', atalho)
    return () => window.removeEventListener('keydown', atalho)
  }, [])

  useEffect(() => {
    if (aberto) campo.current?.focus()
  }, [aberto])

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [falas.length, pensando])

  async function enviar() {
    const texto = pergunta.trim()
    if (!texto || pensando) return
    setPergunta('')
    setPensando(true)
    setFalas((f) => [...f, { papel: 'usuario', texto }])

    // O contexto vai como PREFIXO explícito, e não escondido no system prompt.
    // Assim ele aparece na auditoria exatamente como influenciou a resposta —
    // quem for reler amanhã vê a pergunta que o modelo realmente recebeu.
    const comContexto = usarContexto
      ? `[Estou na tela "${rotuloDaTela(caminho)}" (${caminho}) do ERP.]\n${texto}`
      : texto

    try {
      const r = await fetch('/api/assessor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pergunta: comContexto, conversaId }),
      })
      const d = (await r.json()) as {
        texto?: string
        erro?: string
        conversaId?: string
        ferramentas?: Fala['ferramentas']
      }
      if (d.conversaId) setConversaId(d.conversaId)
      setFalas((f) => [
        ...f,
        {
          papel: 'assessor',
          texto: d.texto ?? `Não consegui responder: ${d.erro ?? 'erro desconhecido'}`,
          ferramentas: d.ferramentas,
        },
      ])
    } catch (e) {
      setFalas((f) => [
        ...f,
        { papel: 'assessor', texto: `Não consegui responder: ${e instanceof Error ? e.message : String(e)}` },
      ])
    } finally {
      setPensando(false)
      campo.current?.focus()
    }
  }

  if (naCentral) return null

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Perguntar ao Gerente sobre esta tela (Ctrl+J)"
        className="botao-ouro hover:brightness-[1.07]"
        style={{
          position: 'fixed',
          right: 22,
          bottom: 22,
          width: 46,
          height: 46,
          borderRadius: 14,
          display: 'grid',
          placeItems: 'center',
          boxShadow: 'var(--shadow-ouro)',
          zIndex: 40,
          cursor: 'pointer',
        }}
        aria-label="Abrir o Gerente"
      >
        <Ico n="faisca" tamanho={20} />
      </button>
    )
  }

  return (
    <aside
      role="dialog"
      aria-label="Gerente"
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: 'min(430px, 100vw)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-painel)',
        borderLeft: '1px solid rgba(255,255,255,.08)',
        boxShadow: '-24px 0 60px rgba(0,0,0,.45)',
        zIndex: 50,
      }}
      className="animate-[fr-in_.2s_ease_both]"
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '15px 16px',
          borderBottom: '1px solid rgba(255,255,255,.06)',
        }}
      >
        <span style={{ color: TINTA.ouro, display: 'grid', placeItems: 'center' }}>
          <Ico n="faisca" tamanho={17} />
        </span>
        <span className="font-display" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-tinta)' }}>
          Gerente
        </span>
        <div style={{ flex: 1 }} />
        <a
          href="/assessor"
          className="font-sans hover:text-ouro"
          style={{ fontSize: 11, color: 'rgba(242,237,227,.42)' }}
        >
          Abrir a Central
        </a>
        <button
          type="button"
          onClick={() => setAberto(false)}
          aria-label="Fechar"
          style={{
            border: 0,
            background: 'transparent',
            color: 'rgba(242,237,227,.45)',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Ico n="x" tamanho={16} />
        </button>
      </header>

      {/* O chip do contexto: visível e removível, como o §3.2 exige. */}
      <div style={{ padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        <Etiqueta>Contexto enviado</Etiqueta>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          {usarContexto ? (
            <span
              className="font-sans"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '5px 10px',
                borderRadius: 8,
                border: `1px solid ${CONTORNO.ouro}`,
                background: VELADO.ouro,
                fontSize: 11,
                color: TINTA.ouro,
              }}
            >
              <Ico n="grade" tamanho={12} />
              {rotuloDaTela(caminho)}
              <button
                type="button"
                onClick={() => setUsarContexto(false)}
                aria-label="Remover contexto"
                style={{
                  border: 0,
                  background: 'transparent',
                  color: 'inherit',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  opacity: 0.7,
                }}
              >
                <Ico n="x" tamanho={11} />
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setUsarContexto(true)}
              className="font-sans hover:text-ouro"
              style={{
                padding: '5px 10px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,.09)',
                background: 'transparent',
                color: 'rgba(242,237,227,.45)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              + Enviar a tela atual como contexto
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 13 }}>
        {falas.length === 0 && !pensando && (
          <span
            className="font-sans"
            style={{ fontSize: 11.5, lineHeight: 1.6, color: 'rgba(242,237,227,.42)', textWrap: 'pretty' }}
          >
            Pergunte sobre o que está vendo. O Gerente sabe em que tela você está, responde com os
            números oficiais do ERP e diz de onde cada um veio.
          </span>
        )}
        {falas.map((f, i) => (
          <FalaNoPainel key={i} f={f} />
        ))}
        {pensando && (
          <span
            className="font-sans animate-[fr-pulse_1.6s_ease-in-out_infinite]"
            style={{ fontSize: 11.5, color: 'rgba(242,237,227,.45)' }}
          >
            Consultando o ERP…
          </span>
        )}
        <div ref={fim} />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 9,
          padding: '11px 13px',
          margin: 12,
          borderRadius: 11,
          border: '1px solid rgba(255,255,255,.09)',
          background: 'rgba(255,255,255,.025)',
        }}
      >
        <textarea
          ref={campo}
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void enviar()
            }
          }}
          rows={1}
          placeholder="Pergunte sobre esta tela…"
          disabled={pensando}
          className="font-sans"
          style={{
            flex: 1,
            minWidth: 0,
            resize: 'none',
            maxHeight: 120,
            border: 0,
            outline: 'none',
            background: 'transparent',
            color: 'var(--color-tinta)',
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        />
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={pensando || !pergunta.trim()}
          aria-label="Enviar"
          className="botao-ouro hover:brightness-[1.07]"
          style={{
            width: 32,
            height: 32,
            flex: 'none',
            borderRadius: 8,
            display: 'grid',
            placeItems: 'center',
            cursor: pensando || !pergunta.trim() ? 'not-allowed' : 'pointer',
            opacity: pensando || !pergunta.trim() ? 0.4 : 1,
          }}
        >
          <Ico n="enviar" tamanho={14} />
        </button>
      </div>
    </aside>
  )
}

function FalaNoPainel({ f }: { f: Fala }) {
  if (f.papel === 'usuario') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span
          className="font-sans"
          style={{
            maxWidth: '88%',
            padding: '8px 11px',
            borderRadius: '11px 11px 3px 11px',
            border: `1px solid ${CONTORNO.ouro}`,
            background: VELADO.ouro,
            fontSize: 12,
            lineHeight: 1.5,
            color: 'var(--color-tinta)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {f.texto}
        </span>
      </div>
    )
  }

  const blocos = blocosDaResposta(f.texto)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {blocos.map((b, i) => {
        if (b.tipo === 'titulo') {
          return (
            <span key={i} className="font-display" style={{ fontSize: 12.5, fontWeight: 600, color: TINTA.ouro }}>
              {b.texto}
            </span>
          )
        }
        if (b.tipo === 'lista') {
          return (
            <ul key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5, margin: 0, padding: 0 }}>
              {b.itens.map((item, k) => (
                <li key={k} style={{ display: 'flex', gap: 7, listStyle: 'none' }}>
                  <span
                    aria-hidden
                    style={{
                      width: 4,
                      height: 4,
                      marginTop: 6,
                      flex: 'none',
                      transform: 'rotate(45deg)',
                      background: TINTA.ouro,
                      opacity: 0.6,
                    }}
                  />
                  <Texto partes={item} />
                </li>
              ))}
            </ul>
          )
        }
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {b.marcador && (
              <span
                className="font-sans"
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: TINTA.info,
                }}
              >
                {ROTULO_DO_MARCADOR[b.marcador]}
              </span>
            )}
            <Texto partes={b.partes} />
          </div>
        )
      })}
      {f.ferramentas && f.ferramentas.length > 0 && (
        <>
          <BaixarCsv ferramentas={f.ferramentas} />
          <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.32)' }}>
            {f.ferramentas.map((x) => rotuloDaFerramenta(x.nome)).join(' · ')}
          </span>
        </>
      )}
    </div>
  )
}

function Texto({ partes }: { partes: { texto: string; forte: boolean }[] }) {
  return (
    <span
      className="font-sans"
      style={{ fontSize: 12, lineHeight: 1.6, color: 'rgba(242,237,227,.8)', textWrap: 'pretty' }}
    >
      {partes.map((t, i) =>
        t.forte ? (
          <strong key={i} style={{ fontWeight: 600, color: 'var(--color-tinta)' }}>
            {t.texto}
          </strong>
        ) : (
          <span key={i}>{t.texto}</span>
        ),
      )}
    </span>
  )
}
