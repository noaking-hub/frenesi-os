import 'server-only'

import { brl, podeAplicarSozinho, type RetornoDaFerramenta } from '@/domain'

import { criarAcaoPendente, registrarExecutor, type PreviaDaAcao } from './acoes'
import {
  analisarLancamentos,
  classificarLancamentos,
  criarRegraDeClassificacao,
  desfazerClassificacao,
  lerCategoriasAtivas,
  lerRegrasDeClassificacao,
} from './financeiro'
import { lerConfiguracaoDoGerente } from './politica'
import type { ContextoDaExecucao, Ferramenta } from './ferramentas'

/**
 * As ferramentas de ESCRITA — Fase 3 do escopo.
 *
 * Cada uma existe em duas metades e a separação é o desenho todo:
 *
 * - `prever` roda quando a política diz "exige confirmação". Ela resolve os
 *   registros de verdade, calcula o impacto, grava uma ação pendente ASSINADA
 *   e devolve ao modelo um texto que descreve o que aconteceria. Nada muda.
 * - o EXECUTOR roda depois, quando um humano clica em aprovar — e roda sem
 *   passar pelo modelo de novo. Entre a prévia e a execução não existe espaço
 *   para reinterpretação: o que roda é o que foi assinado.
 *
 * Nenhuma delas grava direto: a escrita mora numa função do banco que registra
 * o dado e a mutação na mesma transação.
 */

const ESCRITA_B: Pick<Ferramenta, 'modo' | 'risco' | 'permissoes' | 'timeoutMs' | 'idempotente'> = {
  modo: 'WRITE',
  risco: 'B',
  permissoes: ['financeiro.escrever'],
  timeoutMs: 20_000,
  idempotente: true,
}

function textoDaPrevia(p: PreviaDaAcao, acaoId: string, validaAte: string): RetornoDaFerramenta {
  const minutos = Math.max(1, Math.round((new Date(validaAte).getTime() - Date.now()) / 60_000))
  return {
    resumo:
      `PRÉVIA — nada foi gravado. ${p.titulo}. ` +
      `Aguardando confirmação do usuário na tela (validade de ${minutos} min).`,
    totais: Object.fromEntries(p.linhas.map((l) => [l.rotulo, l.valor])),
    itens: p.amostra,
    metadados: {
      acaoPendenteId: acaoId,
      validaAte,
      reversivel: p.reversivel,
      efeitos: p.efeitos,
      instrucao:
        'Você NÃO executou nada. Apresente a prévia e diga que o usuário precisa aprovar no cartão de ação que apareceu na tela.',
    },
  }
}

// ── Classificação financeira ───────────────────────────────────────────────

const classificarEmLote: Ferramenta = {
  ...ESCRITA_B,
  nome: 'classificar_lancamentos_em_lote',
  versao: '1.0.0',
  descricao:
    'Classifica os movimentos financeiros sem categoria que a análise considerou seguros. ' +
    'NÃO grava na hora: monta uma prévia com quantidade, valor e categorias, e espera a ' +
    'aprovação do usuário. Use depois de analisar_lancamentos.',
  parametros: {
    type: 'object',
    properties: {
      categoriaId: {
        type: 'string',
        description:
          'Opcional. Quando informado, classifica TODOS os selecionados nesta categoria. ' +
          'Sem ele, usa a categoria que a análise sugeriu para cada movimento.',
      },
      apenasRegras: {
        type: 'boolean',
        description: 'Restringe aos movimentos que casaram com regra aprovada.',
      },
    },
  },
  executar: async () => ({
    resumo:
      'Esta ferramenta não executa direto: ela exige prévia e confirmação. Chame-a normalmente que o ERP monta a prévia.',
  }),
  prever: async (args, ctx) => {
    const analise = await analisarLancamentos(300)
    const politica = { modo: analise.politica.modo, limiar: analise.politica.limiar } as Parameters<
      typeof podeAplicarSozinho
    >[1]

    const candidatos = analise.sugestoes
      .filter((s) => s.categoriaId)
      .filter((s) => (args.apenasRegras ? s.origem === 'regra' : true))
      // No modo "sugestão" nada é aplicável sozinho — mas o LOTE aprovado à mão
      // é justamente a confirmação que falta. Por isso a prévia aceita tudo que
      // tem categoria e deixa a política decidir só o que roda SEM aprovação.
      .filter((s) => !s.exigeRevisao || podeAplicarSozinho(s, politica))

    const alvo = args.categoriaId ? String(args.categoriaId) : null
    const selecionados = alvo
      ? analise.sugestoes.filter((s) => !s.exigeRevisao)
      : candidatos

    if (selecionados.length === 0) {
      return {
        resumo:
          'Nenhum movimento está pronto para classificação em lote: ou não há sugestão, ou todos ' +
          'exigem revisão individual. Chame analisar_lancamentos para ver os motivos.',
        totais: { fila: analise.resumo.total, semSugestao: analise.resumo.semSugestao },
      }
    }

    // Um lote por categoria: aprovar "23 movimentos" de cinco categorias
    // diferentes num clique só esconderia exatamente a informação que decide.
    const porCategoria = new Map<string, typeof selecionados>()
    for (const s of selecionados) {
      const chave = alvo ?? s.categoriaId!
      porCategoria.set(chave, [...(porCategoria.get(chave) ?? []), s])
    }

    const categorias = await lerCategoriasAtivas()
    const nomeDe = new Map(categorias.map((c) => [c.id, c.nome]))

    const criadas: { categoria: string; qtd: number; valor: number; acaoId: string }[] = []
    for (const [categoriaId, itens] of porCategoria) {
      const valor = arredondar(itens.reduce((a, s) => a + s.valor, 0))
      const nome = nomeDe.get(categoriaId) ?? categoriaId
      const previa: PreviaDaAcao = {
        titulo: `Classificar ${itens.length} movimento(s) como ${nome}`,
        linhas: [
          { rotulo: 'Movimentos', valor: String(itens.length) },
          { rotulo: 'Valor somado', valor: brl(valor) },
          { rotulo: 'Categoria', valor: nome },
          {
            rotulo: 'Origem da sugestão',
            valor: resumirOrigens(itens.map((s) => s.origem)),
          },
        ],
        amostra: itens.slice(0, 8).map((s) => ({
          descricao: s.descricao,
          valor: s.valor,
          nota: s.motivo,
        })),
        efeitos: [
          'A DRE do mês passa a contar estes movimentos na categoria escolhida.',
          'Nada é enviado para fora do ERP.',
        ],
        reversivel: true,
      }

      const { id, validaAte } = await criarAcaoPendente({
        ator: ctx.ator,
        canal: ctx.canal,
        traceId: ctx.traceId,
        conversaId: ctx.conversaId,
        ferramenta: 'classificar_lancamentos_em_lote',
        versaoDaFerramenta: '1.0.0',
        parametros: { ids: itens.map((s) => s.movimentoId).sort(), categoriaId },
        risco: 'B',
        previa,
      })
      criadas.push({ categoria: nome, qtd: itens.length, valor, acaoId: id })
      if (criadas.length === 1 && porCategoria.size === 1) {
        return textoDaPrevia(previa, id, validaAte)
      }
    }

    return {
      resumo:
        `PRÉVIA — nada foi gravado. ${criadas.length} lote(s) montado(s), somando ` +
        `${criadas.reduce((a, c) => a + c.qtd, 0)} movimento(s). Cada um espera aprovação separada.`,
      totais: {
        lotes: criadas.length,
        movimentos: criadas.reduce((a, c) => a + c.qtd, 0),
        valor: arredondar(criadas.reduce((a, c) => a + c.valor, 0)),
      },
      itens: criadas,
      metadados: {
        instrucao:
          'Você NÃO executou nada. Liste os lotes e diga que cada um precisa ser aprovado na tela.',
      },
    }
  },
}

registrarExecutor('classificar_lancamentos_em_lote', async ({ acao, ator, canal, traceId, chaveDeIdempotencia }) => {
  const ids = (acao.parametros.ids ?? []) as string[]
  const categoriaId = String(acao.parametros.categoriaId)
  const r = await classificarLancamentos({
    ids,
    categoriaId,
    ator,
    canal,
    traceId,
    conversaId: acao.conversaId,
    confirmacao: 'explicita',
    chaveBase: chaveDeIdempotencia,
  })
  return {
    recibo:
      `${r.aplicados} movimento(s) classificados como ${r.categoria}` +
      (r.ignorados > 0 ? `; ${r.ignorados} ignorado(s) por já estarem gravados ou não serem classificáveis` : '') +
      '.',
    detalhes: { aplicados: r.aplicados, ignorados: r.ignorados, categoria: r.categoria },
    undoId: r.batchId,
  }
})

// ── Regra de classificação ─────────────────────────────────────────────────

const criarRegra: Ferramenta = {
  ...ESCRITA_B,
  nome: 'criar_regra_classificacao',
  versao: '1.0.0',
  descricao:
    'Transforma uma instrução do usuário ("sempre categorize Melhor Envio como Frete") numa ' +
    'regra determinística. NÃO grava na hora: mostra a condição, o efeito e quantos movimentos ' +
    'em aberto ela pegaria, e espera aprovação.',
  parametros: {
    type: 'object',
    properties: {
      padrao: { type: 'string', description: 'Texto procurado na descrição ou no favorecido.' },
      categoriaId: { type: 'string', description: 'Id da categoria de destino.' },
      tipo: {
        type: 'string',
        enum: ['entrada', 'saida'],
        description: 'Restringe a regra a um sentido. Omita para valer nos dois.',
      },
      prioridade: { type: 'integer', description: 'Desempata regras concorrentes. Maior vence.' },
    },
    required: ['padrao', 'categoriaId'],
  },
  executar: async () => ({ resumo: 'Esta ferramenta exige prévia e confirmação.' }),
  prever: async (args, ctx) => {
    const categorias = await lerCategoriasAtivas()
    const cat = categorias.find((c) => c.id === String(args.categoriaId))
    if (!cat) {
      return {
        resumo: `Categoria "${args.categoriaId}" não existe ou está inativa.`,
        itens: categorias.slice(0, 30),
        metadados: { dica: 'Use um dos ids listados.' },
      }
    }

    const padrao = String(args.padrao ?? '').trim()
    if (padrao.length < 3) {
      return {
        resumo:
          'Padrão curto demais. Um texto de uma ou duas letras casaria com quase tudo e ' +
          'classificaria em massa o que não devia.',
      }
    }

    const analise = await analisarLancamentos(500)
    const tipo = args.tipo ? (String(args.tipo) as 'entrada' | 'saida') : null
    const casariam = analise.sugestoes.filter(
      (s) =>
        (!tipo || tipo === s.tipo) &&
        s.descricao.toLowerCase().includes(padrao.toLowerCase()),
    )

    const regras = await lerRegrasDeClassificacao()
    const conflitantes = regras.filter(
      (r) => r.ativa && r.categoriaId !== cat.id && padrao.toLowerCase().includes(r.padrao.toLowerCase()),
    )

    const previa: PreviaDaAcao = {
      titulo: `Criar regra "${padrao}" → ${cat.nome}`,
      linhas: [
        { rotulo: 'Condição', valor: `descrição ou favorecido contém "${padrao}"` },
        { rotulo: 'Categoria', valor: cat.nome },
        { rotulo: 'Sentido', valor: tipo ?? 'entradas e saídas' },
        { rotulo: 'Pegaria agora', valor: `${casariam.length} movimento(s) em aberto` },
      ],
      amostra: casariam.slice(0, 8).map((s) => ({ descricao: s.descricao, valor: s.valor })),
      efeitos: [
        'A regra passa a valer para movimentos FUTUROS automaticamente conforme o modo de autonomia.',
        'Os movimentos já em aberto continuam esperando classificação — a regra não os grava sozinha.',
        ...(conflitantes.length > 0
          ? [
              `Atenção: ${conflitantes.length} regra(s) existente(s) podem conflitar — ` +
                conflitantes.map((r) => `"${r.padrao}" → ${r.categoria}`).join(', '),
            ]
          : []),
      ],
      reversivel: true,
    }

    const { id, validaAte } = await criarAcaoPendente({
      ator: ctx.ator,
      canal: ctx.canal,
      traceId: ctx.traceId,
      conversaId: ctx.conversaId,
      ferramenta: 'criar_regra_classificacao',
      versaoDaFerramenta: '1.0.0',
      parametros: {
        padrao,
        categoriaId: cat.id,
        tipo,
        prioridade: Number(args.prioridade ?? 0),
      },
      risco: 'B',
      previa,
    })
    return textoDaPrevia(previa, id, validaAte)
  },
}

registrarExecutor('criar_regra_classificacao', async ({ acao, ator, traceId }) => {
  const r = await criarRegraDeClassificacao({
    padrao: String(acao.parametros.padrao),
    categoriaId: String(acao.parametros.categoriaId),
    tipo: (acao.parametros.tipo ?? null) as 'entrada' | 'saida' | null,
    prioridade: Number(acao.parametros.prioridade ?? 0),
    ator,
    traceId,
  })
  return {
    recibo: `Regra criada: "${acao.parametros.padrao}" → ${r.categoria}. Ela casaria com ${r.casariam} movimento(s) em aberto.`,
    detalhes: { regraId: r.id, categoria: r.categoria, casariam: r.casariam },
  }
})

// ── Desfazer ───────────────────────────────────────────────────────────────

const desfazer: Ferramenta = {
  modo: 'WRITE',
  risco: 'A',
  permissoes: ['financeiro.escrever'],
  timeoutMs: 20_000,
  idempotente: true,
  nome: 'desfazer_classificacao',
  versao: '1.0.0',
  descricao:
    'Reverte um lote de classificação já aplicado, devolvendo cada movimento à categoria ' +
    'anterior. O histórico não é apagado: a reversão vira uma nova linha de auditoria.',
  parametros: {
    type: 'object',
    properties: {
      loteId: { type: 'string', description: 'Id do lote devolvido no recibo da classificação.' },
    },
    required: ['loteId'],
  },
  // Risco A executa após comando explícito, sem prévia — é reversível por
  // natureza e exigir confirmação para desfazer atrapalharia justamente quem
  // está corrigindo um erro com pressa.
  executar: async (args, ctx) => {
    const revertidos = await desfazerClassificacao({
      batchId: String(args.loteId),
      ator: ctx.ator,
      canal: ctx.canal,
      traceId: ctx.traceId,
    })
    return {
      resumo:
        revertidos > 0
          ? `${revertidos} movimento(s) voltaram à categoria anterior.`
          : 'Nada foi revertido: o lote não existe ou já tinha sido desfeito.',
      totais: { revertidos },
    } satisfies RetornoDaFerramenta
  },
}

// ── Leituras de apoio da Fase 3 ────────────────────────────────────────────

const analisar: Ferramenta = {
  modo: 'READ',
  risco: 'A',
  permissoes: [],
  timeoutMs: 20_000,
  idempotente: true,
  nome: 'analisar_lancamentos',
  versao: '1.0.0',
  descricao:
    'Fila de movimentos financeiros SEM categoria, com a sugestão do ERP para cada um: ' +
    'categoria, confiança, origem (regra ou histórico) e o motivo. Diz quantos podem ser ' +
    'classificados em lote e quantos exigem olho humano. Use antes de propor classificação.',
  parametros: {
    type: 'object',
    properties: { limite: { type: 'integer', description: 'Quantos analisar. Padrão 200.' } },
  },
  executar: async (args) => {
    const a = await analisarLancamentos(Number(args.limite ?? 200))
    return {
      resumo:
        `${a.resumo.total} movimento(s) sem categoria somando ${brl(a.resumo.valorTotal)}. ` +
        `${a.resumo.aplicaveis} podem ser aplicados no modo atual (${a.politica.modo}), ` +
        `${a.resumo.paraRevisao} exigem revisão e ${a.resumo.semSugestao} não têm sugestão.`,
      totais: {
        total: a.resumo.total,
        aplicaveis: a.resumo.aplicaveis,
        paraRevisao: a.resumo.paraRevisao,
        semSugestao: a.resumo.semSugestao,
        valorTotal: a.resumo.valorTotal,
        valorAplicavel: a.resumo.valorAplicavel,
      },
      itens: a.sugestoes.slice(0, 25).map((s) => ({
        movimentoId: s.movimentoId,
        descricao: s.descricao,
        valor: s.valor,
        categoriaSugerida: s.categoria,
        confianca: s.confianca,
        origem: s.origem,
        exigeRevisao: s.exigeRevisao,
        motivo: s.motivo,
      })),
      metadados: {
        politica: a.politica,
        porCategoria: a.resumo.porCategoria,
        regra:
          'Transferência entre contas próprias e crédito de venda nunca recebem categoria: ' +
          'contá-los duplicaria receita ou despesa.',
      },
    } satisfies RetornoDaFerramenta
  },
}

const listarRegras: Ferramenta = {
  modo: 'READ',
  risco: 'A',
  permissoes: [],
  timeoutMs: 10_000,
  idempotente: true,
  nome: 'listar_regras_classificacao',
  versao: '1.0.0',
  descricao: 'Regras de classificação ativas e pausadas, com padrão, categoria e prioridade.',
  parametros: { type: 'object', properties: {} },
  executar: async () => {
    const regras = await lerRegrasDeClassificacao()
    const config = await lerConfiguracaoDoGerente()
    return {
      resumo: `${regras.filter((r) => r.ativa).length} regra(s) ativa(s) de ${regras.length}.`,
      itens: regras,
      metadados: {
        modoDeAutonomia: config.modoAutonomia,
        limiar: config.limiarConfianca,
        escritaLiberada: config.escritaLiberada,
      },
    } satisfies RetornoDaFerramenta
  },
}

const listarCategorias: Ferramenta = {
  modo: 'READ',
  risco: 'A',
  permissoes: [],
  timeoutMs: 10_000,
  idempotente: true,
  nome: 'listar_categorias',
  versao: '1.0.0',
  descricao:
    'Categorias financeiras ativas com id e natureza. Use para achar o id certo antes de ' +
    'propor uma classificação ou uma regra — nunca invente um id.',
  parametros: { type: 'object', properties: {} },
  executar: async () => {
    const c = await lerCategoriasAtivas()
    return {
      resumo: `${c.length} categoria(s) ativa(s).`,
      itens: c,
    } satisfies RetornoDaFerramenta
  },
}

export const FERRAMENTAS_FINANCEIRAS: Ferramenta[] = [
  analisar,
  listarRegras,
  listarCategorias,
  classificarEmLote,
  criarRegra,
  desfazer,
]

function arredondar(v: number): number {
  return Math.round(v * 100) / 100
}

function resumirOrigens(origens: string[]): string {
  const n = new Map<string, number>()
  for (const o of origens) n.set(o, (n.get(o) ?? 0) + 1)
  return [...n.entries()].map(([o, q]) => `${q} por ${o}`).join(', ')
}

export type { ContextoDaExecucao }
