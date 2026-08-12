'use client'

import { useRouter } from 'next/navigation'

import { useState, useTransition } from 'react'

import { BotaoOuro, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import type { UsuarioSessao } from '@/data/sessao'

import { salvarPerfil, trocarSenha } from './actions'

const campo: React.CSSProperties = {
  height: 40,
  width: '100%',
  padding: '0 12px',
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.04)',
  color: 'var(--color-corrente)',
  fontSize: 13,
  borderRadius: 9,
  outline: 'none',
}

function Aviso({ aviso }: { aviso: { tom: 'ok' | 'erro'; texto: string } | null }) {
  if (!aviso) return null
  return (
    <span
      className="font-sans"
      role={aviso.tom === 'erro' ? 'alert' : undefined}
      style={{ fontSize: 11.5, lineHeight: 1.5, color: aviso.tom === 'ok' ? COR.ok : COR.erro, textWrap: 'pretty' }}
    >
      {aviso.texto}
    </span>
  )
}

const cartao: React.CSSProperties = {
  borderRadius: 16,
  padding: '20px 21px 22px',
  display: 'flex',
  flexDirection: 'column',
  gap: 13,
}

/**
 * Painel do usuário: o que é dele e só dele.
 *
 * Duas coisas separadas em dois cartões, porque são dois riscos diferentes:
 * trocar o nome é cosmético, trocar a senha é segurança — e um botão só,
 * salvando as duas, faria alguém mudar a senha sem querer.
 */
export function PerfilCliente({ usuario, ultimoAcesso }: { usuario: UsuarioSessao; ultimoAcesso: string | null }) {
  const [nome, setNome] = useState(usuario.nome)
  const [avisoNome, setAvisoNome] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)

  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [avisoSenha, setAvisoSenha] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)

  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 620 }}>
      <section className="card-ouro" style={cartao}>
        <TituloSecao tamanho={14.5}>Meus dados</TituloSecao>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Rotulo>Nome</Rotulo>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="font-sans focus:border-ouro/45"
            style={campo}
          />
        </label>

        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Rotulo>E-mail (é a sua credencial)</Rotulo>
            <span className="font-mono" style={{ fontSize: 12, color: 'var(--color-corrente)' }}>
              {usuario.email}
            </span>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Rotulo>Papel</Rotulo>
            <span className="font-sans" style={{ fontSize: 12, color: 'var(--color-corrente)' }}>
              {usuario.papel === 'dono' ? 'Dono · acesso total' : 'Operação'}
            </span>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Rotulo>Último acesso</Rotulo>
            <span className="font-mono" style={{ fontSize: 12, color: 'var(--color-secundario)' }}>
              {ultimoAcesso
                ? new Date(ultimoAcesso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                : 'este é o primeiro'}
            </span>
          </span>
        </div>

        <Aviso aviso={avisoNome} />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <BotaoOuro
            altura={36}
            desabilitado={pendente || nome.trim() === usuario.nome}
            onClick={() =>
              iniciar(async () => {
                const r = await salvarPerfil(nome)
                setAvisoNome(r.ok ? { tom: 'ok', texto: r.recado } : { tom: 'erro', texto: r.erro })
                if (r.ok) router.refresh()
              })
            }
          >
            Salvar nome
          </BotaoOuro>
        </div>
      </section>

      <section className="card-ouro" style={cartao}>
        <TituloSecao tamanho={14.5}>Trocar senha</TituloSecao>
        <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.55, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
          Pelo menos 10 caracteres. Como o ERP guarda dado de cliente e faturamento, prefira uma frase
          longa a uma palavra com símbolos — é mais fácil de lembrar e mais difícil de quebrar.
        </span>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Rotulo>Senha atual</Rotulo>
          <input
            type="password"
            autoComplete="current-password"
            value={atual}
            onChange={(e) => setAtual(e.target.value)}
            className="font-sans focus:border-ouro/45"
            style={campo}
          />
        </label>

        <div className="empilha-600" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Rotulo>Senha nova</Rotulo>
            <input
              type="password"
              autoComplete="new-password"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              className="font-sans focus:border-ouro/45"
              style={campo}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Rotulo>Confirme a senha nova</Rotulo>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              className="font-sans focus:border-ouro/45"
              style={campo}
            />
          </label>
        </div>

        <Aviso aviso={avisoSenha} />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <BotaoOuro
            altura={36}
            desabilitado={pendente || !atual || !nova || !confirmacao}
            onClick={() =>
              iniciar(async () => {
                const r = await trocarSenha(atual, nova, confirmacao)
                setAvisoSenha(r.ok ? { tom: 'ok', texto: r.recado } : { tom: 'erro', texto: r.erro })
                if (r.ok) {
                  setAtual('')
                  setNova('')
                  setConfirmacao('')
                }
              })
            }
          >
            {pendente ? 'Trocando…' : 'Trocar senha'}
          </BotaoOuro>
        </div>
      </section>
    </div>
  )
}
