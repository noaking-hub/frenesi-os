'use client'

import Image from 'next/image'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { entrar } from './actions'

/**
 * A porta do ERP.
 *
 * Quem chega aqui trabalha na casa — não há o que vender, então a tela não
 * tenta convencer. O que ela faz é parecer o sistema que abre em seguida:
 * mesmo preto, mesmo ouro, mesma tipografia. Uma porta que destoa do prédio
 * é a primeira coisa que faz alguém desconfiar de onde está digitando senha.
 */
function Botao() {
  // `useFormStatus` sabe do envio sem estado próprio — e o botão travado
  // durante o envio é o que evita duas sessões abertas por clique duplo.
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="fr-botao">
      {pending ? 'Entrando…' : 'Entrar'}
    </button>
  )
}

export function FormularioEntrada({ de }: { de: string }) {
  const [estado, acao] = useActionState(entrar, null)
  const [vendo, setVendo] = useState(false)

  return (
    <main className="fr-palco">
      {/* O preenchimento automático do Chrome pinta o campo de azul e o texto
          de preto — num tema escuro isso vira um campo ilegível no meio do
          formulário. As regras de autofill abaixo devolvem o campo ao tema. */}
      <style>{`
        .fr-palco {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 30px;
          padding: 40px 20px 64px;
          background:
            radial-gradient(90% 55% at 50% -8%, rgba(239,209,140,.10) 0%, rgba(8,8,7,0) 62%),
            radial-gradient(60% 40% at 50% 108%, rgba(157,126,67,.07) 0%, rgba(8,8,7,0) 70%),
            var(--color-app);
        }
        .fr-marca {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          animation: fr-entrada .5s ease both;
        }
        .fr-selo {
          font-size: 9.5px;
          letter-spacing: .34em;
          text-transform: uppercase;
          color: rgba(239,209,140,.62);
        }
        .fr-cartao {
          width: 100%;
          max-width: 392px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          padding: 30px 30px 32px;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(24,22,26,.96) 0%, rgba(16,15,17,.96) 100%);
          border: 1px solid rgba(239,209,140,.14);
          box-shadow: 0 30px 70px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.04);
          animation: fr-entrada .5s .06s ease both;
        }
        /* Fio de ouro no topo do cartão: o mesmo detalhe dos cards do ERP. */
        .fr-fio {
          height: 1px;
          margin: -30px -30px 0;
          border-radius: 18px 18px 0 0;
          background: linear-gradient(90deg, rgba(239,209,140,0) 0%, rgba(239,209,140,.55) 50%, rgba(239,209,140,0) 100%);
        }
        .fr-titulo {
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: .2em;
          text-transform: uppercase;
          color: var(--color-ouro);
        }
        .fr-campo-caixa { display: flex; flex-direction: column; gap: 8px; }
        .fr-rotulo {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: .14em;
          text-transform: uppercase;
          color: rgba(242,237,227,.5);
        }
        .fr-campo {
          height: 48px;
          width: 100%;
          padding: 0 14px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(255,255,255,.035);
          color: var(--color-corrente);
          font-size: 14px;
          border-radius: 11px;
          outline: none;
          transition: border-color .16s ease, box-shadow .16s ease, background .16s ease;
        }
        .fr-campo::placeholder { color: rgba(242,237,227,.26); }
        .fr-campo:hover { border-color: rgba(255,255,255,.16); }
        .fr-campo:focus {
          border-color: rgba(239,209,140,.5);
          background: rgba(255,255,255,.05);
          box-shadow: 0 0 0 3px rgba(239,209,140,.11);
        }
        .fr-campo:-webkit-autofill,
        .fr-campo:-webkit-autofill:hover,
        .fr-campo:-webkit-autofill:focus {
          -webkit-text-fill-color: var(--color-corrente);
          -webkit-box-shadow: 0 0 0 1000px #17161a inset;
          caret-color: var(--color-corrente);
          transition: background-color 9999s ease-in-out 0s;
        }
        .fr-senha { position: relative; }
        .fr-senha .fr-campo { padding-right: 62px; }
        .fr-ver {
          position: absolute;
          right: 6px;
          top: 50%;
          transform: translateY(-50%);
          height: 34px;
          padding: 0 11px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: rgba(242,237,227,.45);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: .1em;
          text-transform: uppercase;
          cursor: pointer;
          transition: color .16s ease;
        }
        .fr-ver:hover { color: var(--color-ouro); }
        .fr-botao {
          height: 48px;
          margin-top: 2px;
          border: 0;
          border-radius: 11px;
          background: linear-gradient(180deg, #F3D89B 0%, var(--color-ouro) 42%, #C9A868 100%);
          color: var(--color-sobre-ouro);
          font-weight: 700;
          font-size: 12px;
          letter-spacing: .14em;
          text-transform: uppercase;
          cursor: pointer;
          transition: filter .16s ease, transform .1s ease;
        }
        .fr-botao:hover:not(:disabled) { filter: brightness(1.06); }
        .fr-botao:active:not(:disabled) { transform: translateY(1px); }
        .fr-botao:disabled { opacity: .62; cursor: default; }
        .fr-erro {
          display: flex;
          gap: 9px;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid rgba(194,90,80,.34);
          background: rgba(194,90,80,.11);
          color: #E0938B;
          font-size: 11.5px;
          line-height: 1.5;
          text-wrap: pretty;
        }
        .fr-rodape {
          font-size: 9.5px;
          letter-spacing: .16em;
          text-transform: uppercase;
          color: rgba(242,237,227,.22);
        }
        :focus-visible { outline: 2px solid rgba(239,209,140,.55); outline-offset: 2px; }
        @keyframes fr-entrada {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .fr-marca, .fr-cartao { animation: none; }
        }
      `}</style>

      <div className="fr-marca">
        <Image
          src="/assets/frenesi-logo.png"
          alt="FRENESI"
          width={3791}
          height={795}
          priority
          style={{ width: 196, height: 'auto', display: 'block' }}
        />
        <span className="fr-selo font-sans">Sistema de operação</span>
      </div>

      <form action={acao} className="fr-cartao">
        <div className="fr-fio" aria-hidden />
        <span className="fr-titulo font-sans">Acesso ao sistema</span>

        <input type="hidden" name="de" value={de} />

        <label className="fr-campo-caixa">
          <span className="fr-rotulo font-sans">E-mail</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            autoFocus
            spellCheck={false}
            placeholder="voce@frenesiperfumes.com.br"
            className="fr-campo font-sans"
          />
        </label>

        <label className="fr-campo-caixa">
          <span className="fr-rotulo font-sans">Senha</span>
          <span className="fr-senha">
            <input
              name="senha"
              type={vendo ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="••••••••••"
              className="fr-campo font-sans"
            />
            {/* Ver a senha resolve o erro mais comum de digitação — e é mais
                honesto que a pessoa conferir do que errar três vezes. */}
            <button
              type="button"
              className="fr-ver font-sans"
              onClick={() => setVendo((v) => !v)}
              aria-label={vendo ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {vendo ? 'Ocultar' : 'Ver'}
            </button>
          </span>
        </label>

        {estado?.erro && (
          <span className="fr-erro font-sans" role="alert">
            <span aria-hidden style={{ color: '#C25A50' }}>◆</span>
            {estado.erro}
          </span>
        )}

        <Botao />
      </form>

      <span className="fr-rodape font-sans">FRENESI OS · acesso restrito</span>
    </main>
  )
}
