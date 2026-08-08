import { repositorio } from '@/data/repository'

import { EmailsCliente } from './EmailsCliente'

export default async function Emails() {
  const repo = repositorio()
  const [fluxos, etapas, cupons] = await Promise.all([
    repo.fluxos(),
    repo.etapasFluxo(),
    repo.cupons(),
  ])
  return <EmailsCliente fluxos={fluxos} etapas={etapas} cupons={cupons} />
}
