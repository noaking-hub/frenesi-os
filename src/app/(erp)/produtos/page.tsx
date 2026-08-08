import type { Tom } from '@/components/erp/tokens'
import { repositorio } from '@/data/repository'
import { VARIANTES, calcularPreco, coberturaDe, margemDe } from '@/domain'
import type {
  CoberturaBase,
  ParametrosPrecificacao,
  PerfumeBase,
  ProdutoDerivado,
  VarianteMl,
} from '@/domain'

import { CatalogoCliente, type LinhaCatalogo } from './CatalogoCliente'

/**
 * O status do catálogo é derivado, em ordem de urgência: sem custo nenhuma
 * conta fecha; esgotado bloqueia pedidos; crítico é questão de dias; margem
 * baixa corrói sem avisar; parado prende capital; alto giro é planejamento.
 */
function classificar(
  base: PerfumeBase,
  cobertura: CoberturaBase,
  margemMedia: number | null,
  p: ParametrosPrecificacao,
): { status: string; tom: Tom } {
  if (base.custoPorMl === 0) return { status: 'Sem custo', tom: 'erro' }
  if (cobertura.criticidade === 'zero') return { status: 'Esgotado', tom: 'erro' }
  if (cobertura.criticidade === 'urgente' || cobertura.criticidade === 'atencao')
    return { status: 'Crítico', tom: 'atencao' }
  if (margemMedia !== null && margemMedia < p.margemAlvo - 5)
    return { status: 'Margem baixa', tom: 'atencao' }
  if (cobertura.criticidade === 'parado')
    return { status: `Parado ${cobertura.dias}d`, tom: 'info' }
  if (base.consumoDiarioMl >= 25) return { status: 'Alto giro', tom: 'ouro' }
  return { status: 'Ativo', tom: 'ok' }
}

export default async function Catalogo() {
  const repo = repositorio()
  // Inclui inativos: o Catálogo é a tela onde se reativa um perfume.
  const [bases, derivados, precos, parametros] = await Promise.all([
    repo.perfumesBaseTodos(),
    repo.produtosDerivados(),
    repo.precoPraticado(),
    repo.parametros(),
  ])

  const linhas: LinhaCatalogo[] = bases
    .map((base) => {
      const cobertura = coberturaDe(base)
      const unidades = derivados
        .filter((d) => d.baseId === base.id)
        .reduce((a, d: ProdutoDerivado) => a + d.envasadas, 0)

      // Margem média das variantes com preço publicado, pela mesma fórmula
      // da Precificação — nunca um percentual digitado. Sem custo cadastrado
      // não existe margem: mostrar um número aqui seria fantasia.
      const margens =
        base.custoPorMl > 0
          ? VARIANTES.map((v: VarianteMl) => {
              const preco = precos[base.id]?.[v]
              if (!preco) return null
              const c = calcularPreco(base.custoPorMl, v, parametros)
              return margemDe(preco, c.custoProduto, parametros)
            }).filter((m): m is number => m !== null)
          : []
      const margemMedia = margens.length
        ? margens.reduce((a, m) => a + m, 0) / margens.length
        : null

      return {
        base,
        cobertura,
        coberturaDias: cobertura.dias,
        unidades,
        margemMedia,
        ...classificar(base, cobertura, margemMedia, parametros),
      }
    })
    .sort((a, b) => a.base.nome.localeCompare(b.base.nome, 'pt-BR'))

  return <CatalogoCliente linhas={linhas} />
}
