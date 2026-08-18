'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'

import { Ico, type NomeIcone } from './IconesUi'
import { TINTA, Vazio, type TomUi } from './ui'

/**
 * O que o topo precisa saber de uma pendência para desenhá-la.
 *
 * É um subconjunto estrutural de `Pendencia` (`@/data/consultas`) de propósito:
 * o chip do topo não deve depender da camada de dados para ser renderizado —
 * quem monta a lista é o layout, que já lê o Dashboard.
 */
export interface AlertaTopo {
  contagem: number
  titulo: string
  hint: string
  etiqueta: string
  tom: TomUi
  href: string
}

/**
 * A etiqueta da pendência é o que escolhe o ícone: ela já diz de que natureza
 * é a exceção ("Estoque", "Transporte"), então não há um segundo campo a
 * inventar na camada de dados só para ilustrar a linha.
 */
const ICONE_POR_ETIQUETA: Record<string, NomeIcone> = {
  Urgente: 'alerta',
  Financeiro: 'cifrao',
  Preço: 'etiqueta',
  Bloqueia: 'alerta-circulo',
  Cadastro: 'documento',
  Estoque: 'caixa',
  Devoluções: 'repetir',
  Entregas: 'carrinho',
  Transporte: 'alerta',
}

/**
 * Os alertas da operação, ancorados no chip do topo.
 *
 * O painel de alertas morava num cartão do Dashboard, disputando a linha com
 * os gráficos e espremendo o Faturamento diário. Como o topo já carregava um
 * chip com a contagem, a lista passou a viver ATRÁS DESSE CHIP: o mesmo número
 * que resume vira a porta de entrada do detalhe, e a linha de gráficos ficou
 * com duas colunas em vez de três.
 *
 * Isto é o único pedaço de cliente que o topo precisa: estado de aberto/fechado
 * e os dois listeners que o fecham (clique fora e Esc).
 */
export function AlertasDoTopo({ alertas }: { alertas: AlertaTopo[] }) {
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const painel = useRef<HTMLDivElement>(null)
  const idPainel = useId()

  useEffect(() => {
    if (!aberto) return

    // `pointerdown` e não `click`: o clique num item do painel navega e
    // desmonta a lista, e um listener de `click` chegaria depois disso — o
    // fechamento precisa acontecer no começo da interação, não no fim.
    const aoApontar = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false)
    }
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setAberto(false)
      // Esc devolve o foco a quem abriu, senão ele volta para o começo do
      // documento e a navegação por teclado recomeça do zero.
      botao.current?.focus()
    }

    document.addEventListener('pointerdown', aoApontar)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('pointerdown', aoApontar)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto])

  // Abriu por teclado, o foco tem que entrar no painel — sem isso o leitor de
  // tela anuncia a expansão e continua parado no botão.
  useEffect(() => {
    if (aberto) painel.current?.focus()
  }, [aberto])

  const total = alertas.length

  return (
    <div ref={raiz} style={{ position: 'relative' }}>
      <button
        ref={botao}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        aria-controls={aberto ? idPainel : undefined}
        className="font-sans hover:border-ouro/35 hover:text-ouro"
        style={{
          height: 36,
          padding: '0 14px',
          border: `1px solid ${aberto ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.09)'}`,
          background: aberto ? 'rgba(239,209,140,.08)' : 'rgba(255,255,255,.03)',
          color: aberto ? TINTA.ouro : 'var(--color-secundario)',
          fontWeight: 600,
          fontSize: 11.5,
          borderRadius: 9,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: total ? 'var(--color-atencao)' : 'var(--color-ok)',
          }}
        />
        {total === 1 ? '1 alerta' : `${total} alertas`}
      </button>

      {aberto && (
        <div
          ref={painel}
          id={idPainel}
          role="dialog"
          aria-label="Alertas da operação"
          tabIndex={-1}
          data-camada="menu"
          className="animate-[fr-in_.16s_ease_both] painel-alertas"
          style={{
            position: 'absolute',
            top: 46,
            right: 0,
            zIndex: 50,
            width: 380,
            maxHeight: 420,
            display: 'flex',
            flexDirection: 'column',
            outline: 0,
            background: '#151413',
            border: '1px solid rgba(255,255,255,.14)',
            borderRadius: 14,
            boxShadow: '0 22px 54px rgba(0,0,0,.55)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '13px 15px 11px',
              borderBottom: '1px solid rgba(255,255,255,.07)',
              flex: 'none',
            }}
          >
            <span style={{ color: total ? TINTA.atencao : TINTA.ok, display: 'grid', placeItems: 'center' }}>
              <Ico n="sino" tamanho={15} />
            </span>
            <span
              className="font-display"
              style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-tinta)' }}
            >
              Alertas importantes
            </span>
            <span style={{ flex: 1 }} />
            {total > 0 && (
              <span
                className="font-sans"
                style={{ fontSize: 10.5, color: 'rgba(242,237,227,.42)' }}
              >
                {total === 1 ? '1 exige ação' : `${total} exigem ação`}
              </span>
            )}
          </div>

          {/* A rolagem é do miolo, não do painel: cabeçalho e rodapé ficam
              presos enquanto a lista corre. */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '2px 15px 6px' }}>
            {total === 0 ? (
              <Vazio icone="check-circulo" texto="Nenhuma exceção aberta. A operação está em dia." />
            ) : (
              alertas.map((a) => (
                <Link
                  key={a.titulo}
                  href={a.href}
                  onClick={() => setAberto(false)}
                  className="hover:brightness-125"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '11px 0',
                    borderTop: '1px solid rgba(255,255,255,.05)',
                    textDecoration: 'none',
                  }}
                >
                  <span style={{ color: TINTA[a.tom], paddingTop: 1 }}>
                    <Ico n={ICONE_POR_ETIQUETA[a.etiqueta] ?? 'info'} tamanho={15} />
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                    <span
                      className="font-sans"
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        lineHeight: 1.35,
                        color: TINTA[a.tom],
                        textWrap: 'pretty',
                      }}
                    >
                      {`${a.contagem} · ${a.titulo}`}
                    </span>
                    <span
                      className="font-sans"
                      style={{
                        fontSize: 10.5,
                        lineHeight: 1.4,
                        color: 'rgba(242,237,227,.42)',
                        textWrap: 'pretty',
                      }}
                    >
                      {a.hint}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </div>

          <div
            style={{
              padding: '10px 15px 12px',
              borderTop: '1px solid rgba(255,255,255,.07)',
              flex: 'none',
            }}
          >
            <Link
              href="/relatorios"
              onClick={() => setAberto(false)}
              className="font-sans hover:brightness-125"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: TINTA.ouro,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              Ver todos os alertas
              <Ico n="seta-direita" tamanho={12} />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
