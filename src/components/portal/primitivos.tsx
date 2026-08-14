import type { CSSProperties, ReactNode } from 'react'

/** Paleta do portal (tema claro). Fora daqui nenhum componente inventa cor. */
export const PORTAL = {
  fundo: '#EDE6DA',
  coluna: '#FAF6EE',
  card: '#FFFDF9',
  header: '#1A1714',
  tinta: '#241F18',
  secundario: 'rgba(36,31,24,.62)',
  terciario: 'rgba(36,31,24,.5)',
  ouro: '#B08D4B',
  link: '#8A6A2F',
  ok: '#3F7A52',
  erro: '#A83A30',
  borda: 'rgba(36,31,24,.12)',
  ouroClaro: '#EFD18C',
} as const

export function TituloPasso({ children }: { children: ReactNode }) {
  return (
    <h1
      className="font-display"
      style={{
        margin: 0,
        fontWeight: 600,
        fontSize: 23,
        lineHeight: 1.2,
        color: PORTAL.tinta,
      }}
    >
      {children}
    </h1>
  )
}

export function Corpo({ children }: { children: ReactNode }) {
  return (
    <p
      className="font-sans"
      style={{
        margin: 0,
        fontSize: 12.5,
        lineHeight: 1.6,
        color: PORTAL.secundario,
        textWrap: 'pretty',
      }}
    >
      {children}
    </p>
  )
}

export function RotuloCampo({ children }: { children: ReactNode }) {
  return (
    <span
      className="font-sans"
      style={{
        fontWeight: 600,
        fontSize: 10,
        lineHeight: 1,
        letterSpacing: '.11em',
        textTransform: 'uppercase',
        color: PORTAL.terciario,
      }}
    >
      {children}
    </span>
  )
}

/** Botão principal. Desabilitado quando o passo ainda não está completo. */
export function BotaoPrimario({
  children,
  ativo = true,
  onClick,
  style,
}: {
  children: ReactNode
  ativo?: boolean
  onClick?: () => void
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={ativo ? onClick : undefined}
      disabled={!ativo}
      className={ativo ? 'font-sans hover:brightness-110' : 'font-sans'}
      style={{
        height: 50,
        border: ativo ? '1px solid rgba(239,209,140,.28)' : 0,
        background: ativo
          ? 'linear-gradient(180deg, #241F18, #16120D)'
          : 'rgba(36,31,24,.09)',
        color: ativo ? PORTAL.ouroClaro : 'rgba(36,31,24,.32)',
        fontWeight: 700,
        fontSize: 13.5,
        letterSpacing: '.02em',
        lineHeight: 1,
        borderRadius: 12,
        cursor: ativo ? 'pointer' : 'not-allowed',
        boxShadow: ativo ? '0 10px 24px -12px rgba(26,23,20,.55)' : 'none',
        transition: 'filter .15s ease, box-shadow .15s ease',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function BotaoSecundario({
  children,
  onClick,
  style,
}: {
  children: ReactNode
  onClick?: () => void
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-sans hover:border-[#B08D4B]"
      style={{
        height: 50,
        padding: '0 18px',
        border: `1px solid rgba(36,31,24,.16)`,
        background: 'transparent',
        color: 'rgba(36,31,24,.7)',
        fontWeight: 600,
        fontSize: 13,
        lineHeight: 1,
        borderRadius: 12,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'border-color .15s ease',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

/** Bloco de avisos com marcadores. `tom` decide a cor da moldura. */
export function BlocoAviso({
  titulo,
  itens,
  tom = 'ouro',
  children,
}: {
  titulo: string
  itens?: string[]
  tom?: 'ouro' | 'erro'
  children?: ReactNode
}) {
  const cor = tom === 'erro' ? PORTAL.erro : PORTAL.link
  const fundo = tom === 'erro' ? 'rgba(168,58,48,.06)' : 'rgba(176,141,75,.07)'
  const borda = tom === 'erro' ? 'rgba(168,58,48,.2)' : 'rgba(176,141,75,.2)'
  const marcador = tom === 'erro' ? PORTAL.erro : PORTAL.ouro

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 11,
        padding: '16px 17px',
        borderRadius: 13,
        background: fundo,
        border: `1px solid ${borda}`,
      }}
    >
      <span
        className="font-sans"
        style={{
          fontWeight: 600,
          fontSize: 10,
          lineHeight: 1,
          letterSpacing: '.11em',
          textTransform: 'uppercase',
          color: cor,
        }}
      >
        {titulo}
      </span>
      {itens?.map((texto) => (
        <span key={texto} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span
            aria-hidden
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: marcador,
              flex: 'none',
              marginTop: 6,
            }}
          />
          <span
            className="font-sans"
            style={{
              fontSize: 12,
              lineHeight: 1.55,
              color: 'rgba(36,31,24,.68)',
              textWrap: 'pretty',
            }}
          >
            {texto}
          </span>
        </span>
      ))}
      {children}
    </div>
  )
}

/**
 * Placeholder de foto do produto. As fotos do catálogo ainda serão fornecidas
 * pelo cliente — até lá, o slot diz o que vai aparecer ali.
 */
export function SlotImagem({ legenda, tamanho = 96 }: { legenda: string; tamanho?: number }) {
  return (
    <span
      role="img"
      aria-label={`Foto de ${legenda}`}
      style={{
        width: tamanho,
        height: tamanho,
        flex: 'none',
        borderRadius: 10,
        border: `1px dashed rgba(36,31,24,.2)`,
        background: 'rgba(36,31,24,.03)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8,
      }}
    >
      <span
        className="font-sans"
        style={{
          fontWeight: 600,
          fontSize: 9,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: 'rgba(36,31,24,.34)',
          textAlign: 'center',
          lineHeight: 1.3,
        }}
      >
        Foto
      </span>
    </span>
  )
}
