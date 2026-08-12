'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import { ICONES } from './Icones'
import { NAV, grupoAberto, rotaAtiva, type GrupoNav } from './navegacao'

const CHAVE_MENU = 'frenesi:menu-recolhido'

export function Sidebar({ origem }: { origem: 'supabase' | 'fixtures' }) {
  const pathname = usePathname()
  const [abertos, setAbertos] = useState<Record<string, boolean>>({})
  // O menu abre expandido no servidor e recolhe no cliente se foi a última
  // escolha — ler localStorage no primeiro render divergiria da hidratação.
  const [recolhida, setRecolhida] = useState(false)

  useEffect(() => {
    setRecolhida(localStorage.getItem(CHAVE_MENU) === '1')
  }, [])

  const alternarMenu = () => {
    setRecolhida((v) => {
      localStorage.setItem(CHAVE_MENU, v ? '0' : '1')
      return !v
    })
  }

  // O grupo da tela atual abre sozinho — inclusive em navegação direta por URL.
  useEffect(() => {
    const atual = NAV.find((g) => grupoAberto(pathname, g))
    if (atual) setAbertos((s) => ({ ...s, [atual.id]: true }))
  }, [pathname])

  return (
    <aside
      style={{
        width: recolhida ? 62 : 244,
        flex: 'none',
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg,#0E0D0C,#0A0A09)',
        borderRight: '1px solid rgba(239,209,140,.10)',
        transition: 'width .2s ease',
      }}
    >
      <div
        style={{
          height: 78,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: recolhida ? 0 : '0 22px',
          borderBottom: '1px solid rgba(255,255,255,.06)',
        }}
      >
        <Link href="/" aria-label="FRENESI · início">
          {/* Logomarca oficial: vertical, sempre inteira, sem tagline.
              Recolhida, sobra o monograma — a própria logo, cortada não: um F. */}
          {recolhida ? (
            <span
              className="font-display"
              aria-hidden
              style={{ fontWeight: 700, fontSize: 21, color: 'var(--color-ouro)', lineHeight: 1 }}
            >
              F
            </span>
          ) : (
            <Image
              src="/assets/frenesi-logo.png"
              alt="FRENESI"
              // O tamanho declarado é o REAL do arquivo (3791×795): o CSS
              // abaixo escala os dois lados juntos e a proporção fica correta.
              // Declarar 164×52 (que não é a proporção do PNG) fazia o Next
              // avisar, a cada página, que só uma das medidas foi alterada.
              width={3791}
              height={795}
              priority
              style={{ width: 164, height: 'auto', display: 'block' }}
            />
          )}
        </Link>
      </div>

      <nav
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 12px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {NAV.map((grupo) => (
          <Grupo
            key={grupo.id}
            grupo={grupo}
            pathname={pathname}
            recolhida={recolhida}
            aberto={!recolhida && (abertos[grupo.id] ?? false)}
            alternar={() => {
              // Clicar num grupo com o menu recolhido reabre o menu já no
              // grupo certo — recolhido não dá para mostrar as telas.
              if (recolhida) {
                alternarMenu()
                setAbertos((s) => ({ ...s, [grupo.id]: true }))
                return
              }
              setAbertos((s) => ({ ...s, [grupo.id]: !s[grupo.id] }))
            }}
          />
        ))}
      </nav>

      <button
        type="button"
        onClick={alternarMenu}
        aria-label={recolhida ? 'Expandir o menu' : 'Recolher o menu'}
        className="font-sans hover:bg-[rgba(239,209,140,.07)]"
        style={{
          margin: '0 12px 8px',
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          border: '1px solid rgba(255,255,255,.07)',
          borderRadius: 8,
          background: 'transparent',
          color: 'rgba(242,237,227,.5)',
          fontWeight: 600,
          fontSize: 10.5,
          lineHeight: 1,
          cursor: 'pointer',
        }}
      >
        <span aria-hidden style={{ fontSize: 11 }}>{recolhida ? '»' : '«'}</span>
        {!recolhida && 'Recolher menu'}
      </button>

      <div
        style={{
          padding: recolhida ? '14px 0 18px' : '14px 18px 18px',
          borderTop: '1px solid rgba(255,255,255,.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: recolhida ? 'center' : 'flex-start',
          gap: 9,
        }}
      >
        <span
          aria-hidden
          className="animate-[fr-pulse_2.4s_ease-in-out_infinite]"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: origem === 'supabase' ? 'var(--color-ok)' : 'var(--color-info)',
          }}
        />
        {!recolhida && (
          <span
            className="font-sans"
            style={{ fontWeight: 500, fontSize: 10.5, lineHeight: 1.3, color: 'var(--color-terciario)' }}
          >
            {origem === 'supabase' ? 'Sincronizado agora' : 'Dados de demonstração'}
          </span>
        )}
      </div>
    </aside>
  )
}

function Grupo({
  grupo,
  pathname,
  aberto,
  alternar,
  recolhida = false,
}: {
  grupo: GrupoNav
  pathname: string
  aberto: boolean
  alternar: () => void
  recolhida?: boolean
}) {
  const temSubs = Boolean(grupo.telas?.length)
  const ativo = grupo.href
    ? rotaAtiva(pathname, grupo.href)
    : grupoAberto(pathname, grupo)

  const estiloBotao = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: recolhida ? ('center' as const) : ('flex-start' as const),
    gap: 10,
    width: '100%',
    padding: recolhida ? '10px 0' : '9px 12px 9px 13px',
    border: 0,
    borderRadius: 9,
    background: ativo && !temSubs ? 'rgba(239,209,140,.1)' : 'transparent',
    color: ativo ? 'var(--color-ouro)' : 'rgba(242,237,227,.66)',
    fontWeight: ativo ? 600 : 500,
    fontSize: 12.5,
    lineHeight: 1,
    letterSpacing: '.01em',
    textAlign: 'left' as const,
    cursor: 'pointer',
    transition: 'background-color .16s, color .16s',
  }

  // O ícone acompanha o estado pelo `currentColor`: apagado no repouso,
  // dourado no ativo. O ponto genérico fica de reserva para grupo sem ícone.
  const marcador = ICONES[grupo.id] ?? (
    <span
      aria-hidden
      style={{
        width: 4,
        height: 4,
        borderRadius: '50%',
        flex: 'none',
        background: ativo ? 'var(--color-ouro)' : 'rgba(242,237,227,.18)',
      }}
    />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {temSubs ? (
        <button
          type="button"
          onClick={alternar}
          aria-expanded={aberto}
          title={recolhida ? grupo.label : undefined}
          className="nav-grupo font-sans hover:bg-[rgba(239,209,140,.07)]"
          style={estiloBotao}
        >
          {marcador}
          {!recolhida && <span style={{ flex: 1 }}>{grupo.label}</span>}
          {!recolhida && (
            <span
              aria-hidden
              style={{
                fontSize: 9,
                color: 'rgba(242,237,227,.35)',
                transform: `rotate(${aberto ? 90 : 0}deg)`,
                transition: 'transform .2s',
              }}
            >
              ▸
            </span>
          )}
        </button>
      ) : (
        <Link
          href={grupo.href!}
          title={recolhida ? grupo.label : undefined}
          className="nav-grupo font-sans hover:bg-[rgba(239,209,140,.07)]"
          style={estiloBotao}
        >
          {marcador}
          {!recolhida && <span style={{ flex: 1 }}>{grupo.label}</span>}
        </Link>
      )}

      {temSubs && aberto && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            margin: '3px 0 6px 26px',
            paddingLeft: 11,
            borderLeft: '1px solid rgba(239,209,140,.16)',
          }}
        >
          {grupo.telas!.map((tela) => {
            const telaAtiva = rotaAtiva(pathname, tela.href)
            return (
              <Link
                key={tela.id}
                href={tela.href}
                className="font-sans hover:text-ouro hover:bg-[rgba(239,209,140,.05)]"
                style={{
                  background: telaAtiva ? 'rgba(239,209,140,.08)' : 'transparent',
                  color: telaAtiva ? 'var(--color-ouro)' : 'rgba(242,237,227,.5)',
                  fontWeight: telaAtiva ? 600 : 400,
                  fontSize: 11.5,
                  lineHeight: 1,
                  padding: '7px 10px',
                  borderRadius: 7,
                  transition: 'background-color .16s, color .16s',
                }}
              >
                {tela.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
