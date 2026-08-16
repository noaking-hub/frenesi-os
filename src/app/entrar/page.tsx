import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { sessaoAtual } from '@/data/sessao'

import { FormularioEntrada } from './FormularioEntrada'

export const metadata: Metadata = {
  title: 'Entrar · FRENESI OS',
  // Tela de sistema não tem por que aparecer em buscador.
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; recado?: string }>
}) {
  // Quem já tem sessão não precisa ver a porta de novo.
  if (await sessaoAtual()) redirect('/')
  const { de, recado } = await searchParams
  return <FormularioEntrada de={de ?? ''} recado={recado} />
}
