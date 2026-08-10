/**
 * Relatório de Liberações do Mercado Pago — o extrato de verdade da conta.
 *
 * A busca de pagamentos (`/v1/payments/search`) lista PAGAMENTOS RECEBIDOS.
 * Saque para o banco, transferência e tarifa avulsa não são pagamentos
 * recebidos, e por isso o ERP mostrou R$ 83 mil numa conta com R$ 10 mil.
 *
 * Este relatório traz o movimento inteiro, saque inclusive, com as colunas
 * que a própria conta declara em `/v1/account/release_report/config`:
 *
 *   DATE · TRANSACTION_APPROVAL_DATE · SOURCE_ID · DESCRIPTION
 *   NET_CREDIT_AMOUNT · NET_DEBIT_AMOUNT · GROSS_AMOUNT
 *   MP_FEE_AMOUNT · TAXES_AMOUNT
 *
 * Tudo aqui é puro: entra o CSV como texto, sai a lista de linhas. É o que
 * permite testar o formato sem uma conta de verdade — e formato foi
 * exatamente onde esta integração errou três vezes.
 */

import type { LinhaExtratoBruta } from './extrato'

export interface LinhaLiberacao {
  /** Data em que o dinheiro se moveu na conta. */
  data: string
  /** Id da operação que originou o movimento — casa com o id do pagamento. */
  fonte: string
  descricao: string
  /** Positivo quando entrou; negativo quando saiu. */
  liquido: number
  bruto: number
  tarifa: number
  impostos: number
}

export interface ExtratoLiberacoes {
  linhas: LinhaLiberacao[]
  /** Cabeçalhos que o arquivo trouxe, para quando nada for reconhecido. */
  cabecalhos: string[]
  avisos: string[]
}

/**
 * Nomes possíveis de cada coluna.
 *
 * O relatório sai no idioma configurado na conta — `pt` nesta —, então os
 * cabeçalhos vêm traduzidos e a grafia varia entre versões. Casar por nome E
 * por posição é o que evita o pior desfecho: um arquivo lido com zeros,
 * porque a coluna mudou de nome e ninguém percebeu.
 */
const COLUNAS: Record<keyof typeof CHAVES, string[]> = {
  data: ['date', 'data', 'fecha'],
  aprovacao: ['transaction_approval_date', 'data_de_aprovacao_da_transacao', 'data_aprovacao'],
  fonte: ['source_id', 'id_da_operacao', 'id_operacao', 'external_reference'],
  descricao: ['description', 'descricao', 'detalhe'],
  credito: ['net_credit_amount', 'valor_liquido_credito', 'credito_liquido', 'valor_credito'],
  debito: ['net_debit_amount', 'valor_liquido_debito', 'debito_liquido', 'valor_debito'],
  bruto: ['gross_amount', 'valor_bruto', 'bruto'],
  tarifa: ['mp_fee_amount', 'tarifa_mp', 'tarifa', 'taxa_mp'],
  impostos: ['taxes_amount', 'impostos', 'valor_impostos'],
}

/** A ordem em que a config da conta declara as colunas. Serve de plano B. */
const CHAVES = {
  data: 0,
  aprovacao: 1,
  fonte: 2,
  descricao: 3,
  credito: 4,
  debito: 5,
  bruto: 6,
  tarifa: 7,
  impostos: 8,
} as const

function normalizar(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** O separador é o que aparece mais vezes na primeira linha. */
function separadorDe(cabecalho: string): string {
  const candidatos = [';', ',', '\t']
  return candidatos.reduce((a, b) =>
    cabecalho.split(b).length > cabecalho.split(a).length ? b : a,
  )
}

/** Divide respeitando aspas — descrição do MP costuma ter vírgula dentro. */
function dividir(linha: string, sep: string): string[] {
  const campos: string[] = []
  let atual = ''
  let dentro = false
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i]
    if (c === '"') {
      if (dentro && linha[i + 1] === '"') {
        atual += '"'
        i += 1
      } else {
        dentro = !dentro
      }
    } else if (c === sep && !dentro) {
      campos.push(atual)
      atual = ''
    } else {
      atual += c
    }
  }
  campos.push(atual)
  return campos.map((v) => v.trim())
}

/**
 * Número do relatório.
 *
 * O Mercado Pago exporta em pt com vírgula decimal e ponto de milhar, mas o
 * mesmo relatório em outra conta sai com ponto decimal. Ler os dois de forma
 * errada transformaria mil reais em um real e vinte — dinheiro que some sem
 * ninguém notar.
 */
function numero(bruto: string): number {
  const t = (bruto ?? '').replace(/[R$\s]/g, '').trim()
  if (!t) return 0
  const comVirgula = t.includes(',')
  const normal = comVirgula ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(normal)
  return Number.isFinite(n) ? n : 0
}

/** `2026-08-10T02:04:43.000-04:00` e `10/08/2026` viram `2026-08-10`. */
function data(bruto: string): string | null {
  const t = (bruto ?? '').trim()
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  return null
}

/**
 * Lê o CSV do Relatório de Liberações.
 *
 * Quando os cabeçalhos não são reconhecidos mas a contagem de colunas bate
 * com a configuração declarada pela conta, cai para a leitura por posição —
 * e avisa. Recusar um relatório inteiro porque uma coluna trocou de nome
 * seria pior; ler em silêncio e errar, muito pior ainda.
 */
export function lerLiberacoes(csv: string): ExtratoLiberacoes {
  const avisos: string[] = []
  const linhasTexto = csv
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)

  if (linhasTexto.length < 2) {
    return { linhas: [], cabecalhos: [], avisos: ['O relatório veio sem linhas.'] }
  }

  const sep = separadorDe(linhasTexto[0])
  const cabecalhos = dividir(linhasTexto[0], sep)
  const normalizados = cabecalhos.map(normalizar)

  const indice: Partial<Record<keyof typeof CHAVES, number>> = {}
  for (const chave of Object.keys(COLUNAS) as (keyof typeof CHAVES)[]) {
    const achou = normalizados.findIndex((h) => COLUNAS[chave].includes(h))
    if (achou >= 0) indice[chave] = achou
  }

  // Sem reconhecer as colunas essenciais, tenta a ordem que a conta declara.
  const porNome = indice.data !== undefined && (indice.credito !== undefined || indice.debito !== undefined)
  if (!porNome) {
    if (cabecalhos.length >= 9) {
      for (const [chave, pos] of Object.entries(CHAVES)) {
        indice[chave as keyof typeof CHAVES] = pos
      }
      avisos.push(
        `Os cabeçalhos não foram reconhecidos (${cabecalhos.join(', ')}); li pela ordem declarada na configuração da conta. Confira dois valores antes de confiar no total.`,
      )
    } else {
      return {
        linhas: [],
        cabecalhos,
        avisos: [
          `Não reconheci as colunas do relatório. Vieram: ${cabecalhos.join(', ')}.`,
        ],
      }
    }
  }

  const pegar = (campos: string[], chave: keyof typeof CHAVES): string => {
    const i = indice[chave]
    return i === undefined ? '' : (campos[i] ?? '')
  }

  const linhas: LinhaLiberacao[] = []
  let semData = 0

  for (const texto of linhasTexto.slice(1)) {
    const campos = dividir(texto, sep)
    const quando = data(pegar(campos, 'data')) ?? data(pegar(campos, 'aprovacao'))
    if (!quando) {
      semData += 1
      continue
    }

    // O relatório separa crédito e débito em colunas próprias; o débito vem
    // positivo em algumas contas e negativo em outras. `abs` nas duas e o
    // sinal decidido pela coluna evita o mesmo valor entrar e sair.
    const credito = Math.abs(numero(pegar(campos, 'credito')))
    const debito = Math.abs(numero(pegar(campos, 'debito')))
    const liquido = Math.round((credito - debito) * 100) / 100
    if (liquido === 0) continue

    linhas.push({
      data: quando,
      fonte: pegar(campos, 'fonte'),
      descricao: pegar(campos, 'descricao') || 'Movimento sem descrição',
      liquido,
      bruto: Math.abs(numero(pegar(campos, 'bruto'))),
      tarifa: Math.abs(numero(pegar(campos, 'tarifa'))),
      impostos: Math.abs(numero(pegar(campos, 'impostos'))),
    })
  }

  if (semData > 0) {
    avisos.push(`${semData} linha(s) sem data ficaram de fora.`)
  }

  return { linhas, cabecalhos, avisos }
}

/**
 * O que cada movimento do relatório quer dizer, em português.
 *
 * A coluna DESCRIPTION vem com o nome interno da operação — `payment`,
 * `reserve_for_payout`, `payout`. Deixar isso na tela obriga quem lê a
 * decorar jargão de API para saber se R$ 25 saíram ou só foram reservados,
 * e "reserve_for_payout" aparecendo duas vezes com sinais opostos parece
 * erro quando é só o dinheiro sendo separado antes de sair.
 */
const MOVIMENTOS: Record<string, string> = {
  payment: 'Venda recebida',
  refund: 'Estorno ao cliente',
  partial_refund: 'Estorno parcial ao cliente',
  chargeback: 'Chargeback',
  dispute: 'Disputa aberta pelo cliente',
  payout: 'Transferência para o banco',
  payout_reversal: 'Transferência devolvida',
  withdrawal: 'Saque',
  transfer: 'Transferência',
  money_transfer: 'Transferência',
  reserve_for_payout: 'Reserva para transferência',
  reserve_for_refund: 'Reserva para estorno',
  reserve_for_dispute: 'Reserva para disputa',
  reserve_for_bpp_shipping_return: 'Reserva para devolução de frete',
  release: 'Liberação de reserva',
  settlement: 'Liquidação',
  tax: 'Imposto retido',
  fee: 'Tarifa do Mercado Pago',
  mp_fee: 'Tarifa do Mercado Pago',
  shipping: 'Frete',
  credit_payment: 'Pagamento com saldo',
  cash_out: 'Saque em dinheiro',
}

/**
 * Traduz o movimento, preservando o que não conhece.
 *
 * Um nome novo do Mercado Pago aparece cru na tela em vez de sumir ou virar
 * "Outro" — é assim que se descobre que existe um tipo de movimento que o ERP
 * ainda não entende, em vez de nunca descobrir.
 */
export function descreverMovimento(bruto: string): string {
  const chave = normalizar(bruto)
  return MOVIMENTOS[chave] ?? (bruto.trim() || 'Movimento sem descrição')
}

/**
 * Movimentos da própria conta — a conta se mexendo, não uma despesa.
 *
 * Saque e reserva mudam o saldo e não têm decisão nenhuma a tomar: não são
 * receita, não são custo, não têm categoria. Deixá-los na fila de
 * classificação enche a tela de trabalho inventado, e uma fila cheia de
 * trabalho inventado é uma fila que ninguém olha — inclusive a despesa de
 * verdade que está no meio dela.
 *
 * Note que não é o mesmo que dispensar: dispensado sai do saldo, e um saque
 * fora do saldo é o defeito que mostrou R$ 83 mil numa conta com R$ 10 mil.
 */
const INTERNOS = new Set([
  'payout',
  'payout_reversal',
  'withdrawal',
  'transfer',
  'money_transfer',
  'cash_out',
  'reserve_for_payout',
  'reserve_for_refund',
  'reserve_for_dispute',
  'reserve_for_bpp_shipping_return',
  'release',
])

export function movimentoInterno(bruto: string): boolean {
  return INTERNOS.has(normalizar(bruto))
}

/** O que a tela e o cron precisam saber de um relatório para decidir. */
export interface RelatorioListado {
  de: string
  ate: string
  jaImportado: boolean
}

/**
 * Este relatório serve para atualizar a janela pedida?
 *
 * É a decisão que a tela passou a tomar sozinha, e é a que erra sem avisar.
 * Duas condições, cada uma por um motivo diferente:
 *
 *   começa antes  →  o excedente do começo é descartado no recorte, então
 *                    sobrar é inofensivo; faltar deixa buraco no extrato.
 *   alcança o fim →  um relatório que para três dias atrás seria importado e
 *                    daria a atualização por concluída, escondendo as vendas
 *                    mais recentes. Esse é o pior desfecho: parece sucesso.
 *
 * Um dia de folga no fim porque o relatório é montado no fuso do Mercado Pago
 * e o "hoje" daqui pode estar algumas horas à frente do "hoje" de lá.
 */
export function relatorioServe(r: RelatorioListado, de: string, ate: string): boolean {
  if (r.jaImportado) return false
  if (!r.de || !r.ate) return false
  return r.de <= de && r.ate >= diaAnterior(ate)
}

function diaAnterior(iso: string): string {
  const t = Date.parse(`${iso}T12:00:00Z`)
  if (!Number.isFinite(t)) return iso
  return new Date(t - 86_400_000).toISOString().slice(0, 10)
}

/**
 * Descarta o que está fora da janela.
 *
 * É o que torna seguro escolher o relatório sem perguntar: o Mercado Pago
 * entrega o arquivo do período que quiser — o pedido de 22/07 a 10/08 pode
 * voltar como 10/07 a 11/08 — e o excedente traria para o caixa desta loja o
 * movimento de uma operação anterior.
 */
export function recortarJanela(
  linhas: LinhaLiberacao[],
  de: string,
  ate: string,
): LinhaLiberacao[] {
  return linhas.filter((l) => l.data >= de && l.data <= ate)
}

/**
 * Converte para o formato que a tabela de extrato guarda.
 *
 * A chave descreve o CONTEÚDO da linha — dia, operação, movimento, valor —, e
 * não a posição dela no arquivo. A diferença aparece na segunda importação: o
 * relatório de hoje contém tudo o que o de ontem tinha mais o movimento novo,
 * e uma chave posicional faria cada linha antiga cair numa posição diferente
 * e entrar de novo. O saldo dobraria a cada atualização, que é a falha que
 * ninguém percebe olhando a tela — só olhando o banco.
 *
 * O contador no fim continua existindo porque duas linhas idênticas no mesmo
 * dia são possíveis: dois estornos de R$ 18,94 do mesmo pedido são dois
 * fatos, não um repetido.
 */
export function linhasDeLiberacao(extrato: ExtratoLiberacoes): LinhaExtratoBruta[] {
  const porChave = new Map<string, number>()

  return extrato.linhas.map((l) => {
    const centavos = Math.round(l.liquido * 100)
    const base = [
      l.data,
      l.fonte || 's',
      normalizar(l.descricao).slice(0, 28) || 'x',
      centavos,
    ].join(':')
    const n = (porChave.get(base) ?? 0) + 1
    porChave.set(base, n)

    return {
      chave: `${base}:${n}`,
      ocorrido_em: l.data,
      descricao: descreverMovimento(l.descricao),
      contraparte: '',
      documento: l.fonte,
      tipo: l.liquido >= 0 ? 'entrada' : 'saida',
      valor: Math.abs(l.liquido),
      pedido_id: null,
      interno: movimentoInterno(l.descricao),
      bruto: {
        bruto: l.bruto,
        tarifa: l.tarifa,
        impostos: l.impostos,
        fonte: l.fonte,
        origem_relatorio: 'liberacoes',
      },
    }
  })
}
