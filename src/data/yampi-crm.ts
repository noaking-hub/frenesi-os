import 'server-only'

/**
 * Cupons e carrinhos abandonados, direto da Yampi.
 *
 * Estas telas leem ao vivo em vez de importar para o banco: cupom e carrinho
 * são retratos do momento — um carrinho recuperado some da lista, um cupom
 * pausado muda de estado — e uma cópia local estaria sempre atrasada sem
 * acrescentar nada (nenhum outro módulo cruza estes dados).
 *
 * Os leitores são defensivos como os de pedidos: a Yampi ora embrulha relação
 * em `{ data }`, ora devolve o objeto direto, e nomes de campo variam entre
 * lojas. Cada leitor devolve também os campos crus do primeiro registro — é o
 * diagnóstico que mostra na tela o que a API mandou quando o mapeamento não
 * encontrar o que espera.
 */

import { chamarYampi } from './yampi'

/** Desembrulha o padrão `{ data: ... }` da Yampi, em qualquer nível. */
function miolo(valor: unknown): unknown {
  if (valor && typeof valor === 'object' && !Array.isArray(valor) && 'data' in valor) {
    return (valor as { data: unknown }).data
  }
  return valor
}

function texto(valor: unknown): string | null {
  if (typeof valor === 'string' && valor.trim()) return valor.trim()
  if (typeof valor === 'number') return String(valor)
  return null
}

function numero(valor: unknown): number {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  if (typeof valor === 'string') {
    const n = Number(valor.replace(',', '.'))
    if (Number.isFinite(n)) return n
  }
  return 0
}

/** Datas vêm como `2026-08-09 14:55:00`, `{ date: '...' }` ou ISO. */
function data(valor: unknown): string | null {
  const cru = miolo(valor)
  const bruto =
    typeof cru === 'string'
      ? cru
      : cru && typeof cru === 'object' && 'date' in cru
        ? texto((cru as { date: unknown }).date)
        : null
  if (!bruto) return null
  const iso = bruto.includes('T') ? bruto : `${bruto.replace(' ', 'T').slice(0, 19)}Z`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Primeiro campo presente entre os nomes candidatos. */
function campo(registro: Record<string, unknown>, nomes: string[]): unknown {
  for (const nome of nomes) {
    if (nome in registro && registro[nome] !== null && registro[nome] !== undefined) {
      return registro[nome]
    }
  }
  return undefined
}

async function paginas<T>(caminho: string, parametros: Record<string, string>): Promise<T[]> {
  const registros: T[] = []
  for (let pagina = 1; pagina <= 20; pagina++) {
    const r = await chamarYampi<{
      data?: T[]
      meta?: { pagination?: { current_page: number; total_pages: number } }
    }>(caminho, { ...parametros, limit: '50', page: String(pagina) })
    registros.push(...(r.data ?? []))
    const p = r.meta?.pagination
    if (!p || p.current_page >= p.total_pages) break
  }
  return registros
}

// ── Cupons ─────────────────────────────────────────────────────────────────

export interface CupomYampi {
  codigo: string
  descricao: string | null
  /** Percentual ou valor fixo — como a Yampi descrever. */
  regra: string
  usos: number
  limite: number | null
  comecaEm: string | null
  expiraEm: string | null
  ativo: boolean
}

export interface LeituraCupons {
  cupons: CupomYampi[]
  /** Campos crus do primeiro registro — o diagnóstico quando algo faltar. */
  camposCrus: string[]
}

/**
 * Lê os cupons publicados no checkout (`/pricing/promocodes`).
 *
 * A regra é montada aqui e não na tela: percentual e valor fixo chegam no
 * mesmo campo `value`, e o que os separa varia por loja (`type`,
 * `discount_type`, flag booleana). Centralizar a interpretação deixa a tela
 * só exibir.
 */
export async function lerCuponsYampi(): Promise<LeituraCupons> {
  const crus = await paginas<Record<string, unknown>>('/pricing/promocodes', {})

  const cupons = crus.flatMap((c): CupomYampi[] => {
    const codigo = texto(campo(c, ['code', 'promocode', 'name']))
    if (!codigo) return []

    const valor = numero(campo(c, ['value', 'discount', 'amount']))
    const tipoCru = `${texto(campo(c, ['type', 'discount_type', 'value_type'])) ?? ''}`.toLowerCase()
    const percentual =
      /percent|porcent|%|^2$/.test(tipoCru) ||
      Boolean(campo(c, ['is_percent', 'percent', 'percentage']))
    const freteGratis = Boolean(campo(c, ['free_shipment', 'free_shipping']))

    const partes: string[] = []
    if (valor > 0) {
      partes.push(
        percentual
          ? `${valor}% de desconto`
          : `R$ ${valor.toFixed(2).replace('.', ',')} de desconto`,
      )
    }
    if (freteGratis) partes.push('frete grátis')

    const limiteCru = numero(campo(c, ['quantity', 'usage_limit', 'max_uses', 'limit']))

    return [
      {
        codigo,
        descricao: texto(campo(c, ['description', 'title'])),
        regra: partes.join(' + ') || 'Regra não informada pela Yampi',
        usos: numero(campo(c, ['used', 'quantity_used', 'uses', 'usage_count'])),
        limite: limiteCru > 0 ? limiteCru : null,
        comecaEm: data(campo(c, ['starts_at', 'start_at', 'begins_at'])),
        expiraEm: data(campo(c, ['expires_at', 'expire_at', 'ends_at', 'end_at'])),
        ativo: campo(c, ['active', 'is_active', 'enabled']) !== undefined
          ? Boolean(campo(c, ['active', 'is_active', 'enabled']))
          : true,
      },
    ]
  })

  return {
    cupons: cupons.sort((a, b) => Number(b.ativo) - Number(a.ativo) || b.usos - a.usos),
    camposCrus: crus[0] ? Object.keys(crus[0]).sort() : [],
  }
}

// ── Carrinhos abandonados ──────────────────────────────────────────────────

export interface CarrinhoYampi {
  id: string
  cliente: string | null
  email: string | null
  /** Só dígitos, com DDI quando houver — pronto para montar o link do WhatsApp. */
  telefone: string | null
  valor: number
  itens: string[]
  abandonadoEm: string | null
}

export interface LeituraCarrinhos {
  carrinhos: CarrinhoYampi[]
  camposCrus: string[]
}

/**
 * Lê os carrinhos abandonados do checkout (`/checkout/carts`).
 *
 * O telefone é normalizado aqui porque o destino dele é um link `wa.me` — a
 * recuperação de carrinho desta operação é uma mensagem, não uma campanha.
 */
export async function lerCarrinhosYampi(): Promise<LeituraCarrinhos> {
  const crus = await paginas<Record<string, unknown>>('/checkout/carts', {
    include: 'customer,items',
  })

  const carrinhos = crus.flatMap((c): CarrinhoYampi[] => {
    const id = texto(campo(c, ['id', 'token', 'cart_token']))
    if (!id) return []

    const cliente = miolo(campo(c, ['customer', 'client'])) as Record<string, unknown> | undefined
    const nome = cliente
      ? (texto(campo(cliente, ['name'])) ??
        ([texto(campo(cliente, ['first_name'])), texto(campo(cliente, ['last_name']))]
          .filter(Boolean)
          .join(' ') ||
          null))
      : null
    const telefoneCru = cliente
      ? (texto(miolo(campo(cliente, ['whatsapp', 'phone', 'cellphone']))) ??
        texto(
          (miolo(campo(cliente, ['phone'])) as Record<string, unknown> | undefined)?.full_number,
        ))
      : null
    const digitos = telefoneCru?.replace(/\D/g, '') ?? ''

    const totalizadores = miolo(campo(c, ['totalizers', 'totals'])) as
      | Record<string, unknown>
      | undefined
    const valor =
      numero(campo(c, ['value_total', 'total', 'amount'])) ||
      (totalizadores ? numero(campo(totalizadores, ['total', 'value_total', 'subtotal'])) : 0)

    const itensCrus = miolo(campo(c, ['items', 'products', 'spreadsheet']))
    const itens = Array.isArray(itensCrus)
      ? itensCrus.flatMap((i) => {
          const item = miolo(i) as Record<string, unknown>
          const sku = miolo(campo(item, ['sku'])) as Record<string, unknown> | undefined
          const titulo =
            (sku ? texto(campo(sku, ['title', 'name'])) : null) ??
            texto(campo(item, ['name', 'title', 'description', 'product_name']))
          const qtd = numero(campo(item, ['quantity', 'qty'])) || 1
          return titulo ? [qtd > 1 ? `${qtd}× ${titulo}` : titulo] : []
        })
      : []

    return [
      {
        id,
        cliente: nome,
        email: cliente ? texto(campo(cliente, ['email'])) : null,
        telefone: digitos.length >= 10 ? (digitos.length <= 11 ? `55${digitos}` : digitos) : null,
        valor,
        itens,
        abandonadoEm: data(campo(c, ['updated_at', 'abandoned_at', 'created_at'])),
      },
    ]
  })

  return {
    carrinhos: carrinhos.sort((a, b) => b.valor - a.valor),
    camposCrus: crus[0] ? Object.keys(crus[0]).sort() : [],
  }
}

// ── Criação de cupom ───────────────────────────────────────────────────────

export interface NovoCupom {
  codigo: string
  /** Valor do desconto — em % quando `percentual`, em R$ quando não. */
  valor: number
  percentual: boolean
  /** Data limite (aaaa-mm-dd). Sem data, o cupom não expira. */
  expiraEm?: string
  /** Quantidade máxima de usos. Sem limite, vale para sempre. */
  limite?: number
}

/**
 * Publica um cupom no checkout (`POST /pricing/promocodes`).
 *
 * O corpo segue o formato mais comum da Yampi; se a loja recusar, a mensagem
 * dela chega inteira à tela — ela nomeia o campo que faltou, e isso vale
 * mais que qualquer tradução nossa.
 */
export async function criarCupomYampi(cupom: NovoCupom): Promise<void> {
  const codigo = cupom.codigo.trim().toUpperCase()
  if (!/^[A-Z0-9_-]{3,32}$/.test(codigo)) {
    throw new Error('O código do cupom deve ter de 3 a 32 letras, números, hífen ou sublinhado.')
  }
  if (!(cupom.valor > 0)) throw new Error('O desconto precisa ser maior que zero.')
  if (cupom.percentual && cupom.valor >= 100) {
    throw new Error('Desconto percentual de 100% ou mais zeraria a venda.')
  }

  await chamarYampi(
    '/pricing/promocodes',
    {},
    {
      metodo: 'POST',
      corpo: {
        name: codigo,
        code: codigo,
        value: cupom.valor,
        type: cupom.percentual ? 'percent' : 'fixed',
        active: true,
        ...(cupom.limite && cupom.limite > 0 ? { quantity: cupom.limite } : {}),
        ...(cupom.expiraEm ? { expires_at: `${cupom.expiraEm} 23:59:59` } : {}),
      },
    },
  )
}
