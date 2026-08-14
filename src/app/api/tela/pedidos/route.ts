import { NextResponse } from 'next/server'

import { importarDaYampi, sincronizarEnvios } from '@/app/(erp)/pedidos/actions'
import { importarEntregasLocaisDaShopify, mensagemDe, shopifyConfigurada } from '@/data/shopify'

/**
 * Sincronia de pedidos para a tela, como rota — fora da fila de Server
 * Actions, para não segurar a navegação enquanto importa (ver
 * api/tela/extrato). `dias: 0` pula a importação e só espelha envios.
 */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { dias?: number; espelhar?: boolean }
  const dias = Math.max(0, Math.min(365, Math.round(corpo.dias ?? 10)))

  // As entregas locais vêm PRIMEIRO, e a ordem é defesa: a Netlify corta a
  // função por tempo, e a importação da Yampi é o passo lento. Atrás dela,
  // esta etapa — que é barata — morria junto quando o corte chegava.
  let entregasLocais: unknown = null
  if (corpo.espelhar && shopifyConfigurada()) {
    try {
      entregasLocais = await importarEntregasLocaisDaShopify()
    } catch (e) {
      entregasLocais = { erro: mensagemDe(e) }
    }
  }
  const importacao = dias > 0 ? await importarDaYampi(dias) : null
  const envios = corpo.espelhar ? await sincronizarEnvios() : null
  return NextResponse.json({ importacao, envios, entregasLocais })
}
