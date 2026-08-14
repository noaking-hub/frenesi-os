import { lerModeloEmail } from '@/data/modelo-email'

import { EmailsCliente } from './EmailsCliente'

export const dynamic = 'force-dynamic'

export default async function Emails() {
  const [carrinho, giftback, cashback, envio, devolucaoAberta, devolucaoAprovada, devolucaoConcluida] =
    await Promise.all([
      lerModeloEmail('carrinho'),
      lerModeloEmail('giftback'),
      lerModeloEmail('cashback'),
      lerModeloEmail('envio'),
      lerModeloEmail('devolucao-aberta'),
      lerModeloEmail('devolucao-aprovada'),
      lerModeloEmail('devolucao-concluida'),
    ])
  return (
    <EmailsCliente
      carrinho={carrinho}
      giftback={giftback}
      cashback={cashback}
      envio={envio}
      devolucaoAberta={devolucaoAberta}
      devolucaoAprovada={devolucaoAprovada}
      devolucaoConcluida={devolucaoConcluida}
    />
  )
}
