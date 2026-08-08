import { repositorio } from '@/data/repository'

import { GiftbackCliente } from './GiftbackCliente'

export default async function Giftback() {
  const repo = repositorio()
  const [regras, saldos, giftbacks, parametros] = await Promise.all([
    repo.regrasCashback(),
    repo.saldosCashback(),
    repo.giftbacks(),
    repo.parametros(),
  ])
  return (
    <GiftbackCliente regras={regras} saldos={saldos} giftbacks={giftbacks} parametros={parametros} />
  )
}
