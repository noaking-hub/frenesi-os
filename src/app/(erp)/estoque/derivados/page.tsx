import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { TituloSecao } from '@/components/erp/primitivos'
import { repositorio } from '@/data/repository'
import { apurarDerivado, brl, disponivelDe, pad2, plural, temCarga, volume } from '@/domain'
import type { LinhaDerivado } from '@/domain'

import { DisponibilidadeCliente } from './DisponibilidadeCliente'

/**
 * Estoque nunca pode vir do cache do build.
 *
 * Sem isto a página é pré-renderizada no deploy e congela: reserva muda a
 * cada pedido pago, baixa muda a cada faturamento, e a tela mostraria o
 * saldo de horas atrás com cara de saldo atual.
 */
export const dynamic = 'force-dynamic'


/**
 * Disponibilidade por variante.
 *
 * O escopo prevê esta troca de nome: enquanto a Frenesi fracionar sob
 * demanda, "produtos derivados" não é um estoque — é a capacidade que o
 * volume da base sustenta. A tela mostra o pronto (quando houver) e o
 * potencial, separados, sem nunca inventar estoque físico que não existe.
 */
export default async function ProdutosDerivados() {
  const repo = repositorio()
  const [bases, derivados] = await Promise.all([repo.perfumesBase(), repo.produtosDerivados()])

  const linhas: LinhaDerivado[] = derivados
    .map((d) => {
      const base = bases.find((b) => b.id === d.baseId)
      const meus = derivados.filter((x) => x.baseId === d.baseId)
      return apurarDerivado(
        d.baseId,
        base?.nome ?? d.baseId,
        base?.marca ?? '',
        d.variante,
        d.envasadas,
        d.reservadas,
        d.precoPraticado,
        base ? disponivelDe(base) : 0,
        base ? temCarga(base, meus) : false,
      )
    })
    .sort((a, b) => a.perfume.localeCompare(b.perfume) || a.variante - b.variante)

  const prontas = linhas.reduce((a, l) => a + l.disponiveis, 0)
  const pendentes = linhas.reduce((a, l) => a + l.pendentes, 0)
  const valorPronto = linhas.reduce((a, l) => a + l.valorTotal, 0)
  const volumeImobilizado = linhas.reduce((a, l) => a + l.volumeMl, 0)

  // Volume e perfumes contam por BASE, nunca por variante: as cinco variantes
  // bebem do mesmo pool, e somar por linha multiplicaria o mesmo ml por cinco.
  const comVolume = bases.filter((b) => disponivelDe(b) > 0)
  const disponivelMl = comVolume.reduce((a, b) => a + disponivelDe(b), 0)
  const semVolume = linhas.filter((l) => l.estado === 'Sem volume').length

  const kpis: Kpi[] = [
    {
      label: 'Unidades prontas',
      valor: String(prontas),
      hint: prontas
        ? 'Já envasadas, etiquetadas e livres'
        : 'Nada pré-envasado · a produção sai sob demanda',
      tom: prontas ? 'ok' : 'neutro',
    },
    {
      label: 'Perfumes com volume',
      valor: pad2(comVolume.length),
      hint: `${volume(disponivelMl)} disponíveis para fracionar`,
      tom: comVolume.length ? 'ok' : 'erro',
    },
    {
      label: 'Demanda pendente',
      valor: String(pendentes),
      hint: pendentes
        ? 'Unidades vendidas sem estoque pronto que as cubra'
        : 'Nenhuma unidade vendida sem lastro',
      tom: pendentes ? 'erro' : 'ok',
    },
    {
      label: 'Variantes sem volume',
      valor: pad2(semVolume),
      hint: 'A base não tem ml para fracionar nesta variante',
      tom: semVolume ? 'atencao' : 'ok',
    },
    {
      label: 'Valor pronto para venda',
      valor: brl(valorPronto),
      hint: 'Só o que já está envasado · capacidade não é estoque',
      tom: 'ouro',
    },
    {
      label: 'Volume imobilizado',
      valor: volume(volumeImobilizado),
      hint: 'Já fracionado, fora do estoque de base',
      tom: 'info',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <TituloSecao tamanho={16}>Disponibilidade por variante</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          {/* O aviso é a regra mais importante da tela: sem ele alguém soma
              as colunas e conclui que tem cinco vezes mais estoque. */}
          As capacidades <strong style={{ color: 'rgba(242,237,227,.62)' }}>não se somam</strong>: os
          mesmos 100 ml dão 20 unidades de 5 ml <em>ou</em> 10 de 10 ml, nunca as duas. Quem manda é o
          volume disponível da base — e ele já desconta o que está reservado em pedidos pagos.
          {volumeImobilizado > 0 &&
            ` ${plural(prontas, 'unidade pronta saiu', 'unidades prontas saíram')} do volume de base e não voltam a ele.`}
        </span>
      </div>

      <DisponibilidadeCliente linhas={linhas} />
    </div>
  )
}
