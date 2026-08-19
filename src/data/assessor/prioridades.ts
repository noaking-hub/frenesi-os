import 'server-only'

import { carregarConciliacao, carregarLancamentos, carregarVisaoFinanceira } from '@/data/financeiro'
import { carregarPainelPrincipal } from '@/data/painel'
import { carregarEstoque, carregarFilaDeEnvase } from '@/data/consultas'
import { cuponsDaCuradoriaDesviados } from '@/data/quiz'
import { rotinasComErroPersistente } from '@/data/saude-das-rotinas'
import { supabaseServer } from '@/data/supabase'
import { briefingDe, hojeEmSaoPaulo, prioridadesDe, resumoDaFila, type Briefing, type Prioridade } from '@/domain'

/**
 * A Central do Gerente: prioridades, briefing e resumo executivo.
 *
 * Esta camada NÃO decide nada. Ela busca — nas mesmas funções que as telas do
 * ERP usam — e entrega a `prioridadesDe` e `briefingDe`, que são puras e
 * testadas. Toda a inteligência mora lá; aqui só mora a coleta. É essa
 * separação que permite provar por teste que "conta vencida é crítica" sem
 * precisar de banco, e é ela que garante que a fila não muda de opinião entre
 * duas aberturas da tela.
 */

/** §3.1: "Resumo executivo do dia: vendas, pedidos, estoque, produção, caixa, margem e CRM." */
export interface ResumoExecutivo {
  vendas: { valor: number; rotulo: string }
  pedidos: { qtd: number; rotulo: string }
  estoque: { criticos: number; rotulo: string }
  producao: { qtd: number; rotulo: string }
  caixa: { valor: number; rotulo: string }
  margem: { pct: number; rotulo: string }
  crm: { qtd: number; rotulo: string }
}

export interface CentralDoGerente {
  itens: Prioridade[]
  resumo: string
  briefing: Briefing
  executivo: ResumoExecutivo
  /** §3.1: "Indicador de atualização dos dados e módulos consultados." */
  modulosConsultados: string[]
  apuradoEm: string
}

export async function carregarCentralDoGerente(): Promise<CentralDoGerente> {
  // As seis leituras são independentes: em série levariam a soma dos tempos, e
  // a Central abre junto com a tela.
  const [visao, painel, conciliacao, estoque, lancamentos, envase, expedicaoAtrasada, rotinasDoentes, lembretes, cuponsDesviados] =
    await Promise.all([
      carregarVisaoFinanceira(),
      carregarPainelPrincipal('30d'),
      carregarConciliacao(),
      carregarEstoque(),
      carregarLancamentos(),
      carregarFilaDeEnvase(),
      expedicaoAlemDoPrazo(),
      rotinasComErroPersistente(),
      lembretesVencidos(),
      cuponsDaCuradoriaDesviados(),
    ])

  // A distinção já vem pronta do domínio e é reaproveitada, não recalculada:
  // `aguardando` é a venda ainda dentro do prazo do gateway, `sem_credito` é a
  // que passou do prazo. Só a segunda exige ação.
  const aguardando = conciliacao.vendas.filter((v) => v.status === 'aguardando')
  const vencidas = conciliacao.vendas.filter((v) => v.status === 'sem_credito')

  const estado = {
    caixaHoje: visao.caixaHoje,
    diasAteNegativar: visao.projecao.diasAteNegativar,
    menorSaldo: visao.projecao.menorSaldo,
    menorSaldoEm: visao.projecao.menorSaldoEm,
    vencidos: visao.vencidos,
    aPagar: visao.aPagar,
    conciliacaoAguardando: {
      qtd: aguardando.length,
      valor: arredondar(aguardando.reduce((a, v) => a + v.bruto, 0)),
    },
    conciliacaoVencida: {
      qtd: vencidas.length,
      valor: arredondar(vencidas.reduce((a, v) => a + v.bruto, 0)),
    },
    // Transferência entre contas próprias não tem categoria porque NÃO É
    // despesa: o dinheiro só mudou de bolso. Contá-la inflaria a fila com
    // linhas que ninguém deve classificar — e fila com item impossível de
    // resolver é fila que o operador aprende a ignorar.
    lancamentosSemCategoria: lancamentos.lancamentos.filter(
      (l) => !l.canceladoEm && !l.categoriaId && !l.transferenciaId,
    ).length,
    estoque: estoque.coberturas.map((c) => ({
      nome: c.base.nome,
      marca: c.base.marca,
      dias: c.dias,
      criticidade: c.criticidade,
      disponivelMl: c.disponivelMl,
      reservadoMl: c.reservadoMl,
    })),
    faturamentoAtual: painel.atual.faturamento,
    faturamentoAnterior: painel.anterior.faturamento,
    pedidosAtual: painel.atual.pedidos,
    pedidosAnterior: painel.anterior.pedidos,
    rotuloDoPeriodo: painel.janela.rotulo,
    expedicaoAtrasada,
    rotinasDoentes,
    lembretes,
    cuponsDesviados,
  }

  const itens = prioridadesDe(estado)

  return {
    itens,
    resumo: resumoDaFila(itens),
    briefing: briefingDe(estado, itens),
    executivo: {
      vendas: { valor: painel.atual.faturamento, rotulo: painel.janela.rotulo.toLowerCase() },
      pedidos: { qtd: painel.atual.pedidos, rotulo: 'pagos no período' },
      // Só o que está sob controle de estoque: base sem compra registrada não
      // é crítica, é ausente.
      estoque: { criticos: estoque.criticos, rotulo: 'bases abaixo do limite' },
      producao: { qtd: envase.pedidos, rotulo: 'pedidos na fila de envase' },
      caixa: { valor: visao.caixaHoje, rotulo: 'disponível nas contas ativas' },
      margem: { pct: visao.margemMes, rotulo: 'do mês, por competência' },
      crm: { qtd: painel.atual.clientesNovos, rotulo: 'clientes novos no período' },
    },
    modulosConsultados: [
      'Dashboard',
      'Visão Financeira',
      'Conciliação',
      'Lançamentos',
      'Estoque',
      'Envase',
    ],
    apuradoEm: new Date().toISOString(),
  }
}

/**
 * Lembretes do dono cuja data chegou (fuso da operação) e seguem abertos.
 *
 * O lembrete fica na fila até alguém marcar `concluido_em` — a vigília fecha
 * o alerta sozinha na rodada seguinte, como faz com tudo que sai da fila.
 */
async function lembretesVencidos(): Promise<{ id: number; assunto: string; detalhe: string | null }[]> {
  try {
    const { data, error } = await supabaseServer()
      .from('gerente_lembretes')
      .select('id, assunto, detalhe')
      .is('concluido_em', null)
      .lte('a_partir_de', hojeEmSaoPaulo())
      .order('a_partir_de')
      .limit(5)
    if (error) throw error
    return (data ?? []) as { id: number; assunto: string; detalhe: string | null }[]
  } catch (e) {
    console.error('[prioridades] leitura de lembretes falhou:', e)
    return []
  }
}

/**
 * Pedidos pagos além do SLA de expedição (72 h) sem código de rastreio.
 *
 * Entrega local fica fora (não tem rastreio por natureza) e a janela para
 * trás é de 45 dias — mais velho que isso é caso encerrado por outro caminho,
 * não fila de expedição.
 */
async function expedicaoAlemDoPrazo(): Promise<{
  qtd: number
  valor: number
  maisAntigoDias: number
}> {
  const vazio = { qtd: 0, valor: 0, maisAntigoDias: 0 }
  try {
    const agora = Date.now()
    const { data, error } = await supabaseServer()
      .from('pedidos')
      .select('valor, comprado_em')
      .eq('pagamento', 'pago')
      .is('rastreio', null)
      .in('envio', ['nao_iniciado', 'aguardando_envio'])
      .eq('entrega_local', false)
      .lt('comprado_em', new Date(agora - 72 * 3_600_000).toISOString())
      .gte('comprado_em', new Date(agora - 45 * 86_400_000).toISOString())
    if (error) throw error
    const linhas = (data ?? []) as { valor: string; comprado_em: string }[]
    if (!linhas.length) return vazio
    const maisAntigo = Math.min(...linhas.map((l) => Date.parse(l.comprado_em)))
    return {
      qtd: linhas.length,
      valor: arredondar(linhas.reduce((a, l) => a + Number(l.valor), 0)),
      maisAntigoDias: Math.floor((agora - maisAntigo) / 86_400_000),
    }
  } catch (e) {
    console.error('[prioridades] leitura de expedição falhou:', e)
    return vazio
  }
}

function arredondar(v: number): number {
  return Math.round(v * 100) / 100
}
