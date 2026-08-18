import 'server-only'

import {
  ASSUNTO,
  ROTULO_EVENTO,
  apenasOAtual,
  avisosDe,
  emailDevolucaoAberta,
  emailDevolucaoAprovada,
  emailDevolucaoConcluida,
  emailDevolucaoNovasFotos,
  emailEntregue,
  emailEnvio,
  emailPagamento,
  brl,
  type CashbackGanho,
  type ItemComprado,
  ehEntregaLocal,
  identificarFrete,
  paginaDeRastreio,
  type AvisoPendente,
  type EventoNotificacao,
} from '@/domain'

import { clienteYampiPorEmail, extratoCashbackYampi } from './cashback'
import { emailConfigurado, entregar } from './email'
import { lerModeloEmail } from './modelo-email'
import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * Avisos de pedido ao cliente.
 *
 * Existe porque as notificações da Yampi não são editáveis e não têm a cara da
 * marca. O ERP passa a ser o remetente do aviso de ENVIO e do de ENTREGA, com
 * o código de rastreio e o link da transportadora.
 *
 * Três travas, e nenhuma é excesso de zelo:
 *
 *  1. **Um fato, um e-mail, para sempre.** A chave em `notificacoes_enviadas`
 *     deriva do fato (`YP-123|pedido_enviado`), não do instante da rodada.
 *  2. **A vaga é reservada ANTES do envio.** A linha entra como `enviando`, e
 *     quem perde a corrida pela chave primária não manda nada. Sem isso, a
 *     rotina de hora em hora e um clique na tela ao mesmo tempo mandariam o
 *     mesmo aviso duas vezes.
 *  3. **Desligado por padrão.** Sem `AVISOS_DE_PEDIDO=1` (pedidos) ou
 *     `AVISOS_DE_DEVOLUCAO=1` (devoluções) nada sai. Uma rotina que começa a
 *     escrever para clientes reais no primeiro deploy é o tipo de coisa que
 *     não dá para desfazer depois de acontecer. As travas são separadas para
 *     que um módulo pronto não fique refém do outro.
 *
 * Desligado, a rotina ainda RODA — e registra cada fato como dispensado. Essa
 * parte é o que torna a trava reversível com segurança: sem ela, os envios que
 * acontecerem enquanto o módulo está desligado ficariam pendentes, e a
 * primeira rodada depois de ligar despejaria semanas de avisos atrasados sobre
 * pedidos que já chegaram.
 */

/**
 * Quais eventos o módulo cobre hoje. Os outros ficam para quando houver fonte.
 *
 * "Pedido pago" tem chave PRÓPRIA, e não é preciosismo. A ordem da virada com
 * a Yampi é evento por evento — desliga lá, liga aqui —, e uma chave só
 * obrigaria a virar os três de uma vez. Pior: a confirmação de pagamento é a
 * que mais depende de a Yampi estar calada, porque é a que ela dispara no
 * segundo seguinte ao checkout.
 *
 * Há um motivo a mais para este evento nascer atrás de uma segunda chave. Até
 * hoje a consulta desta rotina só lia pedido JÁ ENVIADO, então pedido pago e
 * não despachado nunca chegou a ser lido — e nunca entrou no log como
 * dispensado. Medido no dia em que isto foi escrito: 69 pedidos nessa
 * situação, todos com e-mail. Alargar a consulta e ligar o evento no mesmo
 * deploy mandaria 69 confirmações de pagamento de uma vez, algumas de compras
 * de duas semanas atrás.
 *
 * Com as chaves separadas, a sequência fica segura: este deploy alarga a
 * consulta com `AVISO_PEDIDO_PAGO` desligado, e na primeira rodada os 69 caem
 * no log como dispensados pelo caminho de `foraDoEscopo`. Ligar depois avisa
 * só quem pagar daí para frente.
 */
/**
 * Os eventos que `mensagemDoAviso` sabe transformar em e-mail.
 *
 * Ligado ou desligado é outra pergunta — esta lista é sobre o que EXISTE. Ela
 * serve ao ensaio, que precisa mostrar tudo que a rotina é capaz de mandar.
 */
const RENDERIZAVEIS: EventoNotificacao[] = ['pedido_pago', 'pedido_enviado', 'pedido_entregue']

function eventosAtivos(): EventoNotificacao[] {
  const base: EventoNotificacao[] = ['pedido_enviado', 'pedido_entregue']
  return process.env.AVISO_PEDIDO_PAGO === '1' ? ['pedido_pago', ...base] : base
}

type ModeloEnvio = Parameters<typeof emailEnvio>[1]

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Uma segunda chance quando o provedor diz "devagar".
 *
 * 429 não é erro do e-mail: é a fila andando rápido demais. Marcar o aviso
 * como `falhou` nesse caso obrigaria alguém a reenviar à mão um e-mail que
 * teria saído sozinho meio segundo depois. Só o 429 é repetido — endereço
 * inválido ou domínio não verificado não melhoram com insistência.
 */
async function comRetentativa<T>(acao: () => Promise<T>): Promise<T> {
  try {
    return await acao()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!/429|too many|rate limit/i.test(msg)) throw e
    await pausa(2_000)
    return acao()
  }
}

export function avisosDePedidoLigados(): boolean {
  return process.env.AVISOS_DE_PEDIDO?.trim() === '1'
}

/**
 * Trava PRÓPRIA das devoluções.
 *
 * O módulo de devoluções ficou pronto antes dos avisos de pedido, e prender os
 * dois na mesma chave obrigaria a ligar tudo junto. Aqui a devolução é o caso
 * em que o silêncio custa caro: o cliente que abriu uma devolução está
 * esperando resposta, e o código de postagem sem e-mail nunca chega nele.
 *
 * Vale a mesma disciplina da outra trava: desligada, o fato entra no log como
 * dispensado, e ligar depois não despeja avisos atrasados.
 */
export function avisosDeDevolucaoLigados(): boolean {
  return process.env.AVISOS_DE_DEVOLUCAO?.trim() === '1'
}

interface LinhaPedidoAviso {
  id: string
  pagamento: string
  envio: string
  valor: number | string | null
  rastreio: string | null
  servico_frete: string | null
  rastreio_url: string | null
  rastreio_servico: string | null
  entrega_local: boolean | null
  clientes: { nome: string | null; email: string | null } | null
}

export interface ResultadoAvisos {
  /** Fatos sem aviso registrado, antes de qualquer envio. */
  candidatos: number
  enviados: number
  falhas: { pedido: string; erro: string }[]
  /** O módulo está desligado; nada foi enviado. */
  desligado: boolean
}

/**
 * Manda o que ainda não foi mandado.
 *
 * A janela é curta de propósito: o que interessa é o fato NOVO. Pedido antigo
 * que nunca foi avisado já entrou no log como `dispensado` na carga inicial —
 * ressuscitá-lo agora seria escrever para quem recebeu o perfume semanas
 * atrás, que é exatamente o que aquela carga evitou.
 *
 * `destinoDeTeste` desvia tudo para um endereço só e NÃO grava no log: é para
 * conferir texto e visual antes de ligar de verdade.
 */
export async function enviarAvisosDePedido(opcoes?: {
  limite?: number
  diasDeJanela?: number
  destinoDeTeste?: string
}): Promise<ResultadoAvisos> {
  const vazio: ResultadoAvisos = { candidatos: 0, enviados: 0, falhas: [], desligado: false }

  const teste = opcoes?.destinoDeTeste?.trim()
  const desligado = !teste && !avisosDePedidoLigados()
  if (!supabaseConfigurado()) throw new Error('O Supabase precisa estar configurado.')
  if (!desligado && !emailConfigurado()) {
    throw new Error('Configure RESEND_API_KEY e EMAIL_REMETENTE para enviar avisos ao cliente.')
  }

  const limite = opcoes?.limite ?? 40
  const dias = opcoes?.diasDeJanela ?? 15
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()

  const sb = supabaseServer()
  const { data, error } = await sb
    .from('pedidos')
    .select('id, pagamento, envio, valor, rastreio, servico_frete, rastreio_url, rastreio_servico, entrega_local, clientes(nome, email)')
    // A janela vale pela data do FATO: a compra, ou o momento em que o ERP
    // soube do envio (`envio_visto_em`, carimbado pela descoberta do Melhor
    // Envio). Sem a segunda porta, um pedido de julho postado em agosto caía
    // fora da janela e o cliente nunca recebia o rastreio.
    .or(`comprado_em.gte.${desde},envio_visto_em.gte.${desde}`)
    // Pedido PAGO entra mesmo sem ter saído — sem isto, "pedido pago" seria um
    // evento ligado que não avisa ninguém, e o silêncio pareceria
    // funcionamento normal. Pedido não pago e não enviado continua fora: não
    // há fato nenhum a comunicar sobre ele.
    .or('pagamento.eq.pago,envio.in.(enviado,entregue)')
    .order('comprado_em', { ascending: false })
    .limit(300)
  if (error) throw error

  const pendentes: { aviso: AvisoPendente; pedido: LinhaPedidoAviso }[] = []
  const ultrapassados: AvisoPendente[] = []
  for (const p of (data ?? []) as unknown as LinhaPedidoAviso[]) {
    const email = p.clientes?.email?.trim()
    if (!email) continue
    // Só o aviso do estado ATUAL sai; os anteriores que porventura nunca
    // saíram viram dispensados. "Seu pedido foi enviado" para quem já recebeu
    // não informa — denuncia o atraso.
    const { enviar, dispensar } = apenasOAtual(
      avisosDe({
        id: p.id,
        email,
        cliente: p.clientes?.nome ?? '',
        pagamento: p.pagamento as 'pago' | 'pendente' | 'divergente',
        envio: p.envio as 'enviado' | 'entregue',
        rastreio: p.rastreio,
        notaFiscal: null,
      }),
    )
    for (const aviso of enviar) pendentes.push({ aviso, pedido: p })
    ultrapassados.push(...dispensar)
  }

  // Os ultrapassados entram no log agora, com o motivo escrito — upsert com
  // ignoreDuplicates, então quem já foi enviado ou dispensado não muda.
  if (ultrapassados.length && !teste) {
    await sb.from('notificacoes_enviadas').upsert(
      ultrapassados.map((aviso) => ({
        chave: aviso.chave,
        pedido_id: aviso.pedidoId,
        evento: aviso.evento,
        destinatario: aviso.email,
        assunto: '(não enviado)',
        estado: 'dispensado',
        motivo: 'o pedido já tinha passado deste estado quando o aviso seria enviado',
        concluido_em: new Date().toISOString(),
      })),
      { onConflict: 'chave', ignoreDuplicates: true },
    )
  }

  if (pendentes.length === 0) return { ...vazio, desligado }

  /**
   * O filtro de escopo vem DEPOIS de montar a lista, não antes.
   *
   * Antes, evento fora de `EVENTOS_ATIVOS` — "pedido pago", "nota emitida" —
   * era descartado aqui e nunca chegava ao log. No dia em que a operação
   * cobrisse esses eventos, a primeira rodada trataria meses de pedidos
   * antigos como fatos novos e despejaria a enxurrada que a trava do
   * "desligado" existe justamente para impedir.
   *
   * Agora eles entram no log como dispensados, com o motivo escrito. Ligar o
   * evento passa a avisar só o que acontecer daí para frente.
   */
  /*
   * O ENSAIO vê tudo que o módulo sabe montar, e não só o que está ligado.
   *
   * A chave de ambiente decide quem escreve para CLIENTE, não quem o dono
   * pode conferir. Filtrar o teste pela mesma lista criaria o impasse óbvio:
   * para ver o e-mail de pagamento antes de liberá-lo seria preciso liberá-lo
   * antes de vê-lo.
   */
  const ativos = teste ? RENDERIZAVEIS : eventosAtivos()
  const doEscopo = pendentes.filter((p) => ativos.includes(p.aviso.evento))
  const foraDoEscopo = pendentes.filter((p) => !ativos.includes(p.aviso.evento))

  // AVISO PARA QUEM FOR LIGAR "pedido_faturado": a consulta lá em cima lê
  // pedido pago OU já despachado. Nota fiscal emitida em pedido que não é nem
  // um nem outro não chega aqui — o `.or(...)` precisa mudar junto.

  // ── Módulo desligado: o fato entra no log, o e-mail não sai ──────────────
  //
  // Sem isto, cada envio que acontecesse com o módulo desligado ficaria como
  // aviso PENDENTE. No dia em que a operação ligasse, a primeira rodada
  // despejaria semanas de avisos atrasados de uma vez — clientes recebendo
  // "seu pedido está a caminho" de pedidos que já chegaram.
  //
  // Registrar como dispensado mantém a promessa dos dois lados: nada sai
  // agora, e ligar depois avisa apenas o que acontecer daí para frente.
  if (desligado) {
    const { data: registradas } = await sb
      .from('notificacoes_enviadas')
      .upsert(
        pendentes.map(({ aviso }) => ({
          chave: aviso.chave,
          pedido_id: aviso.pedidoId,
          evento: aviso.evento,
          destinatario: aviso.email,
          assunto: '(não enviado)',
          estado: 'dispensado',
          motivo: 'módulo de avisos desligado quando o fato aconteceu',
          concluido_em: new Date().toISOString(),
        })),
        { onConflict: 'chave', ignoreDuplicates: true },
      )
      .select('chave')
    return { ...vazio, candidatos: (registradas ?? []).length, desligado: true }
  }

  // Fato real, evento que o módulo ainda não cobre: entra no log como
  // dispensado AGORA, para não virar enxurrada quando o evento for ligado.
  if (foraDoEscopo.length && !teste) {
    await sb.from('notificacoes_enviadas').upsert(
      foraDoEscopo.map(({ aviso }) => ({
        chave: aviso.chave,
        pedido_id: aviso.pedidoId,
        evento: aviso.evento,
        destinatario: aviso.email,
        assunto: '(não enviado)',
        estado: 'dispensado',
        motivo: 'evento ainda não coberto pelo módulo de avisos',
        concluido_em: new Date().toISOString(),
      })),
      { onConflict: 'chave', ignoreDuplicates: true },
    )
  }

  if (doEscopo.length === 0) return { ...vazio, desligado }

  // Uma leitura por rodada, não uma por e-mail: o modelo é o mesmo para todos.
  const modelo = (await lerModeloEmail('envio')) as ModeloEnvio

  // No teste nada é reservado: o ensaio não pode consumir o direito do cliente
  // de receber o aviso de verdade depois.
  if (teste) {
    const amostra = doEscopo.slice(0, Math.min(limite, 3))
    const r: ResultadoAvisos = { ...vazio, candidatos: amostra.length }
    for (const { aviso, pedido } of amostra) {
      try {
        await entregar(await mensagemDoAviso(aviso, pedido, modelo, teste))
        r.enviados++
      } catch (e) {
        r.falhas.push({ pedido: aviso.pedidoId, erro: e instanceof Error ? e.message : String(e) })
      }
    }
    return r
  }

  // Quem já está no log sai da fila ANTES do corte de `limite`. Sem isto, a
  // fatia era tomada pelos avisos mais novos — todos já enviados — e o
  // pendente na posição 21 esperava para sempre: foi assim que oito envios
  // ficaram dias sem o e-mail de rastreio, com a rotina respondendo
  // "candidatos: 0" a cada cinco minutos.
  const chavesDoEscopo = doEscopo.map(({ aviso }) => aviso.chave)
  const jaRegistradas = new Set<string>()
  for (let i = 0; i < chavesDoEscopo.length; i += 200) {
    const { data: parte, error: erroLog } = await sb
      .from('notificacoes_enviadas')
      .select('chave')
      .in('chave', chavesDoEscopo.slice(i, i + 200))
    if (erroLog) throw erroLog
    for (const l of (parte ?? []) as { chave: string }[]) jaRegistradas.add(l.chave)
  }
  const novos = doEscopo.filter(({ aviso }) => !jaRegistradas.has(aviso.chave))
  if (novos.length === 0) return { ...vazio, desligado }

  // Reserva em lote: a chave primária decide quem manda. `ignoreDuplicates`
  // devolve só as linhas que ESTA rodada conseguiu inserir — as demais
  // entraram no log entre a leitura acima e agora, e ficam com quem chegou
  // primeiro.
  const reserva = novos.slice(0, limite)
  const { data: ganhas, error: erroReserva } = await sb
    .from('notificacoes_enviadas')
    .upsert(
      reserva.map(({ aviso }) => ({
        chave: aviso.chave,
        pedido_id: aviso.pedidoId,
        evento: aviso.evento,
        destinatario: aviso.email,
        assunto: ASSUNTO[aviso.evento].replace('{pedido}', aviso.pedidoId),
        estado: 'enviando',
      })),
      { onConflict: 'chave', ignoreDuplicates: true },
    )
    .select('chave')
  if (erroReserva) throw erroReserva

  const minhas = new Set((ganhas ?? []).map((l) => (l as { chave: string }).chave))
  const fila = reserva.filter(({ aviso }) => minhas.has(aviso.chave))
  const resultado: ResultadoAvisos = { ...vazio, candidatos: fila.length }

  for (const [indice, { aviso, pedido }] of fila.entries()) {
    // Meio segundo entre envios: o limite do provedor é por segundo, e um
    // lote de quarenta disparado de uma vez volta 429 no meio — com a linha
    // já reservada, o aviso viraria "falhou" sem ninguém ter errado nada.
    if (indice > 0) await pausa(600)
    try {
      const mensagem = await mensagemDoAviso(aviso, pedido, modelo, null)
      const r = await comRetentativa(() => entregar(mensagem))
      await sb
        .from('notificacoes_enviadas')
        .update({
          estado: 'enviado',
          provedor_id: r.id,
          concluido_em: new Date().toISOString(),
          // O corpo é guardado, não redesenhado depois: o modelo é editável, e
          // redesenhar mostraria o texto de hoje com os dados de ontem — o
          // oposto do que se procura ao abrir esta tela.
          corpo_html: r.html,
        })
        .eq('chave', aviso.chave)
      resultado.enviados++
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e)
      resultado.falhas.push({ pedido: aviso.pedidoId, erro })
      // A linha vira `falhou` em vez de sumir: assim a falha aparece no log em
      // vez de virar uma tentativa infinita a cada hora. Reenviar é decisão de
      // quem olha, não da rotina.
      await sb
        .from('notificacoes_enviadas')
        .update({ estado: 'falhou', motivo: erro.slice(0, 300), concluido_em: new Date().toISOString() })
        .eq('chave', aviso.chave)
    }
  }

  return resultado
}

/**
 * Os itens da compra, com a miniatura do catálogo, e o frete pago.
 *
 * A imagem vem do perfume-base — 1.419 dos 1.449 itens já têm uma. Os 30 sem
 * base são kits e lançamentos manuais: a linha sai só com o nome, e nada
 * quebra.
 */
async function resumoDaCompra(
  pedidoId: string,
): Promise<{ itens: ItemComprado[]; frete: number }> {
  const sb = supabaseServer()
  const [{ data: itens }, { data: cabecalho }] = await Promise.all([
    sb
      .from('pedido_itens')
      .select('descricao, quantidade, preco, perfumes_base(imagem_url)')
      .eq('pedido_id', pedidoId),
    sb.from('pedidos').select('frete').eq('id', pedidoId).maybeSingle(),
  ])

  return {
    itens: ((itens ?? []) as unknown as {
      descricao: string
      quantidade: number
      preco: number | string
      perfumes_base: { imagem_url: string | null } | null
    }[]).map((i) => ({
      descricao: i.descricao,
      quantidade: Number(i.quantidade) || 1,
      preco: Number(i.preco) || 0,
      imagem: i.perfumes_base?.imagem_url ?? null,
    })),
    frete: Number((cabecalho as { frete: number | null } | null)?.frete ?? 0),
  }
}

/**
 * O cashback que ESTA compra gerou, lido da carteira do cliente.
 *
 * Lido, nunca calculado. A taxa é 10% em 452 de 452 créditos conferidos, e
 * multiplicar o pedido por 0,1 acertaria em todos eles — até a primeira
 * promoção com outra taxa, quando o e-mail passaria a afirmar um valor que a
 * conta do cliente não tem. O crédito é localizado pelo NÚMERO DO PEDIDO
 * dentro do extrato: casamento exato, sem inferência.
 *
 * Silêncio é o desfecho aceitável. Carteira ainda não espelhada, crédito que
 * a Yampi não lançou até agora, Yampi fora do ar — em qualquer um deles o
 * bloco não aparece e o resto do e-mail sai igual. Nunca um número chutado.
 */
async function cashbackDaCompra(
  pedidoId: string,
  email: string | null,
): Promise<CashbackGanho | null> {
  if (!email) return null
  try {
    const { data: carteira } = await supabaseServer()
      .from('cashback_yampi')
      .select('customer_id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()
    let customerId = (carteira as { customer_id: string } | null)?.customer_id ?? null
    // Cliente NOVO ainda não tem linha no espelho — a varredura anda uma
    // página por hora e pode demorar um dia até chegar nele. O crédito, porém,
    // já está na Yampi minutos depois da aprovação: foi assim que a primeira
    // compra da Letícia saiu sem o bloco enquanto a da Juliana, cliente
    // antiga, saiu completo. Sem espelho, o id vem da API, por e-mail EXATO.
    if (!customerId) customerId = await clienteYampiPorEmail(email)
    if (!customerId) return null

    const numero = pedidoId.replace(/^YP-/, '')
    const { movimentos } = await extratoCashbackYampi(customerId)
    const credito = movimentos.find(
      (m) => m.pedido === numero && m.vale && m.valor - m.usado > 0 && m.expiraEm,
    )
    if (!credito) return null

    return {
      valor: Math.round((credito.valor - credito.usado) * 100) / 100,
      validade: dataBr(credito.expiraEm!),
    }
  } catch (e) {
    // A falha da carteira não pode derrubar a confirmação de pagamento: o
    // aviso do dinheiro que ENTROU vale mais que o bônus.
    console.error('[avisos] cashback da compra não foi lido:', e)
    return null
  }
}

/** aaaa-mm-dd (ou ISO) para dd/MM/aaaa, sem tropeçar no fuso. */
function dataBr(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

/**
 * A mensagem pronta para um aviso.
 *
 * O link do botão sai de `paginaDeRastreio`, que escolhe a casa certa pela
 * transportadora: Frenet para Correios e Jadlog, Melhor Rastreio para J&T,
 * Total e Buslog — sempre com o código embutido, para o cliente não digitar
 * nada. Quando a Frenet já devolveu a URL do objeto, ela tem precedência: é o
 * endereço que a própria transportadora publicou.
 */
async function mensagemDoAviso(
  aviso: AvisoPendente,
  pedido: LinhaPedidoAviso,
  modelo: ModeloEnvio,
  destinoDeTeste: string | null,
) {
  // A transportadora DESCOBERTA (gravada em rastreio_servico pela postagem no
  // Melhor Envio ou pela leitura da Frenet) fala mais alto que o rótulo do
  // checkout: frete grátis sai cotado como Jadlog e viaja pela J&T quando o
  // preço do dia compensa — nomear a errada manda o cliente procurar o pacote
  // no lugar errado.
  const descoberta = pedido.rastreio_servico
    ? identificarFrete(pedido.rastreio_servico, pedido.rastreio)
    : null
  const { transportadora } =
    descoberta && descoberta.transportadora !== 'Não informada'
      ? descoberta
      : identificarFrete(pedido.servico_frete, pedido.rastreio)
  const nome = transportadora === 'Não informada' ? null : transportadora
  // A coluna gravada pela importação decide; o rótulo MOTOBOY no serviço é o
  // reforço para o histórico anterior à convenção.
  const entregaLocal =
    Boolean(pedido.entrega_local) ||
    ehEntregaLocal({ servicoFrete: pedido.servico_frete, destino: null, rastreio: pedido.rastreio })

  const conteudo =
    aviso.evento === 'pedido_pago'
      ? emailPagamento({
          nome: aviso.cliente,
          pedido: aviso.pedidoId,
          total: Number(pedido.valor ?? 0),
          ...(await resumoDaCompra(aviso.pedidoId)),
          cashback: await cashbackDaCompra(aviso.pedidoId, aviso.email),
          entregaLocal,
        })
      : aviso.evento === 'pedido_entregue'
      ? emailEntregue({ nome: aviso.cliente, pedido: aviso.pedidoId, transportadora: nome, entregaLocal })
      : emailEnvio(
          {
            nome: aviso.cliente,
            pedido: aviso.pedidoId,
            codigo: pedido.rastreio,
            transportadora: nome,
            link: entregaLocal ? null : (pedido.rastreio_url ?? paginaDeRastreio(nome, pedido.rastreio)),
            entregaLocal,
          },
          modelo,
        )

  return {
    para: destinoDeTeste || aviso.email,
    assunto: destinoDeTeste ? `[TESTE] ${conteudo.assunto}` : conteudo.assunto,
    html: conteudo.html,
  }
}

// ── Avisos de devolução ─────────────────────────────────────────────────────

/**
 * Um aviso de devolução, com as três travas do módulo: chave derivada do fato
 * (`K7QM-4XT9|devolucao_aberta`), vaga reservada antes do envio, e — com o
 * módulo desligado — o fato entra no log como dispensado, sem sair e-mail.
 * Ligar `AVISOS_DE_DEVOLUCAO=1` depois só avisa o que acontecer daí em diante.
 *
 * Nunca lança: o aviso é coadjuvante. Falhar o registro da devolução porque o
 * provedor de e-mail espirrou inverteria a importância das coisas.
 */
async function avisarDevolucao(
  protocolo: string,
  evento: 'devolucao_aberta' | 'devolucao_aprovada' | 'devolucao_novas_fotos',
  montar: (d: {
    nome: string | null
    email: string
    pedido: string
    reverso: string
    oQueFalta: string | null
  }) => { assunto: string; html: string } | null,
  /**
   * Distingue dois fatos do MESMO evento. Pedir fotos duas vezes, com
   * observações diferentes, são dois fatos — e sem isto o segundo e-mail
   * nunca sairia, porque a chave já existiria no log.
   */
  sufixoDaChave = '',
): Promise<void> {
  try {
    if (!supabaseConfigurado()) return
    const sb = supabaseServer()

    const { data } = await sb
      .from('solicitacoes_devolucao')
      .select('protocolo, pedido_id, motivo, reverso, pedido_de_fotos, pedidos(clientes(nome, email))')
      .eq('protocolo', protocolo)
      .maybeSingle()
    const s = data as unknown as {
      protocolo: string
      pedido_id: string
      motivo: string
      reverso: string
      pedido_de_fotos: string | null
      pedidos: {
        clientes: { nome: string | null; email: string | null } | null
      } | null
    } | null
    const email = s?.pedidos?.clientes?.email?.trim()
    if (!s || !email) return

    const mensagem = montar({
      nome: s.pedidos?.clientes?.nome ?? null,
      email,
      pedido: s.pedido_id,
      reverso: s.reverso,
      oQueFalta: s.pedido_de_fotos,
    })
    if (!mensagem) return

    const chave = `${protocolo}|${evento}${sufixoDaChave}`
    const desligado = !avisosDeDevolucaoLigados() || !emailConfigurado()

    if (desligado) {
      await sb.from('notificacoes_enviadas').upsert(
        {
          chave,
          pedido_id: s.pedido_id,
          evento,
          destinatario: email,
          assunto: '(não enviado)',
          estado: 'dispensado',
          motivo: 'módulo de avisos desligado quando o fato aconteceu',
          concluido_em: new Date().toISOString(),
        },
        { onConflict: 'chave', ignoreDuplicates: true },
      )
      return
    }

    const { data: ganha } = await sb
      .from('notificacoes_enviadas')
      .upsert(
        {
          chave,
          pedido_id: s.pedido_id,
          evento,
          destinatario: email,
          assunto: mensagem.assunto,
          estado: 'enviando',
        },
        { onConflict: 'chave', ignoreDuplicates: true },
      )
      .select('chave')
    if (!(ganha ?? []).length) return

    try {
      const r = await entregar({ para: email, assunto: mensagem.assunto, html: mensagem.html })
      await sb
        .from('notificacoes_enviadas')
        .update({
          estado: 'enviado',
          provedor_id: r.id,
          concluido_em: new Date().toISOString(),
          corpo_html: r.html,
        })
        .eq('chave', chave)
    } catch (e) {
      await sb
        .from('notificacoes_enviadas')
        .update({
          estado: 'falhou',
          motivo: (e instanceof Error ? e.message : String(e)).slice(0, 300),
          concluido_em: new Date().toISOString(),
        })
        .eq('chave', chave)
    }
  } catch (e) {
    console.error(`[devolucoes] aviso ${evento} de ${protocolo} não registrado:`, e)
  }
}

/** Confirmação de solicitação aberta — chamado pelo portal. */
export async function avisarDevolucaoAberta(protocolo: string): Promise<void> {
  const modelo = await lerModeloEmail('devolucao-aberta').catch(() => undefined)
  await avisarDevolucao(protocolo, 'devolucao_aberta', (d) =>
    emailDevolucaoAberta({ nome: d.nome, pedido: d.pedido, protocolo }, modelo),
  )
}

/** Aprovação com o código reverso — chamado quando o ERP gera o reverso. */
export async function avisarDevolucaoAprovada(protocolo: string): Promise<void> {
  const modelo = await lerModeloEmail('devolucao-aprovada').catch(() => undefined)
  await avisarDevolucao(protocolo, 'devolucao_aprovada', (d) =>
    // Sem reverso não há o que apresentar na agência — o e-mail não sai.
    d.reverso
      ? emailDevolucaoAprovada({ nome: d.nome, protocolo, reverso: d.reverso }, modelo)
      : null,
  )
}

/**
 * Conclusão com prova: o e-mail leva a resolução e, quando houver, o
 * comprovante do reembolso EM ANEXO — baixado do bucket privado na hora do
 * envio, nunca por link público. Mesmas travas dos demais avisos.
 */
export async function avisarDevolucaoConcluida(protocolo: string): Promise<void> {
  try {
    if (!supabaseConfigurado()) return
    const sb = supabaseServer()

    const { data } = await sb
      .from('solicitacoes_devolucao')
      .select(
        'protocolo, pedido_id, resolucao, reembolso_valor, reembolso_forma, reembolso_em, ' +
          'comprovante_reembolso, troca_pedido_id, pedidos(clientes(nome, email))',
      )
      .eq('protocolo', protocolo)
      .maybeSingle()
    const s = data as unknown as {
      protocolo: string
      pedido_id: string
      resolucao: string | null
      reembolso_valor: number | string | null
      reembolso_forma: 'pix' | 'estorno-cartao' | null
      reembolso_em: string | null
      comprovante_reembolso: string | null
      troca_pedido_id: string | null
      pedidos: { clientes: { nome: string | null; email: string | null } | null } | null
    } | null
    const email = s?.pedidos?.clientes?.email?.trim()
    if (!s || !email) return

    const modelo = await lerModeloEmail('devolucao-concluida').catch(() => undefined)
    const mensagem = emailDevolucaoConcluida(
      {
        nome: s.pedidos?.clientes?.nome ?? null,
        protocolo,
        resolucao: s.resolucao ?? 'Devolução concluída',
        reembolsoValor: s.reembolso_valor === null ? null : Number(s.reembolso_valor),
        reembolsoForma: s.reembolso_forma,
        reembolsoData: s.reembolso_em
          ? new Date(s.reembolso_em).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              timeZone: 'America/Sao_Paulo',
            })
          : null,
        temComprovante: Boolean(s.comprovante_reembolso),
        trocaPedidoId: s.troca_pedido_id,
      },
      modelo,
    )

    const chave = `${protocolo}|devolucao_concluida`
    const desligado = !avisosDeDevolucaoLigados() || !emailConfigurado()

    if (desligado) {
      await sb.from('notificacoes_enviadas').upsert(
        {
          chave,
          pedido_id: s.pedido_id,
          evento: 'devolucao_concluida',
          destinatario: email,
          assunto: '(não enviado)',
          estado: 'dispensado',
          motivo: 'módulo de avisos desligado quando o fato aconteceu',
          concluido_em: new Date().toISOString(),
        },
        { onConflict: 'chave', ignoreDuplicates: true },
      )
      return
    }

    const { data: ganha } = await sb
      .from('notificacoes_enviadas')
      .upsert(
        {
          chave,
          pedido_id: s.pedido_id,
          evento: 'devolucao_concluida',
          destinatario: email,
          assunto: mensagem.assunto,
          estado: 'enviando',
        },
        { onConflict: 'chave', ignoreDuplicates: true },
      )
      .select('chave')
    if (!(ganha ?? []).length) return

    try {
      const anexos = []
      if (s.comprovante_reembolso) {
        const { data: arquivo } = await sb.storage
          .from('devolucoes')
          .download(s.comprovante_reembolso)
        if (arquivo) {
          const extensao = s.comprovante_reembolso.split('.').pop() ?? 'pdf'
          anexos.push({
            nome: `comprovante-${protocolo}.${extensao}`,
            conteudoBase64: Buffer.from(await arquivo.arrayBuffer()).toString('base64'),
          })
        }
      }
      const r = await entregar({ para: email, assunto: mensagem.assunto, html: mensagem.html, anexos })
      await sb
        .from('notificacoes_enviadas')
        .update({
          estado: 'enviado',
          provedor_id: r.id,
          concluido_em: new Date().toISOString(),
          corpo_html: r.html,
        })
        .eq('chave', chave)
    } catch (e) {
      await sb
        .from('notificacoes_enviadas')
        .update({
          estado: 'falhou',
          motivo: (e instanceof Error ? e.message : String(e)).slice(0, 300),
          concluido_em: new Date().toISOString(),
        })
        .eq('chave', chave)
    }
  } catch (e) {
    console.error(`[devolucoes] aviso de conclusão de ${protocolo} não registrado:`, e)
  }
}

/**
 * Pedido de novas provas — chamado quando a triagem marca "Aguardando fotos".
 *
 * A chave inclui o texto pedido, e não só o protocolo: se a operação pedir
 * fotos de novo, com outra observação, é outro fato e merece outro e-mail. A
 * regra de "um fato, um e-mail" continua valendo — o que muda é o que conta
 * como fato.
 */
export async function avisarDevolucaoNovasFotos(protocolo: string, oQueFalta: string): Promise<void> {
  // Soma simples dos caracteres: não precisa ser criptográfico, precisa ser
  // estável — o mesmo pedido repetido não pode virar dois e-mails.
  let marca = 0
  for (const c of oQueFalta.trim()) marca = (marca * 31 + c.charCodeAt(0)) % 1_000_000
  await avisarDevolucao(
    protocolo,
    'devolucao_novas_fotos',
    (d) =>
      d.oQueFalta
        ? emailDevolucaoNovasFotos({ nome: d.nome, protocolo, oQueFalta: d.oQueFalta })
        : null,
    `|${marca}`,
  )
}

// ── Log para a tela de Configurações → Notificações ─────────────────────────

export interface LinhaLogNotificacao {
  chave: string
  pedidoId: string | null
  evento: EventoNotificacao
  rotulo: string
  destinatario: string
  assunto: string
  estado: 'enviando' | 'enviado' | 'falhou' | 'dispensado'
  motivo: string
  criadoEm: string
  concluidoEm: string | null
  /** O HTML entregue. Nulo em dispensado (não houve e-mail) e no que venceu a retenção de um ano. */
  corpoHtml: string | null
}

/**
 * O registro de cada aviso — inclusive dos que NÃO saíram.
 *
 * Enquanto a Yampi mandava, "o cliente foi avisado?" se respondia lá. Assumindo
 * o envio, a pergunta virou nossa, e sem esta lista a única resposta estaria na
 * caixa de entrada do cliente. Dispensado e falhou aparecem junto com enviado
 * de propósito: é a linha que não saiu que exige decisão.
 */
export async function lerLogDeNotificacoes(filtros?: {
  estado?: string | null
  evento?: string | null
  limite?: number
}): Promise<LinhaLogNotificacao[]> {
  if (!supabaseConfigurado()) return []

  let consulta = supabaseServer()
    .from('notificacoes_enviadas')
    .select('chave, pedido_id, evento, destinatario, assunto, estado, motivo, criado_em, concluido_em, corpo_html')
    .order('criado_em', { ascending: false })
    .limit(filtros?.limite ?? 300)
  if (filtros?.estado) consulta = consulta.eq('estado', filtros.estado)
  if (filtros?.evento) consulta = consulta.eq('evento', filtros.evento)

  const { data, error } = await consulta
  if (error) {
    console.error('[notificacoes] não consegui ler o log:', error.message)
    return []
  }

  return ((data ?? []) as {
    chave: string
    pedido_id: string | null
    evento: string
    destinatario: string
    assunto: string
    estado: string
    motivo: string
    criado_em: string
    concluido_em: string | null
    corpo_html: string | null
  }[]).map((l) => ({
    chave: l.chave,
    pedidoId: l.pedido_id,
    evento: l.evento as EventoNotificacao,
    rotulo: ROTULO_EVENTO[l.evento as EventoNotificacao] ?? l.evento,
    destinatario: l.destinatario,
    assunto: l.assunto,
    estado: l.estado as LinhaLogNotificacao['estado'],
    motivo: l.motivo,
    criadoEm: l.criado_em,
    concluidoEm: l.concluido_em,
    corpoHtml: l.corpo_html,
  }))
}

export interface ResumoNotificacoes {
  enviados: number
  dispensados: number
  falhas: number
  emCurso: number
  /** Enviados HOJE (dia de São Paulo) — a régua do limite diário do Resend. */
  enviadosHoje: number
  /** Enviados no MÊS corrente — a régua do limite mensal do Resend. */
  enviadosMes: number
}

/** Os números para os cartões do topo: 30 dias, o dia e o mês corrente. */
export async function resumoDeNotificacoes(): Promise<ResumoNotificacoes> {
  const zero: ResumoNotificacoes = {
    enviados: 0,
    dispensados: 0,
    falhas: 0,
    emCurso: 0,
    enviadosHoje: 0,
    enviadosMes: 0,
  }
  if (!supabaseConfigurado()) return zero

  // A contagem é do SERVIDOR. O PostgREST devolve no máximo 1.000 linhas por
  // resposta, e o log passou disso — só a carga inicial de dispensados tem
  // 1.5 mil. Trazer linhas para contar aqui mostrava "5 enviados" num mês em
  // que saíram 73: a amostra truncada vinha dominada pelos dispensados.
  //
  // A coluna contada é `chave` — o log não tem `id`, e contar por uma coluna
  // inexistente zerava o cartão inteiro.
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString()
  // O dia e o mês do Resend são os de São Paulo; 00:00 aqui é 03:00Z.
  const hojeSp = new Date().toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' })
  const inicioDoDia = `${hojeSp}T03:00:00Z`
  const inicioDoMes = `${hojeSp.slice(0, 7)}-01T03:00:00Z`

  const sb = supabaseServer()
  const conta = async (aPartirDe: string, estado?: string): Promise<number> => {
    let q = sb
      .from('notificacoes_enviadas')
      .select('chave', { count: 'exact', head: true })
      .gte('criado_em', aPartirDe)
    if (estado) q = q.eq('estado', estado)
    const { count, error } = await q
    if (error) throw error
    return count ?? 0
  }

  try {
    const [total, enviados, dispensados, falhas, enviadosHoje, enviadosMes] = await Promise.all([
      conta(desde),
      conta(desde, 'enviado'),
      conta(desde, 'dispensado'),
      conta(desde, 'falhou'),
      conta(inicioDoDia, 'enviado'),
      conta(inicioDoMes, 'enviado'),
    ])
    return {
      enviados,
      dispensados,
      falhas,
      emCurso: Math.max(0, total - enviados - dispensados - falhas),
      enviadosHoje,
      enviadosMes,
    }
  } catch {
    return zero
  }
}

/**
 * Reenvia um aviso que falhou.
 *
 * Só o que FALHOU: reenviar um aviso já entregue manda o mesmo e-mail duas
 * vezes, e a regra do módulo inteiro é um fato, um e-mail. Dispensado também
 * não volta — ele foi dispensado por decisão (módulo desligado, evento fora do
 * escopo), e ressuscitá-lo escreveria sobre um fato antigo.
 *
 * A linha é apagada para que a rodada seguinte a trate como fato novo: é o
 * caminho que já sabe montar o e-mail, reservar a vaga e registrar o
 * resultado, em vez de uma segunda implementação do mesmo envio.
 */
export async function reenfileirarAviso(
  chave: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!supabaseConfigurado()) return { ok: false, erro: 'O Supabase precisa estar configurado.' }

  const sb = supabaseServer()
  const { data } = await sb
    .from('notificacoes_enviadas')
    .select('chave, estado')
    .eq('chave', chave)
    .maybeSingle()
  const linha = data as { chave: string; estado: string } | null
  if (!linha) return { ok: false, erro: 'Este aviso não está no log.' }
  if (linha.estado !== 'falhou') {
    return {
      ok: false,
      erro:
        linha.estado === 'enviado'
          ? 'Este aviso já foi entregue. Reenviar mandaria o mesmo e-mail duas vezes.'
          : 'Só avisos que falharam voltam para a fila.',
    }
  }

  const { error } = await sb.from('notificacoes_enviadas').delete().eq('chave', chave)
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}
