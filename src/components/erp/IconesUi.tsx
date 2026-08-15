import type { CSSProperties, ReactNode } from 'react'

/**
 * Biblioteca de ícones de interface.
 *
 * Inline, e não de pacote, pelo mesmo motivo dos ícones do menu: zero
 * dependência, traço no mesmo peso em todos (1.5, pontas redondas) e
 * `currentColor` — o que faz o ícone herdar a cor do estado sem uma linha de
 * CSS. Um pacote de ícones traria 200 KB para desenhar trinta traços.
 *
 * O nome é a chave: as telas pedem `<Ico n="carteira" />` e nunca importam
 * um símbolo por vez.
 */

export type NomeIcone =
  | 'carteira'
  | 'calendario'
  | 'tendencia'
  | 'queda'
  | 'entrada'
  | 'saida'
  | 'transferir'
  | 'cifrao'
  | 'moeda'
  | 'porcento'
  | 'alvo'
  | 'pizza'
  | 'barras'
  | 'linha'
  | 'alerta'
  | 'alerta-circulo'
  | 'info'
  | 'check'
  | 'check-circulo'
  | 'x'
  | 'x-circulo'
  | 'relogio'
  | 'ampulheta'
  | 'repetir'
  | 'atualizar'
  | 'cadeado'
  | 'escudo'
  | 'elo'
  | 'documento'
  | 'recibo'
  | 'etiqueta'
  | 'caixa'
  | 'banco'
  | 'cofre'
  | 'balanca'
  | 'calculadora'
  | 'enviar'
  | 'exportar'
  | 'importar'
  | 'filtro'
  | 'busca'
  | 'engrenagem'
  | 'ajustes'
  | 'mais'
  | 'olho'
  | 'lapis'
  | 'lixeira'
  | 'kebab'
  | 'seta-direita'
  | 'seta-esquerda'
  | 'chevron'
  | 'estrela'
  | 'sino'
  | 'faisca'
  | 'grade'
  | 'lista'
  | 'pessoas'
  | 'carrinho'
  | 'frasco'
  | 'megafone'

const TRACOS: Record<NomeIcone, ReactNode> = {
  carteira: (
    <>
      <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z" />
      <path d="M3.5 9.5h13a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-13" />
      <path d="M15.5 12h.01" />
    </>
  ),
  calendario: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
    </>
  ),
  tendencia: (
    <>
      <path d="M3.5 16.5 9 11l3.5 3.5L20.5 6.5" />
      <path d="M15.5 6.5h5v5" />
    </>
  ),
  queda: (
    <>
      <path d="M3.5 7.5 9 13l3.5-3.5 8 8" />
      <path d="M15.5 17.5h5v-5" />
    </>
  ),
  entrada: (
    <>
      <path d="M12 19.5V5.5" />
      <path d="M6.5 11 12 5.5 17.5 11" />
    </>
  ),
  saida: (
    <>
      <path d="M12 4.5v14" />
      <path d="M6.5 13 12 18.5 17.5 13" />
    </>
  ),
  transferir: (
    <>
      <path d="M4 8.5h13M13.5 5 17 8.5 13.5 12" />
      <path d="M20 15.5H7M10.5 12 7 15.5 10.5 19" />
    </>
  ),
  cifrao: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.6 9.4c-.5-.8-1.5-1.3-2.6-1.3-1.6 0-2.8.9-2.8 2.1 0 2.9 5.6 1.4 5.6 4.1 0 1.2-1.2 2.1-2.8 2.1-1.1 0-2.1-.5-2.6-1.3" />
      <path d="M12 6.4v11.2" />
    </>
  ),
  moeda: (
    <>
      <ellipse cx="12" cy="7" rx="7.5" ry="3" />
      <path d="M4.5 7v10c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V7" />
      <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
    </>
  ),
  porcento: (
    <>
      <path d="M6.5 17.5 17.5 6.5" />
      <circle cx="7.8" cy="7.8" r="2.3" />
      <circle cx="16.2" cy="16.2" r="2.3" />
    </>
  ),
  alvo: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.6" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  pizza: (
    <>
      <path d="M12 3.5v8.5h8.5A8.5 8.5 0 0 0 12 3.5z" />
      <path d="M20 15a8.5 8.5 0 1 1-8-11" />
    </>
  ),
  barras: (
    <>
      <path d="M4 20.5h16.5" />
      <path d="M7 20v-5.5M12 20V8M17 20v-9" />
    </>
  ),
  linha: (
    <>
      <path d="M3.5 20V4.5M3.5 20h17" />
      <path d="M7 15.5l3.5-4 3 2.5 4.5-6" />
    </>
  ),
  alerta: (
    <>
      <path d="M10.3 4.2 2.9 17.1c-.7 1.2.2 2.7 1.6 2.7h14.9c1.4 0 2.3-1.5 1.6-2.7L13.6 4.2a1.9 1.9 0 0 0-3.3 0z" />
      <path d="M12 9.4v4M12 16.4h.01" />
    </>
  ),
  'alerta-circulo': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.8v4.6M12 15.9h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8.1h.01" />
    </>
  ),
  check: <path d="M5 12.5 10 17.5 19.5 7" />,
  'check-circulo': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.2 12.2 11 15l5-5.6" />
    </>
  ),
  x: <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />,
  'x-circulo': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.2 9.2 14.8 14.8M14.8 9.2 9.2 14.8" />
    </>
  ),
  relogio: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.2V12l3.2 2" />
    </>
  ),
  ampulheta: (
    <>
      <path d="M6.5 3.5h11M6.5 20.5h11" />
      <path d="M8 3.5v3.1c0 1.9 4 3.5 4 5.4 0 1.9-4 3.5-4 5.4v3.1" />
      <path d="M16 3.5v3.1c0 1.9-4 3.5-4 5.4 0 1.9 4 3.5 4 5.4v3.1" />
    </>
  ),
  repetir: (
    <>
      <path d="M4 8.5h12.5a3.5 3.5 0 0 1 0 7H14" />
      <path d="M7 5.5 4 8.5l3 3" />
      <path d="M20 15.5H7.5a3.5 3.5 0 0 1 0-7H10" />
      <path d="M17 18.5l3-3-3-3" />
    </>
  ),
  atualizar: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20.5 4v4.5H16" />
    </>
  ),
  cadeado: (
    <>
      <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
      <path d="M12 14v2.5" />
    </>
  ),
  escudo: (
    <>
      <path d="M12 3.5 20 6.3v5.4c0 4.4-3.2 7.6-8 9.3-4.8-1.7-8-4.9-8-9.3V6.3z" />
      <path d="M9 12.2 11.3 14.5 15.4 10" />
    </>
  ),
  elo: (
    <>
      <path d="M10.2 13.8a3.6 3.6 0 0 0 5.2 0l2.9-2.9a3.7 3.7 0 0 0-5.2-5.2l-1.4 1.4" />
      <path d="M13.8 10.2a3.6 3.6 0 0 0-5.2 0l-2.9 2.9a3.7 3.7 0 0 0 5.2 5.2l1.4-1.4" />
    </>
  ),
  documento: (
    <>
      <path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" />
      <path d="M13.5 3.5V9H19" />
      <path d="M8.5 13.5h7M8.5 17h5" />
    </>
  ),
  recibo: (
    <>
      <path d="M5.5 3.5h13v17l-2.2-1.5-2.2 1.5-2.1-1.5-2.2 1.5-2.2-1.5-2.1 1.5z" />
      <path d="M9 8.5h6M9 12.5h6" />
    </>
  ),
  etiqueta: (
    <>
      <path d="M3.5 11.2V5a1.5 1.5 0 0 1 1.5-1.5h6.2c.4 0 .8.2 1 .4l8 8a1.5 1.5 0 0 1 0 2.1l-6.2 6.2a1.5 1.5 0 0 1-2.1 0l-8-8a1.5 1.5 0 0 1-.4-1z" />
      <path d="M7.8 7.8h.01" />
    </>
  ),
  caixa: (
    <>
      <path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16z" />
      <path d="M3.5 8 12 12.5 20.5 8M12 12.5V20.5" />
    </>
  ),
  banco: (
    <>
      <path d="M3.5 9.5 12 4l8.5 5.5" />
      <path d="M5.5 9.5v9M18.5 9.5v9M9.5 9.5v9M14.5 9.5v9" />
      <path d="M3.5 20.5h17" />
    </>
  ),
  cofre: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="11" cy="12" r="3.6" />
      <path d="M11 8.4V12M17 9v6" />
    </>
  ),
  balanca: (
    <>
      <path d="M12 4v16M7 20.5h10" />
      <path d="M4 8.5 12 6l8 2.5" />
      <path d="M4 8.5 1.8 14a3.2 3.2 0 0 0 4.4 0z" />
      <path d="M20 8.5 17.8 14a3.2 3.2 0 0 0 4.4 0z" />
    </>
  ),
  calculadora: (
    <>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" />
      <path d="M7.5 7.5h9" />
      <path d="M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" />
    </>
  ),
  enviar: (
    <>
      <path d="M20.5 3.5 11 13" />
      <path d="M20.5 3.5 14.5 20.5l-3.5-7.5-7.5-3.5z" />
    </>
  ),
  exportar: (
    <>
      <path d="M12 15.5V3.5M8 7.5 12 3.5l4 4" />
      <path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" />
    </>
  ),
  importar: (
    <>
      <path d="M12 3.5v12M8 11.5l4 4 4-4" />
      <path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" />
    </>
  ),
  filtro: (
    <>
      <path d="M3.5 5.5h17l-6.5 7.6v5.9l-4 2.1v-8z" />
    </>
  ),
  busca: (
    <>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="M15.5 15.5 20.5 20.5" />
    </>
  ),
  engrenagem: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.8v2M12 18.2v2M20.2 12h-2M5.8 12h-2M17.8 6.2l-1.4 1.4M7.6 16.4l-1.4 1.4M17.8 17.8l-1.4-1.4M7.6 7.6 6.2 6.2" />
    </>
  ),
  ajustes: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="10" cy="17" r="2.2" />
    </>
  ),
  mais: <path d="M12 5.5v13M5.5 12h13" />,
  olho: (
    <>
      <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  lapis: (
    <>
      <path d="M16.5 3.9a2.1 2.1 0 0 1 3 3L8.4 18l-4 1 1-4z" />
      <path d="M14.5 5.9l3 3" />
    </>
  ),
  lixeira: (
    <>
      <path d="M4.5 6.5h15M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="M6.5 6.5 7.5 20a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-13.5" />
    </>
  ),
  kebab: (
    <>
      <circle cx="12" cy="5.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18.5" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  'seta-direita': <path d="M4.5 12h15M13.5 6l6 6-6 6" />,
  'seta-esquerda': <path d="M19.5 12h-15M10.5 18l-6-6 6-6" />,
  chevron: <path d="M7 10l5 5 5-5" />,
  estrela: (
    <path d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9-4.3-4.1 5.9-.8z" />
  ),
  sino: (
    <>
      <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9z" />
      <path d="M13.7 19.5a2 2 0 0 1-3.4 0" />
    </>
  ),
  faisca: (
    <>
      <path d="M12 3.2c.7 4 2.2 5.5 6.2 6.2-4 .7-5.5 2.2-6.2 6.2-.7-4-2.2-5.5-6.2-6.2 4-.7 5.5-2.2 6.2-6.2z" />
      <path d="M18 16c.3 1.7.9 2.3 2.6 2.6-1.7.3-2.3.9-2.6 2.6-.3-1.7-.9-2.3-2.6-2.6 1.7-.3 2.3-.9 2.6-2.6z" />
    </>
  ),
  grade: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </>
  ),
  lista: (
    <>
      <path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12" />
      <path d="M4 6.5h.01M4 12h.01M4 17.5h.01" />
    </>
  ),
  pessoas: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M15.5 5.8a3.2 3.2 0 0 1 0 5.4M17.5 14.9c1.8.8 3 2.5 3 4.6" />
    </>
  ),
  carrinho: (
    <>
      <path d="M3 4.5h2.2l2.4 11.2a1.8 1.8 0 0 0 1.8 1.4h7.9a1.8 1.8 0 0 0 1.8-1.4l1.4-6.7H6" />
      <circle cx="9.5" cy="20" r="1.2" />
      <circle cx="17.5" cy="20" r="1.2" />
    </>
  ),
  frasco: (
    <>
      <path d="M9.5 3.5h5M10.5 3.5v3h3v-3" />
      <path d="M10.5 6.5C7.5 7.6 5.5 10.4 5.5 13.7c0 3.8 2.9 6.8 6.5 6.8s6.5-3 6.5-6.8c0-3.3-2-6.1-5-7.2" />
    </>
  ),
  megafone: (
    <>
      <path d="M4 9.5v5a1.5 1.5 0 0 0 1.5 1.5H8l7.5 4.5V5L8 9.5H5.5A1.5 1.5 0 0 0 4 11z" />
      <path d="M18.5 9a4.5 4.5 0 0 1 0 6" />
    </>
  ),
}

export function Ico({
  n,
  tamanho = 16,
  style,
}: {
  n: NomeIcone
  tamanho?: number
  style?: CSSProperties
}) {
  return (
    <svg
      aria-hidden
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: 'none', display: 'block', ...style }}
    >
      {TRACOS[n]}
    </svg>
  )
}
