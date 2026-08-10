'use client'

import { useState, useTransition } from 'react'

import { BotaoOuro, BotaoSecundario, FaixaAlerta } from '@/components/erp/primitivos'
import { ROTULO_ESTADO_OCORRENCIA } from '@/domain'
import type { EstadoOcorrencia, TipoOcorrencia } from '@/domain'

import { moverOcorrencia, registrarOcorrencia, varrerParados } from './actions'

const TIPOS: TipoOcorrencia[] = [
  'sem-movimentacao',
  'atraso',
  'extravio',
  'avaria',
  'endereco-insuficiente',
  'entrega-nao-efetuada',
]

const ESTADOS: EstadoOcorrencia[] = ['aberta', 'aguardando-cliente', 'em-indenizacao', 'resolvida']

/** Varrer e registrar — as duas ações que abrem ocorrência. */
export function AcoesOcorrencias({ ligado }: { ligado: boolean }) {
  const [recado, setRecado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function rodar(acao: () => Promise<string | null>) {
    setErro(null)
    setRecado(null)
    iniciar(async () => {
      try {
        const r = await acao()
        if (r) setRecado(r)
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return (
    <>
      <span style={{ display: 'flex', gap: 8 }}>
        <BotaoSecundario
          altura={34}
          desabilitado={pendente || !ligado}
          onClick={() =>
            rodar(async () => {
              const r = await varrerParados()
              if (!r.ok) throw new Error(r.erro)
              return r.novas === 0
                ? 'Nenhum pedido novo parado nos últimos 90 dias — a fila já está completa.'
                : `${r.novas} ocorrência(s) aberta(s) para pedidos em trânsito há mais de 15 dias.`
            })
          }
        >
          {pendente ? 'Varrendo…' : 'Varrer pedidos parados'}
        </BotaoSecundario>

        <BotaoOuro
          altura={34}
          desabilitado={pendente || !ligado}
          onClick={() =>
            rodar(async () => {
              const pedidoId = window.prompt('Número do pedido (ex.: YP-1510190684870993)')
              if (!pedidoId) return null
              const tipo = window.prompt(
                `Tipo da ocorrência:\n${TIPOS.map((t, i) => `${i + 1}. ${t}`).join('\n')}`,
                '1',
              )
              if (!tipo) return null
              const escolhido = TIPOS[Number(tipo) - 1]
              if (!escolhido) throw new Error('Tipo inválido.')
              const acao = window.prompt('O que fazer agora?', 'Cobrar posição da transportadora') ?? ''

              const r = await registrarOcorrencia({ pedidoId, tipo: escolhido, acao, prazoDias: 5 })
              if (!r.ok) throw new Error(r.erro)
              return `Ocorrência ${r.id} aberta para o pedido ${pedidoId}.`
            })
          }
        >
          + Registrar ocorrência
        </BotaoOuro>
      </span>

      {(erro || recado) && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, maxWidth: 460, zIndex: 40 }}>
          <FaixaAlerta tom={erro ? 'erro' : 'ok'} texto={erro ?? recado ?? ''} />
        </div>
      )}
    </>
  )
}

/**
 * Move a ocorrência de estado.
 *
 * Um `select` que grava na hora, não um formulário: quem acompanha chamado de
 * transportadora está com o telefone na orelha, e cada clique a mais é um
 * estado que fica desatualizado.
 */
export function MoverOcorrencia({
  id,
  estado,
  ligado,
}: {
  id: string
  estado: EstadoOcorrencia
  ligado: boolean
}) {
  const [pendente, iniciar] = useTransition()

  return (
    <select
      value={estado}
      disabled={pendente || !ligado}
      onChange={(e) => {
        const novo = e.target.value as EstadoOcorrencia
        iniciar(async () => {
          // Fechar sem dizer o desfecho apaga o motivo justamente do caso que
          // alguém vai querer reler daqui a três meses.
          const desfecho =
            novo === 'resolvida' ? (window.prompt('Como terminou?') ?? '') : ''
          if (novo === 'resolvida' && !desfecho) return
          await moverOcorrencia(id, novo, '', desfecho)
        })
      }}
      style={{
        height: 26,
        padding: '0 8px',
        border: '1px solid rgba(255,255,255,.11)',
        background: 'rgba(255,255,255,.03)',
        borderRadius: 7,
        color: 'var(--color-corrente)',
        fontSize: 10.5,
        outline: 0,
        opacity: pendente ? 0.5 : 1,
      }}
    >
      {ESTADOS.map((e) => (
        <option key={e} value={e}>
          {ROTULO_ESTADO_OCORRENCIA[e]}
        </option>
      ))}
    </select>
  )
}
