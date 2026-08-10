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
 * Converte para o formato que a tabela de extrato guarda.
 *
 * A chave junta data, operação e posição: o mesmo pagamento aparece mais de
 * uma vez no relatório (liberação e tarifa são linhas distintas), e usar só o
 * id da operação faria uma sobrescrever a outra.
 */
export function linhasDeLiberacao(extrato: ExtratoLiberacoes): LinhaExtratoBruta[] {
  const porChave = new Map<string, number>()

  return extrato.linhas.map((l) => {
    const base = `${l.data}:${l.fonte || 's'}`
    const n = (porChave.get(base) ?? 0) + 1
    porChave.set(base, n)

    return {
      chave: `${base}:${n}`,
      ocorrido_em: l.data,
      descricao: l.descricao,
      contraparte: '',
      documento: l.fonte,
      tipo: l.liquido >= 0 ? 'entrada' : 'saida',
      valor: Math.abs(l.liquido),
      pedido_id: null,
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
