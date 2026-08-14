import { NextResponse } from 'next/server'

import { importarDaYampi, sincronizarEnvios } from '@/app/(erp)/pedidos/actions'
import { baixarNaShopify } from '@/app/(erp)/pedidos/envios/actions'
import { importarEntregasLocaisDaShopify, mensagemDe, shopifyConfigurada } from '@/data/shopify'

/**
 * Sincronia de pedidos para a tela, como rota — fora da fila de Server
 * Actions, para não segurar a navegação enquanto importa (ver
 * api/tela/extrato).
 *
 * Um passo por requisição, e isso é a correção de um defeito de produção: a
 * Netlify mata a função em ~26 s SEM resposta, e a requisição única que fazia
 * tudo (entregas locais + importação + espelho de centenas de envios) morria
 * no meio — o navegador mostrava página de erro depois de um minuto de
 * espera. Cada passo agora cabe no tempo; o espelho ainda ganha um orçamento
 * interno e devolve quantos ficaram na fila, para a tela decidir se repete.
 */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/** Orçamento do espelho de envios: folga para a resposta sair antes do corte. */
const PRAZO_ESPELHO_MS = 14_000

type Corpo = { passo?: 'locais' | 'importar' | 'envios'; dias?: number }

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as Corpo

  if (corpo.passo === 'locais') {
    if (!shopifyConfigurada()) return NextResponse.json({ entregasLocais: null })
    try {
      return NextResponse.json({ entregasLocais: await importarEntregasLocaisDaShopify() })
    } catch (e) {
      return NextResponse.json({ entregasLocais: { erro: mensagemDe(e) } })
    }
  }

  if (corpo.passo === 'envios') {
    const envios = await sincronizarEnvios({ prazoMs: PRAZO_ESPELHO_MS })
    // Os pedidos locais não têm rastreio e ficam de fora do espelho — a fila
    // de baixa cobre esse resto, com o tempo que sobrou do orçamento.
    let baixa = null
    if (envios.ok && envios.naFila === 0 && shopifyConfigurada()) {
      baixa = await baixarNaShopify(undefined, { prazoMs: 8_000 })
    }
    return NextResponse.json({ envios, baixa })
  }

  const dias = Math.max(1, Math.min(365, Math.round(corpo.dias ?? 10)))
  return NextResponse.json({ importacao: await importarDaYampi(dias) })
}
