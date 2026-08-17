import 'server-only'

import { iniciaisDe, statusCliente } from '@/domain'
import type { StatusCliente } from '@/domain'

import * as fixtures from './fixtures'
import { origemDados } from './repository'
import { supabaseServer, tudoDe } from './supabase'

/**
 * O perfil completo de cada cliente, montado dos pedidos PAGOS.
 *
 * A tela de CRM não vive de uma linha por cliente: quem atende precisa do
 * histórico (o que a pessoa comprou, quando, por quanto) e dos favoritos (o
 * que oferecer na próxima mensagem). Tudo sai dos pedidos que já estão no
 * banco — não há cadastro paralelo para manter.
 */

export interface CompraDoCliente {
  pedidoId: string
  /** ISO — a tela formata no fuso de São Paulo. */
  quando: string
  valor: number
  itens: string[]
}

export interface PerfilCliente {
  nome: string
  iniciais: string
  email: string
  /** Só dígitos com DDI quando reconhecível — pronto para o wa.me. */
  whatsapp: string | null
  telefone: string
  cidade: string
  total: number
  pedidos: number
  ticket: number
  primeiraCompra: string | null
  ultimaCompra: string | null
  diasDesdeUltima: number | null
  status: StatusCliente
  /** O que a pessoa mais comprou, por unidades. */
  favoritos: { nome: string; vezes: number }[]
  /** Histórico completo, mais recente primeiro. */
  compras: CompraDoCliente[]
}

function soDigitosComDdi(telefone: string | null): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '')
  if (digitos.length < 10) return null
  return digitos.length <= 11 ? `55${digitos}` : digitos
}

export async function carregarPerfisClientes(): Promise<PerfilCliente[]> {
  if (origemDados() !== 'supabase') {
    // Fixtures não têm histórico por pedido — o perfil sai raso, mas a tela
    // continua de pé em desenvolvimento sem banco.
    return fixtures.CLIENTES.map((c) => ({
      nome: c.nome,
      iniciais: c.iniciais,
      email: c.email,
      whatsapp: soDigitosComDdi(c.telefone),
      telefone: c.telefone,
      cidade: c.cidade,
      total: c.total,
      pedidos: c.pedidos,
      ticket: c.pedidos ? c.total / c.pedidos : 0,
      primeiraCompra: null,
      ultimaCompra: null,
      diasDesdeUltima: null,
      status: c.status,
      favoritos: [],
      compras: [],
    }))
  }

  // O `.limit(3000)` daqui era ilusão de folga: o teto REAL do PostgREST é
  // 1.000, e ele responde 200 com a lista curta. São 634 pedidos pagos hoje,
  // ~200 por mês — o corte chegaria em cerca de dois meses, e o estrago seria
  // silencioso e progressivo: a PRIMEIRA compra de cada cliente é a que fica
  // de fora (a ordem é decrescente), então "Cliente desde" passa a mentir,
  // gente cai de VIP para novo, e o segmento que decide quem recebe qual
  // mensagem muda sozinho.
  const linhas = await tudoDe<{
    id: string
    valor: number | string
    comprado_em: string
    destino: string | null
    clientes: { nome: string | null; email: string | null; telefone: string | null } | null
    pedido_itens: { descricao: string; quantidade: number; variante: number | null }[]
  }>('pedidos', (de, ate) =>
    supabaseServer()
      .from('pedidos')
      .select(
        'id, valor, comprado_em, destino, clientes(nome, email, telefone), ' +
          'pedido_itens(descricao, quantidade, variante)',
      )
      .eq('pagamento', 'pago')
      .not('cliente_id', 'is', null)
      .order('comprado_em', { ascending: false })
      .range(de, ate) as never,
  ) as unknown as {
    id: string
    valor: number | string
    comprado_em: string
    destino: string | null
    clientes: { nome: string; email: string; telefone: string | null } | null
    pedido_itens: { descricao: string; quantidade: number; variante: number | null }[] | null
  }[]

  interface Acumulado {
    nome: string
    telefone: string | null
    cidade: string
    total: number
    compras: CompraDoCliente[]
    porItem: Map<string, number>
  }

  const porEmail = new Map<string, Acumulado>()
  for (const l of linhas) {
    const c = l.clientes
    if (!c?.email) continue
    const atual = porEmail.get(c.email) ?? {
      nome: c.nome,
      telefone: c.telefone,
      cidade: '',
      total: 0,
      compras: [],
      porItem: new Map<string, number>(),
    }

    const itens = (l.pedido_itens ?? []).map((i) =>
      i.variante ? `${i.quantidade}× ${i.descricao} · ${i.variante} ml` : `${i.quantidade}× ${i.descricao}`,
    )
    atual.compras.push({
      pedidoId: l.id,
      quando: l.comprado_em,
      valor: Number(l.valor),
      itens,
    })
    // A leitura vem ordenada do mais recente: a primeira cidade vista é a do
    // último pedido — para onde a pessoa recebe hoje.
    if (!atual.cidade && l.destino) atual.cidade = l.destino
    atual.total += Number(l.valor)
    for (const i of l.pedido_itens ?? []) {
      atual.porItem.set(i.descricao, (atual.porItem.get(i.descricao) ?? 0) + i.quantidade)
    }
    porEmail.set(c.email, atual)
  }

  const agora = Date.now()
  const dia = 24 * 60 * 60 * 1000
  return [...porEmail.entries()]
    .map(([email, c]): PerfilCliente => {
      const ultima = c.compras[0]?.quando ?? null
      const primeira = c.compras[c.compras.length - 1]?.quando ?? null
      const dias = ultima ? Math.floor((agora - new Date(ultima).getTime()) / dia) : null
      return {
        nome: c.nome,
        iniciais: iniciaisDe(c.nome),
        email,
        whatsapp: soDigitosComDdi(c.telefone),
        telefone: c.telefone ?? '',
        cidade: c.cidade || '—',
        total: c.total,
        pedidos: c.compras.length,
        ticket: c.compras.length ? c.total / c.compras.length : 0,
        primeiraCompra: primeira,
        ultimaCompra: ultima,
        diasDesdeUltima: dias,
        status: statusCliente(c.total, c.compras.length, dias),
        favoritos: [...c.porItem.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([nome, vezes]) => ({ nome, vezes })),
        compras: c.compras,
      }
    })
    .sort((a, b) => b.total - a.total)
}
