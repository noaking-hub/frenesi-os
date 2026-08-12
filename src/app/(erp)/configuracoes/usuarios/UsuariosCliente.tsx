'use client'

import { useRouter } from 'next/navigation'

import { useState, useTransition } from 'react'

import { Badge, BotaoOuro, BotaoSecundario, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR } from '@/components/erp/tokens'

import { alternarAtivo, criarUsuario, redefinirSenha, type UsuarioDoErp } from '../../perfil/actions'

const campo: React.CSSProperties = {
  height: 38,
  width: '100%',
  padding: '0 12px',
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.04)',
  color: 'var(--color-corrente)',
  fontSize: 12.5,
  borderRadius: 9,
  outline: 'none',
}

const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : 'nunca entrou'

/**
 * Quem tem acesso ao ERP.
 *
 * A senha inicial aparece uma vez, na tela de quem criou — o ERP não a envia
 * por e-mail de propósito: caixa de entrada não é cofre, e a mensagem ficaria
 * lá para sempre com a chave do sistema dentro.
 */
export function UsuariosCliente({ usuarios, meuId }: { usuarios: UsuarioDoErp[]; meuId: string }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [papel, setPapel] = useState<'dono' | 'operacao'>('operacao')
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [redefinindo, setRedefinindo] = useState<string | null>(null)
  const [senhaNova, setSenhaNova] = useState('')
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  const colunas: Coluna<UsuarioDoErp>[] = [
    {
      chave: 'pessoa',
      titulo: 'Pessoa',
      largura: 'minmax(180px,1.4fr)',
      render: (u) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span className="font-sans" style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--color-corrente)' }}>
            {u.nome}
            {u.id === meuId && (
              <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
                {' '}
                · você
              </span>
            )}
          </span>
          <span className="font-mono" style={{ fontSize: 10, color: 'rgba(242,237,227,.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {u.email}
          </span>
        </span>
      ),
    },
    {
      chave: 'papel',
      titulo: 'Papel',
      largura: '110px',
      render: (u) => <Badge tom={u.papel === 'dono' ? 'ouro' : 'neutro'}>{u.papel === 'dono' ? 'Dono' : 'Operação'}</Badge>,
    },
    {
      chave: 'acesso',
      titulo: 'Último acesso',
      largura: 'minmax(120px,.8fr)',
      alinhamento: 'right',
      render: (u) => (
        <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--color-secundario)' }}>
          {dataHora(u.ultimoAcessoEm)}
        </span>
      ),
    },
    {
      chave: 'estado',
      titulo: 'Estado',
      largura: '92px',
      alinhamento: 'right',
      render: (u) => <Badge tom={u.ativo ? 'ok' : 'erro'}>{u.ativo ? 'Ativo' : 'Desativado'}</Badge>,
    },
    {
      chave: 'acao',
      titulo: '',
      largura: '210px',
      alinhamento: 'right',
      render: (u) => (
        <span style={{ display: 'inline-flex', gap: 7, justifyContent: 'flex-end' }}>
          <BotaoSecundario
            altura={28}
            onClick={() => {
              setRedefinindo(u.id === redefinindo ? null : u.id)
              setSenhaNova('')
              setAviso(null)
            }}
          >
            {u.id === redefinindo ? 'Cancelar' : 'Nova senha'}
          </BotaoSecundario>
          <BotaoSecundario
            altura={28}
            desabilitado={pendente || u.id === meuId}
            onClick={() =>
              iniciar(async () => {
                const r = await alternarAtivo(u.id, !u.ativo)
                setAviso(r.ok ? { tom: 'ok', texto: r.recado } : { tom: 'erro', texto: r.erro })
                if (r.ok) router.refresh()
              })
            }
          >
            {u.ativo ? 'Desativar' : 'Reativar'}
          </BotaoSecundario>
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {aviso && (
        <span
          className="font-sans"
          style={{
            padding: '9px 13px',
            borderRadius: 10,
            border: `1px solid ${aviso.tom === 'ok' ? 'rgba(92,158,112,.3)' : 'rgba(194,90,80,.35)'}`,
            background: aviso.tom === 'ok' ? 'rgba(92,158,112,.1)' : 'rgba(194,90,80,.1)',
            color: aviso.tom === 'ok' ? COR.ok : COR.erro,
            fontSize: 11.5,
            lineHeight: 1.5,
            textWrap: 'pretty',
          }}
        >
          {aviso.texto}
        </span>
      )}

      {redefinindo && (
        <section className="card-ouro" style={{ borderRadius: 14, padding: '16px 18px', display: 'flex', gap: 11, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 240 }}>
            <Rotulo>{`Senha nova para ${usuarios.find((u) => u.id === redefinindo)?.nome ?? ''}`}</Rotulo>
            <input
              type="text"
              value={senhaNova}
              onChange={(e) => setSenhaNova(e.target.value)}
              placeholder="pelo menos 10 caracteres"
              className="font-mono focus:border-ouro/45"
              style={campo}
            />
          </label>
          <BotaoOuro
            altura={38}
            desabilitado={pendente || senhaNova.length < 10}
            onClick={() =>
              iniciar(async () => {
                const r = await redefinirSenha(redefinindo, senhaNova)
                setAviso(r.ok ? { tom: 'ok', texto: r.recado } : { tom: 'erro', texto: r.erro })
                if (r.ok) {
                  setRedefinindo(null)
                  setSenhaNova('')
                }
              })
            }
          >
            Redefinir
          </BotaoOuro>
        </section>
      )}

      <Tabela
        colunas={colunas}
        itens={usuarios}
        chaveDe={(u) => u.id}
        bandeiraDe={(u) => (u.ativo ? null : 'erro')}
        cabecalho={
          <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--color-borda)' }}>
            <TituloSecao tamanho={13}>Quem tem acesso ao ERP</TituloSecao>
          </div>
        }
        vazio={
          <span className="font-sans" style={{ fontSize: 12, color: 'var(--color-terciario)' }}>
            Nenhum acesso cadastrado além do seu.
          </span>
        }
      />

      <section className="card-ouro" style={{ borderRadius: 16, padding: '20px 21px 22px', display: 'flex', flexDirection: 'column', gap: 13 }}>
        <TituloSecao tamanho={14}>Dar acesso a alguém</TituloSecao>
        <div className="empilha-900" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 1fr .8fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Rotulo>Nome</Rotulo>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="font-sans focus:border-ouro/45" style={campo} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Rotulo>E-mail</Rotulo>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" spellCheck={false} className="font-mono focus:border-ouro/45" style={campo} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Rotulo>Senha inicial</Rotulo>
            <input value={senha} onChange={(e) => setSenha(e.target.value)} type="text" className="font-mono focus:border-ouro/45" style={campo} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Rotulo>Papel</Rotulo>
            <select
              value={papel}
              onChange={(e) => setPapel(e.target.value as 'dono' | 'operacao')}
              className="font-sans focus:border-ouro/45"
              style={campo}
            >
              <option value="operacao">Operação</option>
              <option value="dono">Dono</option>
            </select>
          </label>
        </div>
        <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
          Dono abre Configurações e administra acessos; Operação usa o resto do sistema. A senha
          inicial aparece só aqui — passe por um canal seguro e peça que a pessoa troque em Meu perfil.
        </span>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <BotaoOuro
            altura={38}
            desabilitado={pendente || !nome.trim() || !email.trim() || senha.length < 10}
            onClick={() =>
              iniciar(async () => {
                const r = await criarUsuario({ nome, email, senha, papel })
                setAviso(r.ok ? { tom: 'ok', texto: r.recado } : { tom: 'erro', texto: r.erro })
                if (r.ok) {
                  setNome('')
                  setEmail('')
                  setSenha('')
                  router.refresh()
                }
              })
            }
          >
            {pendente ? 'Criando…' : 'Criar acesso'}
          </BotaoOuro>
        </div>
      </section>
    </div>
  )
}
