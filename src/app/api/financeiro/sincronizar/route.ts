import { NextResponse } from 'next/server'

import { sincronizarEnvios } from '@/app/(erp)/pedidos/actions'
import { cotarPrazosDeEntrega, frenetConfigurada, varrerRastreiosFrenet } from '@/data/frenet'
import { codigosDoMelhorEnvio, descobrirEnviosDoMelhorEnvio, melhorEnvioConectado, rastrearNoMelhorEnvio } from '@/data/melhorenvio'
import { atualizarExtratoMp, descobrirDestinoDosPayouts, mercadoPagoConfigurado } from '@/data/mercadopago'
import { baixarEstoqueDosFaturados } from '@/data/baixa-estoque'
import { pagaleveConfigurada } from '@/data/pagaleve'
import { importarRespostasDoQuiz, quizConfigurado } from '@/data/quiz'
import { registrarSaudeDaRotina } from '@/data/saude-das-rotinas'
import { importarPagaleve } from '@/data/pagaleve-importacao'
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

// 26 segundos é o teto real da função síncrona na Netlify. Declarar 300 era
// uma promessa que só este código fazia — e que a plataforma cortava calada.
export const maxDuration = 26
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

/**
 * Quanto histórico de pedido a Pagaleve pode alcançar quando precisa recorrer
 * ao casamento por valor e data.
 *
 * Maior que a janela de pedidos porque a venda parcelada continua viva por até
 * dois meses, e menor que tudo porque a API só devolve o mês corrente — pedido
 * de abril nunca teria par ali. Na rodada normal esta janela nem é lida: o
 * checkout vem no identificador da transação e o casamento é pela chave.
 */
const JANELA_PAGALEVE_DIAS = 90

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

  /**
   * A corrente foi CORTADA em etapas — e isso não é organização, é conserto.
   *
   * `maxDuration = 300` sempre foi uma promessa que só este código fazia: a
   * Netlify corta função síncrona perto de 26 segundos. Rodando as dezoito
   * etapas de enfiada, TODA rodada horária morria no meio — o histórico do
   * pg_net mostra "Timeout of 30000 ms" em cada uma delas, sem exceção. O que
   * ficava de fora era sempre a mesma ponta: rastreio, Melhor Envio,
   * conciliação, estoque. E em silêncio, porque o corte de tempo acontece
   * FORA do `try` de cada etapa — nenhum erro aparecia em lugar nenhum.
   *
   * Agora cada grupo é uma chamada própria, agendada em minuto diferente:
   *
   *   ?etapa=vendas      pedidos da Yampi, Pagaleve, estorno parcial
   *   ?etapa=logistica   entregas locais, rastreio, Melhor Envio, anulados
   *   ?etapa=financeiro  Mercado Pago, extrato em caixa, repasses, ADS
   *   ?etapa=operacao    baixa de estoque, rascunhos, Shopify, ocorrências
   *
   * Sem `etapa` roda tudo — que é o que o botão "Sincronizar agora" faz, com
   * alguém olhando a tela e podendo clicar de novo.
   */
  const etapa = new URL(req.url).searchParams.get('etapa')
  const inicio = Date.now()
  // 12 segundos, e não 20: o orçamento é conferido ANTES de cada passo, então
  // o último a entrar ainda roda inteiro depois dele. Com 20s, um passo de dez
  // segundos começava aos 19 e terminava aos 29 — fora do teto da plataforma.
  // Doze deixa margem para o passo mais lento caber.
  const ORCAMENTO_MS = 12_000
  const puladasPorTempo: string[] = []

  type Grupo = 'vendas' | 'logistica' | 'financeiro' | 'operacao'

  /** Este grupo pertence à rodada pedida? Sem efeito colateral. */
  const naEtapa = (nome: Grupo) => !etapa || etapa === nome

  function grupo(nome: Grupo): boolean {
    if (!naEtapa(nome)) return false
    // Mesmo dentro do grupo certo, uma etapa lenta não pode levar as
    // seguintes junto: passado o orçamento, o resto é registrado como pulado
    // em vez de morrer no corte da plataforma sem deixar rastro.
    if (Date.now() - inicio > ORCAMENTO_MS) {
      puladasPorTempo.push(nome)
      return false
    }
    return true
  }

  // Os pedidos vêm PRIMEIRO, e por um motivo estrutural: é da Yampi que sai o
  // id da transação, e é ele que liga o crédito do extrato à venda. Rodando
  // depois, a ligação só aconteceria no dia seguinte — e uma conciliação
  // sempre um dia atrasada é uma conciliação em que ninguém confia.
  //
  // A janela é curta porque aqui só interessa o que é novo; o histórico
  // completo é trabalho de importação manual, não de rotina.
  if (grupo('vendas') && yampiConfigurada()) {
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
  } else if (naEtapa('vendas')) {
    relatorio.yampi = { pulado: 'credenciais da Yampi não estão definidas' }
  }

  // A Pagaleve entra AQUI, e o lugar é a parte que importa.
  //
  // Ela nasceu no fim da rotina, depois do Mercado Pago, e ali nunca rodava.
  // Medido: a corrente era cortada por tempo antes de chegar lá — naquela
  // época o passo do Mercado Pago dormia até 150 segundos esperando o
  // relatório, e o que vinha atrás dele só executava em rodada de sorte. A
  // espera acabou, mas o lugar continua sendo este: o download e a importação
  // do extrato ainda são o passo mais caro da rodada, e o sintoma de ficar
  // atrás dele era o pior possível para um financeiro — nenhum erro, nenhum
  // aviso, e a Pagaleve parada no tempo enquanto a tela dizia estar em dia.
  //
  // Aqui ela é barata e determinística: autentica, lê o mês corrente, casa
  // pelo checkout que a Yampi acabou de trazer, agenda as parcelas e concilia.
  // Depende só dos pedidos, que vieram na etapa anterior.
  //
  // Vir antes da conciliação pelo extrato é seguro: aquela só preenche linha
  // com `recebido` nulo, e toda venda da Pagaleve sai daqui com `recebido`
  // escrito — nem que seja zero, quando ainda não houve crédito.
  // Curadoria Olfativa: as respostas do quiz entram junto com as vendas —
  // são a mesma pergunta ("quem é esse cliente?") vinda de outra porta.
  if (grupo('vendas') && quizConfigurado()) {
    try {
      const q = await importarRespostasDoQuiz()
      relatorio.quiz = q.erro
        ? { erro: q.erro }
        : { tabela: q.tabela, lidas: q.lidas, gravadas: q.gravadas }
    } catch (e) {
      relatorio.quiz = { erro: mensagemDe(e) }
    }
  }

  if (grupo('vendas') && pagaleveConfigurada()) {
    try {
      const p = await importarPagaleve({ gravar: true, janelaDePedidosDias: JANELA_PAGALEVE_DIAS })
      relatorio.pagaleve = {
        vendasLidas: (p.transacoes as { lidas?: number }).lidas ?? 0,
        casadas: (p.transacoes as { casadas?: number }).casadas ?? 0,
        porIdentificador: (p.transacoes as { porIdentificador?: number }).porIdentificador ?? 0,
        porValorEData: (p.transacoes as { porValorEData?: number }).porValorEData ?? 0,
        semPedido: (p.transacoes as { orfas?: number }).orfas ?? 0,
        repassesGravados: p.gravados,
        parcelasGravadas: p.parcelasGravadas,
        datasInformadasPreservadas: p.parcelasProtegidas,
        parcelasVinculadas: p.parcelasVinculadas,
        vendas: p.conciliadas,
        recebido: p.recebido ?? 0,
      }
    } catch (e) {
      relatorio.pagaleve = { erro: mensagemDe(e) }
      // A API caiu, mas as parcelas que já estão no banco continuam vencendo.
      // Conciliar o que se tem é melhor que deixar a fila envelhecer por causa
      // de um erro de rede em terceiro.
      try {
        const { data } = await supabaseServer().rpc('conciliar_pagaleve')
        const linha = Array.isArray(data) ? data[0] : data
        relatorio.pagaleveConciliacaoDeReserva = {
          vendas: linha?.vendas ?? 0,
          recebido: linha?.recebido ?? 0,
        }
      } catch (e2) {
        relatorio.pagaleveConciliacaoDeReserva = { erro: mensagemDe(e2) }
      }
    }
  } else if (naEtapa('vendas')) {
    relatorio.pagaleve = { pulado: 'PAGALEVE_CHAVE/PAGALEVE_SENHA não estão definidas' }
  }

  /**
   * O extrato vira CAIXA — e esta chamada acontece DUAS VEZES na rotina, aqui e
   * depois do Mercado Pago. Não é descuido.
   *
   * A etapa do Mercado Pago já esperou o relatório ficar pronto por até 150s,
   * e a rodada morria por tempo antes de chegar ao fim com frequência. Tudo o
   * que ficava atrás dela virava etapa fantasma: existia no código, aparecia
   * na revisão, e não rodava. Foi o que aconteceu com a Pagaleve, e era o que
   * estava acontecendo aqui — cinco vendas com o crédito registrado no extrato
   * e nenhuma delas virando caixa. O ERP mostrava R$ 0,00 recebido num dia em
   * que entraram R$ 669,73, e o Gerente, lendo esse zero, respondia ao dono da
   * loja que não havia entrado dinheiro.
   *
   * A espera acabou e a importação já converte o que acabou de ler, mas esta
   * chamada continua: ela alcança o que a rodada anterior importou e o que
   * entrou por outra porta — extrato do Sicoob, importação manual, correção de
   * ligação com o pedido. Nenhum desses passa por `importarEComplementar`.
   *
   * Rodando ANTES, as linhas que a rodada anterior importou viram caixa mesmo
   * que esta rodada morra no meio. A conversão é idempotente (`on conflict do
   * nothing`), então a segunda chamada não duplica nada — ela só alcança o que
   * o Mercado Pago acabou de trazer.
   */
  if (grupo('financeiro')) try {
    const { data, error } = await supabaseServer().rpc('converter_extrato_em_caixa')
    if (error) throw error
    const linha = Array.isArray(data) ? data[0] : data
    relatorio.extratoEmCaixaAntes = {
      criados: linha?.criados ?? 0,
      total: linha?.total_convertidos ?? 0,
    }
  } catch (e) {
    relatorio.extratoEmCaixaAntes = { erro: mensagemDe(e) }
  }

  /**
   * O repasse da Pagaleve ganha nome logo depois de virar caixa.
   *
   * Roda DEPOIS da conversão de propósito: o que ela batiza é o lançamento que
   * a conversão acabou de criar. O depósito da Pagaleve é agrupado — soma
   * parcelas de vendas diferentes — e por isso não casa com nenhum pedido; sem
   * este passo ele fica como "Crédito a classificar", fora da DRE.
   */
  if (grupo('financeiro')) try {
    const { data, error } = await supabaseServer().rpc('casar_repasses_pagaleve')
    if (error) throw error
    const linha = Array.isArray(data) ? data[0] : data
    relatorio.repassesPagaleve = {
      repasses: linha?.repasses ?? 0,
      parcelasBaixadas: linha?.parcelas_baixadas ?? 0,
      valor: Number(linha?.valor ?? 0),
    }
  } catch (e) {
    relatorio.repassesPagaleve = { erro: mensagemDe(e) }
  }

  if (grupo('financeiro')) try {
    const { data, error } = await supabaseServer().rpc('conciliar_repasses_pelo_extrato')
    if (error) throw error
    const linha = Array.isArray(data) ? data[0] : data
    relatorio.repassesConciliadosAntes = {
      preenchidos: linha?.preenchidos ?? 0,
      aindaSemCredito: linha?.ainda_sem_credito ?? 0,
    }
  } catch (e) {
    relatorio.repassesConciliadosAntes = { erro: mensagemDe(e) }
  }

  // Entrega local logo depois dos pedidos, e ANTES das etapas lentas: a
  // Netlify corta a função por tempo, e os carimbos mostram a corrente
  // morrendo no meio a cada duas ou três rodadas. A operação marca "entregue"
  // na SHOPIFY quando o motoboy volta — esta etapa escuta, fecha o pedido e
  // baixa o estoque; deixá-la atrás da varredura era condená-la ao corte.
  if (grupo('logistica') && shopifyConfigurada()) {
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
  } else if (naEtapa('logistica')) {
    relatorio.entregasLocais = { pulado: 'credenciais da Shopify não estão definidas' }
  }

  // Rastreio logo depois dos pedidos: a importação acabou de trazer códigos
  // novos, e eles entram nesta mesma rodada em vez de esperar a próxima hora.
  // É a rede de segurança do webhook — que se perde em queda, deploy ou 500.
  if (grupo('logistica') && frenetConfigurada()) {
    try {
      // 15 por rodada, não 60: com o corte de tempo da Netlify, a varredura
      // grande morria no meio e NENHUM evento era gravado. 15 cabem — e
      // 15 × 24 rodadas cobrem os ~55 códigos vivos várias vezes por dia.
      const r = await varrerRastreiosFrenet(10)
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
      const c = await cotarPrazosDeEntrega(6)
      relatorio.prazosDeEntrega = c.pulado
        ? { pulado: c.pulado }
        : { consultados: c.consultados, cotados: c.cotados, falhas: c.falhas.length }
    } catch (e) {
      relatorio.prazosDeEntrega = { erro: mensagemDe(e) }
    }
  } else if (naEtapa('logistica')) {
    relatorio.rastreio = { pulado: 'FRENET_TOKEN não está definido' }
  }

  // O espelho de envios na Shopify, em dose pequena: o rastreio que a Yampi
  // acabou de dar precisa chegar à conta do cliente na loja sem depender de
  // alguém clicar em "Sincronizar agora". O orçamento é curto de propósito —
  // a fila grande é trabalho do botão; aqui é só o gotejo do dia a dia, e as
  // etapas seguintes da corrente ainda precisam do tempo que sobra.
  if (grupo('logistica') && shopifyConfigurada()) {
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
  if (grupo('logistica') && await melhorEnvioConectado()) {
    // ANTES da varredura de códigos: a descoberta é quem PÕE o código no
    // pedido quando a etiqueta foi comprada direto no Melhor Envio e a Yampi
    // ficou em "faturado" (frete grátis postado pela J&T/Total em vez da
    // Jadlog cotada). Descoberto aqui, o pedido vira "enviado", o aviso ao
    // cliente sai no próximo pulso e o código já entra na varredura abaixo.
    try {
      const d = await descobrirEnviosDoMelhorEnvio()
      relatorio.descobertaMelhorEnvio = {
        etiquetasExaminadas: d.examinadas,
        pedidosCasados: d.casados,
        ambiguas: d.ambiguas,
      }
    } catch (e) {
      relatorio.descobertaMelhorEnvio = { erro: mensagemDe(e) }
    }
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
  } else if (naEtapa('logistica')) {
    relatorio.rastreioMelhorEnvio = { pulado: 'Melhor Envio ainda não foi conectado' }
  }

  // Venda anulada pela Shopify sai da receita nesta mesma rodada.
  if (grupo('logistica') && shopifyConfigurada()) {
    try {
      relatorio.anulados = await marcarAnuladosDaShopify()
    } catch (e) {
      relatorio.anulados = { erro: mensagemDe(e) }
    }
  }

  // Cada etapa é isolada: uma falha de rede no gateway não pode impedir a
  // varredura de ocorrências, que não depende dele.
  //
  // A rodada NÃO ESPERA o relatório ficar pronto — nunca mais. Esperar era
  // dormir até dois minutos e meio dentro de uma função que a Netlify mata
  // aos 26 segundos, e foi a causa direta de a etapa financeira só registrar
  // "Timeout of 30000 ms": a rodada morria dentro do `setTimeout` e nada
  // depois dele acontecia.
  //
  // Mas só pedir e ir embora era pior ainda: o pedido vale 30 minutos e o
  // agendador volta em 60, então toda rodada encontrava o pendente vencido,
  // pedia outro e desistia — a rotina, sozinha, era incapaz de importar. O
  // extrato ficou 22 horas parado no dia 16, com 22 rodadas dentro do buraco,
  // e as duas importações de 17/08 só aconteceram porque alguém abriu a tela.
  //
  // Agora a rodada é uma esteira: importa o arquivo que a rodada anterior
  // encomendou e deixa o próximo na fila. Sem espera nenhuma, o atraso do
  // extrato passa a ser um ciclo do agendador em vez de "até alguém clicar".
  if (grupo('financeiro') && mercadoPagoConfigurado()) {
    try {
      relatorio.mercadopago = await atualizarExtratoMp(de, ate, { pedir: true })
    } catch (e) {
      relatorio.mercadopago = { erro: mensagemDe(e) }
    }
  } else if (naEtapa('financeiro')) {
    relatorio.mercadopago = { pulado: 'MERCADOPAGO_ACCESS_TOKEN não está definido' }
  }

  // O extrato vira CAIXA aqui. Sem esta etapa o dinheiro do gateway movia o
  // saldo da conta mas não existia como lançamento — e o gráfico de recebido,
  // a DRE por caixa e o fluxo, que leem lançamento, mostravam zero num mês em
  // que entraram centenas de vendas.
  if (grupo('financeiro')) try {
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

  // E as regras do dono valem na hora: lançamento recém-convertido que casa
  // com uma regra ativa (descrição ou favorecido) já nasce categorizado.
  // "Compra de etiquetas" entrou sem categoria duas vezes no dia em que onze
  // iguais tinham sido classificadas à mão — a regra existia, ninguém a
  // aplicava fora da tela.
  if (grupo('financeiro')) try {
    const { data, error } = await supabaseServer().rpc('aplicar_regras_de_categoria')
    if (error) throw error
    relatorio.regrasDeCategoria = data ?? { aplicadas: 0 }
  } catch (e) {
    relatorio.regrasDeCategoria = { erro: mensagemDe(e) }
  }

  // E o repasse aprende com o extrato. A tela de Conciliação lê `repasses`,
  // que só a rotina do Mercado Pago preenchia; tudo o que entrou pelo extrato
  // continuava marcado "pago sem crédito" mesmo com o dinheiro na conta e o
  // lançamento gravado — 416 vendas e R$ 61 mil de fila falsa. Fila falsa faz
  // o operador parar de olhar a fila. Roda aqui, logo depois da conversão,
  // porque é a conversão que acabou de ligar as linhas novas ao pedido.
  if (grupo('financeiro')) try {
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

  // E o saque conta quem recebeu. O extrato descreve todo payout como
  // "Transferência para conta bancária" — o pagamento do Google ADS e o
  // repasse para o Inter saem idênticos, e a fila de destino pedia que o
  // operador adivinhasse. A API do gateway sabe mais do que o relatório: o
  // que ela nomear com clareza (Google, Meta, etiquetas do Melhor Envio) é
  // resolvido como despesa na hora; o resto ganha a contraparte anotada na
  // observação, para a decisão humana deixar de ser às cegas.
  if (grupo('financeiro') && mercadoPagoConfigurado()) try {
    const d = await descobrirDestinoDosPayouts()
    relatorio.destinoDosPayouts = {
      examinados: d.examinados,
      resolvidos: d.resolvidos,
      anotados: d.anotados,
      ...(d.amostras.length ? { amostras: d.amostras } : {}),
    }
  } catch (e) {
    relatorio.destinoDosPayouts = { erro: mensagemDe(e) }
  }

  // Venda anterior ao primeiro extrato que existe não é pendência: é
  // conciliação impossível. Sai da fila com data e motivo escritos, em vez de
  // ficar para sempre pedindo uma decisão que ninguém pode tomar.
  if (grupo('financeiro')) try {
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

  // Estorno PARCIAL não derruba a venda inteira.
  //
  // A leitura da Yampi marcava como divergente qualquer pedido com estorno, e
  // faturamento só conta pedido pago — então um item que esgotou e foi
  // reembolsado apagava a venda toda do faturado. Era assim que o dia 10/08
  // aparecia com faturado MENOR que o recebido líquido: o dinheiro estava na
  // conta, mas a venda que o gerou tinha sumido do gráfico.
  //
  // Roda aqui, e não só na leitura, porque o pulso de 5 minutos reimporta e
  // reverteria a correção. Quem decide é o extrato: se entrou mais do que
  // saiu, o pedido está pago.
  if (grupo('vendas')) try {
    const { data, error } = await supabaseServer().rpc(
      'corrigir_pagamento_por_estorno_parcial',
    )
    if (error) throw error
    const linha = Array.isArray(data) ? data[0] : data
    relatorio.estornosParciais = { corrigidos: linha?.corrigidos ?? 0 }
  } catch (e) {
    relatorio.estornosParciais = { erro: mensagemDe(e) }
  }


  // A baixa de estoque vem depois da importação da Yampi, que é quem acabou
  // de trazer os faturamentos novos. Antes dela, os pedidos faturados nesta
  // hora só sairiam do estoque na rodada seguinte — e o saldo ficaria sempre
  // uma hora otimista, justamente no número que decide quando repor.
  if (grupo('operacao')) try {
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
  if (grupo('operacao')) try {
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
  if (grupo('operacao') && shopifyConfigurada()) {
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
  } else if (naEtapa('operacao')) {
    relatorio.shopifyEstoque = { pulado: 'credenciais da Shopify não estão definidas' }
  }

  // Os avisos ao cliente SAÍRAM daqui.
  //
  // Eles ficavam no fim desta corrente — depois de extrato, rastreio,
  // conciliação e estoque — e a corrente não cabe no tempo de função da
  // Netlify. Quando estourava, o que sobrava de fora era sempre a ponta: o
  // e-mail do cliente, e em silêncio, porque o corte de tempo acontece fora
  // do `try` de cada etapa. Agora são rotina própria, em
  // `/api/pedidos/avisos`, agendada de dez em dez minutos.

  if (grupo('operacao')) try {
    const { data, error } = await supabaseServer().rpc('varrer_ocorrencias', {
      p_dias: 15,
      p_responsavel: 'Varredura automática',
      p_janela_dias: 90,
    })
    relatorio.ocorrencias = error ? { erro: mensagemDe(error) } : { novas: Number(data) }
  } catch (e) {
    relatorio.ocorrencias = { erro: mensagemDe(e) }
  }

  if (puladasPorTempo.length) {
    relatorio.puladasPorTempo = [...new Set(puladasPorTempo)]
  }
  relatorio.etapa = etapa ?? 'tudo'
  relatorio.duracaoMs = Date.now() - inicio
  // O diário de bordo: é ele que deixa a vigília acusar o MESMO erro se
  // repetindo em rodadas seguidas — a resposta HTTP sozinha o pg_net descarta.
  await registrarSaudeDaRotina(`sincronizar:${etapa ?? 'tudo'}`, relatorio, Date.now() - inicio)
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
