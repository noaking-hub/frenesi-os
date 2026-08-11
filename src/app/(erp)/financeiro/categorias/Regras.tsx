'use client'

import { useState, useTransition } from 'react'

import { BotaoOuro, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import type { RegraCategoria } from '@/data/extrato'

import { criarRegraCategoria, removerRegraCategoria } from './actions'

/**
 * Regras de categorização automática.
 *
 * O padrão é procurado na descrição, na contraparte e na resposta crua de
 * cada movimento do extrato; quem casar vira lançamento sozinho, na
 * categoria da regra — o motoboy de toda semana não pede clique.
 */
export function RegrasCategoria({
  regras,
  categorias,
}: {
  regras: RegraCategoria[]
  categorias: string[]
}) {
  const [padrao, setPadrao] = useState('')
  const [categoria, setCategoria] = useState(categorias[0] ?? '')
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const criar = () =>
    iniciarTransicao(async () => {
      const r = await criarRegraCategoria(padrao, categoria)
      setAviso(r.ok ? { ok: true, texto: r.mensagem } : { ok: false, texto: r.erro })
      if (r.ok) setPadrao('')
    })

  const remover = (id: string) =>
    iniciarTransicao(async () => {
      const r = await removerRegraCategoria(id)
      setAviso(r.ok ? { ok: true, texto: r.mensagem } : { ok: false, texto: r.erro })
    })

  const campo: React.CSSProperties = {
    height: 36,
    padding: '0 12px',
    border: '1px solid rgba(255,255,255,.12)',
    background: 'rgba(255,255,255,.04)',
    color: 'var(--color-corrente)',
    fontSize: 12,
    borderRadius: 8,
    outline: 'none',
  }

  return (
    <section
      style={{
        background: 'var(--color-mesa)',
        border: '1px solid var(--color-borda)',
        borderRadius: 'var(--radius-card)',
        padding: '17px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <TituloSecao tamanho={14.5}>Categorização automática</TituloSecao>
        <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
          Movimento do extrato que citar o padrão vira lançamento sozinho, nesta categoria
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <input
          value={padrao}
          onChange={(e) => setPadrao(e.target.value)}
          placeholder="Quem aparece no movimento — ex.: Ricardo H Souza Mello"
          className="font-sans focus:border-ouro/45"
          style={{ ...campo, flex: 1, minWidth: 220 }}
        />
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="font-sans"
          style={{ ...campo, minWidth: 170 }}
        >
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <BotaoOuro altura={36} onClick={criar} desabilitado={pendente || padrao.trim().length < 4}>
          {pendente ? 'Salvando…' : '+ Criar regra'}
        </BotaoOuro>
      </div>

      {aviso && (
        <span
          className="font-sans"
          style={{ fontSize: 11, lineHeight: 1.5, color: aviso.ok ? COR.ok : COR.erro, textWrap: 'pretty' }}
        >
          {aviso.texto}
        </span>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {regras.length === 0 && (
          <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
            Nenhuma regra ainda. A primeira boa candidata é quem você paga toda semana.
          </span>
        )}
        {regras.map((r) => (
          <div
            key={r.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 2px',
              borderTop: '1px solid var(--color-borda-sutil)',
            }}
          >
            <span className="font-sans" style={{ flex: 1, minWidth: 0, fontWeight: 500, fontSize: 12, color: 'var(--color-corrente)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.padrao}
            </span>
            <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-ouro)', whiteSpace: 'nowrap' }}>
              {`→ ${r.categoria}`}
            </span>
            <button
              type="button"
              onClick={() => remover(r.id)}
              disabled={pendente}
              className="hover:text-erro font-sans"
              style={{
                border: 0,
                background: 'transparent',
                color: 'rgba(242,237,227,.4)',
                fontWeight: 600,
                fontSize: 10.5,
                lineHeight: 1,
                cursor: 'pointer',
                padding: '4px 6px',
              }}
            >
              remover
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
