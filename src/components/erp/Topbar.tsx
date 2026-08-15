'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { sair } from '@/app/entrar/actions'

import { Ico, type NomeIcone } from './IconesUi'
import { localizar } from './navegacao'
import { CONTORNO, TINTA, VELADO } from './ui'

const itemMenu: React.CSSProperties = {
  padding: '9px 10px',
  borderRadius: 8,
  fontSize: 12,
  lineHeight: 1.2,
  color: 'var(--color-corrente)',
  textDecoration: 'none',
  display: 'block',
}

export function Topbar({
  alertas,
  usuario,
}: {
  alertas: number
  /** Null quando a autenticação ainda não está configurada (desenvolvimento). */
  usuario: { nome: string; email: string; papel: 'dono' | 'operacao' } | null
}) {
  const pathname = usePathname()
  const cab = localizar(pathname)
  const { modulo, tela } = cab
  // "Rafael Araújo" vira "Rafael A." e "RA": o topo tem largura fixa, e nome
  // inteiro empurrava o breadcrumb.
  const partes = (usuario?.nome ?? '').trim().split(/\s+/).filter(Boolean)
  const nomeCurto = partes.length
    ? partes.length > 1
      ? `${partes[0]} ${partes[partes.length - 1][0]}.`
      : partes[0]
    : 'Sem sessão'
  const iniciais = partes.length
    ? (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
    : '—'
  // Breadcrumb `módulo · tela`; quando o grupo não tem subtelas os dois coincidem.
  const crumb = modulo === tela ? modulo : `${modulo} · ${tela}`

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: '0 30px',
        height: 78,
        flex: 'none',
        background: 'rgba(10,10,9,.82)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(255,255,255,.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
        {cab.icone && (
          <span
            style={{
              width: 38,
              height: 38,
              flex: 'none',
              borderRadius: 11,
              display: 'grid',
              placeItems: 'center',
              background: VELADO.ouro,
              border: `1px solid ${CONTORNO.ouro}`,
              color: TINTA.ouro,
            }}
          >
            <Ico n={cab.icone as NomeIcone} tamanho={18} />
          </span>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <h1
            className="font-display"
            style={{
              margin: 0,
              fontWeight: 600,
              fontSize: 22,
              lineHeight: 1.1,
              letterSpacing: '.005em',
              color: 'var(--color-tinta)',
              whiteSpace: 'nowrap',
            }}
          >
            {cab.titulo}
          </h1>
          <span
            className="font-sans"
            style={{
              fontSize: 11.5,
              lineHeight: 1.35,
              color: 'rgba(242,237,227,.44)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {cab.subtitulo ?? crumb}
          </span>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <label
        className="focus-within:border-ouro/45"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          width: 308,
          height: 36,
          padding: '0 13px',
          border: '1px solid rgba(255,255,255,.09)',
          background: 'rgba(255,255,255,.03)',
          borderRadius: 9,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 11,
            height: 11,
            border: '1.4px solid rgba(242,237,227,.4)',
            borderRadius: '50%',
            flex: 'none',
          }}
        />
        <input
          placeholder="Buscar pedido, cliente, CPF, rastreio, produto…"
          aria-label="Buscar"
          className="font-sans"
          style={{
            flex: 1,
            border: 0,
            outline: 0,
            background: 'transparent',
            color: 'var(--color-corrente)',
            fontSize: 12,
          }}
        />
        <kbd
          className="font-mono"
          style={{
            fontWeight: 500,
            fontSize: 9.5,
            color: 'rgba(242,237,227,.34)',
            border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 4,
            padding: '3px 5px',
          }}
        >
          ⌘K
        </kbd>
      </label>

      <button
        type="button"
        className="font-sans hover:border-ouro/35 hover:text-ouro"
        style={{
          height: 36,
          padding: '0 14px',
          border: '1px solid rgba(255,255,255,.09)',
          background: 'rgba(255,255,255,.03)',
          color: 'var(--color-secundario)',
          fontWeight: 600,
          fontSize: 11.5,
          borderRadius: 9,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: alertas ? 'var(--color-atencao)' : 'var(--color-ok)',
          }}
        />
        {alertas === 1 ? '1 alerta' : `${alertas} alertas`}
      </button>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          paddingLeft: 18,
          borderLeft: '1px solid var(--color-borda)',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 31,
            height: 31,
            borderRadius: '50%',
            background: 'linear-gradient(140deg,#EFD18C,#9D7E43)',
            color: 'var(--color-sobre-ouro)',
            fontWeight: 700,
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {iniciais}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            className="font-sans"
            style={{ fontWeight: 600, fontSize: 11.5, lineHeight: 1.3, color: 'var(--color-corrente)' }}
          >
            {nomeCurto}
          </span>
          <span
            className="font-sans"
            style={{ fontSize: 9.5, lineHeight: 1.3, color: 'rgba(242,237,227,.38)' }}
          >
            {usuario ? (usuario.papel === 'dono' ? 'Dono' : 'Operação') : 'Sem sessão'}
          </span>
        </div>

        {/* O menu é <details>: abre e fecha sem estado, sem efeito e sem
            listener de clique fora — HTML dando conta do que costuma virar
            trezentas linhas de dropdown. */}
        <details style={{ position: 'relative' }}>
          <summary
            aria-label="Menu da conta"
            className="hover:brightness-125"
            style={{
              listStyle: 'none',
              cursor: 'pointer',
              width: 26,
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 7,
              color: 'rgba(242,237,227,.5)',
              fontSize: 10,
            }}
          >
            ▾
          </summary>
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 34,
              minWidth: 210,
              padding: 7,
              borderRadius: 12,
              background: 'var(--color-painel)',
              border: '1px solid var(--color-borda)',
              boxShadow: '0 18px 40px rgba(0,0,0,.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              zIndex: 40,
            }}
          >
            <span
              className="font-mono"
              style={{ padding: '7px 10px 8px', fontSize: 10, lineHeight: 1.4, color: 'var(--color-terciario)', wordBreak: 'break-all' }}
            >
              {usuario?.email ?? 'autenticação desligada'}
            </span>
            <Link href="/perfil" className="hover:brightness-125 font-sans" style={itemMenu}>
              Meu perfil
            </Link>
            {usuario?.papel === 'dono' && (
              <Link href="/configuracoes/usuarios" className="hover:brightness-125 font-sans" style={itemMenu}>
                Usuários do ERP
              </Link>
            )}
            <form action={sair}>
              <button type="submit" className="hover:brightness-125 font-sans" style={{ ...itemMenu, width: '100%', textAlign: 'left', border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-erro-claro, #d98078)' }}>
                Sair
              </button>
            </form>
          </div>
        </details>
      </div>
    </header>
  )
}
