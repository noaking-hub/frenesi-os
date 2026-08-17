'use server'

import { sessaoAtual } from '@/data/sessao'
import { supabaseConfigurado } from '@/data/supabase'

import { dadosDaVendaManual } from './dados-da-venda-manual'
import type { BaseParaVenda } from './VendaManual'

/**
 * O catálogo do formulário de venda manual, buscado no CLIQUE — não no render.
 *
 * Existe por causa de uma medida: `dadosDaVendaManual()` estava no mesmo
 * `Promise.all` do render da lista de Lançamentos, então o catálogo inteiro
 * (403 KB, 6 requisições ao Supabase) era lido a cada mudança de filtro, e 95
 * KB dele atravessavam para o navegador no payload RSC de toda navegação —
 * porque `VendaManual` é 'use client' e recebia `bases` por propriedade. Esse
 * custo não encolhia um byte quando o filtro devolvia uma linha, e era o único
 * da tela com essa propriedade: é ele que explica por que `?q=Icaro`, com "1
 * de 1268" no rodapé, continuava congelando.
 *
 * O botão continua VIVO: ele abre o diálogo no ato e o diálogo mostra que está
 * buscando o catálogo. Nada de botão que não faz nada.
 */
export async function carregarCatalogoDaVendaManual(): Promise<
  { ok: true; bases: BaseParaVenda[]; tamanhos: number[] } | { ok: false; erro: string }
> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'O Supabase precisa estar configurado para registrar venda manual.' }
  }
  // Server Action é endpoint HTTP como outro qualquer: quem souber o nome dela
  // chama direto, sem passar por tela nenhuma. Este catálogo traz o disponível
  // real de 412 bases e a tabela de preços praticados — inventário e margem da
  // operação inteira —, então a sessão é conferida aqui e não só na tela.
  if (!(await sessaoAtual())) {
    return { ok: false, erro: 'Faça login no ERP para registrar venda manual.' }
  }
  const { bases, tamanhos } = await dadosDaVendaManual()
  return { ok: true, bases, tamanhos }
}
