import { frascoDe } from './fracionamento'
import type { FrascoMl, VarianteMl } from './types'

/**
 * Insumos de envase: o que compõe o decant além do líquido.
 *
 * Um decant é frasco + válvula + tampa + perfume. O ERP controlava só o
 * perfume, e acabar tampa trava a operação igual a acabar perfume — com o
 * agravante de ninguém ver chegando.
 *
 * Cada tamanho de frasco tem os seus: a válvula do 8 ml não serve no 15 ml.
 */

export type TipoInsumo = 'frasco' | 'valvula' | 'tampa' | 'outro'

export const ROTULO_INSUMO: Record<TipoInsumo, string> = {
  frasco: 'Frasco',
  valvula: 'Válvula',
  tampa: 'Tampa',
  outro: 'Outro',
}

export interface Insumo {
  id: string
  nome: string
  tipo: TipoInsumo
  /** 8 ou 15. Nulo quando o item serve a qualquer frasco. */
  frascoMl: FrascoMl | null
  unidades: number
  custoUnitario: number
  /** Abaixo disto a tela pede compra. Zero desliga o alerta. */
  minimo: number
  ativo: boolean
}

export interface InsumoAvaliado {
  insumo: Insumo
  /** Unidades comprometidas pelos pedidos já pagos e não faturados. */
  necessario: number
  /** Saldo menos o que a fila vai consumir. Negativo é falta. */
  sobra: number
  falta: number
  valorEmEstoque: number
  estado: 'ok' | 'baixo' | 'insuficiente' | 'zerado'
  /** Dias de cobertura pelo consumo médio, quando há histórico. */
  coberturaDias: number | null
}

/**
 * Quantas unidades de cada insumo um conjunto de decants consome.
 *
 * Um de cada por decant: um frasco, uma válvula, uma tampa. Só o FRASCO
 * depende do tamanho — a válvula e a tampa são as mesmas nos dois, então
 * levam o total do pedido, não a fatia por tamanho.
 */
export function insumosDoEnvase(itens: { variante: VarianteMl; unidades: number }[]): Map<string, number> {
  const consumo = new Map<string, number>()
  let total = 0
  for (const i of itens) {
    const id = `frasco-${frascoDe(i.variante)}`
    consumo.set(id, (consumo.get(id) ?? 0) + i.unidades)
    total += i.unidades
  }
  if (total > 0) {
    // Os ids guardam o sufixo antigo por causa do histórico já gravado; o
    // que a tela mostra é o nome, e ele diz "Válvula spray" e "Tampa".
    consumo.set('valvula-8', total)
    consumo.set('tampa-8', total)
  }
  return consumo
}

/**
 * O estado de um insumo contra a fila de envase.
 *
 * `necessario` vem dos pedidos pagos que ainda não saíram — é a demanda já
 * vendida. Um insumo com saldo positivo mas abaixo dela está insuficiente,
 * ainda que pareça cheio.
 */
export function avaliarInsumo(
  insumo: Insumo,
  necessario = 0,
  consumoDiario = 0,
): InsumoAvaliado {
  const sobra = insumo.unidades - necessario
  const falta = Math.max(0, necessario - insumo.unidades)

  const estado: InsumoAvaliado['estado'] =
    insumo.unidades === 0
      ? 'zerado'
      : falta > 0
        ? 'insuficiente'
        : insumo.minimo > 0 && insumo.unidades <= insumo.minimo
          ? 'baixo'
          : 'ok'

  return {
    insumo,
    necessario,
    sobra,
    falta,
    valorEmEstoque: insumo.unidades * insumo.custoUnitario,
    estado,
    // Sem consumo não há prazo — mesma regra do perfume: nada de "0 dias"
    // para quem não gira.
    coberturaDias: consumoDiario > 0 ? Math.round(insumo.unidades / consumoDiario) : null,
  }
}

export const ROTULO_ESTADO_INSUMO: Record<InsumoAvaliado['estado'], string> = {
  ok: 'Suficiente',
  baixo: 'Abaixo do mínimo',
  insuficiente: 'Não cobre a fila',
  zerado: 'Zerado',
}
