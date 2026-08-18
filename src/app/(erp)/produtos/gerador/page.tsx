import { lerPresetsDoGerador } from '@/data/gerador-presets'

import { GeradorCliente } from './GeradorCliente'

// Os presets moram no banco; a tela precisa da lista fresca a cada abertura.
export const dynamic = 'force-dynamic'

export default async function PaginaDoGerador() {
  return <GeradorCliente presets={await lerPresetsDoGerador()} />
}
