import { repositorio } from '@/data/repository'
import { avaliarProduto } from '@/domain'
import type { ProdutoAvaliado } from '@/domain'

import { CatalogoCliente } from './CatalogoCliente'

export const dynamic = 'force-dynamic'

/**
 * O Catálogo é a visão principal do módulo de Produtos: leitura rápida,
 * exceções na cara e um clique para o Produto 360º. Toda a avaliação
 * (estoque disponível, faixas, alertas, integração) nasce no domínio — a
 * tela só mostra.
 */
export default async function Catalogo() {
  const repo = repositorio()
  // Inclui inativos: o Catálogo é a tela onde se reativa um perfume.
  const [bases, derivados, parametros] = await Promise.all([
    repo.perfumesBaseTodos(),
    repo.produtosDerivados(),
    repo.parametros(),
  ])

  const linhas: ProdutoAvaliado[] = bases
    .map((base) => avaliarProduto(base, derivados, parametros))
    .sort((a, b) => a.base.nome.localeCompare(b.base.nome, 'pt-BR'))

  return <CatalogoCliente linhas={linhas} />
}
