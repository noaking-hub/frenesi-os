/**
 * Categorização financeira assistida — §4.7, §4.11 e §14 do escopo.
 *
 * É a função que mais justifica o Gerente existir e a que mais pode estragar o
 * financeiro se for feita com preguiça. Por isso ela mora aqui, pura e testada,
 * e NÃO no modelo: a categoria de um movimento decide a DRE, e uma DRE montada
 * sobre palpite de LLM é pior do que uma DRE incompleta — a incompleta pelo
 * menos se declara.
 *
 * Três regras governam o arquivo inteiro:
 *
 * 1. TRANSFERÊNCIA ENTRE CONTAS PRÓPRIAS NUNCA VIRA CATEGORIA. Dinheiro que
 *    muda de bolso não é despesa numa ponta e receita na outra; contá-lo
 *    duplicaria o resultado do mês nas duas direções.
 * 2. CONFLITO DE REGRA INTERROMPE. Quando duas regras aprovadas apontam para
 *    categorias diferentes, a resposta certa é "não sei", não "escolhi a
 *    primeira". Escolher em silêncio é como um erro de classificação vira
 *    permanente: ninguém revisa o que parece resolvido.
 * 3. CONFIANÇA É MEDIDA, NÃO ADJETIVO. Ela sai de contagem e consistência do
 *    histórico, e vem sempre com o motivo e os sinais usados — porque quem
 *    aprova em lote precisa poder discordar de um item específico.
 */

export type OrigemDaSugestao = 'regra' | 'historico' | 'nenhuma'

export interface RegraDeClassificacao {
  id: string
  /** Texto procurado na descrição/favorecido. Comparação sem acento e sem caixa. */
  padrao: string
  categoriaId: string
  categoria: string
  /** Regra pausada continua no banco e fora da automação. */
  ativa: boolean
  /** Desempata regras que casam ao mesmo tempo. Maior vence. */
  prioridade: number
  /** Limita a regra a entradas ou saídas quando o mesmo texto serve aos dois. */
  tipo?: 'entrada' | 'saida' | null
}

export interface MovimentoParaClassificar {
  id: string
  descricao: string
  favorecido: string | null
  tipo: 'entrada' | 'saida'
  valor: number
  /** Preenchido quando o ERP já casou as duas pontas de uma transferência. */
  transferenciaId: string | null
  /** Preenchido quando o movimento é o crédito de uma venda. */
  pedidoId: string | null
}

/** Um movimento já classificado, para o histórico ensinar. */
export interface ClassificacaoAnterior {
  chave: string
  categoriaId: string
  categoria: string
}

export interface Sinal {
  tipo: 'regra' | 'historico' | 'transferencia' | 'venda' | 'conflito'
  texto: string
}

export interface Sugestao {
  movimentoId: string
  categoriaId: string | null
  categoria: string | null
  /** 0 a 1. Acima do limiar configurado, o modo Assistido pode aplicar sozinho. */
  confianca: number
  origem: OrigemDaSugestao
  motivo: string
  sinais: Sinal[]
  /** Verdadeiro quando o caso exige olho humano mesmo com confiança alta. */
  exigeRevisao: boolean
}

/**
 * Normaliza texto para comparar.
 *
 * Sem acento, sem caixa e sem os ruídos que os bancos acrescentam — número de
 * documento, data embutida, sequencial. Sem isso, "PIX ENVIADO 12/08 CORREIOS"
 * e "PIX ENVIADO 19/08 CORREIOS" seriam dois favorecidos diferentes e o
 * histórico nunca aprenderia nada.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\d{2}\/\d{2}(\/\d{2,4})?/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A chave que agrupa movimentos "do mesmo tipo" para o histórico.
 *
 * Favorecido quando existe, porque é o identificador mais estável; descrição
 * normalizada quando não. O tipo entra na chave porque a MESMA contraparte pode
 * ser despesa num sentido e receita no outro — um reembolso do fornecedor não
 * é a mesma coisa que uma compra dele.
 */
export function chaveDoMovimento(m: {
  descricao: string
  favorecido: string | null
  tipo: 'entrada' | 'saida'
}): string {
  const base = m.favorecido?.trim() ? normalizar(m.favorecido) : normalizar(m.descricao)
  return `${m.tipo}:${base}`
}

/** Confiança mínima para o modo Assistido sequer considerar aplicar sozinho. */
export const LIMIAR_PADRAO = 0.95

/** Quantas ocorrências o histórico precisa antes de valer como evidência. */
const MINIMO_DE_HISTORICO = 3

export interface EntradaDaSugestao {
  movimento: MovimentoParaClassificar
  regras: RegraDeClassificacao[]
  /** Todas as classificações anteriores; a função agrupa por conta própria. */
  historico: ClassificacaoAnterior[]
}

export function sugerirCategoriaDoMovimento(e: EntradaDaSugestao): Sugestao {
  const { movimento: m } = e
  const vazia = (motivo: string, sinais: Sinal[], exigeRevisao = true): Sugestao => ({
    movimentoId: m.id,
    categoriaId: null,
    categoria: null,
    confianca: 0,
    origem: 'nenhuma',
    motivo,
    sinais,
    exigeRevisao,
  })

  // Regra 1, e ela vem antes de tudo: transferência interna não tem categoria.
  if (m.transferenciaId) {
    return {
      ...vazia(
        'Transferência entre contas próprias: o dinheiro mudou de conta, não saiu nem entrou na operação. Classificar viraria despesa de um lado e receita do outro, dobrando o resultado do mês.',
        [{ tipo: 'transferencia', texto: `Par de transferência ${m.transferenciaId}` }],
        false,
      ),
    }
  }

  // Crédito de venda também não é categoria livre: a receita já é contada pelo
  // pedido, e classificar de novo somaria a mesma venda duas vezes.
  if (m.pedidoId && m.tipo === 'entrada') {
    return {
      ...vazia(
        `Crédito do pedido ${m.pedidoId}: a receita já entra pela venda. Uma categoria aqui contaria o mesmo dinheiro duas vezes.`,
        [{ tipo: 'venda', texto: `Vinculado ao pedido ${m.pedidoId}` }],
        false,
      ),
    }
  }

  const alvo = `${normalizar(m.descricao)} ${normalizar(m.favorecido ?? '')}`.trim()

  const casadas = e.regras
    .filter((r) => r.ativa)
    .filter((r) => !r.tipo || r.tipo === m.tipo)
    .filter((r) => {
      const p = normalizar(r.padrao)
      return p.length > 0 && alvo.includes(p)
    })

  if (casadas.length > 0) {
    const maiorPrioridade = Math.max(...casadas.map((r) => r.prioridade))
    const noTopo = casadas.filter((r) => r.prioridade === maiorPrioridade)
    const categoriasDistintas = new Set(noTopo.map((r) => r.categoriaId))

    // Regra 2: empate entre categorias diferentes PARA a automação.
    if (categoriasDistintas.size > 1) {
      return vazia(
        `Duas regras de mesma prioridade apontam para categorias diferentes (${noTopo
          .map((r) => r.categoria)
          .join(' e ')}). Escolher uma em silêncio transformaria um conflito em erro permanente.`,
        noTopo.map((r) => ({ tipo: 'conflito' as const, texto: `"${r.padrao}" → ${r.categoria}` })),
      )
    }

    const vencedora = noTopo[0]
    return {
      movimentoId: m.id,
      categoriaId: vencedora.categoriaId,
      categoria: vencedora.categoria,
      // Regra aprovada é determinística: a confiança é do usuário que a criou,
      // não do modelo. Por isso 1, e não um número inventado abaixo disso.
      confianca: 1,
      origem: 'regra',
      motivo: `Regra aprovada "${vencedora.padrao}" → ${vencedora.categoria}.`,
      sinais: [{ tipo: 'regra', texto: `Padrão "${vencedora.padrao}"` }],
      exigeRevisao: false,
    }
  }

  // Histórico: o que ESTE favorecido virou nas outras vezes.
  const chave = chaveDoMovimento(m)
  const iguais = e.historico.filter((h) => h.chave === chave)

  if (iguais.length === 0) {
    return vazia(
      'Sem regra e sem histórico para esta contraparte: é a primeira vez que este movimento aparece.',
      [],
    )
  }

  const contagem = new Map<string, { categoria: string; n: number }>()
  for (const h of iguais) {
    const atual = contagem.get(h.categoriaId) ?? { categoria: h.categoria, n: 0 }
    atual.n += 1
    contagem.set(h.categoriaId, atual)
  }

  const ordenadas = [...contagem.entries()].sort((a, b) => b[1].n - a[1].n)
  const [categoriaId, lider] = ordenadas[0]
  const consistencia = lider.n / iguais.length

  // Poucas ocorrências ou histórico dividido: sugere, mas não com força para
  // rodar sozinho. Uma contraparte classificada de dois jeitos é justamente o
  // caso em que a automação erraria metade das vezes com ar de certeza.
  const poucoHistorico = iguais.length < MINIMO_DE_HISTORICO
  const dividido = consistencia < 1

  // A confiança é o produto de consistência por maturidade: dez ocorrências
  // todas iguais valem mais que três, e três divididas valem menos que ambas.
  const maturidade = Math.min(1, iguais.length / (MINIMO_DE_HISTORICO * 2))
  const confianca = Math.round(consistencia * (0.6 + 0.4 * maturidade) * 100) / 100

  return {
    movimentoId: m.id,
    categoriaId,
    categoria: lider.categoria,
    confianca,
    origem: 'historico',
    motivo:
      `Esta contraparte foi classificada como ${lider.categoria} em ${lider.n} de ` +
      `${iguais.length} ${iguais.length === 1 ? 'vez' : 'vezes'}.` +
      (dividido
        ? ` Nas outras foi ${ordenadas
            .slice(1)
            .map((o) => `${o[1].categoria} (${o[1].n})`)
            .join(', ')}.`
        : ''),
    sinais: [
      { tipo: 'historico', texto: `${iguais.length} movimento(s) anteriores da mesma contraparte` },
      ...(dividido ? [{ tipo: 'conflito' as const, texto: 'Histórico não é unânime' }] : []),
    ],
    exigeRevisao: poucoHistorico || dividido,
  }
}

/** Aplica a sugestão a uma lista inteira, mantendo a ordem de entrada. */
export function sugerirEmLote(
  movimentos: MovimentoParaClassificar[],
  regras: RegraDeClassificacao[],
  historico: ClassificacaoAnterior[],
): Sugestao[] {
  return movimentos.map((movimento) => sugerirCategoriaDoMovimento({ movimento, regras, historico }))
}

export type ModoDeAutonomia = 'sugestao' | 'assistido' | 'regra_aprovada'

export interface PoliticaDeAutonomia {
  modo: ModoDeAutonomia
  limiar: number
}

/**
 * Quem pode ser aplicado SEM confirmação item a item — §15 e §8.4.
 *
 * A ordem dos testes é a política:
 * - `sugestao`: nada roda sozinho. É o padrão, e é onde toda implantação começa.
 * - `regra_aprovada`: só o que veio de regra determinística que o usuário
 *   aprovou. A autonomia é dele, não do sistema.
 * - `assistido`: acrescenta o histórico acima do limiar — e mesmo assim nunca
 *   o que está marcado como exigindo revisão, que é o ponto da marca.
 */
export function podeAplicarSozinho(s: Sugestao, p: PoliticaDeAutonomia): boolean {
  if (!s.categoriaId) return false
  if (s.exigeRevisao) return false
  if (p.modo === 'sugestao') return false
  if (p.modo === 'regra_aprovada') return s.origem === 'regra'
  return s.confianca >= p.limiar
}

export interface ResumoDoLote {
  total: number
  aplicaveis: number
  paraRevisao: number
  semSugestao: number
  valorAplicavel: number
  valorTotal: number
  porCategoria: { categoria: string; qtd: number; valor: number }[]
}

/**
 * A prévia do lote — §8.1 e §4.12.
 *
 * Quem aprova cem classificações de uma vez precisa ver ANTES quantos
 * registros, quanto dinheiro e quais categorias. Sem esse resumo, "aprovar
 * tudo" é um clique no escuro, e o escuro é onde erro em massa acontece.
 */
export function resumirLote(
  sugestoes: Sugestao[],
  valores: Map<string, number>,
  politica: PoliticaDeAutonomia,
): ResumoDoLote {
  const aplicaveis = sugestoes.filter((s) => podeAplicarSozinho(s, politica))
  const porCategoria = new Map<string, { categoria: string; qtd: number; valor: number }>()

  for (const s of aplicaveis) {
    if (!s.categoria) continue
    const atual = porCategoria.get(s.categoria) ?? { categoria: s.categoria, qtd: 0, valor: 0 }
    atual.qtd += 1
    atual.valor = arredondar(atual.valor + (valores.get(s.movimentoId) ?? 0))
    porCategoria.set(s.categoria, atual)
  }

  return {
    total: sugestoes.length,
    aplicaveis: aplicaveis.length,
    paraRevisao: sugestoes.filter((s) => s.categoriaId && !podeAplicarSozinho(s, politica)).length,
    semSugestao: sugestoes.filter((s) => !s.categoriaId).length,
    valorAplicavel: arredondar(
      aplicaveis.reduce((a, s) => a + (valores.get(s.movimentoId) ?? 0), 0),
    ),
    valorTotal: arredondar(
      sugestoes.reduce((a, s) => a + (valores.get(s.movimentoId) ?? 0), 0),
    ),
    porCategoria: [...porCategoria.values()].sort((a, b) => b.valor - a.valor),
  }
}

function arredondar(v: number): number {
  return Math.round(v * 100) / 100
}
