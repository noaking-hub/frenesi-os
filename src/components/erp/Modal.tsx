'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Modal do ERP, renderizado por portal no `body`.
 *
 * O portal não é preferência de estilo: qualquer ancestral com `transform`,
 * `filter` ou `animation` vira o bloco de contenção de um `position: fixed`,
 * e o diálogo passa a ser centralizado na ALTURA DA PÁGINA em vez da tela.
 * Numa lista de 400 linhas isso põe o diálogo a 10 mil pixels do topo — o
 * fundo escurece e nada aparece. No `body` não há ancestral para prender.
 */
/** Esc fecha e a página atrás não rola enquanto o diálogo está aberto. */
function useDialogoAberto(aoFechar: () => void) {
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflowAnterior
    }
  }, [aoFechar])
  return montado
}

/**
 * Gaveta lateral (ficha de pedido, de envio). Mesmo motivo do portal: presa
 * a um ancestral animado, ela some numa lista longa.
 */
export function Gaveta({
  titulo,
  largura = 420,
  aoFechar,
  children,
}: {
  titulo: string
  largura?: number
  aoFechar: () => void
  children: ReactNode
}) {
  const montado = useDialogoAberto(aoFechar)
  if (!montado) return null

  return createPortal(
    <div
      onClick={aoFechar}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        justifyContent: 'flex-end',
        background: 'rgba(0,0,0,.55)',
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className="erp animate-[fr-in_.22s_ease_both]"
        style={{
          width: largura,
          maxWidth: '100%',
          height: '100vh',
          overflowY: 'auto',
          background: 'linear-gradient(180deg,#141315,#0E0D0F)',
          borderLeft: '1px solid var(--color-borda-ouro)',
          boxShadow: 'var(--shadow-modal)',
          padding: '22px 24px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {children}
      </aside>
    </div>,
    document.body,
  )
}

export function Modal({
  titulo,
  largura = 620,
  padding = '20px 22px',
  aoFechar,
  children,
}: {
  /** Vai para o `aria-label` do diálogo. */
  titulo: string
  largura?: number
  /** `0` quando o conteúdo desenha as próprias faixas de cabeçalho e rodapé. */
  padding?: string | number
  aoFechar: () => void
  children: ReactNode
}) {
  const montado = useDialogoAberto(aoFechar)
  if (!montado) return null

  return createPortal(
    <div
      onClick={aoFechar}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        background: 'rgba(5,5,4,.66)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className="erp animate-[fr-in_.22s_ease_both]"
        style={{
          width: largura,
          maxWidth: '100%',
          maxHeight: '100%',
          overflowY: 'auto',
          background: 'linear-gradient(170deg,#17161A,#111112)',
          border: '1px solid rgba(239,209,140,.2)',
          borderRadius: 16,
          padding,
          display: 'flex',
          flexDirection: 'column',
          gap: padding === 0 ? 0 : 15,
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
