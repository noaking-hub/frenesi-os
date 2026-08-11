import { TituloSecao } from '@/components/erp/primitivos'

import { RastreioNet } from './RastreioNet'

/**
 * Rastreio detalhado — o widget do Rastreio.net dentro do ERP.
 *
 * É o mesmo rastreador que a página pública dos clientes usa: ele concentra
 * Frenet e Melhor Envio, então serve para qualquer envio da operação. Cole o
 * código do pedido e o histórico completo da transportadora aparece.
 */
export default function RastreioDetalhado() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <TituloSecao tamanho={16}>Rastreio detalhado</TituloSecao>
        <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
          Rastreio.net — concentra Frenet (Correios e Jadlog) e Melhor Envio (J&T, Total Express e
          Buslog). Cole o código de rastreio para ver o histórico completo da transportadora.
        </span>
      </div>
      <RastreioNet />
    </div>
  )
}
