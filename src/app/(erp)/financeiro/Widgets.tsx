'use client'

import { useState, useTransition, type ReactNode } from 'react'

import { Modal } from '@/components/erp/Modal'
import { BotaoSecundario, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { parseNum } from '@/domain'

import { conciliarRepasse, preverRepasses } from './actions'

/**
 * Diálogos da Conciliação.
 *
 * O que era um arquivo com todos os formulários do Financeiro sobrou nestes
 * dois: lançamento, conta e categoria ganharam telas próprias com o
 * vocabulário gerencial — natureza, competência, centro de custo — e manter as
 * versões antigas ao lado ofereceria dois caminhos que gravam campos
 * diferentes para a mesma coisa.
 */

const CAMPO = {
  height: 38,
  padding: '0 12px',
  border: '1px solid rgba(255,255,255,.11)',
  background: 'rgba(255,255,255,.03)',
  borderRadius: 9,
  color: 'var(--color-corrente)',
  fontSize: 12.5,
  lineHeight: 1,
  outline: 0,
  width: '100%',
} as const

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <Rotulo>{rotulo}</Rotulo>
      {children}
    </label>
  )
}

function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null
  return (
    <span
      className="font-sans"
      style={{ fontSize: 11.5, lineHeight: 1.5, color: COR.erro, textWrap: 'pretty' }}
    >
      {texto}
    </span>
  )
}

function Confirmar({
  rotulo,
  onClick,
  pendente,
  desabilitado,
}: {
  rotulo: string
  onClick: () => void
  pendente: boolean
  desabilitado?: boolean
}) {
  const travado = pendente || desabilitado
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={travado}
      className="botao-ouro font-sans hover:brightness-[1.07]"
      style={{
        height: 36,
        padding: '0 16px',
        border: 0,
        fontWeight: 700,
        fontSize: 11.5,
        lineHeight: 1,
        borderRadius: 8,
        cursor: travado ? 'not-allowed' : 'pointer',
        opacity: travado ? 0.5 : 1,
        boxShadow: 'var(--shadow-ouro)',
      }}
    >
      {pendente ? 'Gravando…' : rotulo}
    </button>
  )
}

/** Informa o crédito de um repasse e, de quebra, gera as previsões que faltam. */
export function ConciliarRepasse({ pedidoId, esperado }: { pedidoId: string; esperado: number }) {
  const [aberto, setAberto] = useState(false)
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await conciliarRepasse(pedidoId, parseNum(valor))
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setAberto(false)
    })

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="font-sans hover:bg-[rgba(239,209,140,.16)]"
        style={{
          height: 27,
          padding: '0 11px',
          border: '1px solid rgba(239,209,140,.28)',
          background: 'rgba(239,209,140,.07)',
          color: 'var(--color-ouro)',
          fontWeight: 600,
          fontSize: 10.5,
          lineHeight: 1,
          borderRadius: 7,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Conciliar
      </button>

      {aberto && (
        <Modal titulo={`Conciliar ${pedidoId}`} largura={420} aoFechar={() => setAberto(false)}>
          <TituloSecao tamanho={15}>{`Repasse do pedido ${pedidoId}`}</TituloSecao>
          <Campo rotulo="Valor creditado na conta (R$)">
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value.replace(/[^0-9.,]/g, ''))}
              inputMode="decimal"
              placeholder={esperado.toFixed(2).replace('.', ',')}
              autoFocus
              className="font-mono focus:border-ouro/45"
              style={CAMPO}
            />
          </Campo>
          <span
            className="font-sans"
            style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
          >
            Informe o que caiu de fato. A divergência não é digitada: ela é a comparação com o
            líquido esperado, calculada na leitura — assim mudar a taxa não reescreve o histórico.
          </span>
          <Erro texto={erro} />
          <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
            <BotaoSecundario altura={36} onClick={() => setAberto(false)}>
              Cancelar
            </BotaoSecundario>
            <Confirmar
              rotulo="Gravar crédito"
              onClick={salvar}
              pendente={pendente}
              desabilitado={valor.trim() === ''}
            />
          </div>
        </Modal>
      )}
    </>
  )
}

/** Cria as linhas de repasse dos pedidos que ainda não têm previsão. */
export function PreverRepasses() {
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {(msg || erro) && (
        <span
          className="font-sans"
          style={{ fontSize: 10.5, color: erro ? COR.erro : COR.ok, textWrap: 'pretty' }}
        >
          {erro ?? msg}
        </span>
      )}
      <BotaoSecundario
        altura={34}
        onClick={() =>
          iniciarTransicao(async () => {
            setErro(null)
            setMsg(null)
            const r = await preverRepasses()
            if (!r.ok) {
              setErro(r.erro)
              return
            }
            setMsg(r.novos ? `${r.novos} previstos` : 'nada novo a prever')
          })
        }
      >
        {pendente ? 'Prevendo…' : 'Prever repasses dos pedidos'}
      </BotaoSecundario>
    </span>
  )
}
