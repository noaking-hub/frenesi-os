'use server'

import { diagnosticarMercadoPago } from '@/data/mercadopago'
import { mensagemDe, escoposDoToken } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { diagnosticarYampi } from '@/data/yampi'
import { hojeEmSaoPaulo } from '@/domain'

export type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

/**
 * Testa uma integração de verdade, chamando o serviço.
 *
 * Cada teste devolve NÚMEROS, não um "conectado": o que trava uma integração
 * quase nunca é a conexão em si, e sim escopo faltando ou campo com outro
 * nome. Um teste que só diz "ok" some justamente quando é preciso.
 */
export async function testarIntegracao(id: string): Promise<Resposta<{ linhas: string[] }>> {
  try {
    switch (id) {
      case 'supabase': {
        if (!supabaseConfigurado()) return { ok: false, erro: 'Supabase não configurado.' }
        const sb = supabaseServer()
        const [pedidos, bases, lancamentos, extrato] = await Promise.all([
          sb.from('pedidos').select('id', { count: 'exact', head: true }),
          sb.from('perfumes_base').select('id', { count: 'exact', head: true }),
          sb.from('lancamentos').select('id', { count: 'exact', head: true }),
          sb.from('extrato_linhas').select('chave', { count: 'exact', head: true }),
        ])
        return {
          ok: true,
          linhas: [
            `Pedidos: ${pedidos.count ?? 0}`,
            `Perfumes base: ${bases.count ?? 0}`,
            `Lançamentos: ${lancamentos.count ?? 0}`,
            `Linhas de extrato: ${extrato.count ?? 0}`,
          ],
        }
      }

      case 'shopify': {
        const r = await escoposDoToken()
        return {
          ok: true,
          linhas: [
            `Loja: ${r.loja}`,
            `Escopos concedidos (${r.escopos.length}): ${r.escopos.join(', ') || 'nenhum'}`,
            // Escopo faltando é a causa nº 1 de "a mutação não fez nada".
            ...['write_products', 'write_inventory', 'write_orders']
              .filter((e) => !r.escopos.includes(e))
              .map((e) => `FALTA ${e} — sem ele a escrita correspondente é recusada.`),
          ],
        }
      }

      case 'yampi': {
        const d = await diagnosticarYampi()
        return {
          ok: true,
          linhas: [
            `Loja: ${d.alias} · ${d.pedidos} pedido(s) na conta`,
            `Campos do pedido: ${d.camposDoPedido.slice(0, 18).join(', ')}`,
            `Campos do cliente: ${d.camposDoCliente.slice(0, 12).join(', ')}`,
            `Campos da transação: ${d.camposDaTransacao.slice(0, 18).join(', ') || '— nenhuma transação na amostra'}`,
            d.identificadoresDaAmostra.length
              ? `Id do gateway lido da transação: ${d.identificadoresDaAmostra.join(', ')} — é por ele que o extrato acha a venda`
              : 'ATENÇÃO: não consegui ler nenhum id de gateway na transação. Sem ele, o crédito do extrato não encontra o pedido.',
          ],
        }
      }

      case 'mercadopago': {
        const ate = hojeEmSaoPaulo()
        const de = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
        const d = await diagnosticarMercadoPago(de, ate)
        return { ok: true, linhas: [...d.passos, ...d.amostra] }
      }


      default:
        return { ok: false, erro: 'Esta integração não tem teste próprio.' }
    }
  } catch (e) {
    console.error(`[integracoes] teste de ${id} falhou:`, e)
    return { ok: false, erro: mensagemDe(e) }
  }
}
