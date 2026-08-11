/**
 * Ícones do menu — um por módulo, desenhados à mão.
 *
 * Inline e não de biblioteca por três motivos: zero dependência nova, o
 * traço fica no mesmo peso em todos (1.6, pontas redondas), e `currentColor`
 * faz o ícone acompanhar o estado do item — apagado no repouso, dourado no
 * ativo — sem nenhum CSS extra.
 */

import type { ReactNode } from 'react'

function Icone({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: 'none', display: 'block' }}
    >
      {children}
    </svg>
  )
}

/**
 * Chaveado pelo id do grupo em `navegacao.ts`. Grupo sem ícone cai no
 * marcador de ponto antigo — o menu nunca quebra por causa de um id novo.
 */
export const ICONES: Record<string, ReactNode> = {
  dashboard: (
    <Icone>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="4.5" rx="1.5" />
      <rect x="13.5" y="10.5" width="7" height="10" rx="1.5" />
      <rect x="3.5" y="13" width="7" height="7.5" rx="1.5" />
    </Icone>
  ),
  pedidos: (
    <Icone>
      <path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16z" />
      <path d="M3.5 8 12 12.5 20.5 8" />
      <path d="M12 12.5V20.5" />
    </Icone>
  ),
  produtos: (
    // Frasco de perfume: bojo, gargalo e tampa — é uma loja de decants.
    <Icone>
      <path d="M9.5 3.5h5" />
      <path d="M10.5 3.5v3h3v-3" />
      <path d="M10.5 6.5C7.5 7.6 5.5 10.4 5.5 13.7c0 3.8 2.9 6.8 6.5 6.8s6.5-3 6.5-6.8c0-3.3-2-6.1-5-7.2" />
    </Icone>
  ),
  estoque: (
    <Icone>
      <path d="M12 3.5 20.5 8 12 12.5 3.5 8z" />
      <path d="M3.5 12 12 16.5 20.5 12" />
      <path d="M3.5 16 12 20.5 20.5 16" />
    </Icone>
  ),
  producao: (
    // Erlenmeyer com nível de líquido: a bancada de envase.
    <Icone>
      <path d="M9.5 3.5h5" />
      <path d="M10.5 3.5v6L4.8 18.6c-.6 1.1.2 2.4 1.4 2.4h11.6c1.2 0 2-1.3 1.4-2.4L13.5 9.5v-6" />
      <path d="M7.2 15h9.6" />
    </Icone>
  ),
  financeiro: (
    <Icone>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.8 9.2c-.5-.9-1.6-1.4-2.8-1.4-1.7 0-3 1-3 2.3 0 3.1 6 1.5 6 4.4 0 1.3-1.3 2.3-3 2.3-1.2 0-2.3-.5-2.8-1.4" />
      <path d="M12 6.2v11.6" />
    </Icone>
  ),
  crm: (
    <Icone>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M15.5 5.8a3.2 3.2 0 0 1 0 5.4" />
      <path d="M17.5 14.9c1.8.8 3 2.5 3 4.6" />
    </Icone>
  ),
  promocoes: (
    <Icone>
      <path d="M3.5 11 12 3.5l8 1 1 8L12.5 21z" />
      <circle cx="15.2" cy="8.8" r="1.4" />
    </Icone>
  ),
  atendimento: (
    <Icone>
      <path d="M20.5 11.5c0 4-3.8 7-8.5 7-1 0-2-.1-2.9-.4L4 19.5l1.2-3.3c-1.1-1.2-1.7-2.9-1.7-4.7 0-4 3.8-7 8.5-7s8.5 3 8.5 7z" />
      <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" />
    </Icone>
  ),
  ia: (
    <Icone>
      <path d="M12 3.5c.7 4.2 2.3 5.8 6.5 6.5-4.2.7-5.8 2.3-6.5 6.5-.7-4.2-2.3-5.8-6.5-6.5 4.2-.7 5.8-2.3 6.5-6.5z" />
      <path d="M18.5 15.5c.35 2.1 1.15 2.9 3.25 3.25-2.1.35-2.9 1.15-3.25 3.25-.35-2.1-1.15-2.9-3.25-3.25 2.1-.35 2.9-1.15 3.25-3.25z" />
    </Icone>
  ),
  relatorios: (
    <Icone>
      <path d="M4 20.5h16.5" />
      <path d="M6.5 20v-6M11.5 20V9M16.5 20V4.5" />
    </Icone>
  ),
  config: (
    <Icone>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.8v2M12 18.2v2M20.2 12h-2M5.8 12h-2M17.8 6.2l-1.4 1.4M7.6 16.4l-1.4 1.4M17.8 17.8l-1.4-1.4M7.6 7.6 6.2 6.2" />
    </Icone>
  ),
}
