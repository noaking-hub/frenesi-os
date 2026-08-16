'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { forcaDaSenha, MINIMO_DA_SENHA } from '@/domain'

import { EstilosDaPorta, MarcaDaPorta } from '../entrar/estilos'
import { definirNovaSenha } from './actions'

/**
 * A escolha da senha nova.
 *
 * Não pede a senha antiga, e é proposital: quem chegou até aqui provou ser
 * dono da caixa de e-mail, e exigir a senha esquecida seria fechar a única
 * saída que a pessoa tem.
 *
 * A barra de força é indicação, não permissão. Quem recusa uma senha é o
 * servidor, com a mesma função pura que roda nos testes — uma barra que
 * bloqueia no navegador seria contornável por quem desligasse o JavaScript.
 */

const CORES = ['transparent', '#C25A50', '#D9A441', '#7AA47A']

function Botao() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="fr-botao">
      {pending ? 'Salvando…' : 'Salvar a nova senha'}
    </button>
  )
}

export function FormularioNovaSenha({ email }: { email: string }) {
  const [estado, acao] = useActionState(definirNovaSenha, null)
  const [senha, setSenha] = useState('')
  const [vendo, setVendo] = useState(false)
  const forca = forcaDaSenha(senha)

  return (
    <main className="fr-palco">
      <EstilosDaPorta />
      <MarcaDaPorta />

      {estado?.ok ? (
        <div className="fr-cartao">
          <div className="fr-fio" aria-hidden />
          <span className="fr-titulo font-sans">Senha trocada</span>
          <span className="fr-ok font-sans" role="status">
            <span aria-hidden style={{ color: '#7AA47A' }}>◆</span>
            Pronto. A senha nova já vale, e as outras sessões abertas nesta conta foram
            encerradas — se alguém estava dentro com a senha antiga, saiu agora.
          </span>
          <Link href="/" className="fr-botao font-sans" style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}>
            Ir para o ERP
          </Link>
        </div>
      ) : (
        <form action={acao} className="fr-cartao">
          <div className="fr-fio" aria-hidden />
          <span className="fr-titulo font-sans">Escolher nova senha</span>
          <span className="fr-explica font-sans">
            Para <strong style={{ color: 'rgba(242,237,227,.72)' }}>{email}</strong>. No mínimo{' '}
            {MINIMO_DA_SENHA} caracteres, sem o nome da marca e sem o seu e-mail dentro.
          </span>

          <label className="fr-campo-caixa">
            <span className="fr-rotulo font-sans">Senha nova</span>
            <span className="fr-senha">
              <input
                name="senha"
                type={vendo ? 'text' : 'password'}
                required
                autoComplete="new-password"
                autoFocus
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••••"
                className="fr-campo font-sans"
              />
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

          <div className="fr-forca" aria-hidden>
            <div className="fr-forca-trilho">
              <div
                className="fr-forca-barra"
                style={{ width: `${(forca.nivel / 3) * 100}%`, background: CORES[forca.nivel] }}
              />
            </div>
            <span className="fr-forca-rotulo font-sans">{forca.rotulo}</span>
          </div>

          <label className="fr-campo-caixa">
            <span className="fr-rotulo font-sans">Repita a senha</span>
            <input
              name="confirmacao"
              type={vendo ? 'text' : 'password'}
              required
              autoComplete="new-password"
              placeholder="••••••••••"
              className="fr-campo font-sans"
            />
          </label>

          {estado?.erro && (
            <span className="fr-erro font-sans" role="alert">
              <span aria-hidden style={{ color: '#C25A50' }}>◆</span>
              {estado.erro}
            </span>
          )}

          <Botao />
        </form>
      )}

      <span className="fr-rodape font-sans">FRENESI OS · acesso restrito</span>
    </main>
  )
}
