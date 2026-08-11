import { aniversariantes, ultimaImportacaoAniversarios } from '@/data/giftback'

import { GiftbackCliente } from './GiftbackCliente'

export const dynamic = 'force-dynamic'

export default async function Giftback() {
  const [dados, ultimaImportacao] = await Promise.all([
    aniversariantes(),
    ultimaImportacaoAniversarios(),
  ])
  return (
    <GiftbackCliente
      lista={dados.lista}
      comAniversario={dados.comAniversario}
      semAniversario={dados.semAniversario}
      ultimaImportacao={ultimaImportacao}
    />
  )
}
