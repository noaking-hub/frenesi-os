'use client'

import { useState, useTransition } from 'react'

import { COR } from '@/components/erp/tokens'
import { plural } from '@/domain'

import { aplicarNaShopify } from './actions'

/**
 * Publica na loja o estoque que o ERP calculou.
 *
 * Fica desabilitado quando nada está fora de sincronia: reenviar o valor que
 * já está lá gastaria chamada e sujaria o histórico da Shopify sem mudar nada.
 */
export function AplicarShopify({ foraDeSincronia }: { foraDeSincronia: number }) {
  const [erro, setErro] = useState<string | null>(null)
  const [resumo, setResumo] = useState<string | null>(null)
  const [ignoradas, setIgnoradas] = useState<{ variante: string; motivo: string }[]>([])
  const [pendente, iniciarTransicao] = useTransition()

  const aplicar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setResumo(null)
      setIgnoradas([])
      const r = await aplicarNaShopify()
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      const { aplicadas, ignoradas: nao, pulados, local } = r.resultado
      setIgnoradas(nao)
      setResumo(
        `${plural(aplicadas, 'variante gravada', 'variantes gravadas')} em ${local || 'a loja'}` +
          (pulados ? ` · ${pulados} sem id da Shopify (base criada à mão)` : '') +
          (nao.length ? ` · ${plural(nao.length, 'recusada', 'recusadas')} pela loja` : ''),
      )
    })

  const travado = pendente || foraDeSincronia === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
      <button
        type="button"
        onClick={aplicar}
        disabled={travado}
        className="botao-ouro font-sans hover:brightness-[1.07]"
        style={{
          height: 36,
          padding: '0 18px',
          fontWeight: 700,
          fontSize: 11.5,
          lineHeight: 1,
          borderRadius: 9,
          whiteSpace: 'nowrap',
          cursor: pendente ? 'wait' : foraDeSincronia === 0 ? 'not-allowed' : 'pointer',
          opacity: travado ? 0.5 : 1,
        }}
      >
        {pendente
          ? 'Gravando na Shopify…'
          : foraDeSincronia === 0
            ? 'Tudo em dia na Shopify'
            : `Aplicar ${plural(foraDeSincronia, 'variante', 'variantes')} na Shopify`}
      </button>

      {(erro || resumo) && (
        <span
          className="font-sans"
          style={{
            fontSize: 11,
            lineHeight: 1.5,
            color: erro ? COR.erro : COR.ok,
            textAlign: 'right',
            maxWidth: 420,
            textWrap: 'pretty',
          }}
        >
          {erro ?? resumo}
        </span>
      )}

      {ignoradas.length > 0 && (
        <ul
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            margin: 0,
            padding: '9px 12px',
            listStyle: 'none',
            maxWidth: 460,
            borderRadius: 9,
            background: 'rgba(224,168,74,.06)',
            border: '1px solid rgba(224,168,74,.24)',
          }}
        >
          {ignoradas.slice(0, 6).map((i) => (
            <li
              key={i.variante}
              className="font-sans"
              style={{ fontSize: 10.5, lineHeight: 1.45, color: 'var(--color-secundario)', textWrap: 'pretty' }}
            >
              <strong style={{ fontWeight: 600 }}>{i.variante}</strong>
              {` — ${i.motivo}`}
            </li>
          ))}
          {ignoradas.length > 6 && (
            <li className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
              {`e mais ${ignoradas.length - 6}.`}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
