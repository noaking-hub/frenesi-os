/**
 * Fechamento contábil: transformar o mês do ERP no arquivo que o escritório lê.
 *
 * Puro de propósito. O arquivo que vai para o contador é o documento com mais
 * consequência que este sistema produz — se ele estiver errado, o erro volta
 * como imposto pago a mais ou como autuação. Um gerador que só dá para testar
 * gerando de verdade não é testado.
 */

export interface LancamentoContabil {
  id: string
  /** AAAA-MM-DD. */
  data: string
  descricao: string
  categoria: string
  tipo: 'entrada' | 'saida'
  valor: number
  conta: string
  /** Quando existe, esta entrada é o recebimento de uma venda já contada. */
  pedidoId: string | null
}

export interface VendaContabil {
  id: string
  /** AAAA-MM-DD. */
  data: string
  valor: number
  frete: number
}

export interface Fechamento {
  competencia: string
  arquivo: string
  csv: string
  registros: number
  receita: number
  despesa: number
  outrasEntradas: number
  /** Resultado do mês pelo arquivo — receita menos despesa classificada. */
  resultado: number
  /** Categorias com movimento no mês e sem conta contábil amarrada. */
  semConta: string[]
  /** Lançamentos de saída sem categoria: o contador não tem onde lançar. */
  semCategoria: number
  avisos: string[]
}

const CABECALHO = [
  'Data',
  'Documento',
  'Historico',
  'Origem',
  'Categoria',
  'Conta contabil',
  'Natureza',
  'Valor',
]

/** Vírgula decimal e sem separador de milhar: é assim que o Excel brasileiro lê. */
function valorBr(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

function dataBr(iso: string): string {
  return iso.split('-').reverse().join('/')
}

/** Ponto e vírgula é o separador; aspas duplicadas escapam aspas. */
function campo(v: string): string {
  const t = (v ?? '').replace(/[\r\n]+/g, ' ').trim()
  return /[";]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

function linha(colunas: string[]): string {
  return colunas.map(campo).join(';')
}

function doMes(data: string, competencia: string): boolean {
  return data.slice(0, 7) === competencia
}

/**
 * Monta o razão analítico da competência.
 *
 * A receita vem dos PEDIDOS PAGOS, não dos lançamentos de entrada. É uma
 * decisão, não um detalhe: o crédito da venda aparece nas duas pontas — como
 * pedido e como linha de extrato classificada —, e somar as duas duplicaria o
 * faturamento do mês. Por isso a entrada ligada a um pedido é omitida, e as
 * entradas sem pedido (aporte, reembolso de fornecedor, empréstimo) entram em
 * separado, com natureza própria.
 *
 * Nada é silenciosamente descartado: categoria sem conta contábil e saída sem
 * categoria voltam contadas, para a tela avisar antes de o arquivo sair.
 */
export function montarFechamento(
  competencia: string,
  vendas: VendaContabil[],
  lancamentos: LancamentoContabil[],
  contaDaCategoria: Record<string, string>,
): Fechamento {
  const vendasDoMes = vendas.filter((v) => doMes(v.data, competencia))
  const lancsDoMes = lancamentos.filter((l) => doMes(l.data, competencia))

  const saidas = lancsDoMes.filter((l) => l.tipo === 'saida')
  // Entrada com pedido é o mesmo dinheiro da venda, vista do outro lado.
  const outras = lancsDoMes.filter((l) => l.tipo === 'entrada' && !l.pedidoId)

  const linhas: string[] = [linha(CABECALHO)]

  for (const v of vendasDoMes) {
    linhas.push(
      linha([
        dataBr(v.data),
        v.id,
        // O frete cobrado do cliente é receita e precisa aparecer separado —
        // ele tem tratamento fiscal próprio.
        v.frete > 0 ? `Venda (mercadoria ${valorBr(v.valor - v.frete)} + frete ${valorBr(v.frete)})` : 'Venda',
        'Pedido',
        'Receita de vendas',
        '3.1.01.001 · receita bruta de vendas',
        'Credito',
        valorBr(v.valor),
      ]),
    )
  }

  for (const l of saidas) {
    linhas.push(
      linha([
        dataBr(l.data),
        l.id,
        l.descricao,
        l.conta,
        l.categoria || 'SEM CATEGORIA',
        contaDaCategoria[l.categoria] || '',
        'Debito',
        valorBr(l.valor),
      ]),
    )
  }

  for (const l of outras) {
    linhas.push(
      linha([
        dataBr(l.data),
        l.id,
        l.descricao,
        l.conta,
        l.categoria || 'Outras entradas',
        contaDaCategoria[l.categoria] || '',
        'Credito',
        valorBr(l.valor),
      ]),
    )
  }

  const receita = vendasDoMes.reduce((a, v) => a + v.valor, 0)
  const despesa = saidas.reduce((a, l) => a + l.valor, 0)
  const outrasEntradas = outras.reduce((a, l) => a + l.valor, 0)

  const categoriasUsadas = new Set(
    [...saidas, ...outras].map((l) => l.categoria).filter((c) => c.length > 0),
  )
  const semConta = [...categoriasUsadas]
    .filter((c) => !contaDaCategoria[c])
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const semCategoria = saidas.filter((l) => !l.categoria).length

  const avisos: string[] = []
  if (semConta.length) {
    avisos.push(
      `${semConta.length} categoria(s) com movimento no mês não têm conta contábil: ${semConta.join(', ')}. O escritório vai devolver essas linhas.`,
    )
  }
  if (semCategoria) {
    avisos.push(
      `${semCategoria} saída(s) do mês estão sem categoria — no arquivo elas aparecem como SEM CATEGORIA e o contador não tem onde lançá-las.`,
    )
  }
  if (vendasDoMes.length === 0) {
    avisos.push('Nenhum pedido pago nesta competência. Confira se a importação de pedidos rodou.')
  }

  return {
    competencia,
    arquivo: `frenesi-${competencia.replace('-', '')}-razao.csv`,
    // O BOM faz o Excel abrir o acento certo. Sem ele, "Pró-labore" chega
    // quebrado na planilha do contador e a categoria vira outra.
    csv: `﻿${linhas.join('\r\n')}\r\n`,
    registros: linhas.length - 1,
    receita,
    despesa,
    outrasEntradas,
    resultado: Math.round((receita + outrasEntradas - despesa) * 100) / 100,
    semConta,
    semCategoria,
    avisos,
  }
}

/** Rótulo legível da competência: "2026-08" vira "agosto de 2026". */
export function nomeDaCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number)
  if (!ano || !mes) return competencia
  return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

/** Competência do mês corrente, no formato AAAA-MM. */
export function competenciaAtual(hoje = new Date()): string {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
}

/** As últimas competências, da mais recente para trás — para o seletor da tela. */
export function competenciasRecentes(quantas = 12, hoje = new Date()): string[] {
  const lista: string[] = []
  for (let i = 0; i < quantas; i += 1) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    lista.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return lista
}
