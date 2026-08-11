'use client'

import { useEffect, useRef } from 'react'

/**
 * Widget do Rastreio.net — a mesma página de rastreio que os clientes usam.
 *
 * O serviço concentra os envios da Yampi (Frenet e Melhor Envio juntos), e o
 * widget deles é um script que se monta na div `rastreioDiv`. Injetar via
 * efeito, e não no JSX, porque o script precisa rodar DEPOIS de a div existir.
 */
export function RastreioNet() {
  const carregado = useRef(false)

  useEffect(() => {
    if (carregado.current) return
    carregado.current = true
    const script = document.createElement('script')
    script.src =
      'https://empreender.nyc3.cdn.digitaloceanspaces.com/static/RASTREIOPUB/rastreio.js'
    script.type = 'text/javascript'
    script.id = 'rastreioScript'
    script.dataset.user = 'L2scO3eV'
    document.body.appendChild(script)
  }, [])

  return (
    <div
      style={{
        background: 'var(--color-mesa)',
        border: '1px solid var(--color-borda)',
        borderRadius: 'var(--radius-card)',
        padding: '20px 22px',
        minHeight: 320,
      }}
    >
      <div id="rastreioDiv" />
    </div>
  )
}
