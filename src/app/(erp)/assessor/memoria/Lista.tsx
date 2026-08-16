'use client'

import { useTransition } from 'react'

import { Etiqueta, Ico, TINTA } from '@/components/erp/ui'
import type { Memoria } from '@/data/assessor/memoria'

export function Lista({
  memorias,
  aoApagar,
}: {
  memorias: Memoria[]
  aoApagar: (id: string) => Promise<void>
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {memorias.map((m) => (
        <Item key={m.id} m={m} aoApagar={aoApagar} />
      ))}
    </div>
  )
}

function Item({ m, aoApagar }: { m: Memoria; aoApagar: (id: string) => Promise<void> }) {
  const [ocupado, iniciar] = useTransition()
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 11,
        padding: '10px 12px',
        borderRadius: 9,
        border: '1px solid rgba(255,255,255,.05)',
        background: 'rgba(255,255,255,.02)',
        opacity: ocupado ? 0.5 : 1,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
        <span
          className="font-sans"
          style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-tinta)', textWrap: 'pretty' }}
        >
          {m.valor}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Etiqueta>{m.chave}</Etiqueta>
          <span className="font-mono" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.3)' }}>
            {new Intl.DateTimeFormat('pt-BR', {
              timeZone: 'America/Sao_Paulo',
              dateStyle: 'short',
            }).format(new Date(m.atualizadaEm))}
          </span>
          {m.origem === 'aprovada' && (
            <span className="font-sans" style={{ fontSize: 9.5, color: TINTA.ok }}>
              aprovada por você
            </span>
          )}
        </span>
      </div>

      <button
        type="button"
        onClick={() => iniciar(() => void aoApagar(m.id))}
        disabled={ocupado}
        aria-label="Apagar memória"
        className="hover:text-erro"
        style={{
          border: 0,
          background: 'transparent',
          color: 'rgba(242,237,227,.32)',
          cursor: ocupado ? 'wait' : 'pointer',
          flex: 'none',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Ico n="lixeira" tamanho={14} />
      </button>
    </div>
  )
}
