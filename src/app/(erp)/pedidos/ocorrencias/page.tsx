import { repositorio } from '@/data/repository'
import { supabaseConfigurado } from '@/data/supabase'

import { OcorrenciasCliente } from './OcorrenciasCliente'

export const dynamic = 'force-dynamic'

export default async function OcorrenciasDeEntrega() {
  const ocorrencias = await repositorio().ocorrencias()
  return <OcorrenciasCliente ocorrencias={ocorrencias} ligado={supabaseConfigurado()} />
}
