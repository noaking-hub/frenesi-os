import { lerModeloEmail } from '@/data/modelo-email'

import { EmailsCliente } from './EmailsCliente'

export const dynamic = 'force-dynamic'

export default async function Emails() {
  const [carrinho, giftback, cashback, envio] = await Promise.all([
    lerModeloEmail('carrinho'),
    lerModeloEmail('giftback'),
    lerModeloEmail('cashback'),
    lerModeloEmail('envio'),
  ])
  return (
    <EmailsCliente carrinho={carrinho} giftback={giftback} cashback={cashback} envio={envio} />
  )
}
