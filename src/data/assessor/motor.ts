import 'server-only'

import { randomUUID } from 'node:crypto'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import {
  AVISO_DE_PARADA,
  caberNoLimite,
  catalogoVisivel,
  decidir,
  envelopar,
  excedeu,
  LIMITES_PADRAO,
  nomeDoArquivo,
  paraCsv,
  REGRA_DE_DADOS_NAO_CONFIAVEIS,
  saneadoEmProfundidade,
  tabelaDoResultado,
  type Ator,
  type CanalDoGerente,
  type ContextoDaPolitica,
  type Limites,
  type MotivoDeParada,
} from '@/domain'

import { catalogoParaModelo, FERRAMENTA_POR_NOME, FERRAMENTAS, type Ferramenta } from './catalogo'
import type { ContextoDaExecucao } from './ferramentas'
import { lerConfiguracaoDoGerente } from './politica'
import { lerMemorias, memoriaParaPrompt } from './memoria'

/**
 * O MOTOR do Gerente: pergunta → plano → ferramentas → resposta → auditoria.
 *
 * A forma do laço não mudou desde a Fase 1 e não deve mudar: o modelo pede
 * ferramentas, o ERP executa as que reconhece, devolve o resultado, repete. O
 * que mudou é tudo o que existe AO REDOR do laço, e é onde estava a fragilidade.
 *
 * Antes, três coisas moravam só na boa vontade do modelo: o que ele pode
 * executar, quanto pode gastar e se o dado que ele lê pode mandar nele. As três
 * viraram código. A política decide antes de qualquer chamada, o orçamento
 * interrompe quando estoura e o resultado de ferramenta viaja envelopado como
 * conteúdo, nunca como instrução.
 *
 * E a auditoria deixou de ser responsabilidade de quem chama. `executarInteracao`
 * é o único caminho: ele abre o trace, executa, e fecha a auditoria no `finally`
 * — inclusive quando dá erro, que é justamente quando registrar importa mais.
 */

const API = 'https://api.anthropic.com/v1/messages'
/** Modelo e versão vivem aqui porque a auditoria grava qual respondeu. */
const MODELO = 'claude-sonnet-4-5-20250929'
const VERSAO_API = '2023-06-01'
const VERSAO_DO_PROMPT = '3.1.0'

/**
 * A trava de escrita, em duas camadas.
 *
 * O escopo é explícito: o bloqueio não pode depender do system prompt. Ele
 * depende do Policy Engine, que recebe este booleano e nega toda ferramenta
 * WRITE antes de o modelo sequer vê-la no catálogo.
 *
 * Quem responde é a configuração da tela — porque ligar autonomia é decisão de
 * operação, e uma decisão que exige deploy é uma decisão que ninguém revê. Por
 * cima dela existe `GERENTE_ESCRITA = 'desligada'`, o interruptor de
 * emergência: força leitura sem esperar build.
 */
export async function escritaLiberada(): Promise<boolean> {
  return (await lerConfiguracaoDoGerente()).escritaLiberada
}

export interface FerramentaUsada {
  nome: string
  versao: string
  modo: string
  argumentos: Record<string, unknown>
  ms: number
  bytes?: number
  erro?: string
  /** Motivo do Policy Engine quando a chamada foi barrada antes de executar. */
  bloqueio?: string
  /**
   * Quantas linhas o resultado tinha, quando ele era tabular (§4.5).
   *
   * Quem decide se dá para exportar é o dado, não a interface: o campo só
   * aparece quando existe tabela de verdade, e é por isso que o botão "Baixar
   * CSV" nunca é oferecido para uma resposta que não vira planilha.
   */
  linhas?: number
}

export interface RespostaDoAssessor {
  traceId: string
  texto: string
  ferramentas: FerramentaUsada[]
  tokensEntrada: number
  tokensSaida: number
  duracaoMs: number
  parou: MotivoDeParada
  /** Preenchido quando a interação terminou por limite, não por conclusão. */
  aviso?: string
}

export function assessorConfigurado(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) && supabaseConfigurado()
}

/**
 * O ator do ERP web enquanto não há multiempresa.
 *
 * Explícito de propósito. Um ator implícito seria um ator que ninguém revisa —
 * e quando o WhatsApp entrar, é este objeto que vai precisar ser resolvido a
 * partir do número, com a mesma forma e as mesmas checagens.
 */
export function atorDoErp(usuarioId: string | null, perfil = 'operador'): Ator {
  return {
    usuarioId: usuarioId ?? 'sessao-anonima',
    perfil,
    // Fase 1 é leitura: a permissão de leitura é a única que existe hoje. A
    // lista fica aqui, e não no modelo, porque é o backend que decide.
    permissoes: ['gerente.ler'],
    empresaId: 'frenesi',
  }
}

/**
 * As regras de conduta do Gerente.
 *
 * Escritas aqui, e não no cliente, porque instrução que trafega pelo navegador
 * é instrução que o usuário pode trocar. As primeiras linhas são as que mais
 * importam: sem elas o assistente inventa número, e um número inventado num ERP
 * financeiro é pior do que nenhuma resposta.
 */
function instrucoes(hoje: string, escrita: boolean, memoria: string): string {
  return `Você é o Meu Assessor, o gerente de IA do ERP da FRENESI Perfumes — uma operação
brasileira que vende decants (frações de perfumes importados) pela internet.

REGRAS QUE NÃO SE NEGOCIAM:
1. Todo número que você afirmar precisa ter vindo de uma ferramenta desta conversa.
   Você NÃO calcula margem, saldo, cobertura, DRE ou conciliação por conta própria:
   essas contas pertencem ao ERP e você as consome prontas. Se não chamou a ferramenta,
   não sabe o número — e diz que não sabe.
2. Separe FATO (veio de ferramenta), INFERÊNCIA (sua leitura do fato) e RECOMENDAÇÃO
   (o que fazer). Marque as duas últimas com a palavra correspondente.
3. Se o dado não existir, estiver vazio ou for ambíguo, diga isso explicitamente em vez
   de estimar. Nunca preencha lacuna com número plausível.
3.1. Um número que respondeu a OUTRA pergunta não responde a esta. Antes de reaproveitar
   um valor já dito na conversa, confira se ele mede exatamente o que foi perguntado —
   e, se não medir, chame a ferramenta de novo. Reaproveitar sai mais barato e responde
   errado: "recebido no dia" (baixas de caixa) não é "recebido destas vendas" (crédito
   do gateway por pedido), e trocar um pelo outro já afirmou a alguém que não havia
   entrado dinheiro num dia em que entrou.
3.2. ZERO e NÃO IDENTIFICADO são coisas diferentes, e a diferença é a mais cara de
   errar. Nunca diga "não recebi nada" a partir de um agregado que pode estar medindo
   outra janela: ou o dado mostra o crédito, ou você diz que o crédito ainda não foi
   identificado. Explicar com prazo de gateway um zero que você não conferiu é inventar
   causa para um fato que não existe — e a marca "Inferência:" não torna isso aceitável.
4. Se a pergunta partir de uma premissa errada, corrija a premissa antes de responder.
5. A fila de "prioridades_do_dia" já vem ORDENADA por regra fixa do ERP. Você a relata,
   não a reordena, e não acrescenta urgência que a regra não apontou. Se achar que falta
   algo na fila, diga isso como INFERÊNCIA — nunca embutido como se fosse item dela.
6. Ferramenta marcada [CENÁRIO] devolve SIMULAÇÃO. Nunca apresente o resultado dela como
   realizado, e nunca some cenário com número apurado.
${
  escrita
    ? '7. Ações de escrita exigem prévia e confirmação. Nunca afirme que gravou algo sem o recibo\n   da ferramenta na conversa.'
    : '7. Você está em modo SOMENTE LEITURA. Não existe ferramenta de escrita disponível. Se pedirem\n   uma alteração, explique o que fazer na tela do ERP em vez de prometer executar.'
}

${REGRA_DE_DADOS_NAO_CONFIAVEIS}

COMO RESPONDER:
- Comece pela conclusão, em uma ou duas frases. Depois os números que a sustentam.
- Valores em reais no formato brasileiro: R$ 1.234,56.
- Seja curto. Quem pergunta está trabalhando, não lendo relatório.
- Não repita a pergunta de volta nem abra com saudação.
- Quando não houver dado suficiente, responda neste formato: "Não consigo concluir com
  segurança porque a informação X não está disponível/está desatualizada. Posso analisar
  Y e Z, mas isso seria apenas uma inferência."

EM ANÁLISE APROFUNDADA, use estes títulos, nesta ordem, pulando os que não se aplicam:
**Resumo** (a conclusão), **Evidências** (números, períodos e registros usados),
**Diagnóstico** (causa provável), **Impacto** (financeiro, operacional, cliente ou risco),
**Recomendação** (próxima melhor ação e alternativas), **Confiança** (alta, média ou baixa,
COM o motivo). Pergunta simples se responde em duas linhas — não infle.

MARCADORES OBRIGATÓRIOS: abra a frase com "Inferência:" quando for sua leitura do fato,
"Cenário:" quando for simulação (que nunca é realidade) e "Recomendação:" quando for o que
fazer. Fato não leva marcador, mas só é fato se veio de ferramenta.

CONTEXTO DA OPERAÇÃO:
- Hoje é ${hoje}, fuso de Brasília.
- "Faturado" é o que foi VENDIDO num dia (pedidos pagos, pela data da venda).
  "Recebido líquido" é o que ENTROU no caixa naquele dia, já sem as tarifas do
  intermediador. As duas medem coisas diferentes e só fecham no acumulado do período,
  nunca dia a dia — venda de segunda pode cair na conta na quarta, e cartão parcelado
  leva até 30 dias. Se alguém estranhar a diferença, explique isso.
- O intermediador de pagamentos é o Mercado Pago desde 22/07/2026. Antes disso era a
  Pagar.me, cujo histórico foi importado. A tarifa varia com o meio de pagamento:
  Pix custa pouco, cartão em 6x sem juros custa até 14,94%.
- As vendas nascem no checkout da Yampi e na Shopify.
- Existe um TERCEIRO caminho de pagamento, a PAGALEVE: o cliente parcela o Pix em até
  4x, e o dinheiro chega em depósitos da Pagaleve para o Mercado Pago ao longo de até
  45 dias. Esses depósitos NÃO são vendas do dia em que caem — são repasse de vendas
  anteriores. Venda pela Pagaleve fica "aguardando" na conciliação durante o prazo, o
  que é o comportamento correto e não uma pendência. Se perguntarem por que um depósito
  não bate com nenhuma venda do dia, é quase sempre isto.
- Estoque só considera perfume base com compra de frasco/lote registrada. Base sem
  compra não é "zerada": está fora do controle de estoque, e dizer que ela está crítica
  seria alarme falso.${memoria}`
}

interface BlocoTexto {
  type: 'text'
  text: string
}
interface BlocoFerramenta {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}
type Bloco = BlocoTexto | BlocoFerramenta

interface RespostaCrua {
  content?: Bloco[]
  stop_reason?: string
  usage?: { input_tokens?: number; output_tokens?: number }
  error?: { message?: string }
}

type Mensagem = { role: 'user' | 'assistant'; content: unknown }

export interface PedidoAoGerente {
  pergunta: string
  historico?: { papel: 'usuario' | 'assessor'; texto: string }[]
  ator: Ator
  canal: CanalDoGerente
  traceId?: string
  limites?: Partial<Limites>
  /** A conversa em que a interação acontece. Ações pendentes nascem presas a ela. */
  conversaId?: string | null
}

/**
 * Uma chamada ao modelo com prazo.
 *
 * Sem `AbortController`, um provedor lento segura a função serverless até a
 * plataforma matá-la — e aí não há resposta, não há erro tratado e não há
 * auditoria. Com ele, o estouro vira exceção nossa, dentro do nosso `try`, e a
 * interação termina dizendo o que aconteceu.
 */
async function chamarModelo(
  corpo: unknown,
  chave: string,
  timeoutMs: number,
): Promise<RespostaCrua> {
  const controle = new AbortController()
  const alarme = setTimeout(() => controle.abort(), timeoutMs)
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': chave,
        'anthropic-version': VERSAO_API,
      },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    })
    const json = (await r.json()) as RespostaCrua
    if (!r.ok) throw new Error(json.error?.message ?? `A API respondeu ${r.status}.`)
    return json
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`O modelo não respondeu em ${Math.round(timeoutMs / 1000)}s.`)
    }
    throw e
  } finally {
    clearTimeout(alarme)
  }
}

/**
 * Uma ferramenta com prazo próprio.
 *
 * O timeout é por contrato, e não global, porque as ferramentas não custam o
 * mesmo: ler o saldo de três contas não é a mesma coisa que montar a Central
 * inteira. Um teto único ou estrangularia a segunda ou seria frouxo demais para
 * a primeira.
 */
async function executarComPrazo(
  f: Ferramenta,
  args: Record<string, unknown>,
  ctx: ContextoDaExecucao,
  previa = false,
): Promise<unknown> {
  let alarme: ReturnType<typeof setTimeout> | undefined
  const prazo = new Promise<never>((_, rejeitar) => {
    alarme = setTimeout(
      () => rejeitar(new Error(`A consulta passou de ${Math.round(f.timeoutMs / 1000)}s.`)),
      f.timeoutMs,
    )
  })
  try {
    const trabalho = previa && f.prever ? f.prever(args ?? {}, ctx) : f.executar(args ?? {}, ctx)
    return await Promise.race([trabalho, prazo])
  } finally {
    if (alarme) clearTimeout(alarme)
  }
}

async function perguntar(pedido: PedidoAoGerente): Promise<RespostaDoAssessor> {
  const chave = process.env.ANTHROPIC_API_KEY
  if (!chave) throw new Error('ANTHROPIC_API_KEY não está definida nas variáveis do site.')

  const limites: Limites = { ...LIMITES_PADRAO, ...pedido.limites }
  const traceId = pedido.traceId ?? randomUUID()
  const comecou = Date.now()
  const hoje = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'full',
  }).format(new Date())

  const politica: ContextoDaPolitica = {
    ator: pedido.ator,
    canal: pedido.canal,
    escritaLiberada: await escritaLiberada(),
  }

  const contexto: ContextoDaExecucao = {
    ator: pedido.ator,
    canal: pedido.canal,
    traceId,
    conversaId: pedido.conversaId ?? null,
  }

  // O catálogo é filtrado ANTES de o modelo vê-lo. O que ele não enxerga não
  // vira tentativa, não gasta rodada e não vira insistência.
  const disponiveis = catalogoVisivel(FERRAMENTAS, politica)

  // A memória entra no prompt, não nas ferramentas: preferência é contexto de
  // COMO responder, e obrigar uma chamada de ferramenta para lê-la gastaria uma
  // rodada em toda pergunta. Falhar aqui não derruba a resposta — o Gerente sem
  // memória continua correto, só menos conveniente.
  const memoria = memoriaParaPrompt(await lerMemorias(pedido.ator.usuarioId).catch(() => []))

  // O histórico entra truncado: conversa longa custa caro a cada rodada, e o
  // que importa para desambiguar "esses pedidos" são as últimas trocas.
  const mensagens: Mensagem[] = (pedido.historico ?? []).slice(-8).map((m) => ({
    role: m.papel === 'usuario' ? 'user' : 'assistant',
    content: m.texto,
  }))
  mensagens.push({ role: 'user', content: pedido.pergunta })

  const usadas: FerramentaUsada[] = []
  let tokensEntrada = 0
  let tokensSaida = 0
  let texto = ''
  let parou: MotivoDeParada = 'concluiu'

  for (let rodada = 0; ; rodada++) {
    if (rodada >= limites.maxRodadas) {
      parou = 'rodadas'
      break
    }
    const estouro = excedeu(
      { toolCalls: usadas.length, tokens: tokensEntrada + tokensSaida, decorridoMs: Date.now() - comecou },
      limites,
    )
    if (estouro) {
      parou = estouro
      break
    }

    const json = await chamarModelo(
      {
        model: MODELO,
        max_tokens: 2000,
        system: instrucoes(hoje, politica.escritaLiberada, memoria),
        tools: catalogoParaModelo(disponiveis),
        messages: mensagens,
      },
      chave,
      limites.timeoutDoModeloMs,
    )

    tokensEntrada += json.usage?.input_tokens ?? 0
    tokensSaida += json.usage?.output_tokens ?? 0

    const blocos = json.content ?? []
    const falado = blocos
      .filter((b): b is BlocoTexto => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
    // Só substitui se a rodada trouxe texto: uma rodada que só pede ferramentas
    // não pode apagar a conclusão que a anterior já tinha escrito.
    if (falado) texto = falado

    const pedidos = blocos.filter((b): b is BlocoFerramenta => b.type === 'tool_use')
    if (pedidos.length === 0) break

    mensagens.push({ role: 'assistant', content: blocos })

    // Leitura e simulação em paralelo — são independentes e não mudam estado.
    // Escrita jamais entraria aqui: o escopo (§8) manda executá-la em série, e
    // hoje ela nem chega a este ponto, porque a política a nega antes.
    const resultados = await Promise.all(
      pedidos.map(async (p) => {
        const inicio = Date.now()
        const ferramenta = FERRAMENTA_POR_NOME.get(p.name)

        if (!ferramenta) {
          usadas.push({
            nome: p.name,
            versao: '—',
            modo: '—',
            argumentos: p.input,
            ms: 0,
            erro: 'ferramenta inexistente',
          })
          return recusa(p.id, `A ferramenta "${p.name}" não existe. Use apenas as do catálogo.`)
        }

        // A política decide de novo aqui, e não só na filtragem do catálogo.
        // Filtrar é conveniência; esta é a trava. Sem ela, bastaria o modelo
        // chamar pelo nome uma ferramenta que não lhe foi oferecida.
        const decisao = decidir(ferramenta, politica)

        if (decisao.veredito === 'negado') {
          usadas.push({
            nome: ferramenta.nome,
            versao: ferramenta.versao,
            modo: ferramenta.modo,
            argumentos: p.input,
            ms: 0,
            bloqueio: decisao.motivo,
          })
          return recusa(p.id, `Recusado pelo ERP: ${decisao.motivo}`)
        }

        // Ação que exige confirmação NÃO executa: ela prevê. A prévia resolve
        // os registros de verdade, cria a ação pendente assinada e devolve ao
        // modelo um texto que descreve o que ACONTECERIA. É a separação que
        // impede o assistente de dizer "classifiquei" antes de alguém aprovar.
        const soPreve = decisao.veredito !== 'executa'
        if (soPreve && !ferramenta.prever) {
          usadas.push({
            nome: ferramenta.nome,
            versao: ferramenta.versao,
            modo: ferramenta.modo,
            argumentos: p.input,
            ms: 0,
            bloqueio: `${decisao.motivo} (e esta ferramenta não sabe montar prévia)`,
          })
          return recusa(p.id, `Recusado pelo ERP: ${decisao.motivo}`)
        }

        try {
          const dados = soPreve
            ? await executarComPrazo(ferramenta, p.input, contexto, true)
            : await executarComPrazo(ferramenta, p.input, contexto)
          // Sanear ANTES de serializar: o que sai daqui é conteúdo de terceiro,
          // e vai viajar envelopado justamente por isso.
          const corpo = caberNoLimite(
            JSON.stringify(saneadoEmProfundidade(dados)),
            limites.maxBytesToolResult,
          )
          // Só marcamos como exportável o que REALMENTE virou tabela, e só na
          // leitura de verdade: uma prévia descreve o que aconteceria, e baixar
          // "o que aconteceria" como planilha seria entregar um relatório de
          // fatos que ainda não existem.
          const tabela = soPreve ? null : tabelaDoResultado(dados)
          usadas.push({
            nome: ferramenta.nome,
            versao: ferramenta.versao,
            modo: ferramenta.modo,
            argumentos: p.input,
            ms: Date.now() - inicio,
            bytes: corpo.length,
            ...(tabela ? { linhas: tabela.linhas.length } : null),
            ...(soPreve ? { bloqueio: `Prévia: ${decisao.motivo}` } : null),
          })
          return { type: 'tool_result' as const, tool_use_id: p.id, content: envelopar(corpo) }
        } catch (e) {
          const erro = e instanceof Error ? e.message : String(e)
          usadas.push({
            nome: ferramenta.nome,
            versao: ferramenta.versao,
            modo: ferramenta.modo,
            argumentos: p.input,
            ms: Date.now() - inicio,
            erro,
          })
          // Falha de ferramenta volta como falha, não como silêncio: o modelo
          // precisa poder dizer "não consegui ler X" em vez de inventar X.
          return recusa(p.id, `Falha ao ler: ${erro}`)
        }
      }),
    )

    mensagens.push({ role: 'user', content: resultados })
  }

  const aviso = AVISO_DE_PARADA[parou] || undefined
  return {
    traceId,
    // Parada por limite não pode se passar por resposta completa. O aviso vai
    // no corpo porque é ali que quem lê está olhando.
    texto: (texto || 'Não consegui montar uma resposta com os dados disponíveis.') + (aviso ? `\n\n_${aviso}_` : ''),
    ferramentas: usadas,
    tokensEntrada,
    tokensSaida,
    duracaoMs: Date.now() - comecou,
    parou,
    aviso,
  }
}

function recusa(id: string, mensagem: string) {
  return { type: 'tool_result' as const, tool_use_id: id, is_error: true, content: mensagem }
}

/**
 * O ÚNICO caminho para falar com o Gerente.
 *
 * O escopo (§11) é direto: "a auditoria não pode depender de um chamador
 * externo lembrar de executá-la". Aqui ela não depende — o `finally` grava
 * sempre, com sucesso ou com erro, e o erro é justamente o caso em que alguém
 * esqueceria.
 *
 * O `traceId` nasce antes da primeira chamada e acompanha tudo: resposta,
 * auditoria e, quando houver, ação pendente e mutação.
 */
export async function executarInteracao(pedido: PedidoAoGerente & { conversaId: string | null }) {
  const traceId = pedido.traceId ?? randomUUID()
  const comecou = Date.now()
  let resposta: RespostaDoAssessor | null = null
  let erro: string | null = null

  try {
    resposta = await perguntar({ ...pedido, traceId })
    return resposta
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e)
    throw e
  } finally {
    await auditar({
      traceId,
      conversaId: pedido.conversaId,
      ator: pedido.ator,
      canal: pedido.canal,
      pergunta: pedido.pergunta,
      resposta: resposta?.texto ?? null,
      ferramentas: resposta?.ferramentas ?? [],
      tokensEntrada: resposta?.tokensEntrada,
      tokensSaida: resposta?.tokensSaida,
      duracaoMs: resposta?.duracaoMs ?? Date.now() - comecou,
      parou: resposta?.parou ?? 'cancelado',
      erro: erro ?? undefined,
    }).catch(() => {
      // Auditoria que falha não pode derrubar a resposta do usuário. Ela é
      // obrigatória, não fatal — e a falha em gravar aparece no log do servidor.
    })
  }
}

/**
 * O relatório exportável — §4.5.
 *
 * Não há relatório guardado em lugar nenhum: a exportação REEXECUTA a mesma
 * ferramenta, com os mesmos argumentos, e transforma o resultado em planilha. É
 * mais lento do que servir um arquivo salvo, e é o único jeito honesto — um CSV
 * congelado no momento da conversa viraria, uma hora depois, um número velho
 * baixado com nome de relatório atual.
 *
 * Nenhum modelo participa. O caminho é ferramenta → tabela → CSV, e a política
 * decide de novo aqui: exportar é ler, então só ferramenta de leitura passa. Se
 * fosse pelo nome recebido do navegador, bastaria trocar a string por uma
 * ferramenta de escrita para executá-la sem confirmação nenhuma.
 */
export async function exportarRelatorio(pedido: {
  ferramenta: string
  argumentos: Record<string, unknown>
  ator: Ator
  canal: CanalDoGerente
  traceId?: string
}): Promise<{ csv: string; arquivo: string; linhas: number; omitidas: string[] }> {
  const traceId = pedido.traceId ?? randomUUID()
  const comecou = Date.now()
  const ferramenta = FERRAMENTA_POR_NOME.get(pedido.ferramenta)
  if (!ferramenta) throw new Error(`A ferramenta "${pedido.ferramenta}" não existe.`)
  if (ferramenta.modo !== 'READ') {
    throw new Error('Só relatório de leitura pode ser exportado.')
  }

  const politica: ContextoDaPolitica = {
    ator: pedido.ator,
    canal: pedido.canal,
    escritaLiberada: await escritaLiberada(),
  }
  const decisao = decidir(ferramenta, politica)
  if (decisao.veredito !== 'executa') throw new Error(`Recusado pelo ERP: ${decisao.motivo}`)

  const contexto: ContextoDaExecucao = {
    ator: pedido.ator,
    canal: pedido.canal,
    traceId,
    conversaId: null,
  }

  let erro: string | null = null
  try {
    const dados = await executarComPrazo(ferramenta, pedido.argumentos ?? {}, contexto)
    const tabela = tabelaDoResultado(dados)
    if (!tabela) throw new Error('Esta resposta não é uma tabela — não há o que exportar.')
    return {
      csv: paraCsv(tabela),
      arquivo: nomeDoArquivo(ferramenta.nome, new Date().toISOString().slice(0, 10)),
      linhas: tabela.linhas.length,
      omitidas: tabela.omitidas,
    }
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e)
    throw e
  } finally {
    // Exportar é levar dado do ERP para fora dele. Fica na mesma auditoria das
    // perguntas, com o mesmo formato, porque "quem baixou o quê" é exatamente o
    // tipo de pergunta que só se faz depois — quando não dá mais para instrumentar.
    await auditar({
      traceId,
      conversaId: null,
      ator: pedido.ator,
      canal: pedido.canal,
      pergunta: `[exportar CSV] ${pedido.ferramenta}`,
      resposta: null,
      ferramentas: [
        {
          nome: ferramenta.nome,
          versao: ferramenta.versao,
          modo: ferramenta.modo,
          argumentos: pedido.argumentos ?? {},
          ms: Date.now() - comecou,
          ...(erro ? { erro } : null),
        },
      ],
      duracaoMs: Date.now() - comecou,
      parou: erro ? 'cancelado' : 'concluiu',
      erro: erro ?? undefined,
    }).catch(() => {})
  }
}

/** Grava a interação inteira. Sem isto, o Gerente não deveria estar no ar. */
export async function auditar(dados: {
  traceId: string
  conversaId: string | null
  ator: Ator
  canal: CanalDoGerente
  pergunta: string
  resposta: string | null
  ferramentas: FerramentaUsada[]
  tokensEntrada?: number
  tokensSaida?: number
  duracaoMs?: number
  parou?: MotivoDeParada
  escritaLiberada?: boolean
  erro?: string
}) {
  if (!supabaseConfigurado()) return
  await supabaseServer()
    .from('assessor_auditoria')
    .insert({
      trace_id: dados.traceId,
      conversa_id: dados.conversaId,
      usuario_id: null,
      ator: {
        usuarioId: dados.ator.usuarioId,
        perfil: dados.ator.perfil,
        permissoes: dados.ator.permissoes,
        empresaId: dados.ator.empresaId,
      },
      canal: dados.canal,
      pergunta: dados.pergunta,
      resposta: dados.resposta,
      ferramentas: dados.ferramentas,
      modelo: MODELO,
      versao_do_prompt: VERSAO_DO_PROMPT,
      escrita_liberada: dados.escritaLiberada ?? null,
      parou_por: dados.parou ?? null,
      tokens_entrada: dados.tokensEntrada ?? null,
      tokens_saida: dados.tokensSaida ?? null,
      duracao_ms: dados.duracaoMs ?? null,
      erro: dados.erro ?? null,
    })
}
