import { NextResponse } from 'next/server'

import { sincronizarEnvios } from '@/app/(erp)/pedidos/actions'
import { cotarPrazosDeEntrega, frenetConfigurada, varrerRastreiosFrenet } from '@/data/frenet'
import { codigosDoMelhorEnvio, melhorEnvioConectado, rastrearNoMelhorEnvio } from '@/data/melhorenvio'
import { atualizarExtratoEsperando, mercadoPagoConfigurado } from '@/data/mercadopago'
import { baixarEstoqueDosFaturados } from '@/data/baixa-estoque'
import { enviarAvisosDePedido } from '@/data/notificacoes'
import {
  aplicarEstoqueCalculado,
  importarEntregasLocaisDaShopify,
  marcarAnuladosDaShopify,
  mensagemDe,
  shopifyConfigurada,
} from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { importarPedidosYampi, yampiConfigurada } from '@/data/yampi'
import { INICIO_DA_OPERACAO, dataEmSaoPaulo } from '@/domain'

/**
 * Sincronia do financeiro, de hora em hora.
 *
 * Extrato que só atualiza quando alguém clica não é extrato: quem esquece de
 * clicar não descobre que esqueceu — a tela mostra números plausíveis do jeito
 * que estavam ontem. Por isso a rotina roda sozinha, e a tela também se
 * atualiza ao ser aberta quando a última leitura passou de dez minutos.
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
 * Quanto histórico de pedido cada rodada traz.
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
  // Data em São Paulo, não em UTC: depois das 21h daqui, `toISOString` já
  // devolve amanhã, e o Mercado Pago recusa relatório que termina amanhã.
  const ate = dataEmSaoPaulo(agora.toISOString()) ?? agora.toISOString().slice(0, 10)
  const janela =
    dataEmSaoPaulo(new Date(agora.getTime() - JANELA_DIAS * 86_400_000).toISOString()) ?? ate
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
  // completo é trabalho de importação manual, não de rotina.
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

  // Entrega local logo depois dos pedidos, e ANTES das etapas lentas: a
  // Netlify corta a função por tempo, e os carimbos mostram a corrente
  // morrendo no meio a cada duas ou três rodadas. A operação marca "entregue"
  // na SHOPIFY quando o motoboy volta — esta etapa escuta, fecha o pedido e
  // baixa o estoque; deixá-la atrás da varredura era condená-la ao corte.
  if (shopifyConfigurada()) {
    try {
      const el = await importarEntregasLocaisDaShopify()
      relatorio.entregasLocais = {
        vinculados: el.vinculados,
        consultados: el.consultados,
        entregues: el.entregues,
        datasRepostas: el.datasRepostas,
        mlConsumido: el.mlConsumido,
        falhas: el.falhas.length,
      }
    } catch (e) {
      relatorio.entregasLocais = { erro: mensagemDe(e) }
    }
  } else {
    relatorio.entregasLocais = { pulado: 'credenciais da Shopify não estão definidas' }
  }

  // Rastreio logo depois dos pedidos: a importação acabou de trazer códigos
  // novos, e eles entram nesta mesma rodada em vez de esperar a próxima hora.
  // É a rede de segurança do webhook — que se perde em queda, deploy ou 500.
  if (frenetConfigurada()) {
    try {
      // 15 por rodada, não 60: com o corte de tempo da Netlify, a varredura
      // grande morria no meio e NENHUM evento era gravado. 15 cabem — e
      // 15 × 24 rodadas cobrem os ~55 códigos vivos várias vezes por dia.
      const r = await varrerRastreiosFrenet(15)
      relatorio.rastreio = {
        consultados: r.consultados,
        eventos: r.eventos,
        entregasConfirmadas: r.entregues,
        falhas: r.falhas.length,
      }
    } catch (e) {
      relatorio.rastreio = { erro: mensagemDe(e) }
    }
    // O prazo de entrega cotado é a segunda metade da régua de SLA — 72 h de
    // expedição são regra da operação; daqui em diante quem promete é a
    // transportadora, e a promessa dela sai desta cotação.
    try {
      const c = await cotarPrazosDeEntrega(10)
      relatorio.prazosDeEntrega = c.pulado
        ? { pulado: c.pulado }
        : { consultados: c.consultados, cotados: c.cotados, falhas: c.falhas.length }
    } catch (e) {
      relatorio.prazosDeEntrega = { erro: mensagemDe(e) }
    }
  } else {
    relatorio.rastreio = { pulado: 'FRENET_TOKEN não está definido' }
  }

  // O espelho de envios na Shopify, em dose pequena: o rastreio que a Yampi
  // acabou de dar precisa chegar à conta do cliente na loja sem depender de
  // alguém clicar em "Sincronizar agora". O orçamento é curto de propósito —
  // a fila grande é trabalho do botão; aqui é só o gotejo do dia a dia, e as
  // etapas seguintes da corrente ainda precisam do tempo que sobra.
  if (shopifyConfigurada()) {
    try {
      const esp = await sincronizarEnvios({ prazoMs: 6_000 })
      relatorio.espelhoEnvios = esp.ok
        ? { enviados: esp.enviados, entregues: esp.entregues, naFila: esp.naFila }
        : { erro: esp.erro }
    } catch (e) {
      relatorio.espelhoEnvios = { erro: mensagemDe(e) }
    }
  }

  // Melhor Envio cobre os 22% que a Frenet não vê. Só roda depois de alguém
  // ter autorizado no navegador — sem token guardado não há o que consultar.
  if (await melhorEnvioConectado()) {
    try {
      const r = await rastrearNoMelhorEnvio(await codigosDoMelhorEnvio(80))
      relatorio.rastreioMelhorEnvio = {
        consultados: r.consultados,
        eventos: r.eventos,
        entregasConfirmadas: r.entregues,
      }
    } catch (e) {
      relatorio.rastreioMelhorEnvio = { erro: mensagemDe(e) }
    }
  } else {
    relatorio.rastreioMelhorEnvio = { pulado: 'Melhor Envio ainda não foi conectado' }
  }

  // Venda anulada pela Shopify sai da receita nesta mesma rodada.
  if (shopifyConfigurada()) {
    try {
      relatorio.anulados = await marcarAnuladosDaShopify()
    } catch (e) {
      relatorio.anulados = { erro: mensagemDe(e) }
    }
  }

  // Cada etapa é isolada: uma falha de rede no gateway não pode impedir a
  // varredura de ocorrências, que não depende dele.
  //
  // A rotina ESPERA o relatório ficar pronto, ao contrário da tela. Quem está
  // olhando merece resposta imediata; aqui não há ninguém olhando, e esperar
  // três minutos é o que faz o extrato se manter em dia sem depender de
  // alguém abrir a tela e clicar.
  if (mercadoPagoConfigurado()) {
    try {
      // Dez tentativas de 15s cabem folgadas nos 300s da rota, junto com a
      // importação de pedidos que vem antes.
      relatorio.mercadopago = await atualizarExtratoEsperando(de, ate, { tentativas: 10 })
    } catch (e) {
      relatorio.mercadopago = { erro: mensagemDe(e) }
    }
  } else {
    relatorio.mercadopago = { pulado: 'MERCADOPAGO_ACCESS_TOKEN não está definido' }
  }

  // O extrato vira CAIXA aqui. Sem esta etapa o dinheiro do gateway movia o
  // saldo da conta mas não existia como lançamento — e o gráfico de recebido,
  // a DRE por caixa e o fluxo, que leem lançamento, mostravam zero num mês em
  // que entraram centenas de vendas.
  try {
    const { data, error } = await supabaseServer().rpc('converter_extrato_em_caixa')
    if (error) throw error
    const linha = Array.isArray(data) ? data[0] : data
    relatorio.extratoEmCaixa = {
      criados: linha?.criados ?? 0,
      total: linha?.total_convertidos ?? 0,
    }
  } catch (e) {
    relatorio.extratoEmCaixa = { erro: mensagemDe(e) }
  }

  // E o repasse aprende com o extrato. A tela de Conciliação lê `repasses`,
  // que só a rotina do Mercado Pago preenchia; tudo o que entrou pelo extrato
  // continuava marcado "pago sem crédito" mesmo com o dinheiro na conta e o
  // lançamento gravado — 416 vendas e R$ 61 mil de fila falsa. Fila falsa faz
  // o operador parar de olhar a fila. Roda aqui, logo depois da conversão,
  // porque é a conversão que acabou de ligar as linhas novas ao pedido.
  try {
    const { data, error } = await supabaseServer().rpc('conciliar_repasses_pelo_extrato')
    if (error) throw error
    const linha = Array.isArray(data) ? data[0] : data
    relatorio.repassesConciliados = {
      preenchidos: linha?.preenchidos ?? 0,
      aindaSemCredito: linha?.ainda_sem_credito ?? 0,
    }
  } catch (e) {
    relatorio.repassesConciliados = { erro: mensagemDe(e) }
  }

  // Venda anterior ao primeiro extrato que existe não é pendência: é
  // conciliação impossível. Sai da fila com data e motivo escritos, em vez de
  // ficar para sempre pedindo uma decisão que ninguém pode tomar.
  try {
    const { data, error } = await supabaseServer().rpc('dispensar_conciliacao_sem_extrato')
    if (error) throw error
    const linha = Array.isArray(data) ? data[0] : data
    relatorio.semExtratoDispensadas = {
      dispensados: linha?.dispensados ?? 0,
      corte: linha?.corte ?? null,
    }
  } catch (e) {
    relatorio.semExtratoDispensadas = { erro: mensagemDe(e) }
  }


  // A baixa de estoque vem depois da importação da Yampi, que é quem acabou
  // de trazer os faturamentos novos. Antes dela, os pedidos faturados nesta
  // hora só sairiam do estoque na rodada seguinte — e o saldo ficaria sempre
  // uma hora otimista, justamente no número que decide quando repor.
  try {
    const b = await baixarEstoqueDosFaturados(100)
    relatorio.baixaDeEstoque = {
      candidatos: b.candidatos,
      baixados: b.baixados,
      mlConsumido: b.mlConsumido,
      falhas: b.falhas.length,
    }
  } catch (e) {
    relatorio.baixaDeEstoque = { erro: mensagemDe(e) }
  }

  // Provas que subiram e nunca viraram solicitação: o cliente escolheu as
  // fotos, elas foram para o bucket e ele fechou a aba antes de concluir.
  // Sem esta varrida, cada desistência deixaria um arquivo pago para sempre.
  try {
    const sb = supabaseServer()
    const { data: vencidos } = await sb.rpc('rascunhos_de_devolucao_vencidos')
    const nomes = ((vencidos ?? []) as { nome: string }[]).map((v) => v.nome)
    if (nomes.length) await sb.storage.from('devolucoes').remove(nomes)
    relatorio.rascunhosDeDevolucao = { removidos: nomes.length }
  } catch (e) {
    relatorio.rascunhosDeDevolucao = { erro: mensagemDe(e) }
  }

  // A loja é atualizada por ÚLTIMO, e a ordem é o ponto.
  //
  // Rodando antes da baixa, a Shopify recebia um volume que ainda não tinha
  // perdido os faturados daquela hora: a loja ficava sempre uma rodada
  // otimista — publicando unidades que o estoque já não tinha. Depois da
  // reserva e da baixa, o disponível que vai para a vitrine é o real.
  if (shopifyConfigurada()) {
    try {
      const s = await aplicarEstoqueCalculado()
      relatorio.shopifyEstoque = {
        aplicadas: s.aplicadas,
        recusadas: s.ignoradas.length,
        semIdDaLoja: s.pulados,
      }
    } catch (e) {
      relatorio.shopifyEstoque = { erro: mensagemDe(e) }
    }
  } else {
    relatorio.shopifyEstoque = { pulado: 'credenciais da Shopify não estão definidas' }
  }

  // Os avisos vêm DEPOIS do rastreio: a varredura acabou de confirmar
  // entregas, e essas entram nesta mesma rodada em vez de esperar a próxima
  // hora. Fica desligado até AVISOS_DE_PEDIDO=1 — rotina que escreve para
  // cliente real não se liga sozinha num deploy.
  try {
    const a = await enviarAvisosDePedido()
    relatorio.avisos = a.desligado
      ? {
          desligado: 'AVISOS_DE_PEDIDO não está ligado — nada foi enviado',
          fatosRegistrados: a.candidatos,
        }
      : { candidatos: a.candidatos, enviados: a.enviados, falhas: a.falhas.length }
  } catch (e) {
    relatorio.avisos = { erro: mensagemDe(e) }
  }

  try {
    const { data, error } = await supabaseServer().rpc('varrer_ocorrencias', {
      p_dias: 15,
      p_responsavel: 'Varredura automática',
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
    rota: 'sincronia do financeiro, de hora em hora',
    como: 'POST com Authorization: Bearer $CRON_SEGREDO',
    configurado: Boolean(process.env.CRON_SEGREDO),
    gateway: mercadoPagoConfigurado(),
  })
}
