/**
 * Leitura do texto do Assessor.
 *
 * O modelo responde em texto corrido com marcações leves de markdown. Puxar
 * uma biblioteca de markdown para isso custaria mais do que resolve — e o que
 * chega aqui é texto de máquina, não HTML de terceiro, então o risco não é o
 * mesmo. Este módulo converte a resposta em blocos que a tela desenha, e nada
 * do que ele devolve é interpretado como HTML: a tela imprime `texto` como
 * texto. É por isso que a conversão vive aqui, pura e testável, em vez de num
 * `dangerouslySetInnerHTML` no componente.
 */

export type Bloco =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'paragrafo'; partes: Trecho[] }
  | { tipo: 'lista'; itens: Trecho[][] }

export interface Trecho {
  texto: string
  forte: boolean
}

/**
 * Quebra **negrito** em trechos.
 *
 * O par de asteriscos precisa fechar: `**a` sem fechamento é asterisco
 * literal, e engolir isso deixaria o texto sem um pedaço.
 */
export function trechos(linha: string): Trecho[] {
  const saida: Trecho[] = []
  let resto = linha
  while (resto.length > 0) {
    const abre = resto.indexOf('**')
    if (abre === -1) break
    const fecha = resto.indexOf('**', abre + 2)
    if (fecha === -1) break
    if (abre > 0) saida.push({ texto: resto.slice(0, abre), forte: false })
    const forte = resto.slice(abre + 2, fecha)
    if (forte) saida.push({ texto: forte, forte: true })
    resto = resto.slice(fecha + 2)
  }
  if (resto.length > 0) saida.push({ texto: resto, forte: false })
  return saida.length > 0 ? saida : [{ texto: linha, forte: false }]
}

const MARCA_LISTA = /^\s*([-*•]|\d+[.)])\s+/

/** Converte a resposta inteira em blocos, agrupando itens de lista vizinhos. */
export function blocosDaResposta(texto: string): Bloco[] {
  const blocos: Bloco[] = []
  let lista: Trecho[][] | null = null

  const fecharLista = () => {
    if (lista) blocos.push({ tipo: 'lista', itens: lista })
    lista = null
  }

  for (const bruta of texto.split('\n')) {
    const linha = bruta.trimEnd()
    if (!linha.trim()) {
      fecharLista()
      continue
    }
    if (MARCA_LISTA.test(linha)) {
      const item = trechos(linha.replace(MARCA_LISTA, ''))
      lista = lista ? [...lista, item] : [item]
      continue
    }
    fecharLista()
    const cabecalho = /^#{1,4}\s+(.*)$/.exec(linha)
    if (cabecalho) {
      blocos.push({ tipo: 'titulo', texto: cabecalho[1] })
      continue
    }
    // Linha inteiramente em negrito também é título: é como o modelo separa
    // seções quando não usa `#`.
    // Os dois pontos podem estar dentro ou fora dos asteriscos — o modelo
    // escreve dos dois jeitos, e nenhum deles é conteúdo do título.
    const soForte = /^\*\*(.+?):?\*\*:?$/.exec(linha.trim())
    if (soForte) {
      blocos.push({ tipo: 'titulo', texto: soForte[1] })
      continue
    }
    blocos.push({ tipo: 'paragrafo', partes: trechos(linha) })
  }
  fecharLista()
  return blocos
}

/** Rótulo humano de cada ferramenta, para a tela dizer o que foi consultado. */
export const ROTULO_DA_FERRAMENTA: Record<string, string> = {
  resumo_do_periodo: 'Resumo do período',
  faturamento_por_dia: 'Faturamento por dia',
  situacao_do_caixa: 'Situação do caixa',
  visao_financeira: 'Visão financeira',
  lancamentos_pendentes: 'Lançamentos pendentes',
  conciliacao_pendente: 'Conciliação pendente',
  estoque_e_cobertura: 'Estoque e cobertura',
  prioridades_do_dia: 'Prioridades do dia',
  extrato_recente: 'Extrato recente',
}

export function rotuloDaFerramenta(nome: string): string {
  return ROTULO_DA_FERRAMENTA[nome] ?? nome.replace(/_/g, ' ')
}
