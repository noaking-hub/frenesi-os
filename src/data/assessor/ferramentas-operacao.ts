import 'server-only'

import { carregarEstoque } from '@/data/consultas'
import { carregarVisaoFinanceira } from '@/data/financeiro'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { brl, simularCompraDeBase, simularImpactoNoCaixa, type RetornoDaFerramenta } from '@/domain'

import { criarAcaoPendente, registrarExecutor, type PreviaDaAcao } from './acoes'
import type { Ferramenta } from './ferramentas'

/**
 * Escrita OPERACIONAL — Fase 4 do escopo.
 *
 * A fronteira desta fase é a que o escopo desenha em §34: a IA prepara a
 * decisão de compra inteira, e para antes do dinheiro. Pagamento bancário e
 * transferência externa são classe D — a política os nega para qualquer
 * usuário, sempre, e por isso nem aparecem como ferramenta aqui.
 *
 * O que ela cria é uma SOLICITAÇÃO: produto, quantidade, custo previsto,
 * cobertura antes e depois, e o efeito no caixa projetado. Tudo já apurado pelo
 * ERP, nada estimado pelo modelo.
 */

const ESCRITA_B: Pick<Ferramenta, 'modo' | 'risco' | 'permissoes' | 'timeoutMs' | 'idempotente'> = {
  modo: 'WRITE',
  risco: 'B',
  permissoes: ['estoque.escrever'],
  timeoutMs: 20_000,
  idempotente: true,
}

const recomendarReposicao: Ferramenta = {
  modo: 'READ',
  risco: 'A',
  permissoes: [],
  timeoutMs: 20_000,
  idempotente: true,
  nome: 'recomendacoes_reposicao',
  versao: '1.0.0',
  descricao:
    'Lista priorizada do que repor ANTES de faltar, cruzando cobertura, consumo, custo e o ' +
    'caixa projetado. Cada item traz a quantidade sugerida, o custo estimado, a cobertura que ' +
    'a compra geraria e se ela cabe no caixa. Use antes de propor qualquer compra.',
  parametros: {
    type: 'object',
    properties: {
      horizonteDias: {
        type: 'integer',
        description: 'Cobertura alvo em dias. Padrão 45.',
      },
      limite: { type: 'integer', description: 'Quantos itens trazer. Padrão 10.' },
    },
  },
  executar: async (args) => {
    const horizonte = Math.min(180, Math.max(7, Number(args.horizonteDias ?? 45)))
    const limite = Math.min(30, Math.max(1, Number(args.limite ?? 10)))
    const [estoque, visao] = await Promise.all([carregarEstoque(), carregarVisaoFinanceira()])

    // Só quem TEM ritmo de saída entra: base sem consumo não tem risco de
    // ruptura, e recomendá-la seria imobilizar capital sem motivo.
    const candidatas = estoque.coberturas
      .filter((c) => c.dias !== null && c.dias < horizonte)
      .slice(0, limite)

    const itens = candidatas.map((c) => {
      const consumoDiario = c.dias && c.dias > 0 ? c.disponivelMl / c.dias : 0
      const alvoMl = Math.max(0, Math.ceil(consumoDiario * horizonte - c.disponivelMl))
      const cenario = simularCompraDeBase({
        nome: c.base.nome,
        disponivelMl: c.disponivelMl,
        diasDeCobertura: c.dias,
        custoPorMl: c.base.custoPorMl,
        comprarMl: Math.max(1, alvoMl),
      })
      const custo = 'erro' in cenario ? null : cenario.custoEstimado
      return {
        baseId: c.base.id,
        base: c.base.nome,
        marca: c.base.marca,
        criticidade: c.criticidade,
        disponivelMl: c.disponivelMl,
        reservadoMl: c.reservadoMl,
        coberturaHojeDias: c.dias,
        consumoDiarioMl: Math.round(consumoDiario * 100) / 100,
        comprarMl: alvoMl,
        custoEstimado: custo,
        coberturaPosCompraDias: 'erro' in cenario ? null : cenario.coberturaDepoisDias,
      }
    })

    const desembolso = itens.reduce((a, i) => a + (i.custoEstimado ?? 0), 0)
    const caixa = simularImpactoNoCaixa({
      caixaHoje: visao.caixaHoje,
      menorSaldoProjetado: visao.projecao.menorSaldo,
      menorSaldoEm: visao.projecao.menorSaldoEm,
      desembolso,
    })

    return {
      resumo:
        `${itens.length} base(s) abaixo de ${horizonte} dias de cobertura. ` +
        `Repor todas custaria ${brl(desembolso)} — ${caixa.veredito}`,
      totais: {
        itens: itens.length,
        desembolsoTotal: Math.round(desembolso * 100) / 100,
        menorSaldoDepois: caixa.menorSaldoDepois,
        cabeNoCaixa: caixa.cabeNoCaixa ? 1 : 0,
      },
      itens,
      metadados: {
        horizonteDias: horizonte,
        regraDeCaixa:
          'O veredito usa o MENOR saldo projetado do período, não o saldo de hoje: há dinheiro ' +
          'hoje e pode não haver na data do vencimento.',
        observacao:
          'Só entram bases com compra de frasco/lote registrada e com consumo no período.',
      },
    } satisfies RetornoDaFerramenta
  },
}

const criarSolicitacao: Ferramenta = {
  ...ESCRITA_B,
  nome: 'criar_solicitacao_compra',
  versao: '1.0.0',
  descricao:
    'Cria uma solicitação interna de compra de perfume base, já preenchida com quantidade, ' +
    'custo previsto, cobertura pós-compra e impacto no caixa. NÃO efetua pagamento nem compra: ' +
    'gera o registro para um humano executar. Exige aprovação.',
  parametros: {
    type: 'object',
    properties: {
      base: { type: 'string', description: 'Nome do perfume base, como no estoque.' },
      quantidadeMl: { type: 'number', description: 'Quanto comprar, em ml.' },
      fornecedor: { type: 'string', description: 'Fornecedor sugerido, quando houver.' },
      justificativa: { type: 'string', description: 'Por que comprar agora.' },
    },
    required: ['base', 'quantidadeMl'],
  },
  executar: async () => ({ resumo: 'Esta ferramenta exige prévia e confirmação.' }),
  prever: async (args, ctx) => {
    const alvo = String(args.base ?? '').toLowerCase()
    const [estoque, visao] = await Promise.all([carregarEstoque(), carregarVisaoFinanceira()])
    const c =
      estoque.coberturas.find((x) => x.base.nome.toLowerCase() === alvo) ??
      estoque.coberturas.find((x) => x.base.nome.toLowerCase().includes(alvo))

    if (!c) {
      return {
        resumo: `Não encontrei "${args.base}" entre as bases sob controle de estoque.`,
        metadados: { dica: 'Use estoque_e_cobertura para ver os nomes exatos.' },
      }
    }

    const quantidade = Number(args.quantidadeMl)
    const cenario = simularCompraDeBase({
      nome: c.base.nome,
      disponivelMl: c.disponivelMl,
      diasDeCobertura: c.dias,
      custoPorMl: c.base.custoPorMl,
      comprarMl: quantidade,
    })
    if ('erro' in cenario) return { resumo: cenario.erro }

    const caixa = simularImpactoNoCaixa({
      caixaHoje: visao.caixaHoje,
      menorSaldoProjetado: visao.projecao.menorSaldo,
      menorSaldoEm: visao.projecao.menorSaldoEm,
      desembolso: cenario.custoEstimado ?? 0,
    })

    const previa: PreviaDaAcao = {
      titulo: `Solicitar compra de ${quantidade} ml de ${c.base.nome}`,
      linhas: [
        { rotulo: 'Base', valor: `${c.base.nome}${c.base.marca ? ` · ${c.base.marca}` : ''}` },
        { rotulo: 'Quantidade', valor: `${quantidade} ml` },
        {
          rotulo: 'Custo estimado',
          valor: cenario.custoEstimado == null ? 'sem custo por ml registrado' : brl(cenario.custoEstimado),
        },
        { rotulo: 'Cobertura hoje', valor: `${cenario.coberturaHojeDias} dias` },
        { rotulo: 'Cobertura depois', valor: `${cenario.coberturaDepoisDias} dias` },
        { rotulo: 'Cabe no caixa?', valor: caixa.cabeNoCaixa ? 'sim' : 'NÃO' },
      ],
      efeitos: [
        'Cria uma solicitação interna com situação "aberta".',
        'NÃO efetua pagamento, não emite pedido ao fornecedor e não mexe no estoque.',
        caixa.veredito,
        ...(cenario.aviso ? [cenario.aviso] : []),
      ],
      reversivel: true,
    }

    const { id, validaAte } = await criarAcaoPendente({
      ator: ctx.ator,
      canal: ctx.canal,
      traceId: ctx.traceId,
      conversaId: ctx.conversaId,
      ferramenta: 'criar_solicitacao_compra',
      versaoDaFerramenta: '1.0.0',
      parametros: {
        baseId: c.base.id,
        baseNome: c.base.nome,
        quantidadeMl: quantidade,
        custoPorMl: cenario.custoPorMlUsado,
        custoEstimado: cenario.custoEstimado,
        fornecedor: args.fornecedor ? String(args.fornecedor) : null,
        justificativa:
          (args.justificativa ? String(args.justificativa) : '') ||
          `Cobertura de ${cenario.coberturaHojeDias} dias; a compra leva para ${cenario.coberturaDepoisDias}.`,
        coberturaDias: cenario.coberturaHojeDias,
        disponivelMl: cenario.disponivelHojeMl,
        coberturaPosCompra: cenario.coberturaDepoisDias,
        impactoNoCaixa: {
          desembolso: caixa.desembolso,
          menorSaldoAntes: caixa.menorSaldoAntes,
          menorSaldoDepois: caixa.menorSaldoDepois,
          cabeNoCaixa: caixa.cabeNoCaixa,
          veredito: caixa.veredito,
        },
      },
      risco: 'B',
      previa,
    })

    const minutos = Math.max(1, Math.round((new Date(validaAte).getTime() - Date.now()) / 60_000))
    return {
      resumo:
        `PRÉVIA — nada foi gravado. ${previa.titulo}. ${caixa.veredito} ` +
        `Aguardando aprovação na tela (validade de ${minutos} min).`,
      totais: {
        quantidadeMl: quantidade,
        custoEstimado: cenario.custoEstimado,
        coberturaHojeDias: cenario.coberturaHojeDias,
        coberturaDepoisDias: cenario.coberturaDepoisDias,
        menorSaldoDepois: caixa.menorSaldoDepois,
      },
      metadados: {
        acaoPendenteId: id,
        validaAte,
        instrucao: 'Você NÃO criou a solicitação. Apresente a prévia e peça a aprovação.',
      },
    } satisfies RetornoDaFerramenta
  },
}

registrarExecutor('criar_solicitacao_compra', async ({ acao, ator, traceId }) => {
  if (!supabaseConfigurado()) throw new Error('Supabase não configurado.')
  const p = acao.parametros
  const { data, error } = await supabaseServer()
    .from('solicitacoes_compra')
    .insert({
      base_id: p.baseId ?? null,
      base_nome: String(p.baseNome),
      quantidade_ml: Number(p.quantidadeMl),
      custo_por_ml: p.custoPorMl ?? null,
      custo_estimado: p.custoEstimado ?? null,
      fornecedor: p.fornecedor ?? null,
      cobertura_dias_no_pedido: p.coberturaDias ?? null,
      disponivel_ml_no_pedido: p.disponivelMl ?? null,
      cobertura_pos_compra_dias: p.coberturaPosCompra ?? null,
      justificativa: String(p.justificativa),
      impacto_no_caixa: p.impactoNoCaixa ?? null,
      criada_por: ator.usuarioId,
      trace_id: traceId,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return {
    recibo: `Solicitação de compra criada para ${p.baseNome} (${p.quantidadeMl} ml). Situação: aberta.`,
    detalhes: { solicitacaoId: String(data.id), base: p.baseNome, quantidadeMl: p.quantidadeMl },
  }
})

const listarSolicitacoes: Ferramenta = {
  modo: 'READ',
  risco: 'A',
  permissoes: [],
  timeoutMs: 10_000,
  idempotente: true,
  nome: 'listar_solicitacoes_compra',
  versao: '1.0.0',
  descricao: 'Solicitações internas de compra criadas, com situação, quantidade e custo previsto.',
  parametros: {
    type: 'object',
    properties: {
      situacao: { type: 'string', enum: ['aberta', 'comprada', 'cancelada'] },
    },
  },
  executar: async (args) => {
    if (!supabaseConfigurado()) return { resumo: 'Supabase não configurado.' }
    let q = supabaseServer()
      .from('solicitacoes_compra')
      .select('id, base_nome, quantidade_ml, custo_estimado, fornecedor, situacao, criada_em, justificativa')
      .order('criada_em', { ascending: false })
      .limit(30)
    if (args.situacao) q = q.eq('situacao', String(args.situacao))
    const { data, error } = await q
    if (error) throw new Error(error.message)
    const linhas = data ?? []
    return {
      resumo: `${linhas.length} solicitação(ões) de compra.`,
      totais: {
        custoTotal:
          Math.round(linhas.reduce((a, l) => a + Number(l.custo_estimado ?? 0), 0) * 100) / 100,
      },
      itens: linhas,
    } satisfies RetornoDaFerramenta
  },
}

const anotar: Ferramenta = {
  modo: 'WRITE',
  risco: 'A',
  permissoes: [],
  timeoutMs: 10_000,
  idempotente: false,
  nome: 'criar_anotacao',
  versao: '1.0.0',
  descricao:
    'Registra uma anotação num pedido, lançamento, base ou na operação em geral. ' +
    'Classe A: executa direto após comando explícito, e pode ser removida depois.',
  parametros: {
    type: 'object',
    properties: {
      alvoTipo: { type: 'string', enum: ['pedido', 'lancamento', 'base', 'geral'] },
      alvoId: { type: 'string', description: 'Id do registro. Omita quando for "geral".' },
      texto: { type: 'string', description: 'A anotação.' },
    },
    required: ['alvoTipo', 'texto'],
  },
  executar: async (args, ctx) => {
    if (!supabaseConfigurado()) throw new Error('Supabase não configurado.')
    const texto = String(args.texto ?? '').trim()
    if (texto.length < 2) return { resumo: 'Anotação vazia não é registrada.' }
    const { data, error } = await supabaseServer()
      .from('gerente_anotacoes')
      .insert({
        alvo_tipo: String(args.alvoTipo),
        alvo_id: args.alvoId ? String(args.alvoId) : null,
        texto,
        trace_id: ctx.traceId,
        criada_por: ctx.ator.usuarioId,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return {
      resumo: `Anotação registrada em ${args.alvoTipo}${args.alvoId ? ` ${args.alvoId}` : ''}.`,
      metadados: { anotacaoId: String(data.id), reversivel: true },
    } satisfies RetornoDaFerramenta
  },
}

export const FERRAMENTAS_OPERACIONAIS: Ferramenta[] = [
  recomendarReposicao,
  listarSolicitacoes,
  criarSolicitacao,
  anotar,
]
