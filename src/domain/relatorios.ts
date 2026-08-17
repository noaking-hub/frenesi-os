/**
 * O contrato dos relatórios — domínio puro.
 *
 * Um relatório é uma pergunta com resposta em tabela. Definir isso como
 * CONTRATO, e não como uma tela por pergunta, é o que permite dezenove
 * relatórios sem dezenove telas: a barra de filtros, a ordenação, a exportação
 * e o estado vazio são escritos uma vez e valem para todos. Acrescentar o
 * vigésimo passa a ser escrever uma consulta e um título.
 *
 * Nada aqui toca banco nem React — é a forma da resposta, e é o que os testes
 * conseguem verificar sem subir nada.
 */

export type TipoColuna = 'texto' | 'numero' | 'dinheiro' | 'percentual' | 'data' | 'ml'

export interface ColunaRelatorio {
  chave: string
  rotulo: string
  tipo: TipoColuna
  /** Some no celular: colunas de apoio não valem uma rolagem horizontal. */
  secundaria?: boolean
}

export type CelulaRelatorio = string | number | null
export type LinhaRelatorio = Record<string, CelulaRelatorio>

export interface KpiRelatorio {
  rotulo: string
  valor: string
  nota?: string
}

export interface ResultadoRelatorio {
  colunas: ColunaRelatorio[]
  linhas: LinhaRelatorio[]
  kpis: KpiRelatorio[]
  /**
   * Por que a tabela veio vazia — e de onde o dado viria.
   *
   * Tabela vazia sem explicação é indistinguível de tela quebrada. Quando o
   * relatório sabe o motivo ("o espelho da Yampi não traz resgates"), dizê-lo
   * é a diferença entre o operador entender e o operador abrir um chamado.
   */
  vazioPorque?: string
  /** Quantas linhas existiam antes do corte de exibição. */
  totalAntesDoCorte?: number
}

export type GrupoRelatorio =
  | 'Clientes'
  | 'Cashback'
  | 'Vendas'
  | 'Financeiro'
  | 'Logística'
  | 'Estoque'

export interface FiltrosRelatorio {
  /** Início da janela, `YYYY-MM-DD`. Null = sem limite inferior. */
  de: string | null
  ate: string | null
  uf: string | null
  /** Busca livre — o relatório decide sobre qual coluna ela cai. */
  q: string | null
  /**
   * Quantas linhas devolver.
   *
   * A tela pede 500 porque rolagem infinita não é resposta; a exportação pede
   * tudo, porque lá o corte seria mentira — quem exporta "clientes parados"
   * para uma campanha precisa dos 812, não dos 500 primeiros. Por isso o teto
   * é parâmetro e não constante.
   */
  limite: number
}

/** O teto da TELA. A exportação passa `Infinity`. */
export const LINHAS_NA_TELA = 500

export interface DefinicaoRelatorio {
  id: string
  grupo: GrupoRelatorio
  titulo: string
  /** A PERGUNTA que ele responde. É isso que o operador procura no catálogo. */
  responde: string
  icone: string
  /** Quais controles a barra de filtros mostra. */
  usaData: boolean
  usaUf?: boolean
  usaBusca?: boolean
  /** O que a data significa neste relatório ("data da compra", "vencimento"). */
  notaDaData?: string
}

export const GRUPOS: GrupoRelatorio[] = [
  'Clientes',
  'Cashback',
  'Vendas',
  'Financeiro',
  'Logística',
  'Estoque',
]

/**
 * Ordena as linhas por uma coluna, sem inventar comparação.
 *
 * Texto compara com `localeCompare` em pt-BR (senão "Ácido" cai depois de
 * "Zinco"); número compara como número; nulo vai sempre para o fim, nas duas
 * direções — quem ordena por "maior receita" não quer as linhas sem receita
 * no topo só porque inverteu a seta.
 */
export function ordenarLinhas(
  linhas: LinhaRelatorio[],
  colunas: ColunaRelatorio[],
  chave: string | null,
  desc: boolean,
): LinhaRelatorio[] {
  if (!chave) return linhas
  const coluna = colunas.find((c) => c.chave === chave)
  if (!coluna) return linhas

  const texto = coluna.tipo === 'texto' || coluna.tipo === 'data'
  const sinal = desc ? -1 : 1

  return [...linhas].sort((a, b) => {
    const x = a[chave]
    const y = b[chave]
    if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1
    if (y === null || y === undefined) return -1
    if (texto) return String(x).localeCompare(String(y), 'pt-BR') * sinal
    return (Number(x) - Number(y)) * sinal
  })
}

/** A janela em palavras, para o cabeçalho e para o nome do arquivo. */
export function janelaEmPalavras(de: string | null, ate: string | null): string {
  const dia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
  if (de && ate) return `${dia(de)} a ${dia(ate)}`
  if (de) return `de ${dia(de)} em diante`
  if (ate) return `até ${dia(ate)}`
  return 'todo o período'
}

/**
 * Atalhos de janela. `null` em `dias` significa "desde sempre".
 *
 * O padrão é 30 dias e não "tudo": relatório que abre varrendo dois anos de
 * pedidos demora, e a pergunta quase sempre é sobre o mês.
 */
export const ATALHOS_DE_PERIODO: { chave: string; rotulo: string; dias: number | null }[] = [
  { chave: '7', rotulo: '7 dias', dias: 7 },
  { chave: '30', rotulo: '30 dias', dias: 30 },
  { chave: '90', rotulo: '90 dias', dias: 90 },
  { chave: '365', rotulo: '12 meses', dias: 365 },
  { chave: 'tudo', rotulo: 'Tudo', dias: null },
]

/** Resolve o atalho para uma janela concreta, ancorada no dia informado. */
export function janelaDoAtalho(
  atalho: string,
  hoje: string,
): { de: string | null; ate: string | null } {
  const item = ATALHOS_DE_PERIODO.find((a) => a.chave === atalho)
  if (!item || item.dias === null) return { de: null, ate: null }
  // Meio-dia local evita a viagem de fuso que faz "7 dias" virar 6 ou 8 —
  // o mesmo cuidado do resto do ERP.
  const base = new Date(`${hoje}T12:00:00`)
  base.setDate(base.getDate() - (item.dias - 1))
  return { de: base.toISOString().slice(0, 10), ate: hoje }
}

/** CSV de um resultado: separador ponto e vírgula, que é o que o Excel pt-BR lê. */
export function relatorioParaCsv(r: ResultadoRelatorio): string {
  const escapa = (v: CelulaRelatorio, tipo: TipoColuna) => {
    if (v === null || v === undefined) return ''
    // Número com vírgula decimal: exportar "1234.5" faz o Excel pt-BR tratar
    // a coluna como texto, e aí não soma.
    if (typeof v === 'number') {
      return tipo === 'dinheiro' || tipo === 'percentual' || tipo === 'ml'
        ? v.toFixed(2).replace('.', ',')
        : String(v).replace('.', ',')
    }
    const t = String(v)
    return /[;"\n]/.test(t) ? `"${t.split('"').join('""')}"` : t
  }
  const cabecalho = r.colunas.map((c) => c.rotulo).join(';')
  const corpo = r.linhas.map((l) => r.colunas.map((c) => escapa(l[c.chave], c.tipo)).join(';'))
  return [cabecalho, ...corpo].join('\n')
}
