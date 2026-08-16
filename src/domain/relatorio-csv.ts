/**
 * Relatórios exportáveis do Gerente — §4.5.
 *
 * O escopo pede exportação "quando a origem permitir", e a frase carrega a
 * regra inteira: nem toda resposta é uma tabela. O DRE volta aninhado, a
 * situação do caixa volta como um objeto único, e forçar CSV nesses casos
 * produziria um arquivo com uma linha e a palavra `[object Object]` em três
 * colunas. Pior do que não exportar é exportar lixo com cara de planilha.
 *
 * Então quem decide é o DADO, não o botão: `tabelaDoResultado` devolve `null`
 * quando o resultado não é tabular, e a interface só oferece o download quando
 * há tabela de verdade — nunca um botão que falha depois do clique.
 *
 * Módulo puro: nada de I/O, nada de Supabase. O que ele recebe é o mesmo objeto
 * que a ferramenta devolveu ao modelo, e o que ele entrega é texto.
 */

export interface Tabela {
  colunas: string[]
  linhas: Record<string, unknown>[]
  /** Campos que existiam na origem mas não cabem numa célula (listas aninhadas). */
  omitidas: string[]
}

/** Profundidade e largura máximas — planilha não é dump de banco. */
const MAX_COLUNAS = 60
const MAX_LINHAS = 5000

function ehEscalar(v: unknown): boolean {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v)
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Achata UM nível. `{ base: { nome, ml } }` vira `base.nome` e `base.ml`.
 *
 * Um nível e não N porque o contrato das ferramentas (§ das ferramentas) já é
 * raso por desenho; recursão irrestrita aqui só serviria para transformar um
 * relatório de vinte linhas numa planilha de duzentas colunas.
 */
function achatar(linha: Record<string, unknown>): {
  celulas: Record<string, unknown>
  omitidas: string[]
} {
  const celulas: Record<string, unknown> = {}
  const omitidas: string[] = []
  for (const [chave, valor] of Object.entries(linha)) {
    if (ehEscalar(valor)) {
      celulas[chave] = valor
    } else if (ehObjeto(valor)) {
      for (const [sub, v] of Object.entries(valor)) {
        if (ehEscalar(v)) celulas[`${chave}.${sub}`] = v
        else omitidas.push(`${chave}.${sub}`)
      }
    } else {
      omitidas.push(chave)
    }
  }
  return { celulas, omitidas }
}

/**
 * Encontra a tabela dentro do resultado de uma ferramenta.
 *
 * Procura `items` — o nome do contrato padronizado — e aceita `itens` porque
 * algumas ferramentas antigas nasceram em português. Fora isso, um array de
 * objetos na raiz também vale: é o formato mais óbvio possível.
 */
export function tabelaDoResultado(dados: unknown): Tabela | null {
  const bruto = acharArray(dados)
  if (!bruto || bruto.length === 0) return null

  const linhas: Record<string, unknown>[] = []
  const ordem: string[] = []
  const vistas = new Set<string>()
  const omitidas = new Set<string>()

  for (const item of bruto.slice(0, MAX_LINHAS)) {
    if (!ehObjeto(item)) return null
    const { celulas, omitidas: fora } = achatar(item)
    for (const c of Object.keys(celulas)) {
      if (!vistas.has(c) && ordem.length < MAX_COLUNAS) {
        vistas.add(c)
        ordem.push(c)
      }
    }
    for (const f of fora) omitidas.add(f)
    linhas.push(celulas)
  }

  if (ordem.length === 0) return null
  return { colunas: ordem, linhas, omitidas: [...omitidas] }
}

function acharArray(dados: unknown): unknown[] | null {
  if (Array.isArray(dados)) return dados
  if (!ehObjeto(dados)) return null
  for (const chave of ['items', 'itens']) {
    const v = dados[chave]
    if (Array.isArray(v)) return v
  }
  return null
}

/** `valor_total` → `Valor total`. Cabeçalho é para humano, não para o parser. */
export function rotuloDaColuna(chave: string): string {
  const texto = chave
    .replace(/\./g, ' · ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase()
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

const ISO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/
const ISO_INSTANTE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/

/**
 * Formata uma célula para o Excel brasileiro.
 *
 * Duas conversões que parecem cosméticas e não são: `2026-08-16` vira
 * `16/08/2026` porque o Excel pt-BR lê a forma ISO como texto e depois recusa
 * ordenar por data; e o ponto decimal vira vírgula porque, sem isso, `1234.50`
 * entra na planilha como mil duzentos e trinta e quatro mil e quinhentos.
 */
export function celulaParaCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não'
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return ''
    return Number.isInteger(valor) ? String(valor) : valor.toFixed(2).replace('.', ',')
  }

  const texto = String(valor)
  const data = ISO_DATA.exec(texto)
  if (data) return `${data[3]}/${data[2]}/${data[1]}`
  const instante = ISO_INSTANTE.exec(texto)
  if (instante) return `${instante[3]}/${instante[2]}/${instante[1]} ${instante[4]}:${instante[5]}`
  return texto
}

/**
 * Neutraliza fórmula em célula de texto.
 *
 * O nome do cliente e a descrição do lançamento vêm da Shopify e do banco —
 * texto de terceiro. Um valor que começa com `=` é executado pelo Excel ao
 * abrir o arquivo, e isso já foi vetor de ataque real em ERP de verdade. O
 * apóstrofo à frente resolve: o Excel mostra o texto e não avalia nada.
 *
 * Só se aplica a texto. Número é formatado por nós, e blindar `-12,40` aqui
 * transformaria todo valor negativo do extrato numa string torta.
 */
function semFormula(texto: string): string {
  return /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto
}

function escapar(texto: string): string {
  return `"${texto.replace(/"/g, '""')}"`
}

/**
 * A planilha inteira, com BOM.
 *
 * `;` como separador e BOM na frente porque é o que o Excel brasileiro abre com
 * dois cliques. Sem o BOM, "Perfume Nº 5" chega como "PerfumeÂ NÂº 5" e o
 * usuário conclui, com razão, que o ERP não sabe escrever português.
 */
export function paraCsv(tabela: Tabela): string {
  const cabecalho = tabela.colunas.map((c) => escapar(rotuloDaColuna(c)))
  const corpo = tabela.linhas.map((linha) =>
    tabela.colunas.map((c) => {
      const valor = linha[c]
      const celula = celulaParaCsv(valor)
      return escapar(typeof valor === 'string' ? semFormula(celula) : celula)
    }),
  )
  return `﻿${[cabecalho, ...corpo].map((l) => l.join(';')).join('\r\n')}\r\n`
}

/** `resumo_do_periodo` + 2026-08-16 → `frenesi-resumo-do-periodo-2026-08-16.csv`. */
export function nomeDoArquivo(ferramenta: string, dia: string): string {
  const limpo = ferramenta.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  return `frenesi-${limpo}-${dia}.csv`
}
