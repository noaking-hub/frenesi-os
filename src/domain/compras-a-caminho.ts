/**
 * O que foi comprado e ainda não chegou.
 *
 * Duas perguntas convivem em cada item, e elas são INDEPENDENTES:
 *
 *   1. Chegou?             — `quantidadeRecebida` contra `quantidade`
 *   2. Existe no catálogo? — `baseId` preenchido ou não
 *
 * Tratá-las como uma só seria o erro fácil. Um frasco pode chegar antes de o
 * perfume existir no ERP: é justamente o caso que define a operação, porque
 * lançamento novo precisa nascer na Shopify (imagem, descrição) antes de virar
 * lote com custo por ml. E o contrário também acontece o tempo todo — o
 * perfume já está no catálogo e a caixa ainda está a caminho.
 *
 * Este arquivo é só a aritmética e os nomes dos estados. Quem lê e grava está
 * em `src/data/compras-a-caminho.ts`.
 */

export interface ItemDaCompra {
  id: string
  baseId: string | null
  descricao: string
  volumeMl: number | null
  quantidade: number
  custoUnitario: number | null
  quantidadeRecebida: number
  recebidoEm: string | null
  ocorrencia: string | null
  loteId: string | null
}

export interface CompraACaminho {
  id: string
  fornecedor: string
  referencia: string | null
  compradaEm: string
  previstaPara: string | null
  rastreio: string | null
  transportadora: string | null
  valorTotal: number | null
  frete: number
  observacao: string | null
  canceladaEm: string | null
  itens: ItemDaCompra[]
}

/** Onde o item está na chegada. */
export type EstadoDaChegada = 'aguardando' | 'parcial' | 'recebido'

export function estadoDaChegada(i: ItemDaCompra): EstadoDaChegada {
  if (i.quantidadeRecebida <= 0) return 'aguardando'
  return i.quantidadeRecebida >= i.quantidade ? 'recebido' : 'parcial'
}

/** Quantos frascos ainda faltam neste item. Nunca negativo. */
export function faltamDoItem(i: ItemDaCompra): number {
  return Math.max(0, i.quantidade - i.quantidadeRecebida)
}

/**
 * O que impede este item de virar lote.
 *
 * Devolve `null` quando ele está pronto. A ordem das checagens é a ordem em
 * que a pessoa resolve na vida real: primeiro o frasco chega, depois o
 * perfume existe no catálogo, e só então o lote é registrado com o custo.
 */
export function pendenciaDoItem(i: ItemDaCompra): string | null {
  if (i.loteId) return null
  if (i.quantidadeRecebida <= 0) return 'ainda não chegou'
  if (!i.baseId) return 'o perfume ainda não existe no catálogo'
  return 'falta registrar a compra do frasco para criar o lote'
}

export interface ResumoDaCompra {
  itens: number
  frascosEsperados: number
  frascosRecebidos: number
  frascosFaltando: number
  /** Itens que chegaram (inteiros ou em parte) e ainda não viraram lote. */
  prontosParaLote: number
  /** Itens recebidos cujo perfume ainda não existe no catálogo. */
  semCadastro: number
  /** Todo mundo chegou por inteiro. */
  completa: boolean
  /** Custo dos itens mais o frete, quando informado. */
  custoEstimado: number | null
}

export function resumoDaCompra(c: CompraACaminho): ResumoDaCompra {
  const frascosEsperados = c.itens.reduce((a, i) => a + i.quantidade, 0)
  const frascosRecebidos = c.itens.reduce((a, i) => a + Math.min(i.quantidadeRecebida, i.quantidade), 0)

  // O custo sai dos itens quando há preço unitário em TODOS; um item sem
  // preço tornaria a soma uma meia-verdade que parece total. Nesse caso vale
  // o valor da nota, se ele foi informado.
  const todosComPreco = c.itens.length > 0 && c.itens.every((i) => i.custoUnitario !== null)
  const dosItens = todosComPreco
    ? c.itens.reduce((a, i) => a + (i.custoUnitario ?? 0) * i.quantidade, 0)
    : null
  const custoEstimado =
    dosItens !== null ? Math.round((dosItens + c.frete) * 100) / 100 : c.valorTotal

  return {
    itens: c.itens.length,
    frascosEsperados,
    frascosRecebidos,
    frascosFaltando: Math.max(0, frascosEsperados - frascosRecebidos),
    prontosParaLote: c.itens.filter((i) => i.quantidadeRecebida > 0 && !i.loteId && i.baseId).length,
    semCadastro: c.itens.filter((i) => i.quantidadeRecebida > 0 && !i.baseId).length,
    completa: c.itens.length > 0 && frascosRecebidos >= frascosEsperados,
    custoEstimado,
  }
}

/** Estado da compra inteira, para a etiqueta da listagem. */
export type EstadoDaCompra = 'cancelada' | 'aguardando' | 'parcial' | 'recebida' | 'atrasada'

export function estadoDaCompra(c: CompraACaminho, hoje: string): EstadoDaCompra {
  if (c.canceladaEm) return 'cancelada'
  const r = resumoDaCompra(c)
  if (r.completa) return 'recebida'
  // Atrasada só vale para o que ainda não chegou inteiro — e a data prevista
  // precisa existir. Sem previsão não há atraso a apontar, e chutar uma
  // transformaria "não sei quando chega" em cobrança.
  if (c.previstaPara && c.previstaPara < hoje) return 'atrasada'
  return r.frascosRecebidos > 0 ? 'parcial' : 'aguardando'
}

export const ROTULO_DA_COMPRA: Record<EstadoDaCompra, string> = {
  cancelada: 'Cancelada',
  aguardando: 'A caminho',
  parcial: 'Recebida em parte',
  recebida: 'Recebida',
  atrasada: 'Atrasada',
}

/**
 * Valida antes de gravar. Devolve TODOS os problemas, não o primeiro.
 *
 * Formulário que aponta um erro por vez transforma o cadastro em adivinhação
 * em série — a pessoa corrige, salva, e descobre o seguinte.
 */
export function problemasDaCompra(c: {
  fornecedor: string
  compradaEm: string
  previstaPara: string | null
  itens: { descricao: string; quantidade: number }[]
}): string[] {
  const problemas: string[] = []
  if (!c.fornecedor.trim()) problemas.push('Informe o fornecedor.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.compradaEm)) problemas.push('Informe a data da compra.')
  if (c.previstaPara && c.previstaPara < c.compradaEm) {
    problemas.push('A previsão de chegada não pode ser anterior à compra.')
  }
  if (c.itens.length === 0) problemas.push('Adicione ao menos um perfume à compra.')
  if (c.itens.some((i) => !i.descricao.trim())) problemas.push('Todo item precisa de um nome.')
  if (c.itens.some((i) => !Number.isFinite(i.quantidade) || i.quantidade < 1)) {
    problemas.push('A quantidade de cada item precisa ser pelo menos 1.')
  }
  return problemas
}
