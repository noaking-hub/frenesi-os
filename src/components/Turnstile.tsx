'use client'

import { useEffect, useRef, useState } from 'react'

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
 *
 * Havendo chave, ele APARECE. A primeira versão usava `interaction-only`, que
 * a Cloudflare só pinta quando o desafio exige clique — ou seja, quase nunca.
 * O efeito prático foi um cadeado invisível: ninguém que olhasse a tela de
 * login conseguia dizer se a proteção estava ligada, e o único jeito de
 * descobrir que o script tinha falhado era tentar entrar e ser recusado. Um
 * widget visível resolve os dois: confirma que a camada existe e mostra o erro
 * no lugar onde o erro aconteceu.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (alvo: HTMLElement, opcoes: Record<string, unknown>) => string
      remove: (id: string) => void
      reset: (id: string) => void
    }
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/**
 * Quanto esperar pelo script da Cloudflare antes de admitir que ele não vem.
 *
 * Bloqueador de anúncio, rede corporativa e DNS filtrado derrubam
 * `challenges.cloudflare.com` calados. Sem prazo, o componente ficaria
 * girando para sempre e a pessoa só descobriria o problema ao ser recusada no
 * envio, com uma mensagem que não explica nada.
 */
const PRAZO_DO_SCRIPT_MS = 12_000

export function Turnstile({
  acao,
  tema = 'dark',
  /**
   * Recebe a ficha assim que ela existe — e `null` quando ela vence ou falha.
   *
   * É o que permite usar o widget FORA de um `<form>`: o portal de devoluções
   * chama server action por botão, não por submit, e sem isto a ficha ficaria
   * dentro de um input que ninguém envia.
   */
  aoResolver,
  /**
   * Muda de valor para pedir uma ficha nova. A ficha é de uso único: gastá-la
   * e não reiniciar o widget deixaria a segunda busca sem verificação.
   */
  rodada = 0,
}: {
  acao: string
  tema?: 'dark' | 'light' | 'auto'
  aoResolver?: (ficha: string | null) => void
  rodada?: number
}) {
  const chave = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const caixa = useRef<HTMLDivElement>(null)
  const id = useRef<string | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  // A referência mais recente do callback, sem entrar nas dependências do
  // efeito: uma função nova a cada render redesenharia o widget sem parar.
  const resolver = useRef(aoResolver)
  resolver.current = aoResolver

  // Ficha gasta: reinicia o widget para a próxima consulta.
  useEffect(() => {
    if (rodada === 0 || !id.current || !window.turnstile) return
    window.turnstile.reset(id.current)
  }, [rodada])

  useEffect(() => {
    if (!chave || !caixa.current) return
    let vivo = true

    const desenhar = () => {
      if (!vivo || !caixa.current || !window.turnstile || id.current) return
      setFalha(null)
      id.current = window.turnstile.render(caixa.current, {
        sitekey: chave,
        action: acao,
        theme: tema,
        // Visível sempre. O desafio segue automático — ninguém precisa clicar
        // em nada —, mas a caixa fica na tela dizendo o que está acontecendo.
        appearance: 'always',
        size: 'normal',
        language: 'pt-br',
        callback: (ficha: string) => resolver.current?.(ficha),
        'expired-callback': () => resolver.current?.(null),
        // O código vem da própria Cloudflare e vale ouro no diagnóstico:
        // `110200` é domínio fora da lista do site key, `300***` é rede
        // instável. Mostrar o número evita a caçada às cegas.
        'error-callback': (codigo?: string) => {
          resolver.current?.(null)
          setFalha(
            codigo
              ? `A verificação de segurança falhou (código ${codigo}).`
              : 'A verificação de segurança falhou.',
          )
        },
      })
    }

    if (!window.turnstile && !document.querySelector(`script[src="${SCRIPT}"]`)) {
      const s = document.createElement('script')
      s.src = SCRIPT
      s.async = true
      s.defer = true
      document.head.appendChild(s)
    }

    // Uma espera só, para os dois casos: o script que este componente acabou
    // de pedir e o que outro formulário da página já tinha pedido.
    const limite = Date.now() + PRAZO_DO_SCRIPT_MS
    const espera = setInterval(() => {
      if (!vivo) return
      if (window.turnstile) {
        clearInterval(espera)
        desenhar()
      } else if (Date.now() > limite) {
        clearInterval(espera)
        setFalha('Não foi possível carregar a verificação de segurança. Recarregue a página.')
      }
    }, 120)

    if (window.turnstile) {
      clearInterval(espera)
      desenhar()
    }

    return () => {
      vivo = false
      clearInterval(espera)
      if (id.current && window.turnstile) {
        window.turnstile.remove(id.current)
        id.current = null
      }
    }
  }, [chave, acao, tema])

  if (!chave) return null
  return (
    <div className="fr-turnstile" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div ref={caixa} style={{ display: 'flex', justifyContent: 'center' }} />
      {falha && (
        <span
          role="alert"
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.5, color: '#C25A50', textAlign: 'center' }}
        >
          {falha}
        </span>
      )}
    </div>
  )
}
