import type { CSSProperties, ReactNode } from 'react'

import { COR, type Tom } from './tokens'

export interface Coluna<T> {
  chave: string
  titulo: ReactNode
  /** Largura da coluna no grid. `1fr` para a coluna elástica. */
  largura: string
  alinhamento?: 'left' | 'right'
  /** Coluna dispensável no celular: some quando a linha vira cartão. */
  secundaria?: boolean
  /** Vira o topo do cartão no celular. Sem marcação, é a primeira coluna. */
  identidade?: boolean
  render: (item: T) => ReactNode
}

export interface TabelaProps<T> {
  colunas: Coluna<T>[]
  itens: T[]
  chaveDe: (item: T) => string
  /**
   * Bandeira de estado na borda esquerda de 2px. Transparente quando normal —
   * a linha só ganha cor quando o dado pede atenção.
   */
  bandeiraDe?: (item: T) => Tom | null
  selecionadoDe?: (item: T) => boolean
  aoClicar?: (item: T) => void
  cabecalho?: ReactNode
  rodape?: ReactNode
  vazio?: ReactNode
  densidade?: 'compacta' | 'confortavel'
}

export function Tabela<T>({
  colunas,
  itens,
  chaveDe,
  bandeiraDe,
  selecionadoDe,
  aoClicar,
  cabecalho,
  rodape,
  vazio,
  densidade = 'compacta',
}: TabelaProps<T>) {
  const grid = colunas.map((c) => c.largura).join(' ')
  const padY = densidade === 'confortavel' ? 15 : 11

  return (
    <section
      style={{
        background: 'var(--color-mesa)',
        border: '1px solid var(--color-borda)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
      }}
    >
      {cabecalho}

      {/* No desktop, a grade; no celular ela some e entram os CARTÕES logo
          abaixo — tabela rolando na horizontal não funciona no dedo. */}
      <div className="tabela-grade">
      <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 660 }}>
      <div
        role="row"
        style={{
          display: 'grid',
          gridTemplateColumns: grid,
          gap: 12,
          padding: '11px 18px',
          background: 'var(--color-cabecalho)',
          borderBottom: '1px solid var(--color-borda)',
        }}
      >
        {colunas.map((c) => (
          <span
            key={c.chave}
            className="font-sans"
            style={{
              fontWeight: 600,
              fontSize: 9.5,
              lineHeight: 1,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: 'var(--color-terciario)',
              textAlign: c.alinhamento ?? 'left',
            }}
          >
            {c.titulo}
          </span>
        ))}
      </div>

      {itens.length === 0 && vazio}

      {itens.map((item) => {
        const bandeira = bandeiraDe?.(item) ?? null
        const selecionado = selecionadoDe?.(item) ?? false
        const estilo: CSSProperties = {
          width: '100%',
          display: 'grid',
          gridTemplateColumns: grid,
          gap: 12,
          alignItems: 'center',
          padding: `${padY}px 18px`,
          border: 0,
          borderTop: '1px solid var(--color-borda-sutil)',
          borderLeft: `2px solid ${bandeira ? COR[bandeira] : 'transparent'}`,
          background: selecionado ? 'rgba(239,209,140,.06)' : 'transparent',
          textAlign: 'left',
        }

        // `minWidth: 0` deixa a coluna encolher abaixo do conteúdo; `overflow`
        // impede que ela invada a vizinha quando o texto não couber. Sem o
        // segundo, um `text-overflow: ellipsis` numa caixa INLINE lá dentro é
        // ignorado — overflow não se aplica a inline — e o nome longo passa
        // por cima da coluna seguinte.
        const conteudo = colunas.map((c) => (
          <span
            key={c.chave}
            style={{
              display: 'block',
              minWidth: 0,
              overflow: 'hidden',
              textAlign: c.alinhamento ?? 'left',
              justifySelf: c.alinhamento === 'right' ? 'end' : 'stretch',
            }}
          >
            {c.render(item)}
          </span>
        ))

        // Linha clicável vira <button> de largura total, para o teclado alcançar.
        return aoClicar ? (
          <button
            key={chaveDe(item)}
            type="button"
            onClick={() => aoClicar(item)}
            className="hover:bg-[rgba(239,209,140,.045)]"
            style={{ ...estilo, cursor: 'pointer' }}
          >
            {conteudo}
          </button>
        ) : (
          <div key={chaveDe(item)} className="hover:bg-[rgba(239,209,140,.04)]" style={estilo}>
            {conteudo}
          </div>
        )
      })}
      </div>
      </div>
      </div>

      {/* ── Cartões do celular ─────────────────────────────────────────────
          A mesma lista, uma linha por cartão: a primeira coluna é a
          identidade e vira o topo; as demais viram pares rótulo → valor. As
          marcadas como `secundaria` ficam de fora — no dedo, menos é mais. */}
      <div className="tabela-cartoes">
        {itens.length === 0 && vazio}
        {itens.map((item) => {
          const bandeira = bandeiraDe?.(item) ?? null
          const selecionado = selecionadoDe?.(item) ?? false
          const identidade = colunas.find((c) => c.identidade) ?? colunas[0]
          const detalhes = colunas.filter((c) => c !== identidade && !c.secundaria)
          const estilo: CSSProperties = {
            width: '100%',
            display: 'block',
            padding: '13px 15px',
            border: 0,
            borderTop: '1px solid var(--color-borda-sutil)',
            borderLeft: `2px solid ${bandeira ? COR[bandeira] : 'transparent'}`,
            background: selecionado ? 'rgba(239,209,140,.06)' : 'transparent',
            textAlign: 'left',
          }
          const conteudo = (
            <>
              <div style={{ minWidth: 0, paddingBottom: detalhes.length ? 9 : 0 }}>
                {identidade.render(item)}
              </div>
              {detalhes.map((c) => (
                <div
                  key={c.chave}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '3px 0',
                  }}
                >
                  <span
                    className="font-sans"
                    style={{
                      flexShrink: 0,
                      fontWeight: 600,
                      fontSize: 9,
                      letterSpacing: '.1em',
                      textTransform: 'uppercase',
                      color: 'var(--color-terciario)',
                    }}
                  >
                    {c.titulo}
                  </span>
                  <span style={{ minWidth: 0, overflow: 'hidden', textAlign: 'right' }}>
                    {c.render(item)}
                  </span>
                </div>
              ))}
            </>
          )
          return aoClicar ? (
            <button
              key={chaveDe(item)}
              type="button"
              onClick={() => aoClicar(item)}
              style={{ ...estilo, cursor: 'pointer' }}
            >
              {conteudo}
            </button>
          ) : (
            <div key={chaveDe(item)} style={estilo}>
              {conteudo}
            </div>
          )
        })}
      </div>

      {rodape}
    </section>
  )
}

/** Célula de duas linhas: valor primário + qualificador. */
export function CelulaDupla({
  principal,
  secundaria,
  tomSecundaria,
}: {
  principal: ReactNode
  secundaria: ReactNode
  tomSecundaria?: Tom
}) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span
        className="font-sans"
        style={{
          fontWeight: 600,
          fontSize: 12,
          lineHeight: 1.25,
          color: 'var(--color-corrente)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {principal}
      </span>
      <span
        className="font-sans"
        style={{
          fontWeight: 400,
          fontSize: 10.5,
          lineHeight: 1.25,
          color: tomSecundaria ? COR[tomSecundaria] : 'var(--color-terciario)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {secundaria}
      </span>
    </span>
  )
}
