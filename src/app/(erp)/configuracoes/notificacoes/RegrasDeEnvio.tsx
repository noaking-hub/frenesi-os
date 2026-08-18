'use client'

import { useState, useTransition } from 'react'

import { BotaoOuro, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { Etiqueta, TINTA } from '@/components/erp/ui'
import { problemasDaRegra, type RegraDeEnvio, type ToqueDeCarrinho } from '@/domain'

import { salvarRegra } from './acoes'

/**
 * Quando cada campanha de relacionamento escreve para o cliente.
 *
 * Os avisos de pedido já rodam sozinhos; carrinho, aniversário e cashback
 * dependiam de alguém abrir a tela do CRM e clicar — e por isso só aconteciam
 * quando alguém lembrava.
 *
 * Os números ficam aqui, e não em constante no código, porque "quantas horas
 * depois do abandono" é decisão de negócio: muda com a margem, com a estação e
 * com o que a concorrência está fazendo. Constante vira pedido de deploy toda
 * vez que muda, e o que não se ajusta sozinho acaba não sendo ajustado.
 */

const CAMPO: React.CSSProperties = {
  height: 32,
  width: '100%',
  padding: '0 10px',
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.025)',
  borderRadius: 8,
  color: 'rgba(242,237,227,.9)',
  fontSize: 12,
  outline: 0,
}

const soNumero = (t: string) => t.replace(/[^0-9]/g, '')

function Numero({
  rotulo,
  valor,
  aoMudar,
  sufixo,
}: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  sufixo?: string
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <Rotulo>{rotulo}</Rotulo>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <input
          value={valor}
          onChange={(e) => aoMudar(soNumero(e.target.value))}
          inputMode="numeric"
          className="font-mono"
          style={{ ...CAMPO, width: 74, textAlign: 'right' }}
        />
        {sufixo && (
          <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
            {sufixo}
          </span>
        )}
      </span>
    </label>
  )
}

function CartaoDaRegra({ inicial }: { inicial: RegraDeEnvio }) {
  const [regra, setRegra] = useState<RegraDeEnvio>(inicial)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [pendente, iniciar] = useTransition()

  const mexer = (mudanca: Partial<RegraDeEnvio>) => {
    setRegra((r) => ({ ...r, ...mudanca }))
    setSalvo(false)
    setErro(null)
  }

  const trocarToque = (i: number, mudanca: Partial<ToqueDeCarrinho>) => {
    const toques = [...(regra.toques ?? [])]
    toques[i] = { ...toques[i], ...mudanca }
    mexer({ toques })
  }

  // A conferência é a mesma do servidor, rodada a cada tecla: o problema
  // aparece enquanto se digita, e não depois de um clique que volta recusado.
  const problemas = problemasDaRegra(regra)

  const gravar = () =>
    iniciar(async () => {
      const r = await salvarRegra(regra)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setSalvo(true)
    })

  return (
    <section
      className="card-ouro"
      style={{ borderRadius: 16, padding: '18px 19px', display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <TituloSecao tamanho={14.5}>{regra.nome}</TituloSecao>
        <span style={{ flex: 1 }} />
        {/* O interruptor é o primeiro controle porque é a única decisão desta
            tela que muda o que o cliente recebe hoje. Os números só valem
            depois dele. */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={regra.ligada}
            onChange={(e) => mexer({ ligada: e.target.checked })}
            style={{ width: 16, height: 16, accentColor: '#EFD18C', cursor: 'pointer' }}
          />
          <span
            className="font-sans"
            style={{ fontSize: 11.5, fontWeight: 600, color: regra.ligada ? TINTA.ouro : 'var(--color-terciario)' }}
          >
            {regra.ligada ? 'Ligada' : 'Desligada'}
          </span>
        </label>
      </span>

      {/* O aviso da Yampi some quando a campanha é desligada: quem desligou já
          resolveu o risco, e o alerta permanente vira ruído que se aprende a
          ignorar — inclusive no dia em que ele importar. */}
      {regra.yampiTambemEnvia && regra.ligada && (
        <div
          style={{
            padding: '10px 12px',
            border: `1px solid ${TINTA.atencao}`,
            borderRadius: 9,
            background: 'rgba(217,140,63,.08)',
          }}
        >
          <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: TINTA.atencao, textWrap: 'pretty' }}>
            A Yampi também envia esta campanha. Com as duas ligadas, o cliente recebe dois e-mails do
            mesmo fato — e desconfia mais do segundo que do primeiro. Desligue lá antes.
          </span>
        </div>
      )}

      {regra.observacao && (
        <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
          {regra.observacao}
        </span>
      )}

      {/* ── Carrinho: os toques ─────────────────────────────────────────── */}
      {regra.campanha === 'carrinho' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <Etiqueta>Toques depois do abandono</Etiqueta>
          {(regra.toques ?? []).map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
              <Numero
                rotulo={`${i + 1}º toque`}
                valor={String(t.horas)}
                aoMudar={(v) => trocarToque(i, { horas: Number(v) || 0 })}
                sufixo="horas depois"
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, height: 32, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={t.cupom}
                  onChange={(e) => trocarToque(i, { cupom: e.target.checked })}
                  style={{ width: 14, height: 14, accentColor: '#EFD18C', cursor: 'pointer' }}
                />
                <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-secundario)' }}>
                  com cupom
                </span>
              </label>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10 }}>
            <BotaoOuro
              altura={28}
              onClick={() => mexer({ toques: [...(regra.toques ?? []), { horas: 168, cupom: true }] })}
            >
              + Toque
            </BotaoOuro>
            {(regra.toques?.length ?? 0) > 1 && (
              <button
                type="button"
                onClick={() => mexer({ toques: (regra.toques ?? []).slice(0, -1) })}
                className="font-sans hover:text-ouro"
                style={{ border: 0, background: 'transparent', color: 'var(--color-terciario)', fontSize: 11, cursor: 'pointer' }}
              >
                Remover o último
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Numero rotulo="Desconto do cupom" valor={String(regra.cupomPct ?? '')} aoMudar={(v) => mexer({ cupomPct: Number(v) || 0 })} sufixo="%" />
            <Numero rotulo="Cupom vale por" valor={String(regra.cupomValidadeDias ?? '')} aoMudar={(v) => mexer({ cupomValidadeDias: Number(v) || 0 })} sufixo="dias" />
            <Numero rotulo="Carrinho some depois de" valor={String(regra.janelaMaxDias ?? '')} aoMudar={(v) => mexer({ janelaMaxDias: Number(v) || 0 })} sufixo="dias" />
          </div>
        </div>
      )}

      {/* ── Aniversário ──────────────────────────────────────────────────── */}
      {regra.campanha === 'aniversario' && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <Numero
            rotulo="Enviar"
            valor={String(regra.diasAntes ?? 0)}
            aoMudar={(v) => mexer({ diasAntes: Number(v) || 0 })}
            sufixo="dias antes (0 = no dia)"
          />
          <Numero rotulo="Presente de" valor={String(regra.cupomPct ?? '')} aoMudar={(v) => mexer({ cupomPct: Number(v) || 0 })} sufixo="%" />
          <Numero rotulo="Vale por" valor={String(regra.cupomValidadeDias ?? '')} aoMudar={(v) => mexer({ cupomValidadeDias: Number(v) || 0 })} sufixo="dias" />
        </div>
      )}

      {/* ── Cashback ─────────────────────────────────────────────────────── */}
      {regra.campanha === 'cashback' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Etiqueta>Avisar antes do vencimento</Etiqueta>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {(Array.isArray(regra.diasAntes) ? regra.diasAntes : []).map((d, i) => (
              <Numero
                key={i}
                rotulo={`${i + 1}º aviso`}
                valor={String(d)}
                aoMudar={(v) => {
                  const lista = [...(Array.isArray(regra.diasAntes) ? regra.diasAntes : [])]
                  lista[i] = Number(v) || 0
                  mexer({ diasAntes: lista })
                }}
                sufixo="dias antes (0 = no dia)"
              />
            ))}
            <BotaoOuro
              altura={28}
              onClick={() =>
                mexer({ diasAntes: [...(Array.isArray(regra.diasAntes) ? regra.diasAntes : []), 1] })
              }
            >
              + Aviso
            </BotaoOuro>
            {(Array.isArray(regra.diasAntes) ? regra.diasAntes.length : 0) > 1 && (
              <button
                type="button"
                onClick={() =>
                  mexer({ diasAntes: (Array.isArray(regra.diasAntes) ? regra.diasAntes : []).slice(0, -1) })
                }
                className="font-sans hover:text-ouro"
                style={{ border: 0, background: 'transparent', color: 'var(--color-terciario)', fontSize: 11, cursor: 'pointer', height: 32 }}
              >
                Remover o último
              </button>
            )}
          </div>
        </div>
      )}

      {problemas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {problemas.map((p) => (
            <span key={p} className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.5, color: '#C25A50', textWrap: 'pretty' }}>
              ◆ {p}
            </span>
          ))}
        </div>
      )}
      {erro && (
        <span className="font-sans" style={{ fontSize: 10.5, color: '#C25A50' }}>
          ◆ {erro}
        </span>
      )}

      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <BotaoOuro altura={30} onClick={gravar} desabilitado={pendente || problemas.length > 0}>
          {pendente ? 'Salvando…' : 'Salvar regra'}
        </BotaoOuro>
        {salvo && (
          <span className="font-sans" style={{ fontSize: 11, color: TINTA.ok }}>
            Salvo — vale na próxima rodada
          </span>
        )}
        {regra.atualizadaEm && !salvo && (
          <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
            Última alteração{regra.atualizadaPor ? ` por ${regra.atualizadaPor}` : ''} em{' '}
            {new Date(regra.atualizadaEm).toLocaleDateString('pt-BR')}
          </span>
        )}
      </span>
    </section>
  )
}

export function RegrasDeEnvio({ regras }: { regras: RegraDeEnvio[] }) {
  if (regras.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <TituloSecao tamanho={15}>Regras de envio das campanhas</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--color-terciario)', textWrap: 'pretty', maxWidth: 760 }}
        >
          Quando o ERP escreve sozinho para o cliente. Os avisos de pedido já rodam pela rotina; estas
          três dependiam de alguém abrir a tela do CRM e clicar — e por isso só aconteciam quando
          alguém lembrava. O que for salvo aqui vale na rodada seguinte, sem deploy.
        </span>
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
        {regras.map((r) => (
          <CartaoDaRegra key={r.campanha} inicial={r} />
        ))}
      </div>
    </div>
  )
}
