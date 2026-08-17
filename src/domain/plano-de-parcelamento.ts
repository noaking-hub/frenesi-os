import { brl } from './format'
import {
  INTERVALO_PADRAO_DIAS,
  MAX_PARCELAS,
  MIN_PARCELAS,
  cronogramaDeParcelas,
} from './parcelamento'

/**
 * O parcelamento em que as K primeiras parcelas JÁ FORAM RECEBIDAS.
 *
 * O caso que obrigou isto a existir: a venda saiu em 2x e o lançamento só foi
 * feito depois que a primeira parcela caiu na conta. O ERP gravou a venda
 * inteira e baixada — R$ 216,00 recebidos em 12/08 — quando de verdade só
 * R$ 108,00 tinham entrado. O que a operação precisa registrar é "1/2 recebida
 * em 12/08, com data retroativa, e 2/2 em aberto vencendo depois", e não havia
 * como dizer isso: `parcelar_lancamento` recusava lançamento baixado e
 * `gravar_parcelas_do_lancamento` gravava `recebido = 0` em toda parcela.
 *
 * Por que um arquivo novo e não mais uma função em `parcelamento.ts`: aquele
 * arquivo é a aritmética da divisão e continua sendo só isso. Este COMPÕE em
 * cima dela — quem reparte o valor e espaça os vencimentos continua sendo
 * `cronogramaDeParcelas`. O que se acrescenta aqui é uma informação por
 * parcela: essa já virou dinheiro na conta, ou ainda não. Copiar a divisão para
 * cá criaria a quarta cópia da mesma conta, que é exatamente o que
 * `parcelamento.ts` foi criado para acabar.
 *
 * Com `jaRecebidas = 0` o resultado é, parcela por parcela, o parcelamento que
 * o ERP já fazia antes. Não é um segundo mecanismo: é o mesmo, com K = 0 como
 * caso particular.
 *
 * Por que devolve `{ ok: false, erro }` em vez de lançar exceção: quem chama é
 * uma prévia, recalculada a cada tecla, e a regra da casa é que a tela DIGA o
 * motivo em uma linha em vez de deixar botão inerte. Um `throw` no meio da
 * digitação derrubaria o diálogo para dizer que o campo ainda está pela metade.
 *
 * O que esta função NÃO decide: se o dinheiro marcado como recebido existe. Ela
 * não conhece o lançamento de origem, então o invariante "o parcelamento não
 * pode marcar como recebido mais do que já estava recebido" mora no banco,
 * dentro de `parcelar_lancamento` — é lá que `recebido` do pai é legível. Aqui
 * só se garante que o plano é aritmeticamente possível e gravável.
 */

export interface ParcelaDoPlano {
  /** 1-based, como aparece no "(1/2)" da descrição gravada. */
  numero: number
  valor: number
  /**
   * AAAA-MM-DD. Na parcela JÁ RECEBIDA é a data do recebimento, não o
   * vencimento calculado: parcela liquidada não tem obrigação futura, e uma
   * data lá na frente numa linha já quitada faria a coluna "vence" contradizer
   * o "baixado em" da mesma linha.
   */
  venceEm: string
  /** AAAA-MM-DD quando a parcela já entrou na conta; null quando está em aberto. */
  recebidaEm: string | null
}

export interface ParcelamentoDesejado {
  valor: number
  parcelas: number
  /** AAAA-MM-DD. Vencimento da 1ª; as outras somam o intervalo em dias corridos. */
  primeiroVencimento: string
  intervaloDias?: number
  /** K: quantas das primeiras parcelas já foram recebidas. Zero é o padrão. */
  jaRecebidas?: number
  /** AAAA-MM-DD em que as K primeiras entraram. Obrigatória quando K > 0. */
  recebidasEm?: string | null
}

export type PlanoDeParcelamento =
  | {
      ok: true
      parcelas: ParcelaDoPlano[]
      /** Soma das parcelas já recebidas — o que o caixa já tem. */
      recebido: number
      /** Soma das parcelas em aberto — o que ainda vai entrar. */
      emAberto: number
    }
  | { ok: false; erro: string }

/**
 * Rejeita 2026-02-31: o formato bate, a data não existe.
 *
 * Cópia deliberada da checagem que vive em `acoes-gerenciais.ts`: o domínio é
 * puro e não importa da camada de app — a dependência corre no sentido
 * contrário. São seis linhas; unificá-las exigiria arrastar a action para
 * dentro do domínio ou criar um módulo de datas só para isto.
 */
function dataValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const d = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso
}

/** Soma em centavos inteiros: `reduce` de floats devolve 107,99999999999999. */
function somaExata(valores: number[]): number {
  return valores.reduce((a, v) => a + Math.round(v * 100), 0) / 100
}

/**
 * Monta o plano completo: quanto, quando, e o que já entrou.
 *
 * As recusas repetem, uma a uma, as que o Postgres levanta em
 * `gravar_parcelas_do_lancamento` — de propósito. Esta função existe para que a
 * tela possa dizer ANTES do clique o que o banco faria depois dele; uma recusa
 * que só o banco conhece chega ao operador como erro de Postgres em inglês,
 * dentro de um `catch` genérico.
 */
export function planejarParcelamento(desejado: ParcelamentoDesejado): PlanoDeParcelamento {
  const { valor, primeiroVencimento } = desejado
  const n = Math.trunc(desejado.parcelas)
  const k = Math.trunc(desejado.jaRecebidas ?? 0)
  const intervalo = Math.trunc(desejado.intervaloDias ?? INTERVALO_PADRAO_DIAS)
  const recebidasEm = desejado.recebidasEm ?? ''
  // Em centavos inteiros porque é assim que o dinheiro existe. `valor` pode
  // chegar NaN de um campo em branco, e NaN <= 0 é `false` — a checagem de
  // finito precisa vir antes, ou o NaN atravessaria todas as outras.
  const centavos = Number.isFinite(valor) ? Math.round(valor * 100) : Number.NaN

  if (!Number.isFinite(centavos) || centavos <= 0) {
    return { ok: false, erro: 'O valor a parcelar precisa ser maior que zero.' }
  }
  if (!(n >= MIN_PARCELAS)) {
    return { ok: false, erro: `O parcelamento exige ao menos ${MIN_PARCELAS} parcelas.` }
  }
  if (n > MAX_PARCELAS) {
    return { ok: false, erro: `O parcelamento aceita no máximo ${MAX_PARCELAS} parcelas.` }
  }
  if (!(intervalo >= 1)) {
    return { ok: false, erro: 'O intervalo entre parcelas precisa ser de ao menos 1 dia.' }
  }
  if (!dataValida(primeiroVencimento)) {
    return { ok: false, erro: 'Informe a data do primeiro vencimento no formato AAAA-MM-DD.' }
  }
  // Menos centavos que parcelas significa parcela de R$ 0,00 — e a tabela
  // `lancamentos` tem CHECK (valor > 0). Sem esta recusa, a prévia mostraria um
  // cronograma bonito e o INSERT morreria em violação de constraint, com uma
  // mensagem de Postgres que o operador não tem como interpretar.
  if (centavos < n) {
    return {
      ok: false,
      erro: `${brl(valor)} não se divide em ${n} parcelas: sobraria parcela de R$ 0,00, e o lançamento de valor zero é recusado.`,
    }
  }
  if (!(k >= 0)) {
    return { ok: false, erro: 'Informe quantas parcelas já foram recebidas — zero ou mais.' }
  }
  // O caso que o dono encontraria digitando: 3 recebidas num parcelamento de 2.
  // Aceitar isso marcaria como recebida uma parcela que não existe, e a soma do
  // que "entrou" passaria do valor da venda.
  if (k > n) {
    return {
      ok: false,
      erro: `Não dá para marcar ${k} parcelas já recebidas em um parcelamento de ${n}.`,
    }
  }
  // Sem a data, a baixa não tem dia — e é o dia que o fluxo de caixa usa para
  // saber em que coluna o dinheiro entrou. Assumir "hoje" para um recebimento
  // retroativo jogaria a entrada de 12/08 no dia do cadastro.
  if (k > 0 && !dataValida(recebidasEm)) {
    return { ok: false, erro: 'Informe a data em que as parcelas já recebidas entraram na conta.' }
  }

  const parcelas = cronogramaDeParcelas(valor, n, intervalo, primeiroVencimento).map((p) => {
    const recebida = p.numero <= k
    return {
      numero: p.numero,
      valor: p.valor,
      venceEm: recebida ? recebidasEm : p.venceEm,
      recebidaEm: recebida ? recebidasEm : null,
    }
  })

  return {
    ok: true,
    parcelas,
    recebido: somaExata(parcelas.filter((p) => p.recebidaEm).map((p) => p.valor)),
    emAberto: somaExata(parcelas.filter((p) => !p.recebidaEm).map((p) => p.valor)),
  }
}

export interface EfeitoDoParcelamento {
  /** Depois − antes. Negativo quando o parcelamento desmarca dinheiro que não entrou. */
  diferenca: number
  /** Quanto muda o saldo CALCULADO — o número do diálogo "Calculado pelo ERP". */
  variacaoNoCalculado: number
  /**
   * Quanto muda o saldo EXIBIDO em Contas e Caixas, no painel e no fluxo.
   *
   * Costuma ser ZERO quando a conta tem saldo informado à mão e a baixa é
   * anterior à data desse saldo — e é por isso que este campo existe separado
   * do de cima. Avisar "o saldo do Inter cai R$ 108,00" e o dono conferir na
   * tela um número que não se mexeu destruiria a confiança na prévia inteira.
   */
  variacaoNoDisponivel: number
  /**
   * O plano marcaria como movimentado MAIS do que já estava. `parcelar_lancamento`
   * recusa, e a tela precisa dizer isso antes do clique — o erro do Postgres
   * chegaria como texto de exceção dentro de um catch genérico.
   */
  inventaDinheiro: boolean
}

/**
 * O que este parcelamento faz com o saldo da conta — ANTES do clique.
 *
 * Espelha, em TypeScript, a view `saldos_das_contas` do Postgres, do mesmo
 * jeito que `cronogramaDeParcelas` espelha a divisão do SQL. Duas regras dela
 * mandam no resultado, e nenhuma é óbvia olhando a tela:
 *
 * 1. Só linha BAIXADA entra em qualquer saldo — `baixado_em is not null`. Um
 *    lançamento com `recebido = 669,00` e `baixado_em` nulo (existem três
 *    assim na base, cicatriz da baixa parcial de `registrar_recebimento`) é
 *    dinheiro invisível para todas as views: desmarcá-lo não muda saldo nenhum.
 * 2. `saldo_disponivel` só soma baixas POSTERIORES à data do saldo informado.
 *    Quem informou o saldo do Inter para 17/08 já não estava contando a baixa
 *    de 12/08 — mexer nela não move o número exibido, só o calculado.
 *
 * Entrada soma e saída subtrai porque é assim que a view acumula
 * (`case when tipo='entrada' then recebido else -recebido end`): desmarcar
 * R$ 108,00 de uma DESPESA devolve R$ 108,00 ao saldo.
 */
export function efeitoDoParcelamento(entrada: {
  tipo: 'entrada' | 'saida'
  movimentadoAntes: number
  /** A data de baixa que o lançamento tem hoje; nulo é dinheiro fora dos saldos. */
  baixadoEmAntes: string | null
  movimentadoDepois: number
  /** A data em que as K parcelas nascem baixadas; nulo quando K = 0. */
  baixadoEmDepois: string | null
  /** Data do saldo informado da conta; nulo quando o saldo é o calculado. */
  saldoInformadoPara: string | null
}): EfeitoDoParcelamento {
  const sinal = entrada.tipo === 'entrada' ? 1 : -1
  const antes = Math.round(entrada.movimentadoAntes * 100)
  const depois = Math.round(entrada.movimentadoDepois * 100)

  // Sem data de baixa, a linha não existe para nenhuma view de saldo.
  const noCalculado = (centavos: number, quando: string | null) => (quando ? centavos : 0)
  // Com saldo informado, a âncora corta tudo o que é daquele dia ou de antes.
  const noDisponivel = (centavos: number, quando: string | null) => {
    if (entrada.saldoInformadoPara === null) return noCalculado(centavos, quando)
    return quando && quando > entrada.saldoInformadoPara ? centavos : 0
  }

  return {
    diferenca: (depois - antes) / 100,
    variacaoNoCalculado:
      (sinal *
        (noCalculado(depois, entrada.baixadoEmDepois) -
          noCalculado(antes, entrada.baixadoEmAntes))) /
      100,
    variacaoNoDisponivel:
      (sinal *
        (noDisponivel(depois, entrada.baixadoEmDepois) -
          noDisponivel(antes, entrada.baixadoEmAntes))) /
      100,
    // A mesma tolerância de meio centavo que o `raise exception` do banco usa:
    // recusar por 1e-9 de ponto flutuante seria recusar o parcelamento exato.
    inventaDinheiro: depois > antes + 0.5,
  }
}
