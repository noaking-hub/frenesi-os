import 'server-only'

import { lerContas } from '@/data/financeiro'
import { repositorio } from '@/data/repository'
import { disponivelDe } from '@/domain'

import type { BaseParaVenda, ContaParaVenda } from './VendaManual'

/**
 * O que o formulário de venda manual precisa saber antes de abrir.
 *
 * Bases com o disponível de verdade, contas ativas e os tamanhos que o
 * catálogo realmente pratica. Uma lista chumbada ofereceria um tamanho que
 * ninguém envasa no dia em que o catálogo mudasse, e o preço praticado — que
 * já existe por variante — é o mesmo número que o operador digitaria à mão.
 *
 * Ficou num arquivo próprio ao sair de `pedidos/page.tsx`: a função é a ponte
 * entre três repositórios e o formulário, e enterrá-la de novo dentro de uma
 * página faria a próxima tela que precisar dela copiar o código.
 */
export async function dadosDaVendaManual(): Promise<{
  bases: BaseParaVenda[]
  contas: ContaParaVenda[]
  tamanhos: number[]
}> {
  const [perfumes, derivados, contas] = await Promise.all([
    repositorio().perfumesBase(),
    repositorio().produtosDerivados(),
    lerContas(),
  ])

  const precosPorBase = new Map<string, Record<string, number>>()
  for (const d of derivados) {
    if (!(d.precoPraticado > 0)) continue
    const atual = precosPorBase.get(d.baseId) ?? {}
    atual[String(d.variante)] = d.precoPraticado
    precosPorBase.set(d.baseId, atual)
  }

  return {
    bases: perfumes.map((b) => ({
      id: b.id,
      nome: b.nome,
      marca: b.marca,
      // Disponível, não físico: reserva é pedido pago à espera de envase, e
      // vendê-la de novo no balcão deixaria o cliente da loja sem o dele.
      disponivelMl: disponivelDe(b),
      precos: precosPorBase.get(b.id) ?? {},
    })),
    contas: contas
      .filter((c) => c.ativa)
      .map((c) => ({ id: c.id, nome: c.nome, principal: c.principal })),
    tamanhos: [...new Set(derivados.map((d) => d.variante))].sort((a, b) => a - b),
  }
}
