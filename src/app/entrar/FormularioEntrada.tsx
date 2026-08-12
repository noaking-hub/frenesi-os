'use client'

import Image from 'next/image'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { entrar } from './actions'

const campo: React.CSSProperties = {
  height: 46,
  width: '100%',
  padding: '0 14px',
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.035)',
  color: 'var(--color-corrente)',
  fontSize: 14,
  borderRadius: 10,
  outline: 'none',
}

function Botao() {
  // `useFormStatus` sabe do envio sem estado próprio — e o botão desabilitado
  // durante o envio é o que evita duas sessões abertas por clique duplo.
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="font-sans hover:brightness-110"
      style={{
        height: 46,
        marginTop: 4,
        border: 0,
        borderRadius: 10,
        background: 'linear-gradient(180deg, var(--color-ouro) 0%, var(--color-ouro-escuro) 100%)',
        color: 'var(--color-sobre-ouro)',
        fontWeight: 700,
        fontSize: 12.5,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        cursor: pending ? 'default' : 'pointer',
        opacity: pending ? 0.7 : 1,
      }}
    >
      {pending ? 'Entrando…' : 'Entrar'}
    </button>
  )
}

/**
 * A porta do ERP.
 *
 * Sóbria de propósito: sem ilustração, sem promessa de marketing — quem chega
 * aqui trabalha na casa. O que a tela precisa fazer é caber numa mão, aceitar
 * o gerenciador de senhas do navegador (`autoComplete`) e dizer com clareza
 * quando algo não confere.
 */
export function FormularioEntrada({ de }: { de: string }) {
  const [estado, acao] = useActionState(entrar, null)

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 26,
        padding: '32px 20px 56px',
        background:
          'radial-gradient(120% 80% at 50% 0%, rgba(239,209,140,.07) 0%, rgba(8,8,7,0) 60%), var(--color-app)',
      }}
    >
      <Image
        src="/assets/frenesi-logo.png"
        alt="FRENESI"
        width={3791}
        height={795}
        priority
        style={{ width: 188, height: 'auto', display: 'block' }}
      />

      <form
        action={acao}
        style={{
          width: '100%',
          maxWidth: 380,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          padding: '26px 26px 28px',
          borderRadius: 16,
          background: 'linear-gradient(180deg, var(--color-card-top) 0%, var(--color-card-bottom) 100%)',
          border: '1px solid rgba(239,209,140,.16)',
        }}
      >
        <span
          className="font-sans"
          style={{
            fontSize: 10.5,
            letterSpacing: '.2em',
            textTransform: 'uppercase',
            color: 'var(--color-ouro)',
            fontWeight: 600,
          }}
        >
          Acesso ao sistema
        </span>

        <input type="hidden" name="de" value={de} />

        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-secundario)' }}>
            E-mail
          </span>
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            autoFocus
            spellCheck={false}
            className="font-sans focus:border-ouro/45"
            style={campo}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-secundario)' }}>
            Senha
          </span>
          <input
            name="senha"
            type="password"
            required
            autoComplete="current-password"
            className="font-sans focus:border-ouro/45"
            style={campo}
          />
        </label>

        {estado?.erro && (
          <span
            className="font-sans"
            role="alert"
            style={{
              fontSize: 11.5,
              lineHeight: 1.5,
              color: 'var(--color-erro-claro, #d98078)',
              textWrap: 'pretty',
            }}
          >
            {estado.erro}
          </span>
        )}

        <Botao />
      </form>

      <span
        className="font-sans"
        style={{ fontSize: 10.5, lineHeight: 1.6, color: 'var(--color-terciario)', textAlign: 'center', maxWidth: 340, textWrap: 'pretty' }}
      >
        Esqueceu a senha? Quem administra o ERP redefine em Configurações → Usuários.
      </span>
    </main>
  )
}
