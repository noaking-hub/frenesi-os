'use client'

import { useState, useTransition } from 'react'

import { CONTORNO, Etiqueta, Ico, Painel, TINTA, VELADO } from '@/components/erp/ui'
import type { ModoDeAutonomia } from '@/domain'

/**
 * O formulário da política.
 *
 * Cada modo é apresentado pelo que ELE FAZ, não pelo nome: "Assistido" sozinho
 * não informa nada, e um administrador que liga autonomia sem entender a
 * consequência é o cenário que o escopo passa 34 seções tentando evitar.
 */

const MODOS: { id: ModoDeAutonomia; nome: string; descricao: string; quando: string }[] = [
  {
    id: 'sugestao',
    nome: 'Sugestão',
    descricao: 'O Gerente sugere e mostra a prévia. Nada é gravado sem você aprovar, item ou lote.',
    quando: 'Implantação inicial e categorias novas.',
  },
  {
    id: 'regra_aprovada',
    nome: 'Regra aprovada',
    descricao:
      'Só o que casa com uma regra determinística que VOCÊ aprovou roda sem confirmação item a item. O resto continua esperando você.',
    quando: 'Fornecedores e descrições recorrentes e previsíveis.',
  },
  {
    id: 'assistido',
    nome: 'Assistido',
    descricao:
      'Acrescenta o histórico: o que a mesma contraparte virou repetidamente, acima do limiar, é classificado sozinho. Abaixo dele, vai para revisão.',
    quando: 'Rotina diária, depois de as regras estarem validadas.',
  },
]

export function Formulario({
  inicial,
  travadaPorAmbiente,
  atualizadaEm,
  atualizadaPor,
  aoSalvar,
}: {
  inicial: {
    escritaLiberada: boolean
    modoAutonomia: ModoDeAutonomia
    limiarConfianca: number
    tetoValorAutomatico: number
  }
  travadaPorAmbiente: boolean
  atualizadaEm: string | null
  atualizadaPor: string | null
  aoSalvar: (dados: {
    escritaLiberada: boolean
    modoAutonomia: ModoDeAutonomia
    limiarConfianca: number
    tetoValorAutomatico: number
  }) => Promise<void>
}) {
  const [escrita, setEscrita] = useState(inicial.escritaLiberada)
  const [modo, setModo] = useState<ModoDeAutonomia>(inicial.modoAutonomia)
  const [limiar, setLimiar] = useState(Math.round(inicial.limiarConfianca * 100))
  const [teto, setTeto] = useState(inicial.tetoValorAutomatico)
  const [salvando, iniciar] = useTransition()

  const mudou =
    escrita !== inicial.escritaLiberada ||
    modo !== inicial.modoAutonomia ||
    Math.round(inicial.limiarConfianca * 100) !== limiar ||
    teto !== inicial.tetoValorAutomatico

  return (
    <Painel
      titulo="Política de escrita"
      icone="escudo"
      tom={escrita ? 'atencao' : 'ok'}
      nota={
        escrita
          ? 'O Gerente pode executar ações — sempre com prévia, confirmação e auditoria.'
          : 'O Gerente está em modo somente leitura: consulta, cruza e recomenda, mas não altera nada.'
      }
    >
      {travadaPorAmbiente && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: '12px 13px',
            borderRadius: 11,
            border: `1px solid ${CONTORNO.erro}`,
            background: VELADO.erro,
          }}
        >
          <span style={{ color: TINTA.erro, flex: 'none' }}>
            <Ico n="cadeado" tamanho={15} />
          </span>
          <span
            className="font-sans"
            style={{ fontSize: 11.5, lineHeight: 1.5, color: 'rgba(242,237,227,.75)' }}
          >
            A variável <code>GERENTE_ESCRITA=desligada</code> está forçando modo leitura. Enquanto
            ela existir, nada aqui libera escrita — é o interruptor de emergência, e ele vence a
            configuração de propósito.
          </span>
        </div>
      )}

      <Linha
        titulo="Permitir que o Gerente execute ações"
        descricao="Sem isto, ferramentas de escrita não são nem oferecidas ao modelo. Com isto, elas passam a existir — e continuam exigindo sua aprovação em cada uma."
      >
        <Interruptor ligado={escrita} aoMudar={setEscrita} desabilitado={travadaPorAmbiente} />
      </Linha>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Etiqueta>Nível de autonomia na categorização</Etiqueta>
        <div style={{ display: 'grid', gap: 8 }}>
          {MODOS.map((m) => {
            const ativo = modo === m.id
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setModo(m.id)}
                disabled={!escrita}
                className="font-sans"
                style={{
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                  padding: '12px 13px',
                  borderRadius: 11,
                  border: `1px solid ${ativo ? CONTORNO.ouro : 'rgba(255,255,255,.08)'}`,
                  background: ativo ? VELADO.ouro : 'rgba(255,255,255,.02)',
                  cursor: escrita ? 'pointer' : 'not-allowed',
                  opacity: escrita ? 1 : 0.45,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 13,
                      height: 13,
                      borderRadius: '50%',
                      flex: 'none',
                      border: `1px solid ${ativo ? TINTA.ouro : 'rgba(255,255,255,.25)'}`,
                      background: ativo ? TINTA.ouro : 'transparent',
                    }}
                  />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-tinta)' }}>
                    {m.nome}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    lineHeight: 1.5,
                    color: 'rgba(242,237,227,.66)',
                    textWrap: 'pretty',
                  }}
                >
                  {m.descricao}
                </span>
                <span style={{ fontSize: 10.5, color: 'rgba(242,237,227,.36)' }}>
                  Indicado para: {m.quando}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <Linha
        titulo="Limiar de confiança"
        descricao="Abaixo deste valor, a sugestão do histórico vai para revisão em vez de ser aplicada. Só afeta o modo Assistido."
      >
        <Numero
          valor={limiar}
          aoMudar={setLimiar}
          min={50}
          max={100}
          sufixo="%"
          desabilitado={!escrita || modo !== 'assistido'}
        />
      </Linha>

      <Linha
        titulo="Teto por movimento"
        descricao="Movimento acima deste valor sempre pede confirmação, mesmo com confiança máxima. Errar num valor grande custa mais para descobrir e mais para desfazer."
      >
        <Numero valor={teto} aoMudar={setTeto} min={0} max={100000} prefixo="R$ " desabilitado={!escrita} />
      </Linha>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span className="font-sans" style={{ fontSize: 10.5, color: 'rgba(242,237,227,.34)' }}>
          {atualizadaEm
            ? `Última alteração em ${new Intl.DateTimeFormat('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                dateStyle: 'short',
                timeStyle: 'short',
              }).format(new Date(atualizadaEm))}${atualizadaPor ? ` por ${atualizadaPor}` : ''}.`
            : 'Nunca alterada — está no padrão de fábrica.'}
        </span>
        <div style={{ flex: 1, minWidth: 4 }} />
        <button
          type="button"
          disabled={!mudou || salvando}
          onClick={() =>
            iniciar(() => {
              void aoSalvar({
                escritaLiberada: escrita,
                modoAutonomia: modo,
                limiarConfianca: limiar / 100,
                tetoValorAutomatico: teto,
              })
            })
          }
          className="botao-ouro font-sans hover:brightness-[1.07]"
          style={{
            height: 34,
            padding: '0 18px',
            borderRadius: 9,
            fontSize: 11.5,
            fontWeight: 700,
            boxShadow: 'var(--shadow-ouro)',
            cursor: !mudou || salvando ? 'not-allowed' : 'pointer',
            opacity: !mudou || salvando ? 0.4 : 1,
          }}
        >
          {salvando ? 'Salvando…' : 'Salvar política'}
        </button>
      </div>
    </Painel>
  )
}

function Linha({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '11px 0',
        borderTop: '1px solid rgba(255,255,255,.05)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 240 }}>
        <span className="font-sans" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-tinta)' }}>
          {titulo}
        </span>
        <span
          className="font-sans"
          style={{ fontSize: 11, lineHeight: 1.45, color: 'rgba(242,237,227,.48)', textWrap: 'pretty' }}
        >
          {descricao}
        </span>
      </div>
      {children}
    </div>
  )
}

function Interruptor({
  ligado,
  aoMudar,
  desabilitado,
}: {
  ligado: boolean
  aoMudar: (v: boolean) => void
  desabilitado?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      disabled={desabilitado}
      onClick={() => aoMudar(!ligado)}
      style={{
        width: 46,
        height: 26,
        flex: 'none',
        borderRadius: 13,
        padding: 3,
        border: `1px solid ${ligado ? CONTORNO.ouro : 'rgba(255,255,255,.12)'}`,
        background: ligado ? VELADO.ouro : 'rgba(255,255,255,.04)',
        display: 'flex',
        justifyContent: ligado ? 'flex-end' : 'flex-start',
        cursor: desabilitado ? 'not-allowed' : 'pointer',
        opacity: desabilitado ? 0.4 : 1,
        transition: 'background .15s',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: ligado ? TINTA.ouro : 'rgba(242,237,227,.35)',
        }}
      />
    </button>
  )
}

function Numero({
  valor,
  aoMudar,
  min,
  max,
  prefixo,
  sufixo,
  desabilitado,
}: {
  valor: number
  aoMudar: (v: number) => void
  min: number
  max: number
  prefixo?: string
  sufixo?: string
  desabilitado?: boolean
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: '0 10px',
        height: 34,
        borderRadius: 9,
        border: '1px solid rgba(255,255,255,.1)',
        background: 'rgba(255,255,255,.025)',
        opacity: desabilitado ? 0.4 : 1,
      }}
    >
      {prefixo && (
        <span className="font-mono" style={{ fontSize: 12, color: 'rgba(242,237,227,.45)' }}>
          {prefixo}
        </span>
      )}
      <input
        type="number"
        value={valor}
        min={min}
        max={max}
        disabled={desabilitado}
        onChange={(e) => aoMudar(Math.min(max, Math.max(min, Number(e.target.value) || 0)))}
        className="font-mono"
        style={{
          width: 74,
          border: 0,
          outline: 'none',
          background: 'transparent',
          color: 'var(--color-tinta)',
          fontSize: 13,
          textAlign: 'right',
        }}
      />
      {sufixo && (
        <span className="font-mono" style={{ fontSize: 12, color: 'rgba(242,237,227,.45)' }}>
          {sufixo}
        </span>
      )}
    </span>
  )
}
