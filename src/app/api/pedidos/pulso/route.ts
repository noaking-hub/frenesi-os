import { NextResponse } from 'next/server'

import { sincronizarEnvios } from '@/app/(erp)/pedidos/actions'
import { mensagemDe, shopifyConfigurada } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
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

  // Manutenção do estoque, depois da importação e por um bom motivo de
  // ordem: o pedido que acabou de chegar precisa ter os itens casados com o
  // catálogo ANTES de a reserva tentar enxergá-los. Uma chamada, três
  // etapas, tudo no banco — cabe de sobra no tempo da função.
  try {
    const { data, error } = await supabaseServer().rpc('manutencao_do_estoque')
    relatorio.estoque = error ? { erro: error.message } : data
  } catch (e) {
    relatorio.estoque = { erro: mensagemDe(e) }
  }

  // A batida no banco é o que torna esta rotina AUDITÁVEL: as funções
  // agendadas falharam em silêncio por dias (segredo ausente → 401 → nada
  // gravado em lugar nenhum) e o defeito só apareceu quando alguém estranhou
  // um "sincronizado há 5 horas". Com a batida, "o pulso está vivo?" é uma
  // consulta — inclusive nas rodadas em que a Yampi falha, porque o erro vai
  // junto nos detalhes. Guarda só as últimas 48 h: é sinal vital, não acervo.
  try {
    const sb = supabaseServer()
    await sb
      .from('sincronizacoes')
      .delete()
      .eq('origem', 'pulso')
      .lt('executada_em', new Date(Date.now() - 48 * 3600_000).toISOString())
    await sb.from('sincronizacoes').insert({ origem: 'pulso', tipo: 'batida', detalhes: relatorio })
  } catch {
    // Sem batida ainda há resposta — o pulso não deixa de trabalhar por
    // causa do próprio termômetro.
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
