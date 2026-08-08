import { IA_CAMPANHAS, IA_PUBLICOS } from '@/data/fixtures'
import { repositorio } from '@/data/repository'

import { EmailIaCliente } from './EmailIaCliente'

export default async function EmailIa() {
  const repo = repositorio()
  const [vitrine, bases, parametros] = await Promise.all([
    repo.vitrine(),
    repo.perfumesBase(),
    repo.parametros(),
  ])
  return (
    <EmailIaCliente
      campanhas={IA_CAMPANHAS}
      publicos={IA_PUBLICOS}
      vitrine={vitrine}
      bases={bases}
      parametros={parametros}
    />
  )
}
