'use client'

import { useState, useTransition } from 'react'

import { COR } from '@/components/erp/tokens'
import { plural } from '@/domain'

import {
  conferirYampi,
  diagnosticarShopify,
  importarDaYampi,
  importarPedidos,
  sincronizarEnvios,
} from './actions'

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
  const [diagnostico, setDiagnostico] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const conferirYampiAgora = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setResumo(null)
      setAviso(null)
      const r = await conferirYampi()
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setDiagnostico(
        `Yampi "${r.alias}" conectada · ${r.pedidos} pedidos. ` +
          `Campos do pedido: ${r.camposDoPedido.join(', ') || '—'}. ` +
          `Cliente: ${r.camposDoCliente.join(', ') || '—'}. ` +
          `Item: ${r.camposDoItem.join(', ') || '—'}.`,
      )
    })

  const diagnosticar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setResumo(null)
      setAviso(null)
      const r = await diagnosticarShopify()
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setDiagnostico(
        `Token de ${r.loja} tem: ${r.escopos.join(', ') || 'nenhum escopo'}.` +
          (r.faltando.length
            ? ` Falta ${r.faltando.join(', ')} — lançar a versão no dev dashboard não atualiza a instalação: abra o app na loja e aceite as permissões novas, ou reinstale.`
            : ' Está tudo que o ERP precisa.'),
      )
    })

  const importarYampi = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setResumo(null)
      setAviso(null)
      setDiagnostico(null)
      const r = await importarDaYampi(90)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      const {
        pedidos,
        itens,
        clientes,
        entregues,
        itensSemVariante,
        casadosPorSku,
        desde,
        basesComConsumo,
        removidosShopify,
      } = r.resultado
      setResumo(
        `${plural(pedidos, 'pedido', 'pedidos')} da Yampi desde ${desde} · ${plural(itens, 'item', 'itens')} · ` +
          `${plural(clientes, 'cliente com CPF', 'clientes com CPF')} · ${plural(entregues, 'entrega marcada', 'entregas marcadas')} · ` +
          `${plural(casadosPorSku, 'item casado por SKU', 'itens casados por SKU')} · consumo recalculado em ${plural(basesComConsumo, 'base', 'bases')}.` +
          (removidosShopify
            ? ` ${plural(removidosShopify, 'pedido espelho da Shopify removido', 'pedidos espelho da Shopify removidos')} — as mesmas vendas contariam duas vezes.`
            : ''),
      )
      if (itensSemVariante) {
        setAviso(
          `${plural(itensSemVariante, 'item não casou', 'itens não casaram')} com nenhuma variante pelo SKU. ` +
            'Reimporte o catálogo da Shopify primeiro: é ele que grava o SKU de cada variante, e sem isso não há por onde ligar.',
        )
      }
    })

  const sincronizar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setResumo(null)
      setAviso(null)
      setDiagnostico(null)
      const r = await sincronizarEnvios()
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setResumo(
        r.enviados === 0 && r.ignorados.length === 0
          ? 'Nenhum pedido novo para espelhar: todos os que têm rastreio já estão fechados na Shopify.'
          : `${plural(r.enviados, 'pedido marcado como enviado', 'pedidos marcados como enviados')} na Shopify, com o rastreio na conta do cliente` +
            (r.entregues ? ` · ${plural(r.entregues, 'entrega confirmada', 'entregas confirmadas')}` : '') +
            (r.fechados ? ` · ${plural(r.fechados, 'pedido fechado', 'pedidos fechados')} e fora da fila de abertos` : '') +
            '. Quem avisa o cliente continua sendo a Yampi — a Shopify não manda nada.',
      )
      if (r.ignorados.length) {
        setAviso(
          `${plural(r.ignorados.length, 'pedido não foi espelhado', 'pedidos não foram espelhados')}: ` +
            r.ignorados
              .slice(0, 3)
              .map((i) => `${i.pedido} (${i.motivo})`)
              .join('; ') +
            (r.ignorados.length > 3 ? `; e mais ${r.ignorados.length - 3}.` : '.'),
        )
      }
    })

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
      const {
        pedidos,
        itens,
        clientes,
        itensSemVariante,
        desde,
        basesComConsumo,
        semDadosDeCliente,
        casadosPorNome,
      } = r.resultado
      setResumo(
        `${plural(pedidos, 'pedido', 'pedidos')} desde ${desde} · ${plural(itens, 'item', 'itens')} · ` +
          `${plural(clientes, 'cliente', 'clientes')} · consumo diário recalculado em ${plural(basesComConsumo, 'base', 'bases')}.` +
          (casadosPorNome
            ? ` ${plural(casadosPorNome, 'item casou', 'itens casaram')} pelo nome do perfume — o id da variante mudou na loja desde a venda.`
            : ''),
      )
      const avisos: string[] = []
      if (semDadosDeCliente) {
        avisos.push(
          'A loja não liberou os dados protegidos de cliente, então vieram valores e itens, mas não nome, e-mail nem endereço. ' +
            'Para liberar: no app da Shopify, peça acesso a "protected customer data" e reimporte — o CRM depende disso.',
        )
      }
      if (itensSemVariante) {
        avisos.push(
          `${plural(itensSemVariante, 'item não casou', 'itens não casaram')} com nenhuma variante do ERP. ` +
            'Eles aparecem no pedido, mas não baixam estoque de ninguém — importe o catálogo antes dos pedidos para casar tudo.',
        )
      }
      setAviso(avisos.length ? avisos.join(' ') : null)
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
          Pedidos
        </span>
        <span
          className="font-sans"
          style={{ fontSize: 11, lineHeight: 1.55, color: 'rgba(242,237,227,.68)', textWrap: 'pretty' }}
        >
          {total === 0
            ? 'Nenhum pedido no ERP ainda. A Yampi é o checkout: é dela que vêm CPF, data de entrega e o pagamento liquidado. A Shopify guarda um espelho sem esses três.'
            : `${plural(total, 'pedido no ERP', 'pedidos no ERP')}. Importar da Yampi substitui o espelho da Shopify — as mesmas vendas com ids diferentes contariam duas vezes.`}
        </span>
        {(erro || resumo) && (
          <span
            className="font-sans"
            style={{ fontSize: 11, lineHeight: 1.5, color: erro ? COR.erro : COR.ok, textWrap: 'pretty' }}
          >
            {erro ?? resumo}
          </span>
        )}
        {diagnostico && (
          <span
            className="font-sans"
            style={{ fontSize: 10.5, lineHeight: 1.5, color: 'rgba(242,237,227,.75)', textWrap: 'pretty' }}
          >
            {diagnostico}
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
        onClick={importarYampi}
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
        {pendente ? 'Importando…' : 'Importar da Yampi'}
      </button>

      <button
        type="button"
        onClick={sincronizar}
        disabled={pendente}
        title="Fecha o pedido na Shopify com o rastreio da Yampi. Não envia e-mail: quem avisa é a Yampi"
        className="font-sans hover:border-ouro/40 hover:text-ouro"
        style={{
          height: 36,
          padding: '0 14px',
          flex: 'none',
          border: '1px solid rgba(239,209,140,.3)',
          background: 'rgba(239,209,140,.07)',
          color: 'var(--color-ouro)',
          fontWeight: 600,
          fontSize: 11,
          lineHeight: 1,
          borderRadius: 9,
          whiteSpace: 'nowrap',
          cursor: pendente ? 'wait' : 'pointer',
        }}
      >
        Espelhar envios na Shopify
      </button>

      <button
        type="button"
        onClick={conferirYampiAgora}
        disabled={pendente}
        className="font-sans hover:border-ouro/40 hover:text-ouro"
        style={{
          height: 36,
          padding: '0 14px',
          flex: 'none',
          border: '1px solid rgba(255,255,255,.11)',
          background: 'transparent',
          color: 'var(--color-secundario)',
          fontWeight: 600,
          fontSize: 11,
          lineHeight: 1,
          borderRadius: 9,
          whiteSpace: 'nowrap',
          cursor: pendente ? 'wait' : 'pointer',
        }}
      >
        Conferir Yampi
      </button>

      <button
        type="button"
        onClick={diagnosticar}
        disabled={pendente}
        className="font-sans hover:border-ouro/40 hover:text-ouro"
        style={{
          height: 36,
          padding: '0 14px',
          flex: 'none',
          border: '1px solid rgba(255,255,255,.11)',
          background: 'transparent',
          color: 'var(--color-secundario)',
          fontWeight: 600,
          fontSize: 11,
          lineHeight: 1,
          borderRadius: 9,
          whiteSpace: 'nowrap',
          cursor: pendente ? 'wait' : 'pointer',
        }}
      >
        Conferir permissões
      </button>

      <button
        type="button"
        onClick={importar}
        disabled={pendente}
        title="Espelho da Shopify: sem CPF e sem data de entrega. A Yampi é a origem."
        className="font-sans hover:border-ouro/40 hover:text-ouro"
        style={{
          height: 36,
          padding: '0 14px',
          flex: 'none',
          border: '1px solid rgba(255,255,255,.11)',
          background: 'transparent',
          color: 'var(--color-secundario)',
          fontWeight: 600,
          fontSize: 11,
          lineHeight: 1,
          borderRadius: 9,
          whiteSpace: 'nowrap',
          cursor: pendente ? 'wait' : 'pointer',
        }}
      >
        Importar da Shopify
      </button>
    </div>
  )
}
