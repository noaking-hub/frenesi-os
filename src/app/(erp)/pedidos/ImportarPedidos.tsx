'use client'

import { useState, useTransition } from 'react'

import { COR } from '@/components/erp/tokens'
import { plural } from '@/domain'

import { importarPedidos } from './actions'

/**
 * Traz as vendas da loja e recalcula o consumo diário a partir delas.
 *
 * A janela de 60 dias não é escolha de produto: sem o escopo `read_all_orders`
 * — que a Shopify concede caso a caso — a API simplesmente não devolve pedido
 * mais antigo, e volta vazio sem erro. Pedir 90 dias pareceria "loja sem
 * vendas" em vez de "permissão faltando".
 */
export function ImportarPedidos({ configurada, total }: { configurada: boolean; total: number }) {
  const [erro, setErro] = useState<string | null>(null)
  const [resumo, setResumo] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const importar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setResumo(null)
      setAviso(null)
      const r = await importarPedidos(60)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      const { pedidos, itens, clientes, itensSemVariante, desde, basesComConsumo } = r.resultado
      setResumo(
        `${plural(pedidos, 'pedido', 'pedidos')} desde ${desde} · ${plural(itens, 'item', 'itens')} · ` +
          `${plural(clientes, 'cliente', 'clientes')} · consumo diário recalculado em ${plural(basesComConsumo, 'base', 'bases')}.`,
      )
      if (itensSemVariante) {
        setAviso(
          `${plural(itensSemVariante, 'item não casou', 'itens não casaram')} com nenhuma variante do ERP. ` +
            'Eles aparecem no pedido, mas não baixam estoque de ninguém — importe o catálogo antes dos pedidos para casar tudo.',
        )
      }
    })

  if (!configurada) {
    return (
      <div
        style={{
          padding: '13px 15px',
          borderRadius: 12,
          background: 'rgba(224,168,74,.07)',
          border: '1px solid rgba(224,168,74,.28)',
        }}
      >
        <span
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--color-secundario)', textWrap: 'pretty' }}
        >
          A Shopify não está configurada — sem isso não há de onde trazer pedidos. Preencha
          SHOPIFY_LOJA e as credenciais no <code>.env.local</code>.
        </span>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
        padding: '15px 17px',
        borderRadius: 13,
        background: 'rgba(239,209,140,.045)',
        border: '1px solid var(--color-borda-ouro)',
      }}
    >
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <span
          className="font-sans"
          style={{
            fontWeight: 600,
            fontSize: 10,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            color: 'rgba(239,209,140,.6)',
          }}
        >
          Pedidos da Shopify
        </span>
        <span
          className="font-sans"
          style={{ fontSize: 11, lineHeight: 1.55, color: 'rgba(242,237,227,.68)', textWrap: 'pretty' }}
        >
          {total === 0
            ? 'Nenhum pedido no ERP ainda. A importação traz os últimos 60 dias — mais que isso a Shopify só devolve com o escopo read_all_orders, concedido caso a caso.'
            : `${plural(total, 'pedido no ERP', 'pedidos no ERP')}. Reimportar atualiza pagamento, envio e rastreio, e recalcula o consumo diário de cada base pelas vendas pagas.`}
        </span>
        {(erro || resumo) && (
          <span
            className="font-sans"
            style={{ fontSize: 11, lineHeight: 1.5, color: erro ? COR.erro : COR.ok, textWrap: 'pretty' }}
          >
            {erro ?? resumo}
          </span>
        )}
        {aviso && (
          <span
            className="font-sans"
            style={{ fontSize: 10.5, lineHeight: 1.5, color: COR.atencao, textWrap: 'pretty' }}
          >
            {aviso}
          </span>
        )}
      </span>

      <button
        type="button"
        onClick={importar}
        disabled={pendente}
        className="botao-ouro font-sans hover:brightness-[1.07]"
        style={{
          height: 36,
          padding: '0 18px',
          flex: 'none',
          fontWeight: 700,
          fontSize: 11.5,
          lineHeight: 1,
          borderRadius: 9,
          whiteSpace: 'nowrap',
          cursor: pendente ? 'wait' : 'pointer',
          opacity: pendente ? 0.6 : 1,
        }}
      >
        {pendente ? 'Importando…' : total === 0 ? 'Importar pedidos' : 'Reimportar pedidos'}
      </button>
    </div>
  )
}
