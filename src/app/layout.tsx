import type { Metadata, Viewport } from 'next'
import { Cormorant_Garamond, IBM_Plex_Mono, Manrope } from 'next/font/google'

import './globals.css'

const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-cormorant',
  display: 'swap',
})

const sans = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-manrope',
  display: 'swap',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'FRENESI OS',
  description: 'ERP interno da FRENESI Perfumes e Portal de Devoluções.',
}

/**
 * `viewportFit: 'cover'` é o que faz o ERP usar a tela inteira do iPhone, com
 * as áreas seguras respeitadas pelo CSS (`env(safe-area-inset-*)`). Sem ele o
 * conteúdo para nas tarjas pretas em volta do notch.
 *
 * O zoom continua LIBERADO. Travar `maximumScale` é hábito de app que quer
 * parecer nativo, e o custo é quem precisa aproximar para ler um número —
 * exatamente o que se faz num ERP consultado no celular.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0A0A09',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
