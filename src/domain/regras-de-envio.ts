/**
 * Quando cada campanha de relacionamento escreve para o cliente.
 *
 * As três — carrinho abandonado, aniversário e cashback vencendo — eram as
 * únicas cujo disparo dependia de alguém abrir a tela e clicar. Os avisos de
 * pedido já rodam sozinhos; estas não, e por isso só aconteciam quando alguém
 * lembrava.
 *
 * Este arquivo é só a FORMA da regra e a validação dela. Quem lê e grava está
 * em `src/data/regras-de-envio.ts`, e quem dispara é a rotina — separados
 * porque a aritmética de "este cliente já merece o segundo toque?" precisa ser
 * testável sem banco, e foi a falta disso que deixou a regra de categoria
 * quebrada por semanas sem ninguém notar.
 */

export type CampanhaDeEnvio = 'carrinho' | 'aniversario' | 'cashback'

/** Um toque da recuperação de carrinho: quando, e se leva cupom. */
export interface ToqueDeCarrinho {
  horas: number
  cupom: boolean
}

export interface RegraDeEnvio {
  campanha: CampanhaDeEnvio
  nome: string
  ligada: boolean
  /**
   * A Yampi também dispara esta campanha.
   *
   * Não bloqueia nada — a decisão de ligar continua sendo do dono. O que a
   * tela faz com este campo é avisar, na hora do clique, que o cliente vai
   * receber dois e-mails do mesmo fato. Bloquear seria o ERP decidir por ele;
   * calar seria deixá-lo descobrir pela reclamação do cliente.
   */
  yampiTambemEnvia: boolean
  observacao: string | null
  atualizadaEm: string | null
  atualizadaPor: string | null

  // ── Carrinho ──────────────────────────────────────────────────────────────
  toques?: ToqueDeCarrinho[]
  /** Carrinho mais velho que isto não é mais recuperável — é histórico. */
  janelaMaxDias?: number

  // ── Aniversário e cashback ────────────────────────────────────────────────
  /**
   * Aniversário: um número (0 = no dia). Cashback: uma lista, um toque por
   * antecedência. São o mesmo conceito com cardinalidade diferente, e unificar
   * num array só faria a tela do aniversário mostrar uma lista de um item.
   */
  diasAntes?: number | number[]

  // ── Cupom, onde houver ────────────────────────────────────────────────────
  cupomPct?: number
  cupomValidadeDias?: number
}

export const LIMITES = {
  horas: { min: 1, max: 720 },
  toques: { min: 1, max: 4 },
  diasAntes: { min: 0, max: 90 },
  pct: { min: 1, max: 90 },
  validadeDias: { min: 1, max: 365 },
} as const

/**
 * O que impede esta regra de ser gravada — vazio quando pode.
 *
 * Devolve TODOS os problemas, não o primeiro: corrigir um campo e descobrir o
 * seguinte só no próximo clique é o formulário fazendo o operador de bobo.
 */
export function problemasDaRegra(r: RegraDeEnvio): string[] {
  const erros: string[] = []

  if (r.campanha === 'carrinho') {
    const toques = r.toques ?? []
    if (toques.length < LIMITES.toques.min || toques.length > LIMITES.toques.max) {
      erros.push(`A recuperação precisa de 1 a ${LIMITES.toques.max} toques.`)
    }
    for (const [i, t] of toques.entries()) {
      if (!Number.isFinite(t.horas) || t.horas < LIMITES.horas.min || t.horas > LIMITES.horas.max) {
        erros.push(`O ${i + 1}º toque precisa de 1 a ${LIMITES.horas.max} horas depois do abandono.`)
      }
    }
    // Toque fora de ordem manda o "última chance" antes do "esqueceu algo?".
    for (let i = 1; i < toques.length; i++) {
      if (toques[i].horas <= toques[i - 1].horas) {
        erros.push(`O ${i + 1}º toque precisa vir DEPOIS do ${i}º — hoje está em ${toques[i].horas}h contra ${toques[i - 1].horas}h.`)
      }
    }
    const janela = r.janelaMaxDias ?? 0
    const ultimo = toques.at(-1)?.horas ?? 0
    if (janela > 0 && ultimo > janela * 24) {
      // Sem esta conferência a regra promete um toque que a busca de carrinhos
      // nunca alcança, e o operador fica esperando um e-mail que não sai.
      erros.push(`O último toque (${ultimo}h) cai fora da janela de ${janela} dias — ele nunca seria enviado.`)
    }
  }

  if (r.campanha === 'aniversario') {
    const d = typeof r.diasAntes === 'number' ? r.diasAntes : NaN
    if (!Number.isFinite(d) || d < 0 || d > LIMITES.diasAntes.max) {
      erros.push('Informe de quantos dias antes do aniversário o presente sai (0 = no dia).')
    }
  }

  if (r.campanha === 'cashback') {
    const lista = Array.isArray(r.diasAntes) ? r.diasAntes : []
    if (lista.length === 0) erros.push('Informe ao menos uma antecedência de aviso.')
    if (lista.some((d) => !Number.isFinite(d) || d < 0 || d > LIMITES.diasAntes.max)) {
      erros.push(`Cada aviso precisa cair entre 0 (no dia) e ${LIMITES.diasAntes.max} dias antes do vencimento.`)
    }
    // Duas datas iguais mandariam dois e-mails no mesmo dia.
    if (new Set(lista).size !== lista.length) erros.push('Há antecedências repetidas na lista.')
  }

  if (r.cupomPct !== undefined) {
    if (r.cupomPct < LIMITES.pct.min || r.cupomPct > LIMITES.pct.max) {
      erros.push(`O desconto precisa ficar entre ${LIMITES.pct.min}% e ${LIMITES.pct.max}%.`)
    }
  }
  if (r.cupomValidadeDias !== undefined) {
    if (r.cupomValidadeDias < LIMITES.validadeDias.min || r.cupomValidadeDias > LIMITES.validadeDias.max) {
      erros.push('A validade do cupom precisa ficar entre 1 e 365 dias.')
    }
  }

  return erros
}

/**
 * Este carrinho já merece algum toque, e qual?
 *
 * Devolve o ÍNDICE do toque devido, ou null. A conta é sobre o toque mais
 * avançado que já venceu, e não sobre o próximo da fila: um carrinho que ficou
 * dois dias parado porque a rotina estava desligada deve receber o toque certo
 * para a idade dele — mandar o "esqueceu algo?" de 4h três dias depois é o
 * sistema anunciando que estava dormindo.
 */
export function toqueDevido(
  regra: RegraDeEnvio,
  horasDesdeAbandono: number,
  toquesJaEnviados: number,
): number | null {
  const toques = regra.toques ?? []
  if (toquesJaEnviados >= toques.length) return null

  let devido: number | null = null
  for (let i = toquesJaEnviados; i < toques.length; i++) {
    if (horasDesdeAbandono >= toques[i].horas) devido = i
  }
  return devido
}

/** Quantos dias de atraso um aviso de cashback ainda tolera antes de calar. */
export const MARGEM_AVISO_DIAS = 3

/**
 * Qual aviso de vencimento este saldo merece HOJE — a antecedência, ou null.
 *
 * A conta é por faixa, não por data exata: exigir o dia certeiro fez clientes
 * a 2 e 1 dia do vencimento ficarem sem aviso nenhum, porque a rotina não
 * rodou (ou a regra não existia) no dia em que eles cruzaram a marca. Vale o
 * aviso mais urgente já cruzado — com margem: um aviso de 15 dias entregue a
 * 5 do vencimento chega tarde demais para ser esse aviso, e despejaria o
 * acumulado no orçamento diário de e-mail. Quem ficou fora da margem entra no
 * próximo aviso da régua normalmente.
 *
 * Saldo já vencido não recebe nada — lamentar por e-mail não devolve o crédito.
 */
export function avisoDevido(
  antecedencias: number[],
  diasParaVencer: number,
  margemDias: number = MARGEM_AVISO_DIAS,
): number | null {
  if (!Number.isFinite(diasParaVencer) || diasParaVencer < 0) return null
  const devido = antecedencias
    .filter((a) => Number.isFinite(a) && a >= diasParaVencer)
    .sort((a, b) => a - b)[0]
  if (devido === undefined) return null
  return devido - diasParaVencer <= margemDias ? devido : null
}
