import { NextResponse } from 'next/server'

import { mercadoPagoConfigurado, sincronizarMercadoPago } from '@/data/mercadopago'
import { mensagemDe } from '@/data/shopify'
import { sicoobConfigurado, sincronizarSicoob } from '@/data/sicoob'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

/**
 * Sincronia diária do financeiro.
 *
 * O extrato do Mercado Pago é o que sustenta a margem líquida: é dele que sai
 * a tarifa real de cada venda. Depender de alguém lembrar de clicar em
 * "Sincronizar gateway" é depender de alguém lembrar — e quando esquece, o
 * número que some é justamente o do custo.
 *
 *     POST /api/financeiro/sincronizar
 *     Authorization: Bearer $CRON_SEGREDO
 *
 * A janela é de 35 dias para trás. Não é excesso: o cartão parcelado só
 * LIBERA o dinheiro 30 dias depois da aprovação, e é na liberação que a linha
 * do extrato ganha a data certa. Uma janela de uma semana perderia o crédito
 * de tudo que foi vendido no mês anterior.
 *
 * Rodar de novo o mesmo período é seguro: a linha tem o id do pagamento como
 * chave e a conciliação só reescreve quando o valor mudou.
 */

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const JANELA_DIAS = 35

function autorizado(req: Request): boolean {
  const esperado = process.env.CRON_SEGREDO
  if (!esperado) return false
  const enviado = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return enviado === esperado
}

export async function POST(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json(
      {
        erro:
          'Não autorizado. Defina CRON_SEGREDO no ambiente e mande o mesmo valor em ' +
          'Authorization: Bearer.',
      },
      { status: 401 },
    )
  }
  if (!supabaseConfigurado()) {
    return NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 500 })
  }

  const agora = new Date()
  const ate = agora.toISOString().slice(0, 10)
  const de = new Date(agora.getTime() - JANELA_DIAS * 86_400_000).toISOString().slice(0, 10)

  const relatorio: Record<string, unknown> = { quando: agora.toISOString(), periodo: { de, ate } }

  // Cada etapa é isolada: o Sicoob sem certificado não pode impedir a leitura
  // do gateway, e a varredura de ocorrências não depende de nenhum dos dois.
  if (mercadoPagoConfigurado()) {
    try {
      relatorio.mercadopago = await sincronizarMercadoPago(de, ate)
    } catch (e) {
      relatorio.mercadopago = { erro: mensagemDe(e) }
    }
  } else {
    relatorio.mercadopago = { pulado: 'MERCADOPAGO_ACCESS_TOKEN não está definido' }
  }

  if (sicoobConfigurado()) {
    try {
      relatorio.sicoob = await sincronizarSicoob(agora.getMonth() + 1, agora.getFullYear())
    } catch (e) {
      relatorio.sicoob = { erro: mensagemDe(e) }
    }
  } else {
    relatorio.sicoob = { pulado: 'a API do Sicoob exige certificado; use a importação de OFX' }
  }

  try {
    const { data, error } = await supabaseServer().rpc('varrer_ocorrencias', {
      p_dias: 15,
      p_responsavel: 'Varredura diária',
      p_janela_dias: 90,
    })
    relatorio.ocorrencias = error ? { erro: mensagemDe(error) } : { novas: Number(data) }
  } catch (e) {
    relatorio.ocorrencias = { erro: mensagemDe(e) }
  }

  return NextResponse.json(relatorio)
}

/** GET só para conferir que a rota está no ar; não sincroniza nada. */
export async function GET() {
  return NextResponse.json({
    rota: 'sincronia diária do financeiro',
    como: 'POST com Authorization: Bearer $CRON_SEGREDO',
    configurado: Boolean(process.env.CRON_SEGREDO),
    gateway: mercadoPagoConfigurado(),
    banco: sicoobConfigurado(),
  })
}
