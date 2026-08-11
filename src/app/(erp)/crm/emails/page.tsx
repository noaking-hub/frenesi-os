import { lerModeloEmail } from '@/data/modelo-email'

import { EmailsCliente } from './EmailsCliente'

export const dynamic = 'force-dynamic'

export default async function Emails() {
  const [carrinho, giftback] = await Promise.all([
    lerModeloEmail('carrinho'),
    lerModeloEmail('giftback'),
  ])
  return <EmailsCliente carrinho={carrinho} giftback={giftback} />
}
