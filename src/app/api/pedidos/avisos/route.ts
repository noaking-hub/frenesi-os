import { NextResponse } from 'next/server'

import { enviarAvisosDePedido } from '@/data/notificacoes'
import { registrarSaudeDaRotina } from '@/data/saude-das-rotinas'
import { mensagemDe, shopifyConfigurada, vincularPedidosShopify } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

/**
 * Os avisos ao cliente, em rotina PRÓPRIA.
 *
 * Eles moravam no fim da sincronia horária, atrás de extrato, rastreio,
 * conciliação e estoque — uma corrente longa demais para o tempo de função da
 * Netlify, que corta perto de 26 segundos. Quando a corrente estourava, o que
 * ficava de fora era sempre a ponta: o e-mail do cliente. E a falha era muda,
 * porque o corte acontece fora do `try` de cada etapa.
 *
 * Aqui a rotina tem a função inteira para si, e o único trabalho dela cabe
 * folgado: quarenta avisos por rodada, meio segundo entre um e outro.
 *
 *     POST /api/pedidos/avisos
 *     Authorization: Bearer $CRON_SEGREDO
 *
 * Continua desligada até `AVISOS_DE_PEDIDO=1`. Desligada ela ainda RODA e
 * registra cada fato como dispensado — é isso que impede a enxurrada de
 * avisos atrasados no dia em que a trava for aberta.
 */
export const maxDuration = 26
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

  try {
    // O e-mail cita o número que o cliente vê no site — o da Shopify — e o
    // aviso de pedido sem esse número fica segurado. O vínculo mora na rotina
    // de logística (de hora em hora); rodá-lo AQUI, só quando existe pedido
    // recente sem número, encolhe a espera para um ciclo destes (5 min). A
    // janela de 24h espelha a do seguro: pedido mais velho que isso sai com o
    // código interno e não justifica uma chamada à Shopify por rodada.
    let vinculados = 0
    if (supabaseConfigurado() && shopifyConfigurada()) {
      const { count } = await supabaseServer()
        .from('pedidos')
        .select('id', { count: 'exact', head: true })
        .is('shopify_numero', null)
        .gte('comprado_em', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      if ((count ?? 0) > 0) {
        try {
          vinculados = (await vincularPedidosShopify()).vinculados
        } catch (e) {
          console.error('[avisos] vínculo antes dos avisos falhou:', mensagemDe(e))
        }
      }
    }

    // Vinte por rodada: com a pausa de 600 ms entre envios, são ~12 segundos
    // de trabalho — metade do tempo da função, com folga para o resto.
    const r = await enviarAvisosDePedido({ limite: 20 })
    await registrarSaudeDaRotina('avisos-de-pedido', { ...r, vinculados })
    return NextResponse.json(
      r.desligado
        ? {
            ok: true,
            desligado: 'AVISOS_DE_PEDIDO não está ligado — nada foi enviado',
            fatosRegistrados: r.candidatos,
          }
        : {
            ok: true,
            candidatos: r.candidatos,
            enviados: r.enviados,
            falhas: r.falhas,
            aguardandoVinculo: r.aguardandoVinculo ?? 0,
            vinculados,
          },
    )
  } catch (e) {
    await registrarSaudeDaRotina('avisos-de-pedido', { erro: mensagemDe(e) })
    return NextResponse.json({ ok: false, erro: mensagemDe(e) }, { status: 500 })
  }
}

/** GET só para conferir que a rota está no ar; não envia nada. */
export async function GET() {
  return NextResponse.json({
    rota: 'POST /api/pedidos/avisos',
    autenticacao: 'Authorization: Bearer $CRON_SEGREDO',
    ligada: process.env.AVISOS_DE_PEDIDO?.trim() === '1',
  })
}
