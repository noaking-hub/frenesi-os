'use client'

import { usePathname } from 'next/navigation'

import { localizar } from './navegacao'

export function Topbar({ alertas }: { alertas: number }) {
  const pathname = usePathname()
  const { modulo, tela } = localizar(pathname)
  // Breadcrumb `módulo · tela`; quando o grupo não tem subtelas os dois coincidem.
  const crumb = modulo === tela ? modulo : `${modulo} · ${tela}`

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: '0 30px',
        height: 78,
        flex: 'none',
        background: 'rgba(10,10,9,.82)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(255,255,255,.06)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span
          className="font-sans"
          style={{
            fontSize: 9.5,
            lineHeight: 1,
            letterSpacing: '.2em',
            textTransform: 'uppercase',
            color: 'rgba(242,237,227,.34)',
          }}
        >
          {crumb}
        </span>
        <h1
          className="font-display"
          style={{
            margin: 0,
            fontWeight: 600,
            fontSize: 19,
            lineHeight: 1,
            letterSpacing: '.01em',
            color: 'var(--color-tinta)',
          }}
        >
          {tela}
        </h1>
      </div>

      <div style={{ flex: 1 }} />

      <label
        className="focus-within:border-ouro/45"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          width: 308,
          height: 36,
          padding: '0 13px',
          border: '1px solid rgba(255,255,255,.09)',
          background: 'rgba(255,255,255,.03)',
          borderRadius: 9,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 11,
            height: 11,
            border: '1.4px solid rgba(242,237,227,.4)',
            borderRadius: '50%',
            flex: 'none',
          }}
        />
        <input
          placeholder="Buscar pedido, cliente, perfume…"
          aria-label="Buscar"
          className="font-sans"
          style={{
            flex: 1,
            border: 0,
            outline: 0,
            background: 'transparent',
            color: 'var(--color-corrente)',
            fontSize: 12,
          }}
        />
        <kbd
          className="font-mono"
          style={{
            fontWeight: 500,
            fontSize: 9.5,
            color: 'rgba(242,237,227,.34)',
            border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 4,
            padding: '3px 5px',
          }}
        >
          ⌘K
        </kbd>
      </label>

      <button
        type="button"
        className="font-sans hover:border-ouro/35 hover:text-ouro"
        style={{
          height: 36,
          padding: '0 14px',
          border: '1px solid rgba(255,255,255,.09)',
          background: 'rgba(255,255,255,.03)',
          color: 'var(--color-secundario)',
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
            background: alertas ? 'var(--color-atencao)' : 'var(--color-ok)',
          }}
        />
        {alertas === 1 ? '1 alerta' : `${alertas} alertas`}
      </button>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          paddingLeft: 18,
          borderLeft: '1px solid var(--color-borda)',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 31,
            height: 31,
            borderRadius: '50%',
            background: 'linear-gradient(140deg,#EFD18C,#9D7E43)',
            color: 'var(--color-sobre-ouro)',
            fontWeight: 700,
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          MF
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            className="font-sans"
            style={{ fontWeight: 600, fontSize: 11.5, lineHeight: 1.3, color: 'var(--color-corrente)' }}
          >
            Marina F.
          </span>
          <span
            className="font-sans"
            style={{ fontSize: 9.5, lineHeight: 1.3, color: 'rgba(242,237,227,.38)' }}
          >
            Operação
          </span>
        </div>
      </div>
    </header>
  )
}
