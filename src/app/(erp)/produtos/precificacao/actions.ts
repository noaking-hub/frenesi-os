'use server'

import { revalidatePath } from 'next/cache'

import { OPERADOR } from '@/data/operador'
import { aplicarPrecosShopify, mensagemDe, type AlvoPreco } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { PARAMETROS_PADRAO, calcularPreco } from '@/domain'
import type { ParametrosPrecificacao, VarianteMl } from '@/domain'

export type RespostaPrecos =
  | {
      ok: true
      aplicadas: number
      ignoradas: { variante: string; motivo: string }[]
      /** A loja gravou um valor DIFERENTE do pedido — exceção rara e grave. */
      divergentes: { variante: string; esperado: number; gravado: number }[]
    }
  | { ok: false; erro: string }

export interface PrecoAPublicar {
  baseId: string
  variante: number
  preco: number
}

/**
 * Publica na Shopify os preços que o ERP calculou.
 *
 * A ordem importa: só grava `preco_praticado` DEPOIS que a loja aceitou. Se
 * gravasse antes, a tela diria "publicado" para um preço que continua o
 * antigo na vitrine — e o erro só apareceria na próxima importação.
 *
 * O caminho até o checkout é indireto de propósito: a Shopify é dona do
 * catálogo e a Yampi espelha o catálogo dela. Escrever nas duas criaria duas
 * verdades de preço, e a próxima sincronia desfaria uma.
 */
export async function publicarPrecos(itens: PrecoAPublicar[]): Promise<RespostaPrecos> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para publicar preços.' }
  }
  if (itens.length === 0) return { ok: false, erro: 'Nenhum preço para publicar.' }
  const semPreco = itens.find((i) => !(i.preco > 0))
  if (semPreco) {
    return { ok: false, erro: 'Há preço zerado na seleção — confira o custo por ml da base.' }
  }

  try {
    const sb = supabaseServer()

    const baseIds = [...new Set(itens.map((i) => i.baseId))]
    const [{ data: derivados, error: erroDer }, { data: bases, error: erroBase }, { data: pp }] =
      await Promise.all([
        sb
          .from('produtos_derivados')
          .select('base_id, variante, shopify_variant_id, preco_praticado')
          .in('base_id', baseIds),
        sb
          .from('perfumes_base')
          .select('id, nome, shopify_product_id, custo_por_ml')
          .in('id', baseIds),
        sb
          .from('parametros_precificacao')
          .select('*')
          .order('vigente_desde', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
    if (erroDer) throw erroDer
    if (erroBase) throw erroBase

    const varianteDe = new Map(
      (derivados ?? []).map((d) => [
        `${d.base_id}|${d.variante}`,
        {
          shopifyVariantId: d.shopify_variant_id as string | null,
          precoAtual: d.preco_praticado === null ? null : Number(d.preco_praticado),
        },
      ]),
    )
    const produtoDe = new Map(
      (bases ?? []).map((b) => [
        b.id,
        {
          nome: b.nome as string,
          produtoId: b.shopify_product_id as string | null,
          custoPorMl: Number(b.custo_por_ml) || 0,
        },
      ]),
    )

    // O piso é conferido AQUI, com o custo do catálogo e os parâmetros
    // vigentes — não com o que a tela mandou. O bloqueio do escopo é regra de
    // servidor: um cliente adulterado não pode furar a margem mínima.
    const parametros = parametrosDaLinha(pp)
    const abaixoDoPiso: { variante: string; motivo: string }[] = []
    const publicaveis: PrecoAPublicar[] = []
    for (const i of itens) {
      const base = produtoDe.get(i.baseId)
      const rotulo = `${base?.nome ?? i.baseId} · ${i.variante} ml`
      if (base && base.custoPorMl > 0) {
        const { piso } = calcularPreco(base.custoPorMl, i.variante as VarianteMl, parametros)
        if (i.preco < piso - 0.005) {
          abaixoDoPiso.push({
            variante: rotulo,
            motivo: `abaixo do piso de ${piso.toFixed(2).replace('.', ',')} — a margem mínima não fecha`,
          })
          continue
        }
      }
      publicaveis.push(i)
    }

    const alvos: AlvoPreco[] = publicaveis.map((i) => {
      const base = produtoDe.get(i.baseId)
      return {
        shopifyProductId: base?.produtoId ?? '',
        shopifyVariantId: varianteDe.get(`${i.baseId}|${i.variante}`)?.shopifyVariantId ?? '',
        rotulo: `${base?.nome ?? i.baseId} · ${i.variante} ml`,
        preco: i.preco,
      }
    })

    const resultado = await aplicarPrecosShopify(alvos)
    const ignoradas = [...abaixoDoPiso, ...resultado.ignoradas]
    const recusadas = new Set(resultado.ignoradas.map((g) => g.variante))

    // O veredito de cada item vem do RETORNO da loja, não da ausência de
    // erro: confirmado quando ela devolve o mesmo valor, divergente quando
    // devolve outro — e divergente NÃO grava preco_praticado com o valor
    // pedido, porque a vitrine está com o outro.
    const divergentes: { variante: string; esperado: number; gravado: number }[] = []
    const confirmados: { item: PrecoAPublicar; gravado: number }[] = []
    publicaveis.forEach((item, i) => {
      const alvo = alvos[i]
      if (recusadas.has(alvo.rotulo)) return
      const retorno = resultado.retornoPorVariante[alvo.shopifyVariantId]
      if (retorno !== undefined && Math.abs(retorno - item.preco) > 0.009) {
        divergentes.push({ variante: alvo.rotulo, esperado: item.preco, gravado: retorno })
      } else {
        confirmados.push({ item, gravado: retorno ?? item.preco })
      }
    })

    if (confirmados.length) {
      const { error } = await sb.from('produtos_derivados').upsert(
        confirmados.map(({ item, gravado }) => ({
          base_id: item.baseId,
          variante: item.variante,
          preco_praticado: gravado,
        })),
        { onConflict: 'base_id,variante' },
      )
      if (error) throw error
    }

    // A trilha de auditoria do escopo: um registro por variante com
    // antes/depois, autor, origem e o veredito do retorno. Recusa também é
    // fato — inclusive a do piso, que nem saiu do ERP.
    const motivoDe = new Map(ignoradas.map((g) => [g.variante, g.motivo]))
    const auditoria = itens.map((i) => {
      const rotulo = `${produtoDe.get(i.baseId)?.nome ?? i.baseId} · ${i.variante} ml`
      const divergente = divergentes.find((d) => d.variante === rotulo)
      const recusa = motivoDe.get(rotulo)
      return {
        base_id: i.baseId,
        variante: i.variante,
        preco_anterior: varianteDe.get(`${i.baseId}|${i.variante}`)?.precoAtual ?? null,
        preco_novo: i.preco,
        usuario: OPERADOR,
        origem: 'precificacao',
        resultado: recusa ? 'recusado' : divergente ? 'divergente' : 'confirmado',
        detalhe: recusa ?? (divergente ? `a loja gravou ${divergente.gravado.toFixed(2)}` : null),
      }
    })
    const { error: erroAud } = await sb.from('precos_publicados').insert(auditoria)
    if (erroAud) throw erroAud

    const { error: erroLog } = await sb.from('sincronizacoes').insert({
      origem: 'shopify',
      tipo: 'preco',
      perfumes: baseIds.length,
      variantes: confirmados.length,
      ignorados: ignoradas.length,
      detalhes: ignoradas,
    })
    if (erroLog) throw erroLog

    revalidatePath('/', 'layout')
    return { ok: true, aplicadas: confirmados.length, ignoradas, divergentes }
  } catch (e) {
    console.error('[shopify] publicação de preço falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

/** Parâmetros vigentes a partir da linha crua — o mesmo mapa do repositório. */
function parametrosDaLinha(data: Record<string, unknown> | null): ParametrosPrecificacao {
  if (!data) return PARAMETROS_PADRAO
  const n = (v: unknown) => Number(v ?? 0)
  return {
    intermediadorPct: n(data?.intermediador_pct),
    intermediadorFixo: n(data?.intermediador_fixo),
    checkoutPct: n(data?.checkout_pct),
    impostoPct: n(data?.imposto_pct),
    adsPct: n(data?.ads_pct),
    frasco: n(data?.frasco) || n(data?.insumos),
    valvula: n(data?.valvula),
    tampa: n(data?.tampa),
    etiqueta: n(data?.etiqueta),
    caixa: n(data?.caixa),
    plasticoBolha: n(data?.plastico_bolha),
    sacolaAntifraude: n(data?.sacola_antifraude),
    freteSubsidio: n(data?.frete_subsidio),
    antifraude: n(data?.antifraude),
    perdaPct: n(data?.perda_pct),
    margemAlvo: n(data?.margem_alvo),
    adsMensal: data?.ads_mensal == null ? null : Number(data.ads_mensal),
    descontoPixPct: n(data?.desconto_pix_pct),
    fatiaPixPct: n(data?.fatia_pix_pct),
  }
}

export interface PublicacaoRegistrada {
  variante: number
  precoAnterior: number | null
  precoNovo: number
  usuario: string
  quando: string
  resultado: 'confirmado' | 'divergente' | 'recusado'
  detalhe: string | null
}

/** As últimas publicações de preço deste perfume — a trilha, na tela. */
export async function historicoDePublicacoes(baseId: string): Promise<PublicacaoRegistrada[]> {
  if (!supabaseConfigurado() || !baseId) return []
  const { data, error } = await supabaseServer()
    .from('precos_publicados')
    .select('variante, preco_anterior, preco_novo, usuario, publicado_em, resultado, detalhe')
    .eq('base_id', baseId)
    .order('publicado_em', { ascending: false })
    .limit(12)
  if (error) {
    console.error('[precos] histórico de publicações falhou:', error)
    return []
  }
  return (data ?? []).map((r) => ({
    variante: Number(r.variante),
    precoAnterior: r.preco_anterior === null ? null : Number(r.preco_anterior),
    precoNovo: Number(r.preco_novo),
    usuario: String(r.usuario),
    quando: String(r.publicado_em),
    resultado: r.resultado as PublicacaoRegistrada['resultado'],
    detalhe: (r.detalhe as string | null) ?? null,
  }))
}
