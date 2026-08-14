import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { EstadoVazio, LinkSecundario, TituloSecao } from '@/components/erp/primitivos'
import { carregarFilaDeEnvase } from '@/data/consultas'
import { pad2, plural, volume } from '@/domain'

import { FilaCliente } from './FilaCliente'

/**
 * A fila nasce das reservas, que mudam a cada pedido pago. Cache de build
 * mostraria a fila de ontem para quem vai envasar hoje.
 */
export const dynamic = 'force-dynamic'

/**
 * Fila de envase: o que precisa ser fracionado agora.
 *
 * Substituiu a antiga tela de Produção, que abria "ordem de produção" e
 * baixava estoque no encerramento. Aquilo nunca foi usado — nenhuma ordem em
 * toda a história do ERP — e era perigoso: o estoque já baixa no
 * faturamento, então concluir uma ordem tiraria o mesmo mililitro duas
 * vezes.
 *
 * Esta tela NÃO move estoque. Ela responde à pergunta que a operação faz
 * todo dia: quais frascos eu pego e quanto tiro de cada um.
 */
export default async function Envase() {
  const fila = await carregarFilaDeEnvase()

  if (fila.semBanco) {
    return (
      <EstadoVazio
        titulo="Fila indisponível"
        instrucao="O Supabase precisa estar configurado para a fila de envase ler os pedidos reservados."
      />
    )
  }

  const kpis: Kpi[] = [
    {
      label: 'Pedidos na fila',
      valor: pad2(fila.pedidos),
      hint: fila.pedidos ? 'Pagos, aguardando envase e despacho' : 'Nada pago esperando envase',
      tom: fila.pedidos ? 'atencao' : 'ok',
    },
    {
      label: 'Volume a envasar',
      valor: volume(fila.mlTotal),
      hint: 'Soma do que os pedidos da fila comprometeram',
      tom: 'ouro',
    },
    {
      label: 'Perfumes envolvidos',
      valor: pad2(fila.perfumes),
      hint: 'Frascos diferentes a manusear',
    },
    {
      // Bloqueio é falta de líquido no frasco para um pedido que já foi
      // pago — é a pendência mais cara da tela, e precisa saltar.
      label: 'Sem volume para atender',
      valor: pad2(fila.bloqueados),
      hint: fila.bloqueados
        ? 'Pedidos pagos sem líquido suficiente no frasco'
        : 'Todo pedido da fila tem volume que o cubra',
      tom: fila.bloqueados ? 'erro' : 'ok',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <TituloSecao tamanho={16}>O que envasar agora</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          {/* A regra que evita a baixa dupla precisa estar escrita na tela:
              quem envasa não deve procurar um botão de "concluir" aqui. */}
          A fila sai dos pedidos pagos que ainda não saíram. Envasar não baixa estoque por aqui — o
          volume sai do frasco quando o pedido é faturado, uma vez só.
        </span>
        <div style={{ flex: 1 }} />
        <LinkSecundario href="/pedidos" altura={34}>
          Ver pedidos
        </LinkSecundario>
        <LinkSecundario href="/estoque" altura={34}>
          Ver estoque
        </LinkSecundario>
      </div>

      {/* Embalagem ao lado do líquido: descobrir que faltou tampa com o
          frasco na mão é o pior momento possível. */}
      {fila.insumos.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
            padding: '13px 16px',
            border: `1px solid ${fila.insumos.some((i) => i.falta > 0) ? 'rgba(224,109,109,.3)' : 'rgba(255,255,255,.07)'}`,
            borderRadius: 12,
            background: fila.insumos.some((i) => i.falta > 0) ? 'rgba(224,109,109,.05)' : 'rgba(255,255,255,.015)',
          }}
        >
          <span className="font-sans" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-secundario)' }}>
            Esta fila consome
          </span>
          {fila.insumos.map((i) => (
            <span key={i.id} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span className="font-mono" style={{ fontSize: 12, color: i.falta > 0 ? '#e06d6d' : 'var(--color-corrente)' }}>
                {`${i.necessario}`}
              </span>
              <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
                {i.nome
                  .replace('Frasco de vidro', 'frascos de')
                  .replace('Válvula spray', 'válvulas')
                  .replace('Tampa', 'tampas')}
              </span>
              {i.falta > 0 && (
                <span className="font-sans" style={{ fontSize: 9.5, color: '#e06d6d' }}>
                  {`(faltam ${i.falta})`}
                </span>
              )}
            </span>
          ))}
          <div style={{ flex: 1 }} />
          <LinkSecundario href="/estoque/insumos" altura={30}>
            Ver insumos
          </LinkSecundario>
        </div>
      )}

      {fila.pedidos === 0 ? (
        <EstadoVazio
          titulo="Nada na fila"
          instrucao="Quando um pedido for pago, ele aparece aqui com os frascos a pegar e o volume a tirar de cada um."
        />
      ) : (
        <FilaCliente fila={fila} />
      )}

      <span
        className="font-sans"
        style={{ fontSize: 10, lineHeight: 1.5, color: 'rgba(242,237,227,.34)', textWrap: 'pretty' }}
      >
        {`${plural(fila.pedidos, 'pedido reservou', 'pedidos reservaram')} ${volume(fila.mlTotal)} no total. O mesmo volume aparece como "Reservado" em Estoque — é a mesma reserva, vista do lado de quem envasa.`}
      </span>
    </div>
  )
}
