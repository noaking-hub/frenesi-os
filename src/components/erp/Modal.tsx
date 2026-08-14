'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
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

/**
 * Painel INFERIOR ancorado — a ficha do pedido do mockup.
 *
 * Não é modal, e isso é o desenho: a lista continua visível E CLICÁVEL acima,
 * sem véu escuro. É o que permite abrir um pedido, ler, e clicar no próximo da
 * fila sem fechar nada — o painel só troca de conteúdo. Esc fecha; clique fora
 * não, porque "fora" é a própria lista em uso.
 *
 * Começa depois do menu lateral (var --sidebar-w, publicada pela Sidebar)
 * para não engolir a navegação, como no mockup.
 */
export function PainelInferior({
  titulo,
  altura = '62vh',
  aoFechar,
  children,
}: {
  titulo: string
  /** Altura máxima; o conteúdo rola dentro dela. */
  altura?: string
  aoFechar: () => void
  children: ReactNode
}) {
  const [montado, setMontado] = useState(false)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => setMontado(true), [])

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      // Esc fecha uma camada por vez: com um menu ou um modal aberto por
      // cima, o Esc é deles — fechar o painel junto tiraria da tela
      // justamente o que a pessoa estava usando. (E o modal PRECISA desta
      // guarda: quando o painel fecha no mesmo Esc, o re-render do React
      // reinscreve o listener do modal durante o próprio dispatch e o Esc
      // dele se perde — sobraria o modal aberto sem o painel de baixo.)
      if (
        e.key === 'Escape' &&
        !document.querySelector('[data-camada="menu"], [data-camada="modal"]')
      ) {
        aoFechar()
      }
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  // O painel é fixo e cobre o pé da página; sem compensar, as últimas linhas
  // da lista ficariam para sempre atrás dele — visíveis de relance, mas
  // impossíveis de alcançar rolando. O corpo ganha o respiro equivalente.
  useEffect(() => {
    if (!montado) return
    const altura = ref.current?.offsetHeight ?? 0
    const anterior = document.body.style.paddingBottom
    document.body.style.paddingBottom = `${altura + 16}px`
    return () => {
      document.body.style.paddingBottom = anterior
    }
  }, [montado])

  if (!montado) return null

  return createPortal(
    <section
      ref={ref}
      role="dialog"
      aria-label={titulo}
      className="erp animate-[fr-sobe_.24s_ease_both]"
      style={{
        position: 'fixed',
        left: 'var(--sidebar-w, 244px)',
        right: 0,
        bottom: 0,
        zIndex: 60,
        maxHeight: altura,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg,#141317,#0E0D0F)',
        borderTop: '1px solid rgba(239,209,140,.26)',
        boxShadow: '0 -26px 70px rgba(0,0,0,.6)',
        // Acompanha a animação de recolher da Sidebar, senão a borda salta.
        transition: 'left .2s ease',
      }}
    >
      {children}
    </section>,
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
      data-camada="modal"
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
