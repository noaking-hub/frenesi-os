import 'server-only'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

import { catalogoParaModelo, FERRAMENTA_POR_NOME } from './ferramentas'

/**
 * O motor do Assessor: pergunta → ferramentas → resposta.
 *
 * O laço é simples e é de propósito: o modelo pede ferramentas, o ERP executa
 * as que reconhece, devolve o resultado, e repete até o modelo parar de pedir.
 * Nenhuma etapa aceita nome de ferramenta que não esteja no catálogo — se o
 * modelo inventar uma, o laço devolve erro no lugar do resultado, e ele
 * corrige. É essa recusa que impede "endpoint genérico capaz de executar
 * operação arbitrária", que o escopo proíbe na seção 10.4.
 *
 * Fase 1 é SÓ LEITURA. Não há ferramenta de escrita registrada, então não há
 * caminho para gravar nada — a proibição não depende de o modelo se comportar.
 */

const API = 'https://api.anthropic.com/v1/messages'
/** Modelo e versão vivem aqui porque a auditoria grava qual respondeu. */
const MODELO = 'claude-sonnet-4-5-20250929'
const VERSAO_API = '2023-06-01'

/** Teto de idas ao modelo. Existe para uma pergunta não virar um laço caro. */
const MAX_RODADAS = 6

export interface FerramentaUsada {
  nome: string
  argumentos: Record<string, unknown>
  ms: number
  erro?: string
}

export interface RespostaDoAssessor {
  texto: string
  ferramentas: FerramentaUsada[]
  tokensEntrada: number
  tokensSaida: number
  duracaoMs: number
}

export function assessorConfigurado(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) && supabaseConfigurado()
}

/**
 * As regras de conduta do Gerente.
 *
 * Escritas aqui, e não no cliente, porque instrução que trafega pelo navegador
 * é instrução que o usuário pode trocar. As três primeiras linhas são as que
 * mais importam: sem elas o assistente inventa número, e um número inventado
 * num ERP financeiro é pior do que nenhuma resposta.
 */
function instrucoes(hoje: string): string {
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
4. Se a pergunta partir de uma premissa errada, corrija a premissa antes de responder.
5. A fila de "prioridades_do_dia" já vem ORDENADA por regra fixa do ERP. Você a relata,
   não a reordena, e não acrescenta urgência que a regra não apontou. Se achar que falta
   algo na fila, diga isso como INFERÊNCIA — nunca embutido como se fosse item dela.

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
- As vendas nascem no checkout da Yampi e na Shopify.`
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

export async function perguntarAoAssessor(
  pergunta: string,
  historico: { papel: 'usuario' | 'assessor'; texto: string }[] = [],
): Promise<RespostaDoAssessor> {
  const chave = process.env.ANTHROPIC_API_KEY
  if (!chave) throw new Error('ANTHROPIC_API_KEY não está definida nas variáveis do site.')

  const comecou = Date.now()
  const hoje = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'full',
  }).format(new Date())

  // O histórico entra truncado: conversa longa custa caro a cada rodada, e o
  // que importa para desambiguar "esses pedidos" são as últimas trocas.
  const mensagens: Mensagem[] = historico.slice(-8).map((m) => ({
    role: m.papel === 'usuario' ? 'user' : 'assistant',
    content: m.texto,
  }))
  mensagens.push({ role: 'user', content: pergunta })

  const usadas: FerramentaUsada[] = []
  let tokensEntrada = 0
  let tokensSaida = 0
  let texto = ''

  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    const r = await fetch(API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': chave,
        'anthropic-version': VERSAO_API,
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 2000,
        system: instrucoes(hoje),
        tools: catalogoParaModelo(),
        messages: mensagens,
      }),
    })

    const json = (await r.json()) as RespostaCrua
    if (!r.ok) {
      throw new Error(json.error?.message ?? `A API respondeu ${r.status}.`)
    }

    tokensEntrada += json.usage?.input_tokens ?? 0
    tokensSaida += json.usage?.output_tokens ?? 0

    const blocos = json.content ?? []
    texto = blocos
      .filter((b): b is BlocoTexto => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    const pedidos = blocos.filter((b): b is BlocoFerramenta => b.type === 'tool_use')
    if (pedidos.length === 0) break

    mensagens.push({ role: 'assistant', content: blocos })

    // Cada ferramenta roda no ERP, com o resultado devolvido ao modelo como
    // CONTEÚDO — nunca como instrução. É a defesa contra o dado do banco
    // conter texto que tente mandar no assistente (seção 11 do escopo).
    const resultados = await Promise.all(
      pedidos.map(async (p) => {
        const inicio = Date.now()
        const ferramenta = FERRAMENTA_POR_NOME.get(p.name)
        if (!ferramenta) {
          usadas.push({ nome: p.name, argumentos: p.input, ms: 0, erro: 'ferramenta inexistente' })
          return {
            type: 'tool_result' as const,
            tool_use_id: p.id,
            is_error: true,
            content: `A ferramenta "${p.name}" não existe. Use apenas as do catálogo.`,
          }
        }
        try {
          const dados = await ferramenta.executar(p.input ?? {})
          usadas.push({ nome: p.name, argumentos: p.input, ms: Date.now() - inicio })
          return {
            type: 'tool_result' as const,
            tool_use_id: p.id,
            content: JSON.stringify(dados),
          }
        } catch (e) {
          const erro = e instanceof Error ? e.message : String(e)
          usadas.push({ nome: p.name, argumentos: p.input, ms: Date.now() - inicio, erro })
          // Falha de ferramenta volta como falha, não como silêncio: o modelo
          // precisa poder dizer "não consegui ler X" em vez de inventar X.
          return {
            type: 'tool_result' as const,
            tool_use_id: p.id,
            is_error: true,
            content: `Falha ao ler: ${erro}`,
          }
        }
      }),
    )

    mensagens.push({ role: 'user', content: resultados })
  }

  return {
    texto: texto || 'Não consegui montar uma resposta com os dados disponíveis.',
    ferramentas: usadas,
    tokensEntrada,
    tokensSaida,
    duracaoMs: Date.now() - comecou,
  }
}

/** Grava a interação inteira. Sem isto, o Assessor não deveria estar no ar. */
export async function auditar(dados: {
  conversaId: string | null
  usuarioId: string | null
  pergunta: string
  resposta: string | null
  ferramentas: FerramentaUsada[]
  tokensEntrada?: number
  tokensSaida?: number
  duracaoMs?: number
  erro?: string
}) {
  if (!supabaseConfigurado()) return
  await supabaseServer()
    .from('assessor_auditoria')
    .insert({
      conversa_id: dados.conversaId,
      usuario_id: dados.usuarioId,
      pergunta: dados.pergunta,
      resposta: dados.resposta,
      ferramentas: dados.ferramentas,
      modelo: MODELO,
      tokens_entrada: dados.tokensEntrada ?? null,
      tokens_saida: dados.tokensSaida ?? null,
      duracao_ms: dados.duracaoMs ?? null,
      erro: dados.erro ?? null,
    })
}
