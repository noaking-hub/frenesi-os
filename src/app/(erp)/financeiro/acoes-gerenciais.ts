'use server'

import { revalidatePath } from 'next/cache'

import { OPERADOR } from '@/data/operador'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import type { NaturezaGerencial } from '@/domain'

/**
 * Ações do Financeiro gerencial.
 *
 * Ficam separadas de `actions.ts` porque falam com o modelo novo — natureza,
 * competência, transferência, parcela — e o arquivo antigo ainda serve as
 * telas que não foram reescritas. Misturar os dois faria um `import` de
 * lançamento trazer junto o vocabulário que ele não usa mais.
 *
 * Nenhuma delas revalida `'/', 'layout'`: a revalidação global reconstrói
 * todas as rotas do ERP a cada baixa de conta, e foi o que estourou o limite
 * de 26 s da Netlify no módulo de Devoluções.
 */

export type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

function falha(e: { message?: string; details?: string }, padrao: string) {
  return { ok: false as const, erro: e.message || e.details || padrao }
}

function exigeSupabase(acao: string) {
  return supabaseConfigurado()
    ? null
    : { ok: false as const, erro: `O Supabase precisa estar configurado para ${acao}.` }
}

/** Só as rotas do módulo — o resto do ERP não muda quando um boleto é pago. */
function revalidarFinanceiro() {
  for (const rota of [
    '/financeiro',
    '/financeiro/lancamentos',
    '/financeiro/contas',
    '/financeiro/fluxo-de-caixa',
    '/financeiro/dre',
    '/financeiro/conciliacao',
    '/financeiro/categorias',
    '/financeiro/configuracoes',
  ]) {
    revalidatePath(rota)
  }
}

// ── Compromissos ───────────────────────────────────────────────────────────

export interface NovoCompromissoDados {
  descricao: string
  favorecido: string
  categoriaId: string
  contaId: string
  centroCusto: string | null
  tipo: 'entrada' | 'saida'
  valor: number
  /** Mês do fato econômico — é ele que a DRE usa. */
  competencia: string
  venceEm: string
  documento: string
  observacao: string
  recorrencia: string | null
  recorrenciaAte: string | null
  /** Já pago/recebido no ato — o caso da compra no débito. */
  baixadoNoAto: boolean
}

/**
 * Cria um compromisso com o vocabulário gerencial completo.
 *
 * Difere de `criarLancamento` (arquivo antigo) em duas coisas que mudam o
 * resultado: a categoria é escolhida por ID — o que amarra a natureza
 * gerencial e evita a categoria digitada que nunca entra na DRE — e a
 * competência é um campo do formulário, não a data de hoje. A assinatura de
 * um plano anual pago em janeiro é competência de janeiro a dezembro, e
 * carimbar tudo em janeiro é o erro que faz o mês parecer catastrófico.
 */
export async function criarCompromisso(
  dados: NovoCompromissoDados,
): Promise<Resposta<{ id: string }>> {
  const bloqueio = exigeSupabase('criar compromissos')
  if (bloqueio) return bloqueio
  if (!dados.descricao.trim()) return { ok: false, erro: 'Informe a descrição.' }
  if (!dados.categoriaId) return { ok: false, erro: 'Escolha a categoria.' }
  if (!dados.contaId) return { ok: false, erro: 'Escolha a conta.' }
  if (!(dados.valor > 0)) return { ok: false, erro: 'O valor deve ser maior que zero.' }
  if (!/^\d{4}-\d{2}$/.test(dados.competencia)) return { ok: false, erro: 'Competência inválida.' }

  const sb = supabaseServer()
  const { data: cat, error: erroCat } = await sb
    .from('categorias_financeiras')
    .select('nome, exige_documento')
    .eq('id', dados.categoriaId)
    .maybeSingle()
  if (erroCat) return falha(erroCat, 'Falha ao ler a categoria.')
  if (!cat) return { ok: false, erro: 'Categoria não encontrada.' }

  // A exigência de documento é da categoria, não da tela: quem definiu que
  // "Serviços de terceiros" precisa de nota foi quem cadastrou a categoria.
  if ((cat as { exige_documento: boolean }).exige_documento && !dados.documento.trim()) {
    return {
      ok: false,
      erro: `A categoria "${(cat as { nome: string }).nome}" exige o número do documento fiscal.`,
    }
  }

  const id = `LC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const hoje = new Date().toISOString().slice(0, 10)
  const venceEm = dados.venceEm || `${dados.competencia}-01`

  const { error } = await sb.from('lancamentos').insert({
    id,
    ocorrido_em: hoje,
    competencia: `${dados.competencia}-01`,
    vence_em: venceEm,
    baixado_em: dados.baixadoNoAto ? venceEm : null,
    descricao: dados.descricao.trim(),
    favorecido: dados.favorecido.trim() || null,
    categoria: (cat as { nome: string }).nome,
    categoria_id: dados.categoriaId,
    centro_custo: dados.centroCusto,
    conta_id: dados.contaId,
    tipo: dados.tipo,
    valor: dados.valor,
    recebido: dados.baixadoNoAto ? dados.valor : 0,
    recorrente: Boolean(dados.recorrencia),
    recorrencia: dados.recorrencia,
    recorrencia_ate: dados.recorrenciaAte,
    documento: dados.documento.trim() || null,
    observacao: dados.observacao.trim() || null,
    origem: 'Manual',
    criado_por: OPERADOR,
  })
  if (error) {
    console.error('[financeiro] criar compromisso falhou:', error)
    return falha(error, 'Falha ao criar o compromisso.')
  }

  revalidarFinanceiro()
  return { ok: true, id }
}

/**
 * Cancela sem apagar.
 *
 * Excluir some com a linha e com a explicação; cancelado some da fila de
 * trabalho e continua respondendo "o que aconteceu com aquele boleto?".
 */
export async function cancelarCompromisso(id: string, motivo: string): Promise<Resposta> {
  const bloqueio = exigeSupabase('cancelar compromissos')
  if (bloqueio) return bloqueio
  if (!motivo.trim()) return { ok: false, erro: 'Explique por que está cancelando.' }

  const { error } = await supabaseServer()
    .from('lancamentos')
    .update({ cancelado_em: new Date().toISOString(), cancelado_motivo: motivo.trim() })
    .eq('id', id)
  if (error) {
    console.error('[financeiro] cancelar compromisso falhou:', error)
    return falha(error, 'Falha ao cancelar o compromisso.')
  }

  revalidarFinanceiro()
  return { ok: true }
}

// ── Transferência ──────────────────────────────────────────────────────────

/**
 * Move dinheiro entre contas próprias — duas pernas, um só identificador.
 *
 * O ERP precisa disso como operação de primeira classe porque a alternativa
 * (uma saída avulsa aqui, uma entrada avulsa ali) aparece na DRE como despesa
 * e receita do mesmo mês: resultado final igual, todas as margens erradas.
 */
export async function registrarTransferencia(dados: {
  contaOrigem: string
  contaDestino: string
  valor: number
  data: string
  descricao: string
}): Promise<Resposta<{ id: string }>> {
  const bloqueio = exigeSupabase('registrar transferências')
  if (bloqueio) return bloqueio
  if (!dados.contaOrigem || !dados.contaDestino) return { ok: false, erro: 'Escolha as duas contas.' }
  if (dados.contaOrigem === dados.contaDestino) {
    return { ok: false, erro: 'Origem e destino são a mesma conta.' }
  }
  if (!(dados.valor > 0)) return { ok: false, erro: 'O valor deve ser maior que zero.' }

  const { data, error } = await supabaseServer().rpc('registrar_transferencia', {
    p_conta_origem: dados.contaOrigem,
    p_conta_destino: dados.contaDestino,
    p_valor: dados.valor,
    p_data: dados.data || new Date().toISOString().slice(0, 10),
    p_descricao: dados.descricao.trim() || 'Transferência entre contas',
    p_operador: OPERADOR,
  })
  if (error) {
    console.error('[financeiro] registrar_transferencia falhou:', error)
    return falha(error, 'Falha ao registrar a transferência.')
  }

  revalidarFinanceiro()
  return { ok: true, id: String(data ?? '') }
}

// ── Parcelamento ───────────────────────────────────────────────────────────

/** Quebra um compromisso em N parcelas mensais e cancela o original. */
export async function parcelarLancamento(
  id: string,
  parcelas: number,
  intervaloDias = 30,
): Promise<Resposta<{ criadas: number }>> {
  const bloqueio = exigeSupabase('parcelar lançamentos')
  if (bloqueio) return bloqueio
  if (!(parcelas >= 2)) return { ok: false, erro: 'O parcelamento exige ao menos 2 parcelas.' }
  if (parcelas > 48) return { ok: false, erro: 'No máximo 48 parcelas.' }

  const { data, error } = await supabaseServer().rpc('parcelar_lancamento', {
    p_lancamento_id: id,
    p_parcelas: parcelas,
    p_intervalo_dias: intervaloDias,
  })
  if (error) {
    console.error('[financeiro] parcelar_lancamento falhou:', error)
    return falha(error, 'Falha ao parcelar o lançamento.')
  }

  revalidarFinanceiro()
  return { ok: true, criadas: Number(data ?? 0) }
}

// ── Baixa com encargos ─────────────────────────────────────────────────────

/**
 * Baixa registrando multa, juros e desconto separados do principal.
 *
 * Somar juros ao valor original faria a despesa de energia de agosto crescer
 * retroativamente — e o que cresceu foi despesa FINANCEIRA, que é outra linha
 * da DRE e outra conversa com o contador.
 */
export async function baixarComEncargos(dados: {
  id: string
  valor: number
  data: string
  multa?: number
  juros?: number
  desconto?: number
}): Promise<Resposta<{ falta: number; quitado: boolean }>> {
  const bloqueio = exigeSupabase('dar baixa')
  if (bloqueio) return bloqueio
  if (!(dados.valor > 0)) return { ok: false, erro: 'Informe quanto foi movimentado.' }

  const sb = supabaseServer()
  const encargos = {
    multa: Math.max(0, dados.multa ?? 0),
    juros: Math.max(0, dados.juros ?? 0),
    desconto: Math.max(0, dados.desconto ?? 0),
  }

  // Os encargos entram antes da baixa: `registrar_recebimento` compara o
  // recebido com valor + encargos para decidir se quitou, e gravar depois
  // marcaria como quitado um lançamento que ainda deve os juros.
  if (encargos.multa || encargos.juros || encargos.desconto) {
    const { error } = await sb
      .from('lancamentos')
      .update(encargos)
      .eq('id', dados.id)
    if (error) {
      console.error('[financeiro] encargos falharam:', error)
      return falha(error, 'Falha ao gravar multa, juros ou desconto.')
    }
  }

  const { data, error } = await sb.rpc('registrar_recebimento', {
    p_id: dados.id,
    p_valor: dados.valor,
    p_quando: dados.data || null,
    p_operador: OPERADOR,
  })
  if (error) {
    console.error('[financeiro] registrar_recebimento falhou:', error)
    return falha(error, 'Falha ao registrar a baixa.')
  }

  const r = (data ?? {}) as { falta?: number; quitado?: boolean }
  revalidarFinanceiro()
  return { ok: true, falta: Number(r.falta ?? 0), quitado: Boolean(r.quitado) }
}

// ── Categorias ─────────────────────────────────────────────────────────────

export interface DadosCategoria {
  nome: string
  natureza: NaturezaGerencial
  impactaDre: boolean
  impactaCaixa: boolean
  exigeDocumento: boolean
  usarEmAutomacao: boolean
  contaContabil: string
  centroCusto: string | null
}

function identificador(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

/** A natureza gerencial é o campo que decide onde a categoria entra na DRE. */
export async function salvarCategoria(
  id: string | null,
  dados: DadosCategoria,
): Promise<Resposta<{ id: string }>> {
  const bloqueio = exigeSupabase('gerenciar categorias')
  if (bloqueio) return bloqueio
  if (!dados.nome.trim()) return { ok: false, erro: 'Informe o nome da categoria.' }

  const sb = supabaseServer()
  const linha = {
    nome: dados.nome.trim(),
    natureza_gerencial: dados.natureza,
    impacta_dre: dados.impactaDre,
    impacta_caixa: dados.impactaCaixa,
    exige_documento: dados.exigeDocumento,
    usar_em_automacao: dados.usarEmAutomacao,
    conta_contabil: dados.contaContabil.trim(),
    centro_custo: dados.centroCusto,
  }

  if (id) {
    const { error } = await sb.from('categorias_financeiras').update(linha).eq('id', id)
    if (error) {
      console.error('[financeiro] editar categoria falhou:', error)
      return falha(error, 'Falha ao salvar a categoria.')
    }
    revalidarFinanceiro()
    return { ok: true, id }
  }

  const novoId = identificador(dados.nome)
  if (!novoId) return { ok: false, erro: 'O nome não forma um identificador válido.' }

  const { error } = await sb
    .from('categorias_financeiras')
    // `natureza` (texto do modelo antigo) continua obrigatória no banco; ela é
    // derivada da gerencial para as telas que ainda leem a coluna velha.
    .insert({ id: novoId, natureza: naturezaLegado(dados.natureza), ativa: true, ...linha })
  if (error) {
    console.error('[financeiro] criar categoria falhou:', error)
    if (error.code === '23505') return { ok: false, erro: 'Já existe uma categoria com esse nome.' }
    return falha(error, 'Falha ao criar a categoria.')
  }

  revalidarFinanceiro()
  return { ok: true, id: novoId }
}

function naturezaLegado(n: NaturezaGerencial): string {
  if (n === 'receita_operacional') return 'Receita'
  if (n === 'cmv') return 'Custo variável'
  if (n === 'despesa_fixa') return 'Despesa fixa'
  if (n === 'transferencia') return 'Transferência'
  return 'Despesa'
}

/** Inativar preserva o histórico; excluir só quando ninguém usou. */
export async function alternarCategoria(id: string, ativa: boolean): Promise<Resposta> {
  const bloqueio = exigeSupabase('gerenciar categorias')
  if (bloqueio) return bloqueio

  const { error } = await supabaseServer()
    .from('categorias_financeiras')
    .update({ ativa })
    .eq('id', id)
  if (error) return falha(error, 'Falha ao alterar a categoria.')

  revalidarFinanceiro()
  return { ok: true }
}

export async function excluirCategoria(id: string): Promise<Resposta> {
  const bloqueio = exigeSupabase('gerenciar categorias')
  if (bloqueio) return bloqueio

  const sb = supabaseServer()
  const { count } = await sb
    .from('lancamentos')
    .select('id', { count: 'exact', head: true })
    .eq('categoria_id', id)

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      erro: `${count} lançamento(s) usam esta categoria. Inative-a — excluir apagaria a classificação deles.`,
    }
  }

  const { error } = await sb.from('categorias_financeiras').delete().eq('id', id)
  if (error) return falha(error, 'Falha ao excluir a categoria.')

  revalidarFinanceiro()
  return { ok: true }
}

// ── Centros de custo ───────────────────────────────────────────────────────

export async function salvarCentroCusto(nome: string): Promise<Resposta> {
  const bloqueio = exigeSupabase('gerenciar centros de custo')
  if (bloqueio) return bloqueio
  if (!nome.trim()) return { ok: false, erro: 'Informe o nome do centro de custo.' }

  const id = identificador(nome)
  if (!id) return { ok: false, erro: 'O nome não forma um identificador válido.' }

  const { error } = await supabaseServer()
    .from('centros_custo')
    .upsert({ id, nome: nome.trim(), ativo: true })
  if (error) return falha(error, 'Falha ao salvar o centro de custo.')

  revalidarFinanceiro()
  return { ok: true }
}

export async function alternarCentroCusto(id: string, ativo: boolean): Promise<Resposta> {
  const bloqueio = exigeSupabase('gerenciar centros de custo')
  if (bloqueio) return bloqueio

  const { error } = await supabaseServer().from('centros_custo').update({ ativo }).eq('id', id)
  if (error) return falha(error, 'Falha ao alterar o centro de custo.')

  revalidarFinanceiro()
  return { ok: true }
}

// ── Fechamento de competência ──────────────────────────────────────────────

/**
 * Fecha o mês: a partir daqui, valor, categoria e tipo dos lançamentos dele
 * não mudam mais sem reabrir.
 *
 * Sem isso, "o resultado de agosto" é uma frase sem sujeito — cada vez que
 * alguém corrige uma categoria antiga, o número que foi para o contador deixa
 * de existir, e ninguém fica sabendo.
 */
export async function fecharCompetencia(
  competencia: string,
  observacao: string,
): Promise<Resposta> {
  const bloqueio = exigeSupabase('fechar competências')
  if (bloqueio) return bloqueio
  if (!/^\d{4}-\d{2}$/.test(competencia)) return { ok: false, erro: 'Competência inválida.' }

  const { error } = await supabaseServer().from('competencias_fechadas').upsert({
    competencia,
    fechada_em: new Date().toISOString(),
    fechada_por: OPERADOR,
    // Reabrir e fechar de novo tem de zerar as marcas da reabertura anterior,
    // senão `competencia_esta_fechada` continua respondendo "aberta".
    reaberta_em: null,
    reaberta_por: null,
    reabertura_motivo: null,
    resumo: observacao.trim() ? { observacao: observacao.trim() } : null,
  })
  if (error) {
    console.error('[financeiro] fechar competência falhou:', error)
    return falha(error, 'Falha ao fechar a competência.')
  }

  revalidarFinanceiro()
  return { ok: true }
}

/**
 * Reabre marcando quem e por quê — a linha não é apagada.
 *
 * Apagar deixaria o mês idêntico a um que nunca foi fechado, e a pergunta que
 * o contador faz depois ("por que esse número mudou?") não teria resposta.
 */
export async function reabrirCompetencia(
  competencia: string,
  motivo: string,
): Promise<Resposta> {
  const bloqueio = exigeSupabase('reabrir competências')
  if (bloqueio) return bloqueio
  if (!motivo.trim()) return { ok: false, erro: 'Explique por que a competência está sendo reaberta.' }

  const { error } = await supabaseServer()
    .from('competencias_fechadas')
    .update({
      reaberta_em: new Date().toISOString(),
      reaberta_por: OPERADOR,
      reabertura_motivo: motivo.trim(),
    })
    .eq('competencia', competencia)
  if (error) return falha(error, 'Falha ao reabrir a competência.')

  revalidarFinanceiro()
  return { ok: true }
}

// ── Contas ─────────────────────────────────────────────────────────────────

export interface DadosConta {
  nome: string
  tipo: string
  banco: string
  finalidade: string
  principal: boolean
  ativa: boolean
  cor: string | null
}

/** Cria ou edita uma conta do caixa. O saldo não se digita aqui — vem do extrato. */
export async function salvarConta(
  id: string | null,
  dados: DadosConta,
): Promise<Resposta<{ id: string }>> {
  const bloqueio = exigeSupabase('gerenciar contas')
  if (bloqueio) return bloqueio
  if (!dados.nome.trim()) return { ok: false, erro: 'Informe o nome da conta.' }
  if (!dados.banco.trim()) return { ok: false, erro: 'Informe o banco ou a instituição.' }

  const sb = supabaseServer()

  // Duas contas principais fariam o Dashboard escolher uma ao acaso para
  // mostrar como padrão. A anterior perde o posto na mesma transação lógica.
  if (dados.principal) {
    const q = sb.from('contas_bancarias').update({ principal: false }).eq('principal', true)
    const { error } = await (id ? q.neq('id', id) : q)
    if (error) return falha(error, 'Falha ao trocar a conta principal.')
  }

  const linha = {
    nome: dados.nome.trim(),
    tipo: dados.tipo.trim() || 'Conta corrente',
    banco: dados.banco.trim(),
    finalidade: dados.finalidade.trim() || null,
    // `uso` é a coluna do modelo antigo, ainda lida pelo Dashboard. Gravar o
    // mesmo texto nas duas evita que a mesma conta se descreva de dois jeitos.
    uso: dados.finalidade.trim(),
    principal: dados.principal,
    ativa: dados.ativa,
    cor: dados.cor,
  }

  if (id) {
    const { error } = await sb.from('contas_bancarias').update(linha).eq('id', id)
    if (error) {
      console.error('[financeiro] editar conta falhou:', error)
      return falha(error, 'Falha ao salvar a conta.')
    }
    revalidarFinanceiro()
    return { ok: true, id }
  }

  const novoId = identificador(dados.nome)
  if (!novoId) return { ok: false, erro: 'O nome não forma um identificador válido.' }

  const { error } = await sb.from('contas_bancarias').insert({ id: novoId, ...linha })
  if (error) {
    console.error('[financeiro] criar conta falhou:', error)
    if (error.code === '23505') return { ok: false, erro: 'Já existe uma conta com esse nome.' }
    return falha(error, 'Falha ao criar a conta.')
  }

  revalidarFinanceiro()
  return { ok: true, id: novoId }
}

/**
 * Remove a conta, desde que ela esteja vazia.
 *
 * Apagar uma conta com extrato ou lançamento levaria junto o histórico que
 * sustenta a DRE, e nada disso seria reconstruível. A recusa diz quantos
 * registros existem: quem quer mesmo remover sabe o que precisa mover antes.
 */
export async function removerConta(id: string): Promise<Resposta> {
  const bloqueio = exigeSupabase('remover contas')
  if (bloqueio) return bloqueio

  const sb = supabaseServer()
  const [extrato, lancamentos] = await Promise.all([
    sb.from('extrato_linhas').select('chave', { count: 'exact', head: true }).eq('conta_id', id),
    sb.from('lancamentos').select('id', { count: 'exact', head: true }).eq('conta_id', id),
  ])

  if ((extrato.count ?? 0) + (lancamentos.count ?? 0) > 0) {
    return {
      ok: false,
      erro: `Esta conta tem ${extrato.count ?? 0} linha(s) de extrato e ${lancamentos.count ?? 0} lançamento(s). Inative-a — apagar levaria esse histórico junto.`,
    }
  }

  const { error } = await sb.from('contas_bancarias').delete().eq('id', id)
  if (error) return falha(error, 'Falha ao remover a conta.')

  revalidarFinanceiro()
  return { ok: true }
}

// ── Saldo informado ────────────────────────────────────────────────────────

/**
 * Informa o saldo que o app do banco mostra, com a data da leitura.
 *
 * Conta cujo saldo o ERP só consegue calcular do extrato sempre atrasa; um
 * número digitado com carimbo de hoje é mais honesto que uma soma que parece
 * saldo. A divergência contra o calculado fica visível na tela de contas.
 */
export async function informarSaldo(
  contaId: string,
  saldo: number | null,
): Promise<Resposta> {
  const bloqueio = exigeSupabase('informar saldos')
  if (bloqueio) return bloqueio

  const { error } = await supabaseServer()
    .from('contas_bancarias')
    .update({
      saldo_informado: saldo,
      saldo_informado_em: saldo === null ? null : new Date().toISOString(),
      origem_saldo: saldo === null ? 'calculado' : 'informado',
    })
    .eq('id', contaId)
  if (error) {
    console.error('[financeiro] informar saldo falhou:', error)
    return falha(error, 'Falha ao gravar o saldo informado.')
  }

  revalidarFinanceiro()
  return { ok: true }
}
