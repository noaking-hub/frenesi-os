'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Etiqueta, TINTA } from '@/components/erp/ui'
import { ATALHOS_DE_PERIODO } from '@/domain'

/**
 * A barra de filtros — uma só, para os dezenove relatórios.
 *
 * Cada relatório declara o que aceita (`usaData`, `usaUf`, `usaBusca`) e o que
 * a data significa nele; a barra só desenha o que aquele relatório entende.
 * Controle que não faz nada é pior do que controle ausente: ensina a pessoa a
 * duvidar dos que funcionam.
 *
 * O estado vive na URL. É o que faz o F5 manter o recorte, o link colado no
 * WhatsApp abrir o mesmo número, e o botão "voltar" desfazer o último filtro.
 */

const CAMPO: React.CSSProperties = {
  height: 30,
  padding: '0 10px',
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.025)',
  borderRadius: 8,
  color: 'rgba(242,237,227,.88)',
  fontSize: 11.5,
  lineHeight: 1,
  outline: 0,
  colorScheme: 'dark',
}

export function FiltrosDoRelatorio({
  usaData,
  usaUf,
  usaBusca,
  notaDaData,
  ufs,
}: {
  usaData: boolean
  usaUf: boolean
  usaBusca: boolean
  notaDaData?: string
  /** As UFs que existem no cadastro — nada de lista fixa dos 27 estados. */
  ufs: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [texto, setTexto] = useState(params.get('q') ?? '')

  // Digitar não navega a cada tecla: cada navegação é uma ida ao servidor e o
  // cursor saltaria. 350 ms separa "parou de digitar" de "quer o resultado".
  useEffect(() => {
    const atual = params.get('q') ?? ''
    if (texto === atual) return
    const t = setTimeout(() => trocar({ q: texto }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  function trocar(mudancas: Record<string, string>) {
    const novo = new URLSearchParams(params.toString())
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor) novo.set(chave, valor)
      else novo.delete(chave)
    }
    // Atalho e datas à mão são a MESMA decisão dita de dois jeitos; manter os
    // dois faria a tela obedecer a um e exibir o outro aceso.
    if ('atalho' in mudancas) {
      novo.delete('de')
      novo.delete('ate')
    }
    if ('de' in mudancas || 'ate' in mudancas) novo.delete('atalho')
    const qs = novo.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const deManual = params.get('de') ?? ''
  const ateManual = params.get('ate') ?? ''
  const atalhoAceso = deManual || ateManual ? '' : (params.get('atalho') ?? '30')

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 11,
        padding: '14px 16px',
        border: '1px solid rgba(255,255,255,.065)',
        borderRadius: 14,
        background: 'linear-gradient(168deg, #15141608, #0E0E0F)',
      }}
    >
      {usaData ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <Etiqueta>Período</Etiqueta>
          {ATALHOS_DE_PERIODO.map((a) => {
            const aceso = atalhoAceso === a.chave
            return (
              <button
                key={a.chave}
                type="button"
                onClick={() => trocar({ atalho: a.chave })}
                className="font-sans"
                style={{
                  height: 28,
                  padding: '0 12px',
                  borderRadius: 8,
                  border: `1px solid ${aceso ? 'rgba(239,209,140,.42)' : 'rgba(255,255,255,.08)'}`,
                  background: aceso ? 'rgba(239,209,140,.10)' : 'transparent',
                  color: aceso ? TINTA.ouro : 'rgba(242,237,227,.55)',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {a.rotulo}
              </button>
            )
          })}
          <input
            type="date"
            value={deManual}
            onChange={(e) => trocar({ de: e.target.value })}
            className="font-mono"
            style={CAMPO}
            aria-label="De"
          />
          <span className="font-sans" style={{ fontSize: 11, color: 'rgba(242,237,227,.4)' }}>
            até
          </span>
          <input
            type="date"
            value={ateManual}
            onChange={(e) => trocar({ ate: e.target.value })}
            className="font-mono"
            style={CAMPO}
            aria-label="Até"
          />
          {notaDaData ? (
            <span className="font-sans" style={{ fontSize: 11, color: 'rgba(242,237,227,.4)' }}>
              · {notaDaData}
            </span>
          ) : null}
        </div>
      ) : null}

      {usaUf || usaBusca ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          {usaUf ? (
            <>
              <Etiqueta>Estado</Etiqueta>
              <select
                value={params.get('uf') ?? ''}
                onChange={(e) => trocar({ uf: e.target.value })}
                className="font-sans"
                style={{ ...CAMPO, minWidth: 110 }}
              >
                <option value="">Todos</option>
                {ufs.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          {usaBusca ? (
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar…"
              className="font-sans"
              style={{ ...CAMPO, flex: 1, minWidth: 180 }}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
