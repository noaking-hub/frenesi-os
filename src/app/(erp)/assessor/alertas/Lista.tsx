'use client'

import { useTransition } from 'react'

import { CONTORNO, Etiqueta, Ico, LinkSeta, Num, TINTA, VELADO, type TomUi } from '@/components/erp/ui'
import { brl, type Severidade } from '@/domain'

import type { Alerta } from '@/data/assessor/alertas'

const TOM: Record<Severidade, TomUi> = {
  critico: 'erro',
  alto: 'atencao',
  medio: 'info',
  informativo: 'neutro',
}

const ROTULO: Record<Severidade, string> = {
  critico: 'Crítico',
  alto: 'Alto',
  medio: 'Médio',
  informativo: 'Informativo',
}

export function ListaDeAlertas({
  alertas,
  aoSilenciar,
  aoReativar,
  silenciados,
  resolvidos,
}: {
  alertas: Alerta[]
  aoSilenciar: (chave: string, dias: number) => Promise<void>
  aoReativar: (chave: string) => Promise<void>
  silenciados?: boolean
  resolvidos?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {alertas.map((a) => (
        <Item
          key={a.id}
          a={a}
          aoSilenciar={aoSilenciar}
          aoReativar={aoReativar}
          silenciado={silenciados}
          resolvido={resolvidos}
        />
      ))}
    </div>
  )
}

function Item({
  a,
  aoSilenciar,
  aoReativar,
  silenciado,
  resolvido,
}: {
  a: Alerta
  aoSilenciar: (chave: string, dias: number) => Promise<void>
  aoReativar: (chave: string) => Promise<void>
  silenciado?: boolean
  resolvido?: boolean
}) {
  const [ocupado, iniciar] = useTransition()
  const tom = resolvido ? 'ok' : TOM[a.severidade]

  const desde = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(a.detectadoEm))

  return (
    <article
      style={{
        display: 'flex',
        gap: 12,
        padding: '12px 13px',
        borderRadius: 11,
        border: `1px solid ${CONTORNO[tom]}`,
        background: VELADO[tom],
        opacity: resolvido || silenciado ? 0.72 : 1,
        flexWrap: 'wrap',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 28,
          height: 28,
          flex: 'none',
          borderRadius: 8,
          display: 'grid',
          placeItems: 'center',
          background: 'rgba(0,0,0,.22)',
          border: `1px solid ${CONTORNO[tom]}`,
          color: TINTA[tom],
        }}
      >
        <Ico
          n={resolvido ? 'check' : silenciado ? 'relogio' : a.severidade === 'critico' ? 'alerta-circulo' : 'alerta'}
          tamanho={15}
        />
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          {!resolvido && (
            <span
              className="font-sans"
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                color: TINTA[tom],
              }}
            >
              {ROTULO[a.severidade]}
            </span>
          )}
          <span
            className="font-sans"
            style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-tinta)', textWrap: 'pretty' }}
          >
            {a.titulo}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
          {a.impactoFinanceiro !== null && (
            <Campo rotulo="Impacto">
              <Num tom={tom} tamanho={12}>
                {brl(a.impactoFinanceiro)}
              </Num>
            </Campo>
          )}
          {a.impactoOperacional && <Campo rotulo="Alcance">{a.impactoOperacional}</Campo>}
          {a.urgencia && !resolvido && <Campo rotulo="Urgência">{a.urgencia}</Campo>}
          <Campo rotulo="Desde">{desde}</Campo>
          <Campo rotulo="Vezes vistas">{String(a.ocorrencias)}</Campo>
          {silenciado && a.silenciadoAte && (
            <Campo rotulo="Volta em">
              {new Intl.DateTimeFormat('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                dateStyle: 'short',
              }).format(new Date(a.silenciadoAte))}
            </Campo>
          )}
          {resolvido && a.resolvidoEm && (
            <Campo rotulo="Resolvido em">
              {new Intl.DateTimeFormat('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                dateStyle: 'short',
                timeStyle: 'short',
              }).format(new Date(a.resolvidoEm))}
            </Campo>
          )}
        </div>
      </div>

      {!resolvido && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {a.proximaAcao && <LinkSeta href={a.proximaAcao.href}>{a.proximaAcao.texto}</LinkSeta>}
          {silenciado ? (
            <Botao
              texto="Reativar"
              ocupado={ocupado}
              aoClicar={() => iniciar(() => void aoReativar(a.chave))}
            />
          ) : (
            <>
              <Botao
                texto="Adiar 7 dias"
                ocupado={ocupado}
                aoClicar={() => iniciar(() => void aoSilenciar(a.chave, 7))}
              />
              <Botao
                texto="Adiar 30"
                ocupado={ocupado}
                aoClicar={() => iniciar(() => void aoSilenciar(a.chave, 30))}
              />
            </>
          )}
        </div>
      )}
    </article>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Etiqueta>{rotulo}</Etiqueta>
      <span className="font-sans" style={{ fontSize: 11.5, color: 'rgba(242,237,227,.7)' }}>
        {children}
      </span>
    </span>
  )
}

function Botao({
  texto,
  ocupado,
  aoClicar,
}: {
  texto: string
  ocupado: boolean
  aoClicar: () => void
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={ocupado}
      className="font-sans hover:border-ouro/40 hover:text-ouro"
      style={{
        height: 28,
        padding: '0 11px',
        borderRadius: 7,
        border: '1px solid rgba(255,255,255,.1)',
        background: 'transparent',
        color: 'rgba(242,237,227,.55)',
        fontSize: 10.5,
        fontWeight: 600,
        cursor: ocupado ? 'wait' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {texto}
    </button>
  )
}
