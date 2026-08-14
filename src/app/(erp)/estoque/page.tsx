import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { LinkOuro, LinkSecundario, TituloSecao } from '@/components/erp/primitivos'
import { carregarEstoque } from '@/data/consultas'
import { brl, pad2, volume } from '@/domain'

import { PerfumesBaseCliente } from './PerfumesBaseCliente'

/**
 * Estoque nunca pode vir do cache do build.
 *
 * Sem isto a página é pré-renderizada no deploy e congela: reserva muda a
 * cada pedido pago, baixa muda a cada faturamento, e a tela mostraria o
 * saldo de horas atrás com cara de saldo atual.
 */
export const dynamic = 'force-dynamic'


export default async function PerfumesBase() {
  const {
    coberturas,
    volumeTotalMl,
    reservadoTotalMl,
    disponivelTotalMl,
    esgotados,
    semCarga,
    criticos,
    comExcedente,
    valorReposicao,
  } = await carregarEstoque()

  const kpis: Kpi[] = [
    {
      label: 'Volume físico',
      valor: volume(volumeTotalMl),
      hint: `${coberturas.length} perfumes base`,
    },
    {
      // Reserva não some do frasco — some do que se pode vender. Os dois
      // números juntos evitam a leitura de que o estoque "sumiu".
      label: 'Reservado',
      valor: volume(reservadoTotalMl),
      hint: reservadoTotalMl ? 'Pedidos pagos aguardando produção' : 'Nenhum pedido pago na fila',
      tom: reservadoTotalMl ? 'atencao' : 'neutro',
    },
    {
      label: 'Disponível para venda',
      valor: volume(disponivelTotalMl),
      hint: 'Físico menos o que já foi vendido',
      tom: disponivelTotalMl ? 'ok' : 'erro',
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
      // Demanda acima do estoque aparece como pendência, nunca como estoque
      // negativo: o pedido foi pago e o volume não cobre.
      label: 'Reserva sem lastro',
      valor: pad2(comExcedente),
      hint: comExcedente
        ? 'Bases com pedido pago acima do volume físico'
        : 'Toda reserva tem volume que a cubra',
      tom: comExcedente ? 'erro' : 'ok',
    },
    {
      // Esgotado e sem carga davam o mesmo zero e pediam coisas opostas: um
      // pede recompra, o outro pede que alguém diga quanto tem na gaveta.
      label: 'Fora do controle de estoque',
      valor: pad2(semCarga),
      hint: 'Entram um a um, quando a compra do frasco novo for registrada',
      tom: 'neutro',
    },
    {
      label: 'Valor em estoque',
      valor: brl(valorReposicao),
      hint: 'Custo de reposição do volume físico',
      tom: 'ouro',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <TituloSecao tamanho={16}>Perfumes base · quando o estoque acaba</TituloSecao>
        <div style={{ flex: 1 }} />
        {/* Esta tela é leitura: quem move estoque é a compra, a produção e o
            inventário. Os atalhos levam até quem executa, em vez de fingir
            que a ação acontece aqui. */}
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
