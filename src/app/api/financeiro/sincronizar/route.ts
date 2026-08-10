import { NextResponse } from 'next/server'

import { atualizarExtratoMp, mercadoPagoConfigurado } from '@/data/mercadopago'
import { mensagemDe } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { importarPedidosYampi, yampiConfigurada } from '@/data/yampi'
import { INICIO_DA_OPERACAO } from '@/domain'

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

/**
 * Quanto histórico de pedido a rotina diária traz.
 *
 * Menor que a janela do extrato de propósito: o cartão parcelado só LIBERA o
 * dinheiro 30 dias depois, então o extrato precisa alcançar o mês anterior,
 * mas o pedido daquela venda já foi importado quando ela aconteceu. Puxar 35
 * dias de pedido todo dia seria reler o mesmo mês 35 vezes.
 */
const JANELA_PEDIDOS_DIAS = 10

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
  const janela = new Date(agora.getTime() - JANELA_DIAS * 86_400_000).toISOString().slice(0, 10)
  // Nunca antes do dia em que esta conta passou a receber as vendas desta
  // loja: o movimento anterior é de outra operação.
  const de = janela < INICIO_DA_OPERACAO ? INICIO_DA_OPERACAO : janela

  const relatorio: Record<string, unknown> = { quando: agora.toISOString(), periodo: { de, ate } }

  // Os pedidos vêm PRIMEIRO, e por um motivo estrutural: é da Yampi que sai o
  // id da transação, e é ele que liga o crédito do extrato à venda. Rodando
  // depois, a ligação só aconteceria no dia seguinte — e uma conciliação
  // sempre um dia atrasada é uma conciliação em que ninguém confia.
  //
  // A janela é curta porque aqui só interessa o que é novo; o histórico
  // completo é trabalho de importação manual, não de rotina diária.
  if (yampiConfigurada()) {
    try {
      const y = await importarPedidosYampi(JANELA_PEDIDOS_DIAS)
      relatorio.yampi = {
        pedidos: y.pedidos,
        transacoes: y.transacoes,
        pedidosSemTransacao: y.pedidosSemTransacao,
        extratoLigado: y.extratoLigado,
      }
    } catch (e) {
      relatorio.yampi = { erro: mensagemDe(e) }
    }
  } else {
    relatorio.yampi = { pulado: 'credenciais da Yampi não estão definidas' }
  }

  // Cada etapa é isolada: uma falha de rede no gateway não pode impedir a
  // varredura de ocorrências, que não depende dele.
  //
  // A sincronia de ontem terá pedido o relatório e não o encontrado pronto —
  // ele leva minutos para montar. Por isso a rodada de hoje IMPORTA o de
  // ontem antes de pedir o de hoje: o atraso de um dia se resolve sozinho, em
  // vez de virar um extrato que nunca chega.
  if (mercadoPagoConfigurado()) {
    try {
      relatorio.mercadopago = await atualizarExtratoMp(de, ate, { pedir: true })
    } catch (e) {
      relatorio.mercadopago = { erro: mensagemDe(e) }
    }
  } else {
    relatorio.mercadopago = { pulado: 'MERCADOPAGO_ACCESS_TOKEN não está definido' }
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
  })
}
