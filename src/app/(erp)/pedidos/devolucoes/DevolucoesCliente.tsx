'use client'

import { useMemo, useState } from 'react'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Barra, BotaoOuro, Losango, Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { BORDA, COR, FAIXA, type Tom } from '@/components/erp/tokens'
import {
  PASSOS_DEVOLUCAO,
  acoesDisponiveis,
  brl,
  descreveVariante,
  emAberto,
  etapaDe,
  pad2,
  plural,
  triarDevolucao,
  volume,
} from '@/domain'
import type { ItemAferido, StatusSolicitacao, Triagem } from '@/domain'
import type { SolicitacaoErp } from '@/data/fixtures'

const TOM_STATUS: Record<StatusSolicitacao, Tom> = {
  Nova: 'ouro',
  'Em análise': 'info',
  'Aguardando fotos': 'atencao',
  Aprovada: 'ok',
  Recusada: 'erro',
  'Aguardando postagem': 'atencao',
  'Em trânsito reverso': 'info',
  Recebida: 'ouro',
  Concluída: 'ok',
}

type Filtro = 'Abertas' | 'Novas' | 'Em análise' | 'Aguardando reverso' | 'A conferir' | 'Encerradas'

const RESOLUCOES = ['Reembolso integral', 'Troca por outro perfume', 'Cupom + 10% de bônus']

export function DevolucoesCliente({ solicitacoes }: { solicitacoes: SolicitacaoErp[] }) {
  const [filtro, setFiltro] = useState<Filtro>('Abertas')
  const [selecionada, setSelecionada] = useState(solicitacoes[0]?.id ?? '')
  // Decisões tomadas nesta sessão. Com backend, viram mutações.
  const [decisoes, setDecisoes] = useState<
    Record<string, { status?: StatusSolicitacao; resolucao?: string; reverso?: string }>
  >({})

  const statusDe = (d: SolicitacaoErp): StatusSolicitacao =>
    decisoes[d.id]?.status ?? d.status
  const reversoDe = (d: SolicitacaoErp): string => decisoes[d.id]?.reverso ?? d.reverso

  const predicados = useMemo<Record<Filtro, (d: SolicitacaoErp) => boolean>>(
    () => ({
      Abertas: (d) => emAberto(statusDe(d)),
      Novas: (d) => statusDe(d) === 'Nova',
      'Em análise': (d) => statusDe(d) === 'Em análise' || statusDe(d) === 'Aguardando fotos',
      'Aguardando reverso': (d) =>
        statusDe(d) === 'Aprovada' ||
        statusDe(d) === 'Aguardando postagem' ||
        statusDe(d) === 'Em trânsito reverso',
      'A conferir': (d) => statusDe(d) === 'Recebida',
      Encerradas: (d) => !emAberto(statusDe(d)),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [decisoes],
  )

  const filtros = Object.keys(predicados) as Filtro[]
  const visiveis = solicitacoes.filter(predicados[filtro])
  const sel = solicitacoes.find((d) => d.id === selecionada) ?? visiveis[0] ?? null

  const conta = (fn: (d: SolicitacaoErp) => boolean) => solicitacoes.filter(fn).length
  const valorEmAberto = solicitacoes
    .filter((d) => emAberto(statusDe(d)))
    .reduce((a, d) => a + d.valor, 0)

  const kpis: Kpi[] = [
    {
      label: 'Novas solicitações',
      valor: pad2(conta((d) => statusDe(d) === 'Nova')),
      hint: 'Abertas no portal e ainda sem análise',
      tom: 'ouro',
    },
    {
      label: 'Em análise',
      valor: pad2(conta((d) => statusDe(d) === 'Em análise' || statusDe(d) === 'Aguardando fotos')),
      hint: 'Aguardando decisão da operação',
      tom: 'info',
    },
    {
      label: 'Aguardando postagem',
      valor: pad2(
        conta((d) => statusDe(d) === 'Aguardando postagem' || statusDe(d) === 'Em trânsito reverso'),
      ),
      hint: 'Reverso enviado ao cliente',
      tom: 'atencao',
    },
    {
      label: 'A conferir',
      valor: pad2(conta((d) => statusDe(d) === 'Recebida')),
      hint: 'Chegou e precisa de conferência',
      tom: 'ouro',
    },
    {
      label: 'Valor em devolução',
      valor: brl(valorEmAberto),
      hint: 'Ainda não resolvido',
      tom: 'erro',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        {filtros.map((f) => {
          const ativo = f === filtro
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className="font-sans hover:border-ouro/40"
              style={{
                height: 31,
                padding: '0 13px',
                border: `1px solid ${ativo ? 'rgba(239,209,140,.4)' : 'var(--color-borda)'}`,
                background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
                color: ativo ? 'var(--color-ouro)' : 'var(--color-secundario)',
                fontWeight: 600,
                fontSize: 11,
                borderRadius: 'var(--radius-pill)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              {f}
              <span className="font-mono" style={{ fontWeight: 500, fontSize: 10, opacity: 0.6 }}>
                {solicitacoes.filter(predicados[f]).length}
              </span>
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        <span
          className="font-sans"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 10.5,
            color: 'var(--color-terciario)',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            aria-hidden
            className="animate-[fr-pulse_2.4s_ease-in-out_infinite]"
            style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-ok)' }}
          />
          devolucoes.frenesiperfumes.com.br
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '288px minmax(0,1fr)',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {visiveis.map((d) => {
            const status = statusDe(d)
            const ativo = sel?.id === d.id
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelecionada(d.id)}
                className="hover:border-ouro/35"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 9,
                  padding: '14px 15px',
                  border: `1px solid ${ativo ? 'rgba(239,209,140,.4)' : 'var(--color-borda)'}`,
                  borderLeft: `2px solid ${COR[TOM_STATUS[status]]}`,
                  background: ativo ? 'rgba(239,209,140,.07)' : 'rgba(255,255,255,.022)',
                  borderRadius: 12,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%' }}>
                  <Valor tamanho={11} tom="ouro">
                    {d.id}
                  </Valor>
                  <span className="font-mono" style={{ fontSize: 10.5, color: 'rgba(242,237,227,.38)' }}>
                    {d.pedidoId}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span
                    className="font-sans"
                    style={{
                      fontWeight: 600,
                      fontSize: 9,
                      lineHeight: 1,
                      letterSpacing: '.07em',
                      textTransform: 'uppercase',
                      color: COR[TOM_STATUS[status]],
                      border: `1px solid ${COR[TOM_STATUS[status]]}`,
                      borderRadius: 'var(--radius-pill)',
                      padding: '3px 7px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {status}
                  </span>
                </span>
                <span
                  className="font-sans"
                  style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.3, color: 'var(--color-corrente)' }}
                >
                  {d.cliente}
                </span>
                <span
                  className="font-sans"
                  style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--color-secundario)' }}
                >
                  {d.motivo}
                </span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, width: '100%' }}>
                  <Valor tamanho={12.5}>{brl(d.valor)}</Valor>
                  <span
                    className="font-sans"
                    style={{
                      fontSize: 10,
                      letterSpacing: '.05em',
                      textTransform: 'uppercase',
                      color: 'rgba(242,237,227,.35)',
                    }}
                  >
                    {d.tipo}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.35)' }}>
                    {d.abertura}
                  </span>
                </span>
              </button>
            )
          })}

          {visiveis.length === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 9,
                padding: '44px 20px',
                border: '1px solid var(--color-borda)',
                borderRadius: 12,
                background: 'var(--color-mesa)',
              }}
            >
              <span
                aria-hidden
                style={{ width: 20, height: 20, border: '1px solid rgba(239,209,140,.3)', transform: 'rotate(45deg)' }}
              />
              <span
                className="font-display"
                style={{ fontWeight: 600, fontSize: 13, marginTop: 5, color: 'rgba(242,237,227,.75)' }}
              >
                Sem solicitações neste filtro
              </span>
            </div>
          )}
        </div>

        {sel && (
          <Ficha
            solicitacao={sel}
            status={statusDe(sel)}
            reverso={reversoDe(sel)}
            resolucao={decisoes[sel.id]?.resolucao ?? RESOLUCOES[0]}
            aoDecidir={(patch) =>
              setDecisoes((s) => ({ ...s, [sel.id]: { ...s[sel.id], ...patch } }))
            }
          />
        )}
      </div>
    </div>
  )
}

function Ficha({
  solicitacao: d,
  status,
  reverso,
  resolucao,
  aoDecidir,
}: {
  solicitacao: SolicitacaoErp
  status: StatusSolicitacao
  reverso: string
  resolucao: string
  aoDecidir: (patch: { status?: StatusSolicitacao; resolucao?: string; reverso?: string }) => void
}) {
  const triagem = triarDevolucao(d.itens, d.tipo, d.lacre)
  const acoes = acoesDisponiveis(status, Boolean(reverso))
  const etapa = etapaDe(status)
  const artigo = d.gateway === 'Frenet' ? 'na' : 'no'

  const tomTriagem: Tom = triagem.severidade === 'erro' ? 'erro' : triagem.severidade === 'atencao' ? 'atencao' : 'ok'

  const historico: { quando: string; texto: string; tom: Tom }[] = [
    { quando: d.abertura, texto: `Solicitação aberta no portal · ${d.identificacao}`, tom: 'info' },
  ]
  if (status === 'Recusada') {
    historico.push({ quando: 'Análise', texto: 'Devolução recusada · produto fora da política', tom: 'erro' })
  } else if (etapa >= 2) {
    historico.push({ quando: 'Análise', texto: `Devolução aprovada · ${d.tipo}`, tom: 'ok' })
  }
  if (reverso) {
    historico.push({
      quando: 'Reverso',
      // A plataforma do reverso é sempre a da etiqueta de ida.
      texto: `Código ${reverso} gerado ${artigo} ${d.gateway} · mesma plataforma da etiqueta de ida`,
      tom: 'ok',
    })
    historico.push({ quando: 'E-mail', texto: `Instruções de postagem enviadas para ${d.email}`, tom: 'ok' })
  }
  if (etapa >= 3) {
    historico.push({ quando: 'Recebimento', texto: 'Produto recebido na expedição · conferência pendente', tom: 'ouro' })
  }
  if (status === 'Concluída') {
    historico.push({ quando: 'Resolução', texto: `${resolucao} registrada e informada ao cliente`, tom: 'ok' })
  }

  return (
    <section
      style={{
        background: 'linear-gradient(170deg,#141315,#101011)',
        border: '1px solid var(--color-borda)',
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 16,
          padding: '20px 22px 18px',
          borderBottom: '1px solid rgba(255,255,255,.06)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Valor tamanho={12} tom="ouro">
              {d.id}
            </Valor>
            <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
              {`pedido ${d.pedidoId}`}
            </span>
            <span
              className="font-sans"
              style={{
                fontWeight: 600,
                fontSize: 9.5,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: COR[TOM_STATUS[status]],
                border: `1px solid ${COR[TOM_STATUS[status]]}`,
                borderRadius: 'var(--radius-pill)',
                padding: '4px 8px',
                whiteSpace: 'nowrap',
              }}
            >
              {status}
            </span>
          </span>
          <TituloSecao tamanho={19}>{`${d.cliente} · ${d.destino}`}</TituloSecao>
          <span
            className="font-sans"
            style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--color-terciario)' }}
          >
            {`Portal do cliente · ${d.identificacao} · aberta ${d.abertura}`}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flex: 'none' }}>
          <Valor tamanho={19} tom="ouro">
            {brl(d.valor)}
          </Valor>
          <span
            className="font-sans"
            style={{
              fontSize: 10.5,
              lineHeight: 1.3,
              color: d.prazoOk ? COR.ok : COR.atencao,
              whiteSpace: 'nowrap',
            }}
          >
            {d.prazo}
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${PASSOS_DEVOLUCAO.length},1fr)`,
          gap: 10,
          padding: '16px 22px',
          borderBottom: '1px solid rgba(255,255,255,.06)',
        }}
      >
        {PASSOS_DEVOLUCAO.map((p, i) => {
          const tom: Tom = i < etapa ? 'ok' : i === etapa ? (status === 'Recusada' ? 'erro' : 'ouro') : 'neutro'
          return (
            <span key={p} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span
                style={{
                  height: 3,
                  borderRadius: 2,
                  display: 'block',
                  background: i < etapa ? 'rgba(127,192,149,.5)' : 'rgba(255,255,255,.08)',
                }}
              />
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    flex: 'none',
                    background: i <= etapa ? COR[tom] : 'rgba(255,255,255,.12)',
                  }}
                />
                <span
                  className="font-sans"
                  style={{
                    fontWeight: 600,
                    fontSize: 10.5,
                    lineHeight: 1.3,
                    color: i <= etapa ? 'var(--color-corrente)' : 'rgba(242,237,227,.35)',
                  }}
                >
                  {p}
                </span>
              </span>
            </span>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(380px,1fr) 280px', gap: 18, padding: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <Rotulo>{`Motivo declarado · ${d.tipo}`}</Rotulo>
            <span
              className="font-sans"
              style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.35, color: 'var(--color-corrente)' }}
            >
              {d.motivo}
            </span>
            <p
              className="font-sans"
              style={{
                margin: 0,
                padding: '12px 14px',
                borderRadius: 11,
                background: 'rgba(255,255,255,.028)',
                borderLeft: '2px solid rgba(239,209,140,.35)',
                fontSize: 12,
                lineHeight: 1.6,
                color: 'rgba(242,237,227,.78)',
              }}
            >
              {d.comentario}
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 11,
              padding: '15px 16px',
              borderRadius: 13,
              background: FAIXA[tomTriagem],
              border: `1px solid ${BORDA[tomTriagem]}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Losango tom={tomTriagem} />
              <span
                className="font-sans"
                style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.35, color: COR[tomTriagem] }}
              >
                {triagem.titulo}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                background: 'rgba(255,255,255,.06)',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              {triagem.itens.map((item) => (
                <LinhaAferida key={`${item.perfume}-${item.variante}`} item={item} />
              ))}
            </div>

            <span style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Rotulo>Lacre / recrave</Rotulo>
                <span
                  className="font-sans"
                  style={{
                    fontWeight: 600,
                    fontSize: 12,
                    lineHeight: 1.3,
                    color: d.lacre === 'intacto' ? COR.ok : d.lacre === 'violado' ? COR.erro : COR.atencao,
                  }}
                >
                  {d.lacre === 'intacto'
                    ? 'Intacto'
                    : d.lacre === 'violado'
                      ? 'Violado'
                      : 'Rompido no transporte'}
                </span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* Critério interno: existe aqui, nunca no portal do cliente. */}
                <Rotulo>Tolerância</Rotulo>
                <span
                  className="font-sans"
                  style={{ fontSize: 12, lineHeight: 1.3, color: 'var(--color-secundario)', whiteSpace: 'nowrap' }}
                >
                  10% abaixo do fracionado
                </span>
              </span>
            </span>

            <span
              className="font-sans"
              style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--color-secundario)' }}
            >
              {triagem.mensagem}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Rotulo>Fotos enviadas pelo cliente</Rotulo>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill,minmax(118px,1fr))',
                gap: 10,
              }}
            >
              {d.fotos.map((label, i) => (
                <span key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                  <span
                    style={{
                      height: 104,
                      borderRadius: 9,
                      border: '1px solid rgba(255,255,255,.08)',
                      background:
                        'repeating-linear-gradient(135deg,rgba(239,209,140,.1) 0 4px,rgba(239,209,140,.035) 4px 8px)',
                      display: 'flex',
                      alignItems: 'flex-end',
                      padding: 8,
                    }}
                  >
                    <span
                      className="font-mono"
                      style={{ fontSize: 8.5, letterSpacing: '.1em', color: 'var(--color-terciario)' }}
                    >
                      {`FOTO ${i + 1}`}
                    </span>
                  </span>
                  <span
                    className="font-sans"
                    style={{ fontSize: 10.5, lineHeight: 1.3, color: 'var(--color-terciario)' }}
                  >
                    {label}
                  </span>
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <Rotulo>Histórico</Rotulo>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {historico.map((h, i) => (
                <span
                  key={`${h.quando}-${i}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '92px 12px minmax(0,1fr)',
                    gap: 11,
                    alignItems: 'start',
                    padding: '8px 0',
                  }}
                >
                  <span
                    className="font-mono"
                    style={{ fontSize: 10, lineHeight: 1.45, color: 'rgba(242,237,227,.34)' }}
                  >
                    {h.quando}
                  </span>
                  <span
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, paddingTop: 4 }}
                  >
                    <span
                      aria-hidden
                      style={{ width: 5, height: 5, borderRadius: '50%', background: COR[h.tom] }}
                    />
                    <span
                      style={{ width: 1, flex: 1, minHeight: 12, background: 'var(--color-borda)', display: 'block' }}
                    />
                  </span>
                  <span
                    className="font-sans"
                    style={{ fontSize: 11.5, lineHeight: 1.45, color: 'rgba(242,237,227,.75)' }}
                  >
                    {h.texto}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 11,
              padding: '15px 16px',
              borderRadius: 13,
              background: 'rgba(239,209,140,.045)',
              border: '1px solid var(--color-borda-ouro)',
            }}
          >
            <Rotulo style={{ color: 'var(--color-ouro)' }}>Logística reversa</Rotulo>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                background: 'rgba(255,255,255,.05)',
                borderRadius: 9,
                overflow: 'hidden',
              }}
            >
              <LinhaInfo rotulo="Plataforma da etiqueta de ida" valor={`${d.gateway} · ${d.etiquetaIda}`} />
              <LinhaInfo
                rotulo="Código reverso"
                valor={reverso || 'Não gerado'}
                tom={reverso ? COR.ouro : 'var(--color-terciario)'}
                mono
              />
              <LinhaInfo
                rotulo="E-mail ao cliente"
                valor={reverso ? 'Instruções enviadas' : 'Ainda não enviado'}
                tom={reverso ? COR.ok : COR.atencao}
              />
              <LinhaInfo rotulo="Contato" valor={d.telefone} mono />
            </div>

            {acoes.emAnalise && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {/* A recusa só vira ação primária quando a triagem bloqueia. */}
                {triagem.bloqueado ? (
                  <button
                    type="button"
                    onClick={() => aoDecidir({ status: 'Recusada' })}
                    className="font-sans hover:brightness-[1.07]"
                    style={{
                      height: 36,
                      border: 0,
                      background: 'var(--color-erro)',
                      color: '#FFF6F4',
                      fontWeight: 700,
                      fontSize: 11.5,
                      borderRadius: 9,
                      cursor: 'pointer',
                    }}
                  >
                    Recusar · produto utilizado
                  </button>
                ) : (
                  <BotaoOuro altura={36} onClick={() => aoDecidir({ status: 'Aprovada' })}>
                    Aprovar devolução
                  </BotaoOuro>
                )}
                <div style={{ display: 'flex', gap: 7 }}>
                  <button
                    type="button"
                    onClick={() => aoDecidir({ status: 'Aguardando fotos' })}
                    className="font-sans hover:border-ouro/30 hover:text-ouro"
                    style={{
                      flex: 1,
                      height: 32,
                      border: '1px solid rgba(255,255,255,.11)',
                      background: 'transparent',
                      color: 'var(--color-secundario)',
                      fontWeight: 600,
                      fontSize: 11,
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    Pedir mais fotos
                  </button>
                  {!triagem.bloqueado && (
                    <button
                      type="button"
                      onClick={() => aoDecidir({ status: 'Recusada' })}
                      className="font-sans hover:bg-[rgba(194,90,80,.12)]"
                      style={{
                        flex: 1,
                        height: 32,
                        border: '1px solid rgba(194,90,80,.32)',
                        background: 'transparent',
                        color: 'var(--color-erro-claro)',
                        fontWeight: 600,
                        fontSize: 11,
                        borderRadius: 8,
                        cursor: 'pointer',
                      }}
                    >
                      Recusar
                    </button>
                  )}
                </div>
              </div>
            )}

            {acoes.podeGerarReverso && (
              <BotaoOuro
                altura={36}
                onClick={() =>
                  aoDecidir({ reverso: `RV${d.etiquetaIda.slice(-7)}`, status: 'Aguardando postagem' })
                }
              >
                {`Gerar reverso ${artigo} ${d.gateway}`}
              </BotaoOuro>
            )}

            {acoes.podeReceber && (
              <button
                type="button"
                onClick={() => aoDecidir({ status: 'Recebida' })}
                className="font-sans hover:bg-[rgba(239,209,140,.16)]"
                style={{
                  height: 36,
                  border: '1px solid rgba(239,209,140,.3)',
                  background: 'rgba(239,209,140,.07)',
                  color: 'var(--color-ouro)',
                  fontWeight: 600,
                  fontSize: 11.5,
                  borderRadius: 9,
                  cursor: 'pointer',
                }}
              >
                Registrar recebimento
              </button>
            )}

            {acoes.podeConcluir && (
              <BotaoOuro altura={36} onClick={() => aoDecidir({ status: 'Concluída' })}>
                {`Concluir com ${resolucao.toLowerCase()}`}
              </BotaoOuro>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              padding: '15px 16px',
              borderRadius: 13,
              background: 'rgba(255,255,255,.025)',
              border: '1px solid var(--color-borda)',
            }}
          >
            <Rotulo>Resolução</Rotulo>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {RESOLUCOES.map((r) => {
                const ativo = resolucao === r
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => aoDecidir({ resolucao: r })}
                    className="font-sans hover:border-ouro/35"
                    style={{
                      height: 33,
                      padding: '0 12px',
                      border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.09)'}`,
                      background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
                      color: ativo ? 'var(--color-ouro)' : 'rgba(242,237,227,.62)',
                      fontWeight: 600,
                      fontSize: 11,
                      borderRadius: 8,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {r}
                  </button>
                )
              })}
            </div>
            <span
              className="font-sans"
              style={{ fontSize: 10.5, lineHeight: 1.45, color: 'var(--color-terciario)' }}
            >
              A resolução só é aplicada após a conferência do produto recebido.
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Rotulo>{plural(d.itens.length, 'Item da solicitação', 'Itens da solicitação')}</Rotulo>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                background: 'rgba(255,255,255,.05)',
                borderRadius: 11,
                overflow: 'hidden',
              }}
            >
              {d.itens.map((i) => (
                <span
                  key={`${i.perfume}-${i.variante}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    background: '#121114',
                  }}
                >
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <span
                      className="font-sans"
                      style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.25, color: 'var(--color-corrente)' }}
                    >
                      {i.perfume}
                    </span>
                    <span
                      className="font-sans"
                      style={{ fontSize: 10.5, lineHeight: 1.25, color: 'var(--color-terciario)' }}
                    >
                      {descreveVariante(i.variante)}
                    </span>
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * Uma linha de aferição: silhueta do frasco com o nível medido, barra de
 * proporção e veredito. O frasco de 15 ml é visivelmente maior que o de 8 ml,
 * e o tracejado marca até onde o volume fracionado deveria chegar.
 */
function LinhaAferida({ item }: { item: ItemAferido }) {
  const tom: Tom = item.dentroDaTolerancia ? 'ok' : 'erro'
  const corpoW = item.frasco === 8 ? 17 : 25
  const corpoH = item.frasco === 8 ? 30 : 46
  const gargaloW = item.frasco === 8 ? 7 : 9
  const gargaloH = item.frasco === 8 ? 5 : 7
  // Quanto do frasco o volume fracionado ocupa quando cheio.
  const ocupa = Math.round((item.variante / item.frasco) * 100)

  return (
    <span
      style={{
        display: 'grid',
        gridTemplateColumns: '38px minmax(0,1fr) 132px',
        gap: 14,
        alignItems: 'end',
        padding: '12px 13px',
        background: '#121114',
      }}
    >
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          height: 74,
          justifyContent: 'flex-end',
        }}
      >
        <span
          aria-hidden
          style={{
            width: gargaloW,
            height: gargaloH,
            border: '1px solid rgba(255,255,255,.14)',
            borderBottom: 0,
            borderRadius: '2px 2px 0 0',
            background: 'rgba(255,255,255,.05)',
            display: 'block',
          }}
        />
        <span
          aria-hidden
          style={{
            width: corpoW,
            height: corpoH,
            borderRadius: '2px 2px 3px 3px',
            border: '1px solid rgba(255,255,255,.14)',
            background: 'rgba(255,255,255,.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              height: `${ocupa}%`,
              borderTop: '1px dashed rgba(239,209,140,.5)',
              background: 'rgba(239,209,140,.1)',
            }}
          >
            <span
              style={{
                display: 'block',
                height: `${Math.min(100, item.pct)}%`,
                background: COR[tom],
                opacity: 0.5,
              }}
            />
          </span>
        </span>
        <span
          className="font-mono"
          style={{ fontWeight: 500, fontSize: 8, letterSpacing: '.04em', color: 'var(--color-terciario)' }}
        >
          {`${item.frasco} ml`}
        </span>
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
          <span
            className="font-sans"
            style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.25, color: 'var(--color-corrente)' }}
          >
            {item.perfume}
          </span>
          <span
            className="font-sans"
            style={{
              fontSize: 10,
              lineHeight: 1.25,
              letterSpacing: '.05em',
              textTransform: 'uppercase',
              color: 'rgba(239,209,140,.6)',
            }}
          >
            {`${item.variante} ml fracionado · frasco ${item.frasco} ml`}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, minWidth: 80 }}>
            <Barra pct={Math.min(100, item.pct)} tom={tom} altura={5} />
          </span>
          <span
            className="font-sans"
            style={{ fontSize: 10, lineHeight: 1.25, color: 'var(--color-terciario)', whiteSpace: 'nowrap' }}
          >
            {`mínimo ${volume(item.minimoMl)}`}
          </span>
        </span>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.3, color: 'var(--color-terciario)' }}
        >
          {item.observacao}
        </span>
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        <Valor tamanho={14} tom={tom}>
          {volume(item.medidoMl)}
        </Valor>
        <span
          className="font-sans"
          style={{ fontWeight: 500, fontSize: 9.5, lineHeight: 1.3, color: COR[tom], textAlign: 'right' }}
        >
          {item.dentroDaTolerancia
            ? 'Dentro da tolerância'
            : `Abaixo do mínimo · falta ${volume(item.faltaMl)}`}
        </span>
      </span>
    </span>
  )
}

function LinhaInfo({
  rotulo,
  valor,
  tom,
  mono,
}: {
  rotulo: string
  valor: string
  tom?: string
  mono?: boolean
}) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '9px 12px',
        background: 'var(--color-painel)',
      }}
    >
      <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.3, color: 'var(--color-terciario)' }}>
        {rotulo}
      </span>
      <span
        className={mono ? 'font-mono' : 'font-sans'}
        style={{
          fontWeight: 500,
          fontSize: mono ? 11 : 10.5,
          lineHeight: 1.3,
          color: tom ?? 'var(--color-corrente)',
          textAlign: 'right',
        }}
      >
        {valor}
      </span>
    </span>
  )
}
