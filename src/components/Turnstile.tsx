'use client'

import { useEffect, useRef } from 'react'

/**
 * O widget do Turnstile.
 *
 * Ele injeta um `input[name=cf-turnstile-response]` dentro do formulário, que é
 * exatamente o campo que o servidor confere. Por isso o componente não precisa
 * de estado nem de callback: basta estar dentro do `<form>`.
 *
 * Some inteiro quando não há chave pública configurada — e some de verdade,
 * devolvendo `null`, em vez de deixar uma caixa vazia no meio do cartão de
 * login esperando por um script que nunca vai carregar.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (alvo: HTMLElement, opcoes: Record<string, unknown>) => string
      remove: (id: string) => void
    }
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export function Turnstile({ acao }: { acao: string }) {
  const chave = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const caixa = useRef<HTMLDivElement>(null)
  const id = useRef<string | null>(null)

  useEffect(() => {
    if (!chave || !caixa.current) return
    let vivo = true

    const desenhar = () => {
      if (!vivo || !caixa.current || !window.turnstile || id.current) return
      id.current = window.turnstile.render(caixa.current, {
        sitekey: chave,
        action: acao,
        theme: 'dark',
        // O widget do ERP não precisa ser visível quando o desafio é trivial —
        // e a maior parte das vezes é. Some do caminho de quem só quer entrar.
        appearance: 'interaction-only',
        language: 'pt-br',
      })
    }

    if (window.turnstile) {
      desenhar()
    } else if (!document.querySelector(`script[src="${SCRIPT}"]`)) {
      const s = document.createElement('script')
      s.src = SCRIPT
      s.async = true
      s.defer = true
      s.onload = desenhar
      document.head.appendChild(s)
    } else {
      // O script já está carregando por causa de outro formulário na página.
      const espera = setInterval(() => {
        if (window.turnstile) {
          clearInterval(espera)
          desenhar()
        }
      }, 120)
      return () => clearInterval(espera)
    }

    return () => {
      vivo = false
      if (id.current && window.turnstile) {
        window.turnstile.remove(id.current)
        id.current = null
      }
    }
  }, [chave, acao])

  if (!chave) return null
  return <div ref={caixa} className="fr-turnstile" />
}
