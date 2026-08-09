import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { LinkOuro, LinkSecundario, TituloSecao } from '@/components/erp/primitivos'
import { carregarEstoque } from '@/data/consultas'
import { brl, pad2, volume } from '@/domain'

import { PerfumesBaseCliente } from './PerfumesBaseCliente'

export default async function PerfumesBase() {
  const { coberturas, volumeTotalMl, comEstoque, esgotados, semCarga, criticos, valorReposicao } =
    await carregarEstoque()

  const kpis: Kpi[] = [
    {
      label: 'Volume total',
      valor: volume(volumeTotalMl),
      hint: `${coberturas.length} perfumes base`,
    },
    {
      label: 'Com estoque',
      valor: pad2(comEstoque),
      hint: comEstoque ? 'Volume declarado no ERP' : 'Nenhuma base tem volume ainda',
      tom: comEstoque ? 'ok' : 'erro',
    },
    {
      label: 'Estoque crítico',
      valor: pad2(criticos),
      hint: 'Menos de 20 dias de cobertura',
      tom: criticos ? 'atencao' : 'ok',
    },
    {
      label: 'Esgotados',
      valor: pad2(esgotados),
      hint: esgotados ? 'Já tiveram compra e zeraram' : 'Nenhuma base com compra zerou',
      tom: esgotados ? 'erro' : 'ok',
    },
    {
      // Esgotado e sem carga davam o mesmo zero e pediam coisas opostas: um
      // pede recompra, o outro pede que alguém diga quanto tem na gaveta.
      label: 'Sem carga inicial',
      valor: pad2(semCarga),
      hint: semCarga ? 'O ERP não sabe se você tem estes' : 'Todas as bases foram declaradas',
      tom: semCarga ? 'atencao' : 'ok',
    },
    {
      label: 'Valor em estoque',
      valor: brl(valorReposicao),
      hint: 'Custo de reposição do volume atual',
      tom: 'ouro',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <TituloSecao tamanho={16}>Perfumes base · quando o estoque acaba</TituloSecao>
        <div style={{ flex: 1 }} />
        {/* Esta tela é leitura: quem move estoque é a carga, a compra, a
            produção e o inventário. Os atalhos levam até quem executa, em vez
            de fingir que a ação acontece aqui. */}
        <LinkSecundario href="/estoque/carga" altura={34}>
          Carga inicial
        </LinkSecundario>
        <LinkSecundario href="/estoque/lotes" altura={34}>
          Registrar compra de frasco
        </LinkSecundario>
        <LinkOuro href="/producao" altura={34}>
          Nova ordem de produção
        </LinkOuro>
      </div>

      <PerfumesBaseCliente coberturas={coberturas} />
    </div>
  )
}
