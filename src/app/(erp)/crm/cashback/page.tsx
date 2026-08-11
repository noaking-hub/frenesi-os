import { carteirasCashback, lerRegraCashback } from '@/data/cashback'

import { CashbackCliente } from './CashbackCliente'

export const dynamic = 'force-dynamic'

export default async function Cashback() {
  const [regra, carteiras] = await Promise.all([lerRegraCashback(), carteirasCashback()])
  return <CashbackCliente regra={regra} carteiras={carteiras} />
}
