/**
 * A leitura de saúde das rotinas automáticas.
 *
 * Cada rodada devolve um relatório JSON onde toda etapa que falha escreve um
 * campo `erro` — é a convenção do sistema inteiro. O que faltava era alguém
 * LER esses campos: a varredura de rastreio do Melhor Envio respondeu 422 em
 * toda rodada durante semanas sem que nada acusasse.
 *
 * Aqui mora a conta pura: extrair os erros de um relatório e decidir quando
 * uma repetição vira alerta. Uma falha isolada é a internet piscando; o MESMO
 * ponto falhando em rodadas seguidas é integração quebrada.
 */

export interface ErroDeRotina {
  /** O caminho do campo no relatório — 'rastreioMelhorEnvio', 'espelhoEnvios'. */
  onde: string
  erro: string
}

/** Rodadas seguidas com o mesmo ponto falhando para virar alerta. */
export const RODADAS_PARA_ALERTAR = 3

const TAMANHO_MAX_DO_ERRO = 300

/**
 * Varre o relatório de uma rodada e colhe todo campo `erro` com o caminho.
 *
 * Profundidade limitada e texto truncado: o objetivo é diagnóstico, não
 * arquivar a resposta inteira — o relatório cru continua sendo o dono do
 * detalhe.
 */
export function extrairErros(relatorio: unknown, prefixo = '', profundidade = 0): ErroDeRotina[] {
  if (profundidade > 4 || !relatorio || typeof relatorio !== 'object') return []
  const saida: ErroDeRotina[] = []
  for (const [chave, valor] of Object.entries(relatorio as Record<string, unknown>)) {
    if (chave === 'erro' && typeof valor === 'string' && valor.trim()) {
      saida.push({ onde: prefixo || 'rotina', erro: valor.trim().slice(0, TAMANHO_MAX_DO_ERRO) })
      continue
    }
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
      const caminho = prefixo ? `${prefixo}.${chave}` : chave
      saida.push(...extrairErros(valor, caminho, profundidade + 1))
    }
  }
  return saida
}

export interface RodadaRegistrada {
  rotina: string
  /** ISO — usada só para ordenar; a mais nova decide. */
  rodadaEm: string
  erros: ErroDeRotina[]
}

export interface RotinaDoente {
  rotina: string
  onde: string
  /** Rodadas seguidas, contadas da mais recente para trás. */
  rodadasSeguidas: number
  ultimoErro: string
}

/**
 * Quais pontos estão falhando em rodadas SEGUIDAS, da mais recente para trás.
 *
 * A identidade do problema é o CAMINHO (`onde`), não a mensagem: a mensagem
 * varia (ids, timestamps), o caminho não. E a contagem exige consecutividade
 * a partir da última rodada — um erro que já sumiu não é alerta, é história.
 */
export function rotinasDoentes(
  rodadas: RodadaRegistrada[],
  limiar: number = RODADAS_PARA_ALERTAR,
): RotinaDoente[] {
  const porRotina = new Map<string, RodadaRegistrada[]>()
  for (const r of rodadas) {
    const lista = porRotina.get(r.rotina) ?? []
    lista.push(r)
    porRotina.set(r.rotina, lista)
  }

  const doentes: RotinaDoente[] = []
  for (const [rotina, lista] of porRotina) {
    const ordenada = [...lista].sort((a, b) => b.rodadaEm.localeCompare(a.rodadaEm))
    const ultima = ordenada[0]
    for (const e of ultima?.erros ?? []) {
      let seguidas = 0
      for (const rodada of ordenada) {
        if (!rodada.erros.some((x) => x.onde === e.onde)) break
        seguidas++
      }
      if (seguidas >= limiar) {
        doentes.push({ rotina, onde: e.onde, rodadasSeguidas: seguidas, ultimoErro: e.erro })
      }
    }
  }
  return doentes.sort((a, b) => b.rodadasSeguidas - a.rodadasSeguidas)
}
