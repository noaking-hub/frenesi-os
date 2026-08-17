'use server'

import { revalidatePath } from 'next/cache'

import { OPERADOR } from '@/data/operador'
import { sessaoAtual } from '@/data/sessao'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import type { NaturezaGerencial } from '@/domain'
import { hojeEmSaoPaulo } from '@/domain'

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

/**
 * Quem esconde não protege.
 *
 * A tela só mostra o lápis para quem está logado, mas Server Action é um
 * endpoint HTTP como outro qualquer: quem souber o nome dela chama direto, sem
 * passar por tela nenhuma. A verificação é repetida aqui porque é a única que
 * o navegador não consegue pular.
 */
async function exigeSessao(acao: string) {
  // Sem Supabase não há Auth para consultar — e quem chama já passou por
  // `exigeSupabase`, que devolve o motivo verdadeiro. Mandar "faça login" no
  // ERP rodando sem banco seria pedir o impossível para esconder a causa real.
  if (!supabaseConfigurado()) return null
  return (await sessaoAtual())
    ? null
    : { ok: false as const, erro: `Faça login no ERP para ${acao}.` }
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
  const hoje = hojeEmSaoPaulo()
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

// ── Edição de lançamento ───────────────────────────────────────────────────

export interface EdicaoLancamento {
  descricao: string
  favorecido: string
  valor: number
  /** AAAA-MM-DD. Vazio deixa o título sem data — e fora da projeção de caixa. */
  venceEm: string
  /** Vazio significa "não mexer na categoria", nunca "apagar a categoria". */
  categoriaId: string
  contaId: string
  centroCusto: string | null
  documento: string
  observacao: string
}

interface LinhaEmEdicao {
  descricao: string
  favorecido: string | null
  valor: number | string
  vence_em: string | null
  categoria: string | null
  categoria_id: string | null
  centro_custo: string | null
  conta_id: string
  documento: string | null
  observacao: string | null
  tipo: string
  competencia: string
  baixado_em: string | null
  cancelado_em: string | null
  transferencia_id: string | null
  origem: string
}

/** '' e null são a mesma coisa para o operador: "não informado". */
function texto(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t || null
}

/** Rejeita 2026-02-31: o formato bate, a data não existe. */
function dataValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const d = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso
}

/** Centavos: 1.005 e 1.0049999 são o mesmo dinheiro e não podem virar "mudou". */
function centavos(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * Grava o que mudou na trilha de auditoria do Financeiro.
 *
 * A falha aqui NÃO derruba a operação: a alteração já foi persistida e
 * devolver erro faria o operador repetir uma edição que já valeu. Fica o
 * `console.error` — perder o rastro é ruim, duplicar a correção é pior.
 */
async function registrarAuditoria(entrada: {
  entidade: string
  entidadeId: string
  acao: string
  anterior: Record<string, unknown>
  novo: Record<string, unknown>
  justificativa: string
}) {
  const { error } = await supabaseServer().from('financeiro_auditoria').insert({
    entidade: entrada.entidade,
    entidade_id: entrada.entidadeId,
    acao: entrada.acao,
    valor_anterior: entrada.anterior,
    valor_novo: entrada.novo,
    operador: OPERADOR,
    justificativa: entrada.justificativa,
  })
  if (error) console.error('[financeiro] auditoria não registrada:', error)
}

/**
 * Edita um lançamento já registrado.
 *
 * Existe por duas necessidades que não tinham saída: título lançado sem
 * vencimento não entra na projeção de caixa (a projeção posiciona o
 * recebimento na data de vencimento — sem data, ele simplesmente não existe
 * no gráfico), e lançamento vindo do extrato chega sem categoria, então a DRE
 * não sabe classificá-lo. Os dois casos são "o registro está certo, falta um
 * campo" — cancelar e relançar perderia a baixa, a conciliação e o histórico.
 *
 * O que NÃO se edita está listado abaixo com o motivo. A regra geral: pode
 * mudar o que descreve o fato; não pode mudar o que outra parte do sistema já
 * usou como verdade.
 */
export async function editarLancamento(
  id: string,
  dados: EdicaoLancamento,
): Promise<Resposta<{ alteracoes: number }>> {
  const bloqueio = exigeSupabase('editar lançamentos')
  if (bloqueio) return bloqueio
  const semSessao = await exigeSessao('editar lançamentos')
  if (semSessao) return semSessao
  if (!id) return { ok: false, erro: 'Lançamento não informado.' }
  if (!dados.descricao.trim()) return { ok: false, erro: 'Informe a descrição.' }
  if (!(dados.valor > 0)) {
    return { ok: false, erro: 'O valor deve ser maior que zero. Para anular um lançamento, use Cancelar.' }
  }
  if (dados.venceEm && !dataValida(dados.venceEm)) {
    return { ok: false, erro: 'Vencimento inválido. Use uma data no formato dia/mês/ano.' }
  }
  if (!dados.contaId) return { ok: false, erro: 'Escolha a conta.' }

  const sb = supabaseServer()
  const { data, error: erroLeitura } = await sb
    .from('lancamentos')
    .select(
      'descricao, favorecido, valor, vence_em, categoria, categoria_id, centro_custo, conta_id, documento, observacao, tipo, competencia, baixado_em, cancelado_em, transferencia_id, origem',
    )
    .eq('id', id)
    .maybeSingle()
  if (erroLeitura) return falha(erroLeitura, 'Falha ao ler o lançamento.')
  if (!data) return { ok: false, erro: 'Lançamento não encontrado — talvez ele tenha sido removido.' }

  const atual = data as unknown as LinhaEmEdicao

  // Cancelado é registro do que deixou de valer. Editá-lo devolveria vida a
  // um compromisso que alguém encerrou de propósito — e sem ninguém ver.
  if (atual.cancelado_em) {
    return {
      ok: false,
      erro: 'Este lançamento está cancelado e não pode ser editado. Crie um novo compromisso no lugar dele.',
    }
  }

  // Fechar o mês existe para congelar o passado: é o número que já foi para o
  // contador. Reabrir é possível e fica registrado com motivo — o que não
  // pode é o total de agosto mudar em silêncio depois do envio.
  const mes = String(atual.competencia).slice(0, 7)
  const { data: fechamento, error: erroFechamento } = await sb
    .from('competencias_fechadas')
    .select('competencia')
    .eq('competencia', mes)
    .is('reaberta_em', null)
    .maybeSingle()
  if (erroFechamento) return falha(erroFechamento, 'Falha ao verificar o fechamento da competência.')
  if (fechamento) {
    return {
      ok: false,
      erro: `A competência ${mes} está fechada. Reabra-a em Configurações (com o motivo) antes de alterar este lançamento.`,
    }
  }

  const ehTransferencia = Boolean(atual.transferencia_id)
  const veioDoExtrato = atual.origem.startsWith('Extrato ')
  const jaBaixado = Boolean(atual.baixado_em)

  const valorNovo = centavos(dados.valor)
  const valorAtual = centavos(Number(atual.valor))
  const contaNova = dados.contaId
  const venceNovo = dados.venceEm || null

  // Transferência entre contas próprias tem duas pernas com o mesmo
  // identificador. Mudar valor ou conta de UM lado deixaria o par
  // desequilibrado: sairia 500 de uma conta e entrariam 300 na outra, e o
  // saldo consolidado passaria a inventar dinheiro.
  if (ehTransferencia && valorNovo !== valorAtual) {
    return {
      ok: false,
      erro: 'Este lançamento é uma perna de transferência: o valor não muda aqui. Cancele a transferência e registre-a de novo com o valor certo.',
    }
  }
  if (ehTransferencia && contaNova !== atual.conta_id) {
    return {
      ok: false,
      erro: 'Este lançamento é uma perna de transferência: a conta não muda aqui. Cancele a transferência e registre-a de novo entre as contas certas.',
    }
  }

  // O dinheiro já entrou ou saiu pelo valor antigo. Trocar o valor depois da
  // baixa faria o saldo da conta divergir do extrato sem nenhum fato por
  // trás. Categoria, descrição e observação continuam livres — é exatamente
  // o que se faz ao classificar o que veio do banco.
  if (jaBaixado && valorNovo !== valorAtual) {
    return {
      ok: false,
      erro: 'Este lançamento já foi baixado: o valor não pode mudar, porque o saldo da conta foi calculado com ele. Se o valor está errado, estorne a baixa antes.',
    }
  }

  // A linha do extrato pertence à conta em que ela apareceu. Mover o
  // lançamento para outra conta faria a conciliação apontar para um extrato
  // onde aquele movimento nunca existiu.
  if (veioDoExtrato && contaNova !== atual.conta_id) {
    return {
      ok: false,
      erro: `Este lançamento veio do extrato (${atual.origem}) e pertence à conta em que o movimento apareceu. A conta não pode ser trocada.`,
    }
  }

  const patch: Record<string, unknown> = {}
  const anterior: Record<string, unknown> = {}
  const novo: Record<string, unknown> = {}
  const campos: string[] = []

  const anota = (campo: string, coluna: string, antes: unknown, depois: unknown) => {
    if (antes === depois) return
    patch[coluna] = depois
    anterior[campo] = antes
    novo[campo] = depois
    campos.push(campo)
  }

  anota('descrição', 'descricao', atual.descricao, dados.descricao.trim())
  anota('favorecido', 'favorecido', texto(atual.favorecido), texto(dados.favorecido))
  anota('valor', 'valor', valorAtual, valorNovo)
  anota('vencimento', 'vence_em', atual.vence_em, venceNovo)
  anota('conta', 'conta_id', atual.conta_id, contaNova)
  anota('centro de custo', 'centro_custo', atual.centro_custo, dados.centroCusto || null)
  anota('documento', 'documento', texto(atual.documento), texto(dados.documento))
  anota('observação', 'observacao', texto(atual.observacao), texto(dados.observacao))

  // Categoria vazia não apaga a classificação existente: um lançamento sai da
  // DRE ao perder a categoria, e ninguém quer isso de propósito. Trocar de
  // categoria também reescreve o nome desnormalizado — as telas antigas leem
  // a coluna de texto, e deixá-la para trás faria o mesmo lançamento se
  // descrever de dois jeitos.
  if (!dados.categoriaId && atual.categoria_id) {
    return {
      ok: false,
      erro: 'Não é possível deixar um lançamento já classificado sem categoria — ele sairia da DRE. Escolha outra categoria.',
    }
  }

  if (dados.categoriaId && dados.categoriaId !== atual.categoria_id) {
    const { data: cat, error: erroCat } = await sb
      .from('categorias_financeiras')
      .select('id, nome, natureza_gerencial, ativa')
      .eq('id', dados.categoriaId)
      .maybeSingle()
    if (erroCat) return falha(erroCat, 'Falha ao ler a categoria.')
    if (!cat) return { ok: false, erro: 'Categoria não encontrada.' }

    const c = cat as unknown as { nome: string; natureza_gerencial: string; ativa: boolean }
    if (!c.ativa) {
      return { ok: false, erro: `A categoria "${c.nome}" está inativa. Reative-a em Categorias ou escolha outra.` }
    }
    // Receita em lançamento de saída (e vice-versa) não é digitação errada de
    // texto: é uma despesa entrando na DRE como faturamento. A natureza da
    // categoria já responde de que lado ela pode aparecer.
    const natureza = c.natureza_gerencial
    if (natureza === 'transferencia' && !ehTransferencia) {
      return {
        ok: false,
        erro: 'Categoria de transferência só vale para transferência entre contas próprias — ela não entra no resultado.',
      }
    }
    if (atual.tipo === 'entrada' && natureza !== 'receita_operacional' && natureza !== 'aporte_retirada' && natureza !== 'transferencia') {
      return {
        ok: false,
        erro: `"${c.nome}" é categoria de despesa e este lançamento é uma entrada. Escolha uma categoria de receita ou de aporte.`,
      }
    }
    if (atual.tipo === 'saida' && natureza === 'receita_operacional') {
      return {
        ok: false,
        erro: `"${c.nome}" é categoria de receita e este lançamento é uma saída. Escolha uma categoria de custo ou despesa.`,
      }
    }

    anota('categoria', 'categoria_id', atual.categoria_id, dados.categoriaId)
    patch.categoria = c.nome
  }

  if (campos.length === 0) return { ok: true, alteracoes: 0 }

  patch.atualizado_em = new Date().toISOString()

  const { error } = await sb.from('lancamentos').update(patch).eq('id', id)
  if (error) {
    console.error('[financeiro] editar lançamento falhou:', error)
    return falha(error, 'Falha ao salvar a edição.')
  }

  await registrarAuditoria({
    entidade: 'lancamento',
    entidadeId: id,
    acao: 'editar',
    anterior,
    novo,
    justificativa: `Edição manual de ${campos.join(', ')}`,
  })

  revalidarFinanceiro()
  return { ok: true, alteracoes: campos.length }
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
    p_data: dados.data || hojeEmSaoPaulo(),
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
 * Informa o saldo que o app do banco mostra, e A QUE DIA ele se refere.
 *
 * Conta cujo saldo o ERP só consegue calcular do extrato sempre atrasa; um
 * número digitado é mais honesto que uma soma que parece saldo. A divergência
 * contra o calculado fica visível na tela de contas.
 *
 * O segundo parâmetro é o conserto de um bug que congelava a conta. Antes só
 * existia `saldo_informado_em`, a hora do clique, e a view fazia
 * `COALESCE(saldo_informado, ledger)` — ou seja, informar um saldo parava
 * aquela conta naquele número PARA SEMPRE, e nenhum lançamento voltava a
 * mexer nele. A tela chegou a exibir "SAÍDAS (30D) R$ 965,89" ao lado de um
 * saldo que não sentiu essas saídas.
 *
 * `para` é a data de FECHAMENTO a que o número se refere ("no fim de 15/08 eu
 * tinha X"). Tudo que for baixado depois dela soma por cima. A distinção
 * importa: informar o saldo hoje de manhã e lançar à tarde um pagamento de
 * ontem é indefensável pela hora do clique — pelo relógio o pagamento é
 * "anterior" e some. Com a data explícita, quem decide é o dono do dinheiro.
 */
export async function informarSaldo(
  contaId: string,
  saldo: number | null,
  para?: string | null,
): Promise<Resposta> {
  const bloqueio = exigeSupabase('informar saldos')
  if (bloqueio) return bloqueio

  // Sem data escolhida, hoje — que é o caso comum de quem abriu o app do banco
  // agora. O fuso é o da operação, não o do servidor: um saldo informado às
  // 21h de São Paulo cairia no dia seguinte em UTC e passaria a ignorar os
  // lançamentos do próprio dia.
  const referencia = saldo === null ? null : (para?.trim() || hojeEmSaoPaulo())

  const { error } = await supabaseServer()
    .from('contas_bancarias')
    .update({
      saldo_informado: saldo,
      saldo_informado_em: saldo === null ? null : new Date().toISOString(),
      saldo_informado_para: referencia,
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

/**
 * Quanto o ERP vai somar por cima de um saldo informado para a data escolhida.
 *
 * Existe para o diálogo poder mostrar o resultado ANTES de gravar. Escolher a
 * data de referência sem ver o efeito é apostar: o número só apareceria
 * depois, na tela de contas, e quem errou o dia não teria como saber que
 * errou. É a mesma postura das prévias de baixa e de parcelamento.
 */
export async function somaBaixadaDepois(
  contaId: string,
  data: string,
): Promise<{ soma: number; quantos: number }> {
  if (!supabaseConfigurado() || !data) return { soma: 0, quantos: 0 }

  const { data: linhas, error } = await supabaseServer()
    .from('lancamentos')
    .select('tipo, recebido')
    .eq('conta_id', contaId)
    .is('cancelado_em', null)
    .not('baixado_em', 'is', null)
    .gt('baixado_em', data)
  if (error || !linhas) return { soma: 0, quantos: 0 }

  const soma = (linhas as { tipo: string; recebido: number | string }[]).reduce(
    (a, l) => a + (l.tipo === 'entrada' ? Number(l.recebido) : -Number(l.recebido)),
    0,
  )
  return { soma: Math.round(soma * 100) / 100, quantos: linhas.length }
}

// ── Destino dos repasses ───────────────────────────────────────────────────

/**
 * Diz para onde foi um saque do gateway.
 *
 * O extrato do Mercado Pago descreve todo saque como "Transferência para
 * conta bancária", tanto o que cai no Inter quanto o que paga o anúncio da
 * Meta. Quem sabe a diferença é quem operou — e enquanto ninguém diz, o
 * lançamento fica marcado `aguarda_destino` e fora dos dois regimes.
 *
 * As duas respostas são exclusivas, e a exclusividade é imposta no banco:
 * `resolver_destino_do_payout` recusa quando vêm as duas ou nenhuma. Aqui a
 * checagem é repetida só para dar mensagem antes da ida ao servidor.
 *
 * O laço é sequencial de propósito. São no máximo algumas dezenas de linhas,
 * e cada uma pode falhar por um motivo diferente (conta igual à origem,
 * categoria removida no meio do caminho); disparar tudo em paralelo devolveria
 * um erro só, sem dizer qual linha ficou para trás.
 */
export async function resolverDestinoDoRepasse(
  ids: string[],
  destino: { contaId?: string; categoriaId?: string },
): Promise<Resposta<{ resolvidos: number; recusados: { id: string; erro: string }[] }>> {
  const bloqueio = exigeSupabase('resolver o destino dos repasses')
  if (bloqueio) return bloqueio

  const conta = destino.contaId?.trim() || null
  const categoria = destino.categoriaId?.trim() || null
  if ((conta === null) === (categoria === null)) {
    return { ok: false, erro: 'Escolha a conta de destino OU a categoria da despesa — uma só.' }
  }
  if (ids.length === 0) return { ok: false, erro: 'Nenhum repasse selecionado.' }

  const sb = supabaseServer()
  const recusados: { id: string; erro: string }[] = []
  let resolvidos = 0

  for (const id of ids) {
    const { data, error } = await sb.rpc('resolver_destino_do_payout', {
      p_id: id,
      p_conta_destino: conta,
      p_categoria_id: categoria,
      p_operador: OPERADOR,
    })
    if (error) {
      console.error('[financeiro] resolver_destino_do_payout falhou:', error)
      recusados.push({ id, erro: error.message || 'Falha ao gravar o destino.' })
      continue
    }
    const r = (data ?? {}) as { ok?: boolean; erro?: string }
    if (r.ok) resolvidos++
    else recusados.push({ id, erro: r.erro ?? 'O banco recusou sem dizer o motivo.' })
  }

  revalidarFinanceiro()
  revalidatePath('/financeiro/repasses')
  // Sucesso parcial continua sendo sucesso: dez linhas resolvidas e uma
  // recusada não podem virar "falhou" e fazer a tela desfazer o que deu certo.
  return resolvidos > 0
    ? { ok: true, resolvidos, recusados }
    : { ok: false, erro: recusados[0]?.erro ?? 'Nenhum repasse foi resolvido.' }
}
