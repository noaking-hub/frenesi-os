'use client'

import { useState } from 'react'

import { BotaoOuro, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import type { ChaveModelo } from '@/data/modelo-email'
import type { ModeloEmailRecuperacao } from '@/domain'

import { ModeloEmail } from './ModeloEmail'

/**
 * A Central de E-mails da marca: cada e-mail que o ERP envia, com seu texto
 * editável e a prévia exata. Um lugar só — quem quer mudar a voz da marca
 * não deveria ter que lembrar em qual tela cada e-mail mora.
 */
export function EmailsCliente({
  carrinho,
  giftback,
  cashback,
  envio,
  devolucaoAberta,
  devolucaoAprovada,
  devolucaoConcluida,
}: {
  carrinho: ModeloEmailRecuperacao
  giftback: ModeloEmailRecuperacao
  cashback: ModeloEmailRecuperacao
  envio: ModeloEmailRecuperacao
  devolucaoAberta: ModeloEmailRecuperacao
  devolucaoAprovada: ModeloEmailRecuperacao
  devolucaoConcluida: ModeloEmailRecuperacao
}) {
  const [editando, setEditando] = useState<ChaveModelo | null>(null)

  // Cada cartão carrega o próprio modelo e os próprios dados de exemplo. Antes
  // o modal escolhia por uma cadeia de ternários paralela a esta lista, e o
  // quarto tipo caía no `else` — abrindo o editor de envio com o texto do
  // cashback. Lista única: acrescentar um tipo não pede lembrar de outro lugar.
  const cartoes = [
    {
      chave: 'carrinho' as const,
      nome: 'Recuperação de carrinho',
      onde: 'Enviado de CRM → Carrinhos abandonados, por clique ou em massa',
      modelo: carrinho,
      extras: 'aceita HTML do zero · lista de itens e cupom automáticos',
      cupom: { codigo: 'VOLTA10-A7K2MB', pct: 10 } as { codigo: string; pct: number } | null,
    },
    {
      chave: 'giftback' as const,
      nome: 'Aniversário (Giftback)',
      onde: 'Enviado de CRM → Giftback ao presentear um aniversariante',
      modelo: giftback,
      extras: 'cupom-presente único criado na Yampi entra sozinho',
      cupom: { codigo: 'NIVER15-A7K2MB', pct: 15 },
    },
    {
      chave: 'cashback' as const,
      nome: 'Aviso de cashback',
      onde: 'Enviado de CRM → Cashback, para quem tem saldo perto de vencer',
      modelo: cashback,
      extras: 'saldo e data de validade do próprio cliente entram sozinhos',
      // Cashback e envio não têm cupom — a prévia diz isso em vez de inventar um.
      cupom: null,
    },
    {
      chave: 'envio' as const,
      nome: 'Aviso de envio',
      onde: 'Enviado sozinho quando o pedido ganha código de rastreio',
      modelo: envio,
      extras: 'código e transportadora entram sozinhos · o botão já abre a página do objeto',
      cupom: null,
    },
    {
      chave: 'devolucao-aberta' as const,
      nome: 'Devolução · solicitação recebida',
      onde: 'Enviado sozinho quando o cliente abre a devolução no portal',
      modelo: devolucaoAberta,
      extras: 'protocolo e pedido entram sozinhos · próximos passos numerados',
      cupom: null,
    },
    {
      chave: 'devolucao-aprovada' as const,
      nome: 'Devolução · código de postagem',
      onde: 'Enviado sozinho quando a triagem aprova e gera o código reverso',
      modelo: devolucaoAprovada,
      extras: 'código reverso entra sozinho · instrução da agência dos Correios',
      cupom: null,
    },
    {
      chave: 'devolucao-concluida' as const,
      nome: 'Devolução · concluída',
      onde: 'Enviado sozinho na conclusão — com o comprovante do reembolso em anexo',
      modelo: devolucaoConcluida,
      extras: 'resolução e valor entram sozinhos · comprovante anexado ao e-mail',
      cupom: null,
    },
  ]

  const aberto = cartoes.find((c) => c.chave === editando)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--color-terciario)', textWrap: 'pretty', maxWidth: 720 }}>
        Todos os e-mails que o ERP envia em nome da FRENESI, num lugar só. Cada modelo tem editor com
        campos vivos e prévia exata do que o cliente recebe; o texto salvo vale na hora, sem deploy.
        O remetente (Resend) é configurado uma vez no ambiente e serve para todos.
      </span>

      <div className="empilha-900" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {cartoes.map((c) => (
          <section key={c.chave} className="card-ouro" style={{ borderRadius: 16, padding: '19px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <TituloSecao tamanho={14.5}>{c.nome}</TituloSecao>
            <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
              {c.onde}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '11px 13px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>
              <Rotulo>Assunto atual</Rotulo>
              <span className="font-sans" style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--color-corrente)' }}>
                {c.modelo.assunto}
              </span>
              <span className="font-mono" style={{ fontSize: 9.5, color: 'rgba(239,209,140,.5)' }}>
                {c.modelo.html?.trim() ? 'HTML do zero' : 'moldura da marca'} · {c.extras}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <BotaoOuro altura={36} onClick={() => setEditando(c.chave)}>
                Editar com prévia
              </BotaoOuro>
            </div>
          </section>
        ))}
      </div>

      {aberto && (
        <ModeloEmail
          tipo={aberto.chave}
          inicial={aberto.modelo}
          cupom={aberto.cupom}
          aoFechar={() => setEditando(null)}
        />
      )}
    </div>
  )
}
