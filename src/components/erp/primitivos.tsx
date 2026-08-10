import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'

import { BORDA, COR, FAIXA, FUNDO, type Tom } from './tokens'

/**
 * Losango 7×7 rotacionado 45°: o ornamento da marca.
 * É marcador, nunca ícone genérico.
 */
export function Losango({
  tom = 'ouro',
  tamanho = 7,
  preenchido = false,
}: {
  tom?: Tom
  tamanho?: number
  preenchido?: boolean
}) {
  return (
    <span
      aria-hidden
      style={{
        width: tamanho,
        height: tamanho,
        flex: 'none',
        transform: 'rotate(45deg)',
        border: preenchido ? 0 : `1px solid ${COR[tom]}`,
        background: preenchido ? COR[tom] : 'transparent',
      }}
    />
  )
}

export function Ponto({ tom, tamanho = 5 }: { tom: Tom; tamanho?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: '50%',
        flex: 'none',
        background: COR[tom],
      }}
    />
  )
}

export function Badge({ tom, children }: { tom: Tom; children: ReactNode }) {
  return (
    <span
      className="font-sans"
      style={{
        fontWeight: 600,
        fontSize: 10,
        lineHeight: 1,
        letterSpacing: '.05em',
        textTransform: 'uppercase',
        color: COR[tom],
        background: FUNDO[tom],
        borderRadius: 'var(--radius-chip)',
        padding: '5px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

export function Rotulo({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      className="font-sans"
      style={{
        fontWeight: 600,
        fontSize: 9.5,
        lineHeight: 1.2,
        letterSpacing: '.12em',
        textTransform: 'uppercase',
        color: 'var(--color-terciario)',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

export function TituloSecao({
  children,
  tom,
  tamanho = 15,
}: {
  children: ReactNode
  tom?: Tom
  tamanho?: number
}) {
  return (
    <h2
      className="font-display"
      style={{
        margin: 0,
        fontWeight: 600,
        fontSize: tamanho,
        lineHeight: 1,
        letterSpacing: '.02em',
        color: tom ? COR[tom] : 'var(--color-tinta)',
      }}
    >
      {children}
    </h2>
  )
}

/** Valor numérico. Todo número do ERP passa por aqui, sempre em mono. */
export function Valor({
  children,
  tamanho = 12,
  tom,
  peso = 500,
  style,
}: {
  children: ReactNode
  tamanho?: number
  tom?: Tom | string
  peso?: number
  style?: CSSProperties
}) {
  const cor = tom && tom in COR ? COR[tom as Tom] : (tom ?? 'var(--color-corrente)')
  return (
    <span
      className="font-mono"
      style={{
        fontWeight: peso,
        fontSize: tamanho,
        lineHeight: 1,
        color: cor,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

/**
 * Faixa de alerta: losango + texto + ação. A cor vem da severidade,
 * e a ação é opcional porque nem todo alerta tem botão.
 */
export function FaixaAlerta({
  tom,
  texto,
  acao,
}: {
  tom: Tom
  texto: string
  acao?: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 17px',
        borderRadius: 12,
        background: FAIXA[tom],
        border: `1px solid ${BORDA[tom]}`,
      }}
    >
      <Losango tom={tom} />
      <span
        className="font-sans"
        style={{
          flex: 1,
          fontWeight: 500,
          fontSize: 11.5,
          lineHeight: 1.5,
          color: 'rgba(242,237,227,.82)',
          textWrap: 'pretty',
        }}
      >
        {texto}
      </span>
      {acao}
    </div>
  )
}

/**
 * Mesma aparência do botão, mas navega. Existe porque um atalho para outra
 * tela é um link — e um <button> que navega perde abrir em nova aba, copiar
 * endereço e o estado de visitado.
 */
export function LinkOuro({
  children,
  href,
  altura = 32,
}: {
  children: ReactNode
  href: string
  altura?: number
}) {
  return (
    <Link
      href={href}
      className="botao-ouro font-sans hover:brightness-[1.07]"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: altura,
        padding: '0 14px',
        fontWeight: 700,
        fontSize: 11,
        lineHeight: 1,
        borderRadius: 8,
        whiteSpace: 'nowrap',
        boxShadow: 'var(--shadow-ouro)',
      }}
    >
      {children}
    </Link>
  )
}

export function LinkSecundario({
  children,
  href,
  altura = 32,
}: {
  children: ReactNode
  href: string
  altura?: number
}) {
  return (
    <Link
      href={href}
      className="font-sans hover:border-ouro/40 hover:text-ouro"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: altura,
        padding: '0 14px',
        border: '1px solid rgba(255,255,255,.11)',
        background: 'transparent',
        color: 'var(--color-secundario)',
        fontWeight: 600,
        fontSize: 11,
        lineHeight: 1,
        borderRadius: 8,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Link>
  )
}

export function BotaoOuro({
  children,
  altura = 32,
  onClick,
  type = 'button',
  desabilitado = false,
}: {
  children: ReactNode
  altura?: number
  onClick?: () => void
  type?: 'button' | 'submit'
  /** Desligado de verdade: sem clique, sem cursor de mão e com opacidade menor. */
  desabilitado?: boolean
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={desabilitado}
      className="botao-ouro font-sans hover:brightness-[1.07]"
      style={{
        height: altura,
        padding: '0 14px',
        fontWeight: 700,
        fontSize: 11,
        lineHeight: 1,
        borderRadius: 8,
        cursor: desabilitado ? 'not-allowed' : 'pointer',
        opacity: desabilitado ? 0.45 : 1,
        whiteSpace: 'nowrap',
        boxShadow: 'var(--shadow-ouro)',
      }}
    >
      {children}
    </button>
  )
}

export function BotaoSecundario({
  children,
  altura = 32,
  onClick,
  desabilitado = false,
}: {
  children: ReactNode
  altura?: number
  onClick?: () => void
  desabilitado?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      className="font-sans hover:border-ouro/40 hover:text-ouro"
      style={{
        height: altura,
        padding: '0 14px',
        border: '1px solid rgba(255,255,255,.11)',
        background: 'transparent',
        color: 'var(--color-secundario)',
        fontWeight: 600,
        fontSize: 11,
        lineHeight: 1,
        borderRadius: 8,
        cursor: desabilitado ? 'not-allowed' : 'pointer',
        opacity: desabilitado ? 0.45 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

/** Estado vazio padrão — losango, título e instrução do que fazer. */
export function EstadoVazio({
  titulo,
  instrucao,
}: {
  titulo: string
  instrucao: string
}) {
  return (
    <div
      style={{
        background: 'var(--color-mesa)',
        border: '1px solid var(--color-borda)',
        borderRadius: 'var(--radius-card)',
        padding: 48,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 11,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 26,
          height: 26,
          border: '1px solid rgba(239,209,140,.3)',
          transform: 'rotate(45deg)',
        }}
      />
      <span
        className="font-display"
        style={{ fontWeight: 600, fontSize: 14, marginTop: 8, color: 'rgba(242,237,227,.75)' }}
      >
        {titulo}
      </span>
      <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
        {instrucao}
      </span>
    </div>
  )
}

/** Barra de proporção. `pct` já vem calculado pelo domínio. */
export function Barra({ pct, tom, altura = 4 }: { pct: number; tom: Tom; altura?: number }) {
  return (
    <span
      style={{
        display: 'block',
        height: altura,
        borderRadius: 2,
        background: 'rgba(255,255,255,.06)',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          display: 'block',
          height: '100%',
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: COR[tom],
          borderRadius: 2,
        }}
      />
    </span>
  )
}

/** Switch 40×21 com knob de 15px. */
export function Switch({
  ligado,
  onChange,
  label,
}: {
  ligado: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={label}
      onClick={() => onChange(!ligado)}
      style={{
        width: 40,
        height: 21,
        flex: 'none',
        border: 0,
        borderRadius: 20,
        cursor: 'pointer',
        padding: 3,
        display: 'flex',
        justifyContent: ligado ? 'flex-end' : 'flex-start',
        background: ligado ? 'rgba(92,158,112,.45)' : 'rgba(255,255,255,.09)',
      }}
    >
      <span
        style={{
          width: 15,
          height: 15,
          borderRadius: '50%',
          background: ligado ? 'var(--color-ok-claro)' : 'rgba(242,237,227,.45)',
          transition: 'background .16s',
        }}
      />
    </button>
  )
}
