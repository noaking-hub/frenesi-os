'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

import { BotaoSecundario, Badge, EstadoVazio, TituloSecao } from '@/components/erp/primitivos'
import { Etiqueta, TINTA } from '@/components/erp/ui'
import type { Tom } from '@/components/erp/tokens'
import type { LinhaLogNotificacao } from '@/data/notificacoes'
import type { LinhaDescadastro } from '@/data/descadastro'

import { reenviarAviso } from './acoes'

/**
 * O log dos avisos e a lista de quem cancelou a inscrição.
 *
 * As linhas que NÃO saíram vêm junto com as que saíram, e é isso que faz a
 * tela valer: "enviado" a operação já supõe; "falhou" e "dispensado" são as
 * que exigem decisão, e ficavam invisíveis.
 */

const TOM_DO_ESTADO: Record<LinhaLogNotificacao['estado'], Tom> = {
  enviado: 'ok',
  falhou: 'erro',
  dispensado: 'neutro',
  enviando: 'info',
}

const ROTULO_ESTADO: Record<LinhaLogNotificacao['estado'], string> = {
  enviado: 'Enviado',
  falhou: 'Falhou',
  dispensado: 'Dispensado',
  enviando: 'Em curso',
}

const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })

export function NotificacoesCliente({
  log,
  descadastrados,
  filtroEstado,
  filtroEvento,
}: {
  log: LinhaLogNotificacao[]
  descadastrados: LinhaDescadastro[]
  filtroEstado: string
  filtroEvento: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()

  const trocar = (chave: string, valor: string) => {
    const novo = new URLSearchParams(params.toString())
    if (valor) novo.set(chave, valor)
    else novo.delete(chave)
    const qs = novo.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const reenviar = (chave: string) =>
    iniciar(async () => {
      setAviso(null)
      const r = await reenviarAviso(chave)
      setAviso(
        r.ok
          ? {
              tom: 'ok',
              texto:
                'Aviso devolvido para a fila. Ele sai na próxima rodada da rotina, em até dez minutos.',
            }
          : { tom: 'erro', texto: r.erro },
      )
      router.refresh()
    })

  const eventos = [...new Set(log.map((l) => l.evento))].sort()

  const chip = (ativo: boolean): React.CSSProperties => ({
    height: 28,
    padding: '0 12px',
    borderRadius: 8,
    border: `1px solid ${ativo ? 'rgba(239,209,140,.42)' : 'rgba(255,255,255,.08)'}`,
    background: ativo ? 'rgba(239,209,140,.10)' : 'transparent',
    color: ativo ? TINTA.ouro : 'rgba(242,237,227,.55)',
    fontSize: 11.5,
    fontWeight: 600,
    cursor: 'pointer',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 11,
          padding: '14px 16px',
          border: '1px solid rgba(255,255,255,.065)',
          borderRadius: 14,
          background: 'linear-gradient(168deg, #15141608, #0E0E0F)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <Etiqueta>Estado</Etiqueta>
          {(
            [
              ['', 'Todos'],
              ['enviado', 'Enviados'],
              ['falhou', 'Falharam'],
              ['dispensado', 'Dispensados'],
            ] as [string, string][]
          ).map(([valor, rotulo]) => (
            <button
              key={valor || 'todos'}
              type="button"
              onClick={() => trocar('estado', valor)}
              className="font-sans"
              style={chip(filtroEstado === valor)}
            >
              {rotulo}
            </button>
          ))}
          {eventos.length > 1 ? (
            <>
              <div style={{ width: 8 }} />
              <Etiqueta>Evento</Etiqueta>
              <select
                value={filtroEvento}
                onChange={(e) => trocar('evento', e.target.value)}
                className="font-sans"
                style={{
                  height: 28,
                  padding: '0 8px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,.08)',
                  background: 'rgba(255,255,255,.025)',
                  color: 'rgba(242,237,227,.88)',
                  fontSize: 11.5,
                }}
              >
                <option value="">Todos</option>
                {eventos.map((e) => (
                  <option key={e} value={e}>
                    {log.find((l) => l.evento === e)?.rotulo ?? e}
                  </option>
                ))}
              </select>
            </>
          ) : null}
        </div>
        {aviso ? (
          <span
            className="font-sans"
            style={{ fontSize: 12, color: aviso.tom === 'ok' ? 'var(--color-ok)' : 'var(--color-erro)' }}
          >
            {aviso.texto}
          </span>
        ) : null}
      </section>

      {log.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum aviso registrado"
          instrucao="Cada e-mail ao cliente — enviado, dispensado ou falho — aparece aqui assim que a rotina rodar."
        />
      ) : (
        <section
          style={{
            background: 'var(--color-mesa)',
            border: '1px solid var(--color-borda)',
            borderRadius: 'var(--radius-card)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '15px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <TituloSecao tamanho={14.5}>O que o ERP escreveu para o cliente</TituloSecao>
          </div>
          {log.map((l) => (
            <div
              key={l.chave}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 18px',
                borderTop: '1px solid var(--color-borda-sutil)',
                flexWrap: 'wrap',
              }}
            >
              <span
                className="font-mono"
                style={{ fontSize: 11, color: 'var(--color-terciario)', minWidth: 86 }}
              >
                {quando(l.criadoEm)}
              </span>
              <Badge tom={TOM_DO_ESTADO[l.estado]}>{ROTULO_ESTADO[l.estado]}</Badge>
              <span
                className="font-sans"
                style={{ fontSize: 12, color: 'var(--color-corrente)', minWidth: 150 }}
              >
                {l.rotulo}
              </span>
              <span
                className="font-sans"
                style={{ flex: 1, minWidth: 180, fontSize: 12, color: 'var(--color-secundario)' }}
              >
                {l.destinatario}
                {l.pedidoId ? (
                  <span style={{ color: 'var(--color-terciario)' }}> · {l.pedidoId}</span>
                ) : null}
                {l.motivo ? (
                  <span
                    style={{ display: 'block', fontSize: 11, color: 'var(--color-terciario)' }}
                  >
                    {l.motivo}
                  </span>
                ) : null}
              </span>
              {l.estado === 'falhou' ? (
                <BotaoSecundario altura={28} onClick={() => reenviar(l.chave)} desabilitado={pendente}>
                  Reenviar
                </BotaoSecundario>
              ) : null}
            </div>
          ))}
        </section>
      )}

      <section
        style={{
          background: 'var(--color-mesa)',
          border: '1px solid var(--color-borda)',
          borderRadius: 'var(--radius-card)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '15px 18px',
            borderBottom: '1px solid rgba(255,255,255,.06)',
          }}
        >
          <TituloSecao tamanho={14.5}>Cancelaram a inscrição</TituloSecao>
          <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
            Não recebem carrinho, giftback nem aviso de cashback. Avisos de pedido e devolução
            continuam — são o andamento de uma compra, não divulgação.
          </span>
        </div>
        {descadastrados.length === 0 ? (
          <div style={{ padding: '16px 18px' }}>
            <span className="font-sans" style={{ fontSize: 12, color: 'var(--color-terciario)' }}>
              Ninguém cancelou a inscrição até agora.
            </span>
          </div>
        ) : (
          descadastrados.map((d) => (
            <div
              key={d.email}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 18px',
                borderTop: '1px solid var(--color-borda-sutil)',
                flexWrap: 'wrap',
              }}
            >
              <span
                className="font-mono"
                style={{ fontSize: 11, color: 'var(--color-terciario)', minWidth: 86 }}
              >
                {quando(d.criadoEm)}
              </span>
              <span className="font-sans" style={{ flex: 1, minWidth: 200, fontSize: 12, color: 'var(--color-corrente)' }}>
                {d.email}
              </span>
              <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
                {d.origem}
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
