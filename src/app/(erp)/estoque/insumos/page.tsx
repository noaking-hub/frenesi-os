import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { EstadoVazio, TituloSecao } from '@/components/erp/primitivos'
import { carregarInsumos } from '@/data/consultas'
import { brl, pad2, plural } from '@/domain'

import { InsumosCliente } from './InsumosCliente'

/** Saldo de insumo muda a cada faturamento — cache de build mostraria o de ontem. */
export const dynamic = 'force-dynamic'

/**
 * Insumos de envase: frasco, válvula e tampa.
 *
 * Decant não se faz só de perfume. Antes desta tela, acabar tampa era uma
 * descoberta de bancada — o ERP tinha dois litros de perfume no relatório e
 * nenhuma pista de que faltava o que enche.
 *
 * A baixa é automática: cada unidade faturada tira um frasco, uma válvula e
 * uma tampa do tamanho certo, na mesma transação em que o líquido sai.
 */
export default async function Insumos() {
  const painel = await carregarInsumos()

  if (painel.semBanco) {
    return (
      <EstadoVazio
        titulo="Insumos indisponíveis"
        instrucao="O Supabase precisa estar configurado para controlar os insumos de envase."
      />
    )
  }

  const kpis: Kpi[] = [
    {
      label: 'Unidades em estoque',
      valor: String(painel.totalUnidades),
      hint: `${plural(painel.itens.length, 'item controlado', 'itens controlados')}`,
      tom: painel.totalUnidades ? 'ok' : 'erro',
    },
    {
      // O que a fila já vendida exige e o estoque não cobre. É a pendência
      // que para a bancada, e por isso vem antes do valor.
      label: 'Não cobrem a fila',
      valor: pad2(painel.insuficientes),
      hint: painel.insuficientes
        ? 'Itens que faltam para envasar o que já foi pago'
        : 'Todo pedido pago tem insumo que o cubra',
      tom: painel.insuficientes ? 'erro' : 'ok',
    },
    {
      label: 'Abaixo do mínimo',
      valor: pad2(painel.abaixoDoMinimo),
      hint: 'Ainda dá para envasar, mas é hora de comprar',
      tom: painel.abaixoDoMinimo ? 'atencao' : 'ok',
    },
    {
      label: 'Valor em estoque',
      valor: brl(painel.valorEmEstoque),
      hint: 'Pelo custo médio de compra',
      tom: 'ouro',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <TituloSecao tamanho={16}>Frascos, válvulas e tampas</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          Cada decant leva um frasco, uma válvula e uma tampa do tamanho dele — 3, 5 e 8 ml no frasco
          de 8 ml; 10 e 15 ml no de 15 ml. A saída é automática no faturamento, junto com o líquido.
        </span>
      </div>

      <InsumosCliente itens={painel.itens} />
    </div>
  )
}
