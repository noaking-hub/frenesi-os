import { lerModeloEmail } from '@/data/modelo-email'

import { EmailsCliente } from './EmailsCliente'

export const dynamic = 'force-dynamic'

export default async function Emails() {
  const [carrinho, giftback, cashback] = await Promise.all([
    lerModeloEmail('carrinho'),
    lerModeloEmail('giftback'),
    lerModeloEmail('cashback'),
  ])
  return <EmailsCliente carrinho={carrinho} giftback={giftback} cashback={cashback} />
}
