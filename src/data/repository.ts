import 'server-only'

import { PARAMETROS_PADRAO } from '@/domain'
import type { SolicitacaoErp } from './fixtures'
import type {
  ContagemInventario,
  Envio,
  Ocorrencia,
  Lote,
  Movimentacao,
  ParametrosPrecificacao,
  Pedido,
  PerfumeBase,
  ProdutoDerivado,
  TipoMovimentacao,
  VarianteMl,
} from '@/domain'

import * as fixtures from './fixtures'
import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * Única porta de entrada para dados. As telas nunca importam fixtures nem o
 * client do Supabase diretamente — assim trocar a origem não toca em nenhuma UI.
 */
export interface Repositorio {
  parametros(): Promise<ParametrosPrecificacao>
  perfumesBase(): Promise<PerfumeBase[]>
  produtosDerivados(): Promise<ProdutoDerivado[]>
  shopifyPublicado(): Promise<Record<string, number>>
  lotes(): Promise<Lote[]>
  pedidos(): Promise<Pedido[]>
  precoPraticado(): Promise<Record<string, Partial<Record<VarianteMl, number>>>>
  movimentacoes(): Promise<Movimentacao[]>
  inventario(): Promise<ContagemInventario[]>
  envios(): Promise<Envio[]>
  ocorrencias(): Promise<Ocorrencia[]>
  solicitacoes(): Promise<SolicitacaoErp[]>
}

const repositorioFixtures: Repositorio = {
  async parametros() {
    return PARAMETROS_PADRAO
  },
  async perfumesBase() {
    return fixtures.PERFUMES_BASE
  },
  async produtosDerivados() {
    return fixtures.PRODUTOS_DERIVADOS
  },
  async shopifyPublicado() {
    return fixtures.SHOPIFY_PUBLICADO
  },
  async lotes() {
    return fixtures.LOTES
  },
  async pedidos() {
    return fixtures.PEDIDOS
  },
  async precoPraticado() {
    return fixtures.PRECO_PRATICADO
  },
  async movimentacoes() {
    return fixtures.MOVIMENTACOES
  },
  async inventario() {
    return fixtures.INVENTARIO
  },
  async envios() {
    return fixtures.ENVIOS
  },
  async ocorrencias() {
    return fixtures.OCORRENCIAS
  },
  async solicitacoes() {
    return fixtures.SOLICITACOES
  },
}

const repositorioSupabase: Repositorio = {
  async parametros() {
    const { data, error } = await supabaseServer()
      .from('parametros_precificacao')
      .select('*')
      .order('vigente_desde', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!data) return PARAMETROS_PADRAO
    return {
      intermediadorPct: Number(data.intermediador_pct),
      intermediadorFixo: Number(data.intermediador_fixo),
      checkoutPct: Number(data.checkout_pct),
      impostoPct: Number(data.imposto_pct),
      adsPct: Number(data.ads_pct),
      insumos: Number(data.insumos),
      freteSubsidio: Number(data.frete_subsidio),
      antifraude: Number(data.antifraude),
      perdaPct: Number(data.perda_pct),
      margemAlvo: Number(data.margem_alvo),
    }
  },

  async perfumesBase() {
    const { data, error } = await supabaseServer()
      .from('perfumes_base')
      .select('id, nome, marca, custo_por_ml, volume_ml, consumo_diario_ml')
      .eq('ativo', true)
    if (error) throw error
    return (data ?? []).map((b) => ({
      id: b.id,
      nome: b.nome,
      marca: b.marca,
      custoPorMl: Number(b.custo_por_ml),
      volumeMl: Number(b.volume_ml),
      consumoDiarioMl: Number(b.consumo_diario_ml),
    }))
  },

  async produtosDerivados() {
    const { data, error } = await supabaseServer()
      .from('produtos_derivados')
      .select('base_id, variante, envasadas, reservadas, preco_praticado')
    if (error) throw error
    return (data ?? []).map((d) => ({
      baseId: d.base_id,
      variante: d.variante as VarianteMl,
      envasadas: d.envasadas,
      reservadas: d.reservadas,
      precoPraticado: Number(d.preco_praticado ?? 0),
    }))
  },

  async shopifyPublicado() {
    const { data, error } = await supabaseServer()
      .from('shopify_publicado')
      .select('base_id, variante, publicado')
    if (error) throw error
    return Object.fromEntries(
      (data ?? []).map((p) => [`${p.base_id}|${p.variante}`, p.publicado]),
    )
  },

  async lotes() {
    const { data, error } = await supabaseServer()
      .from('lotes')
      .select(
        'id, base_id, fornecedor, volume_ml, entrada_em, encerrado_em, ' +
          'perfumes_base(nome), lote_saidas(ocorrida_em, ordem_id, unidades, variante)',
      )
      .order('entrada_em', { ascending: false })
    if (error) throw error
    // O client sem tipos gerados não infere selects com embed; a forma da linha
    // é declarada aqui e conferida contra `supabase/migrations`.
    const linhas = (data ?? []) as unknown as LinhaLote[]
    return linhas.map((l): Lote => {
      const base = l.perfumes_base
      const saidas = l.lote_saidas ?? []
      return {
        id: l.id,
        baseId: l.base_id,
        perfume: base?.nome ?? l.base_id,
        fornecedor: l.fornecedor,
        volumeMl: Number(l.volume_ml),
        entrada: l.entrada_em,
        encerradoEm: l.encerrado_em,
        saidas: saidas.map((s) => ({
          data: s.ocorrida_em,
          ref: s.ordem_id,
          unidades: s.unidades,
          variante: s.variante as VarianteMl,
        })),
      }
    })
  },

  async pedidos() {
    const { data, error } = await supabaseServer()
      .from('pedidos')
      .select(
        'id, canal, valor, frete, cashback, pagamento, envio, comprado_em, entregue_em, ' +
          'destino, cep, logradouro, peso, dimensoes, gateway, rastreio, ' +
          'clientes(nome, email, cpf, telefone), pedido_itens(descricao, variante, preco)',
      )
      .order('comprado_em', { ascending: false })
    if (error) throw error
    const dia = 24 * 60 * 60 * 1000
    const linhas = (data ?? []) as unknown as LinhaPedido[]
    return linhas.map((p): Pedido => {
      const cliente = p.clientes
      const itens = p.pedido_itens ?? []
      return {
        id: p.id,
        cliente: cliente?.nome ?? '—',
        email: cliente?.email ?? '',
        cpf: (cliente?.cpf ?? '').replace(/\D/g, ''),
        telefone: cliente?.telefone ?? '',
        data: p.comprado_em,
        canal: capitalizaCanal(p.canal),
        valor: Number(p.valor),
        frete: Number(p.frete),
        cashback: Number(p.cashback),
        pagamento: p.pagamento,
        envio: rotuloEnvio(p.envio),
        // O prazo de devolução só começa a correr na marcação de entrega.
        diasDesdeEntrega: p.entregue_em
          ? Math.floor((Date.now() - new Date(p.entregue_em).getTime()) / dia)
          : null,
        entregueEm: p.entregue_em,
        destino: p.destino ?? '',
        cep: p.cep ?? '',
        rua: p.logradouro ?? '',
        peso: p.peso ?? '',
        dimensoes: p.dimensoes ?? '',
        gateway: p.gateway === 'frenet' ? 'Frenet' : 'Melhor Envio',
        rastreio: p.rastreio,
        itens: itens.map((i) => ({
          perfume: i.descricao,
          marca: '',
          variante: (i.variante ?? 5) as VarianteMl,
          preco: Number(i.preco),
        })),
      }
    })
  },

  async precoPraticado() {
    const derivados = await repositorioSupabase.produtosDerivados()
    const mapa: Record<string, Partial<Record<VarianteMl, number>>> = {}
    for (const d of derivados) {
      if (!d.precoPraticado) continue
      mapa[d.baseId] = { ...mapa[d.baseId], [d.variante]: d.precoPraticado }
    }
    return mapa
  },

  async movimentacoes() {
    const { data, error } = await supabaseServer()
      .from('movimentacoes')
      .select(
        'id, base_id, tipo, ocorrida_em, volume_ml, liquido_ml, ref, descricao, ' +
          'responsavel, saldo_ml, perfumes_base(nome)',
      )
      .order('ocorrida_em', { ascending: false })
      .limit(200)
    if (error) throw error
    const linhas = (data ?? []) as unknown as LinhaMovimentacao[]
    return linhas.map(
      (m): Movimentacao => ({
        id: m.id,
        baseId: m.base_id,
        perfume: m.perfumes_base?.nome ?? m.base_id,
        tipo: m.tipo,
        data: m.ocorrida_em,
        volumeMl: Number(m.volume_ml),
        liquidoMl: m.liquido_ml === null ? null : Number(m.liquido_ml),
        ref: m.ref ?? '',
        motivo: m.descricao,
        responsavel: m.responsavel ?? '—',
        saldoMl: Number(m.saldo_ml ?? 0),
      }),
    )
  },

  async inventario() {
    // A contagem em andamento é a que ainda não foi fechada.
    const { data: aberto, error: erroAberto } = await supabaseServer()
      .from('inventarios')
      .select('id')
      .is('fechado_em', null)
      .order('competencia', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (erroAberto) throw erroAberto
    if (!aberto) return []

    const { data, error } = await supabaseServer()
      .from('inventario_contagens')
      .select('base_id, sistema_ml, contado_ml, responsavel, contado_em, perfumes_base(nome)')
      .eq('inventario_id', aberto.id)
    if (error) throw error
    const linhas = (data ?? []) as unknown as LinhaInventarioDb[]
    return linhas.map(
      (i): ContagemInventario => ({
        baseId: i.base_id,
        perfume: i.perfumes_base?.nome ?? i.base_id,
        sistemaMl: Number(i.sistema_ml),
        contadoMl: i.contado_ml === null ? null : Number(i.contado_ml),
        responsavel: i.responsavel,
        quando: i.contado_em,
      }),
    )
  },

  // Rastreamento, ocorrências e a triagem de devolução ainda não têm tabelas
  // próprias — o schema cobre `devolucoes`, mas não o extrato de eventos nem a
  // aferição de volume. Até lá estas três leem os fixtures, mesmo com o
  // Supabase configurado, em vez de fingir uma consulta que não existe.
  envios: repositorioFixtures.envios,
  ocorrencias: repositorioFixtures.ocorrencias,
  solicitacoes: repositorioFixtures.solicitacoes,
}

/**
 * Formas das linhas com embed, espelhando `supabase/migrations`.
 * Substituíveis pelos tipos gerados (`supabase gen types typescript`).
 */
interface LinhaLote {
  id: string
  base_id: string
  fornecedor: string
  volume_ml: number | string
  entrada_em: string
  encerrado_em: string | null
  perfumes_base: { nome: string } | null
  lote_saidas: {
    ocorrida_em: string
    ordem_id: string
    unidades: number
    variante: number
  }[]
}

interface LinhaPedido {
  id: string
  canal: string
  valor: number | string
  frete: number | string
  cashback: number | string
  pagamento: Pedido['pagamento']
  envio: string
  comprado_em: string
  entregue_em: string | null
  destino: string | null
  cep: string | null
  logradouro: string | null
  peso: string | null
  dimensoes: string | null
  gateway: string | null
  rastreio: string | null
  clientes: { nome: string; email: string; cpf: string | null; telefone: string } | null
  pedido_itens: { descricao: string; variante: number | null; preco: number | string }[]
}

interface LinhaMovimentacao {
  id: string
  base_id: string
  tipo: TipoMovimentacao
  ocorrida_em: string
  volume_ml: number | string
  liquido_ml: number | string | null
  ref: string | null
  descricao: string
  responsavel: string | null
  saldo_ml: number | string | null
  perfumes_base: { nome: string } | null
}

interface LinhaInventarioDb {
  base_id: string
  sistema_ml: number | string
  contado_ml: number | string | null
  responsavel: string | null
  contado_em: string | null
  perfumes_base: { nome: string } | null
}

function capitalizaCanal(canal: string): Pedido['canal'] {
  const mapa: Record<string, Pedido['canal']> = {
    shopify: 'Shopify',
    yampi: 'Yampi',
    whatsapp: 'WhatsApp',
    instagram: 'Instagram',
  }
  return mapa[canal] ?? 'Shopify'
}

function rotuloEnvio(envio: string): Pedido['envio'] {
  const mapa: Record<string, Pedido['envio']> = {
    nao_iniciado: 'Não iniciado',
    aguardando_envio: 'Aguardando envio',
    enviado: 'Enviado',
    entregue: 'Entregue',
    retido: 'Retido',
    atrasado: 'Atrasado',
  }
  return mapa[envio] ?? 'Não iniciado'
}

export function repositorio(): Repositorio {
  return supabaseConfigurado() ? repositorioSupabase : repositorioFixtures
}

/** Origem dos dados, para o rodapé da sidebar dizer a verdade. */
export function origemDados(): 'supabase' | 'fixtures' {
  return supabaseConfigurado() ? 'supabase' : 'fixtures'
}
