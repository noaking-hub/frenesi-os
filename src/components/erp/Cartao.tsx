import type { ReactNode } from 'react'

import { TituloSecao } from './primitivos'
import { COR } from './tokens'

/**
 * Cartão de painel — a moldura que o Financeiro repete em todas as telas.
 *
 * Existe separado da `Tabela` porque nem todo bloco é uma lista: gráfico,
 * resumo de DRE e grade de contas dividem a mesma borda e o mesmo respiro, e
 * repetir esse `style` em oito arquivos garantiria que um deles ficasse com
 * 16px de padding enquanto os outros têm 17.
 */
export function Cartao({
  children,
  padding = '15px 17px 17px',
}: {
  children: ReactNode
  padding?: string
}) {
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding,
        border: '1px solid var(--color-borda-sutil)',
        borderRadius: 'var(--radius-card)',
        background: 'var(--color-superficie)',
        minWidth: 0,
      }}
    >
      {children}
    </section>
  )
}

/**
 * Título, nota e ação na mesma linha de base.
 *
 * A nota fica ao lado do título, não abaixo: ela qualifica o que o cartão
 * mostra ("competência de agosto"), e embaixo seria lida como legenda do
 * primeiro número.
 */
export function CabecalhoCartao({
  titulo,
  nota,
  acao,
}: {
  titulo: string
  nota?: string
  acao?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
      <TituloSecao tamanho={14}>{titulo}</TituloSecao>
      {nota && (
        <span
          className="font-sans"
          style={{ fontSize: 10.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          {nota}
        </span>
      )}
      <div style={{ flex: 1 }} />
      {acao}
    </div>
  )
}

/** Vazio de dentro do cartão — o `EstadoVazio` cheio seria grande demais aqui. */
export function VazioInterno({ texto }: { texto: string }) {
  return (
    <span
      className="font-sans"
      style={{
        display: 'block',
        padding: '20px 0',
        textAlign: 'center',
        fontSize: 11,
        color: 'var(--color-terciario)',
      }}
    >
      {texto}
    </span>
  )
}

/** Linha rótulo → valor de um resumo. Negativo sempre em vermelho. */
export function LinhaResumo({
  rotulo,
  valor,
  nota,
  destaque,
}: {
  rotulo: string
  valor: string
  nota?: string
  /** Subtotal: fonte maior e peso, para separar do que ele soma. */
  destaque?: boolean
  negativo?: boolean
}) {
  const negativo = valor.trim().startsWith('−') || valor.trim().startsWith('-')
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        padding: '7px 0',
        borderTop: '1px solid var(--color-borda-sutil)',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span
          className="font-sans"
          style={{
            fontSize: destaque ? 12 : 11.5,
            fontWeight: destaque ? 600 : 400,
            color: destaque ? 'var(--color-corrente)' : 'var(--color-secundario)',
          }}
        >
          {rotulo}
        </span>
        {nota && (
          <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
            {nota}
          </span>
        )}
      </span>
      <span
        className="font-mono"
        style={{
          fontSize: destaque ? 15 : 12.5,
          fontWeight: destaque ? 600 : 400,
          whiteSpace: 'nowrap',
          color: negativo ? COR.erro : destaque ? 'var(--color-tinta)' : 'var(--color-corrente)',
        }}
      >
        {valor}
      </span>
    </span>
  )
}
