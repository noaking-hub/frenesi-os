import { pesquisasAnteriores } from '@/data/pesquisa-de-mercado'

import { PesquisaCliente } from './PesquisaCliente'

// As seis lojas são consultadas em paralelo dentro da server action; o teto
// da Netlify é ~26 s e cada loja tem prazo individual de 9 s.
export const maxDuration = 26
export const dynamic = 'force-dynamic'

export default async function PaginaDePesquisa() {
  return <PesquisaCliente historicoInicial={await pesquisasAnteriores()} />
}
