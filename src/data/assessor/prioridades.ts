import 'server-only'

import { carregarConciliacao, carregarLancamentos, carregarVisaoFinanceira } from '@/data/financeiro'
import { carregarPainelPrincipal } from '@/data/painel'
import { carregarEstoque } from '@/data/consultas'
import { prioridadesDe, resumoDaFila, type Prioridade } from '@/domain'

/**
 * A fila de decisões: junta o estado da operação e aplica as regras.
 *
 * Esta camada NÃO decide nada. Ela só busca — nas mesmas funções que as telas
 * usam — e entrega a `prioridadesDe`, que é pura e testada. Toda a inteligência
 * mora lá; aqui só mora a coleta. É essa separação que torna possível provar
 * por teste que "conta vencida é crítica" sem precisar de banco.
 */

export interface FilaDeDecisoes {
  itens: Prioridade[]
  resumo: string
  /** Quando os números foram lidos. A fila é sempre de agora, nunca de cache. */
  apuradoEm: string
}

export async function carregarPrioridades(): Promise<FilaDeDecisoes> {
  // As cinco leituras são independentes: em série levariam a soma dos tempos,
  // e a fila abre junto com a tela.
  const [visao, painel, conciliacao, estoque, lancamentos] = await Promise.all([
    carregarVisaoFinanceira(),
    carregarPainelPrincipal('30d'),
    carregarConciliacao(),
    carregarEstoque(),
    carregarLancamentos(),
  ])

  // A distinção já vem pronta do domínio e é reaproveitada, não recalculada:
  // `aguardando` é a venda ainda dentro do prazo do gateway, `sem_credito` é a
  // que passou do prazo. Só a segunda exige ação — se a primeira entrasse na
  // fila, haveria item novo todo dia e ninguém leria a fila.
  const aguardando = conciliacao.vendas.filter((v) => v.status === 'aguardando')
  const vencidas = conciliacao.vendas.filter((v) => v.status === 'sem_credito')

  const itens = prioridadesDe({
    caixaHoje: visao.caixaHoje,
    diasAteNegativar: visao.projecao.diasAteNegativar,
    menorSaldo: visao.projecao.menorSaldo,
    menorSaldoEm: visao.projecao.menorSaldoEm,
    vencidos: visao.vencidos,
    aPagar: visao.aPagar,
    conciliacaoSemCredito: {
      qtd: aguardando.length + vencidas.length,
      valor: arredondar([...aguardando, ...vencidas].reduce((a, v) => a + v.bruto, 0)),
    },
    conciliacaoVencida: {
      qtd: vencidas.length,
      valor: arredondar(vencidas.reduce((a, v) => a + v.bruto, 0)),
    },
    // Transferência entre contas próprias não tem categoria porque NÃO É
    // despesa: o dinheiro só mudou de bolso. Contá-la aqui inflaria a fila com
    // 62 linhas que ninguém deve classificar — e fila com item impossível de
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
    })),
    faturamentoAtual: painel.atual.faturamento,
    faturamentoAnterior: painel.anterior.faturamento,
    rotuloDoPeriodo: painel.janela.rotulo,
  })

  return { itens, resumo: resumoDaFila(itens), apuradoEm: new Date().toISOString() }
}

function arredondar(v: number): number {
  return Math.round(v * 100) / 100
}
