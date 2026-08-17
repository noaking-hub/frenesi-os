'use client'

import { useState, useTransition } from 'react'

import { confirmarDescadastro, voltarParaLista } from './acoes'

/**
 * O botão que faz o descadastro acontecer.
 *
 * Um clique, sem formulário e sem pedir o e-mail de novo — a pessoa já provou
 * quem é pelo link assinado. Pedir confirmação em duas etapas aqui é o tipo de
 * atrito que faz o cliente desistir e clicar em "isto é spam", que é
 * exatamente o resultado que esta página existe para evitar.
 *
 * "Voltar para a lista" fica logo abaixo porque quem clicou sem querer não
 * deve precisar de atendimento para desfazer.
 */
export function ConfirmarDescadastro({
  email,
  assinatura,
  jaSaiu,
}: {
  email: string
  assinatura: string
  jaSaiu: boolean
}) {
  const [fora, setFora] = useState(jaSaiu)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const agir = (sair: boolean) =>
    iniciar(async () => {
      setErro(null)
      const r = sair
        ? await confirmarDescadastro(email, assinatura)
        : await voltarParaLista(email, assinatura)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setFora(sair)
    })

  const BOTAO: React.CSSProperties = {
    height: 46,
    border: 0,
    borderRadius: 11,
    fontWeight: 600,
    fontSize: 13.5,
    cursor: pendente ? 'progress' : 'pointer',
  }

  return (
    <>
      <h1 className="font-display" style={{ margin: 0, fontSize: 24, lineHeight: 1.2, color: '#241F18' }}>
        {fora ? 'Pronto, você saiu da lista' : 'Quer parar de receber nossos e-mails?'}
      </h1>

      <p
        className="font-sans"
        style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'rgba(36,31,24,.62)' }}
      >
        {fora ? (
          <>
            Não enviaremos mais novidades, cupons nem lembretes para <strong>{email}</strong>.
          </>
        ) : (
          <>
            Vamos parar de enviar novidades, cupons e lembretes para <strong>{email}</strong>.
          </>
        )}
      </p>

      {erro ? (
        <span className="font-sans" style={{ fontSize: 12.5, color: '#A83A30' }}>
          {erro}
        </span>
      ) : null}

      {fora ? (
        <button
          type="button"
          onClick={() => agir(false)}
          disabled={pendente}
          className="font-sans"
          style={{
            ...BOTAO,
            background: 'transparent',
            border: '1px solid rgba(36,31,24,.18)',
            color: '#241F18',
          }}
        >
          {pendente ? 'Um instante…' : 'Cliquei sem querer, quero voltar'}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => agir(true)}
          disabled={pendente}
          className="font-sans"
          style={{ ...BOTAO, background: '#241F18', color: '#EFD18C' }}
        >
          {pendente ? 'Um instante…' : 'Cancelar inscrição'}
        </button>
      )}
    </>
  )
}
