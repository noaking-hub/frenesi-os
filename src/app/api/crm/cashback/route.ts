import { NextResponse } from 'next/server'

import { exigeSessao } from '@/app/api/exige-sessao'

import { sincronizarCashbackYampi } from '@/data/cashback'

/**
 * Sincronização do espelho de cashback, em rodadas.
 *
 * São centenas de consultas de carteira (uma por cliente) — não cabe numa
 * Server Action nem numa execução só. Cada chamada processa uma fatia e
 * devolve a página onde parou; a tela repete até `proximaPagina` vir nula.
 *
 * O ORÇAMENTO DE 15 s não é folga, é o que cabe. A função síncrona da Netlify
 * é encerrada por volta de 26 s, e quando isso acontece quem responde é a
 * plataforma, com uma página HTML de erro — que no cliente virava
 * `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`. O `maxDuration`
 * de 300 era uma promessa que só o código fazia; a Netlify nunca concordou.
 *
 * É a mesma armadilha da espera de 150 s do Mercado Pago: escrever para um
 * tempo que o ambiente não dá não adia o corte, só troca um erro claro por
 * um confuso.
 */
export const maxDuration = 26
export const dynamic = 'force-dynamic'

export async function POST(pedido: Request) {
  const semSessao = await exigeSessao()
  if (semSessao) return semSessao

  let corpo: { pagina?: number }
  try {
    corpo = await pedido.json()
  } catch {
    corpo = {}
  }
  try {
    const r = await sincronizarCashbackYampi(Math.max(1, Number(corpo.pagina) || 1), 15_000)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({
      ok: false,
      erro: e instanceof Error ? e.message : String(e),
    })
  }
}
