import { aniversariantes } from '@/data/giftback'

import { GiftbackCliente } from './GiftbackCliente'

export const dynamic = 'force-dynamic'

export default async function Giftback() {
  const dados = await aniversariantes()
  return (
    <GiftbackCliente
      lista={dados.lista}
      comAniversario={dados.comAniversario}
      semAniversario={dados.semAniversario}
    />
  )
}
