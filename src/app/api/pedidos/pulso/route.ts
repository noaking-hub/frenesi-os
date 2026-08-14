import { NextResponse } from 'next/server'

import { sincronizarEnvios } from '@/app/(erp)/pedidos/actions'
import { mensagemDe, shopifyConfigurada } from '@/data/shopify'
import { supabaseConfigurado } from '@/data/supabase'
import { importarPedidosYampi, yampiConfigurada } from '@/data/yampi'

/**
 * O pulso dos pedidos, a cada 5 minutos.
 *
 * A rotina horária faz a manutenção completa — extrato, rastreio, estoque,
 * avisos — e por ser uma corrente longa, morre no corte de tempo da Netlify
 * com frequência: o carimbo de sincronia mostrava buracos de 3 a 6 horas, e a
 * operação via pedido novo só depois de clicar em "Sincronizar agora". Venda
 * é o dado que não pode envelhecer.
 *
 * Este pulso faz DUAS coisas, escolhidas para caber folgadas numa função:
 * os pedidos novos da Yampi (janela de 2 dias — o histórico é trabalho da
 * rotina horária e do botão) e uma dose curta do espelho de envios, que
 * mantém a fila da Shopify perto de zero sem depender de cliques.
 *
 *     POST /api/pedidos/pulso
 *     Authorization: Bearer $CRON_SEGREDO
 */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

function autorizado(req: Request): boolean {
  const esperado = process.env.CRON_SEGREDO
  if (!esperado) return false
  const enviado = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return enviado === esperado
}

export async function POST(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json(
      { erro: 'Não autorizado. Defina CRON_SEGREDO e mande o mesmo valor em Authorization: Bearer.' },
      { status: 401 },
    )
  }
  if (!supabaseConfigurado()) {
    return NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 500 })
  }

  const relatorio: Record<string, unknown> = { quando: new Date().toISOString() }

  if (yampiConfigurada()) {
    try {
      const y = await importarPedidosYampi(2)
      relatorio.pedidos = { pedidos: y.pedidos, entregues: y.entregues, transacoes: y.transacoes }
    } catch (e) {
      relatorio.pedidos = { erro: mensagemDe(e) }
    }
  } else {
    relatorio.pedidos = { pulado: 'credenciais da Yampi não estão definidas' }
  }

  if (shopifyConfigurada()) {
    try {
      const esp = await sincronizarEnvios({ prazoMs: 8_000 })
      relatorio.espelhoEnvios = esp.ok
        ? { enviados: esp.enviados, entregues: esp.entregues, naFila: esp.naFila }
        : { erro: esp.erro }
    } catch (e) {
      relatorio.espelhoEnvios = { erro: mensagemDe(e) }
    }
  }

  return NextResponse.json(relatorio)
}

/** GET só para conferir que a rota está no ar; não sincroniza nada. */
export async function GET() {
  return NextResponse.json({
    rota: 'pulso dos pedidos, a cada 5 minutos',
    como: 'POST com Authorization: Bearer $CRON_SEGREDO',
    configurado: Boolean(process.env.CRON_SEGREDO),
  })
}
