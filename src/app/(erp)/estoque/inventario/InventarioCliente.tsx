'use client'

import { useState, useTransition } from 'react'

import { Modal } from '@/components/erp/Modal'
import { BotaoSecundario, EstadoVazio, Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR } from '@/components/erp/tokens'
import { parseNum, plural, volume } from '@/domain'
import type { LinhaInventario, ResumoInventario } from '@/domain'

import {
  abrirInventario,
  cancelarInventario,
  confirmarInventario,
  registrarContagem,
} from './actions'

interface Props {
  inv: ResumoInventario
  aberto: { id: string; competencia: string } | null
}

export function InventarioCliente({ inv, aberto }: Props) {
  const [contando, setContando] = useState<LinhaInventario | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const executar = (acao: () => Promise<{ ok: true } | { ok: false; erro: string }>, ok?: string) =>
    iniciarTransicao(async () => {
      setErro(null)
      setAviso(null)
      const r = await acao()
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      if (ok) setAviso(ok)
    })

  if (!aberto) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <EstadoVazio
          titulo="Nenhuma contagem em andamento"
          instrucao="Abrir a contagem congela o volume de sistema de cada base. Comparar com o volume atual mascararia qualquer movimentação ocorrida enquanto você conta as prateleiras."
        />
        <div style={{ display: 'flex', gap: 9, justifyContent: 'center', flexWrap: 'wrap' }}>
          <BotaoAcao
            rotulo="Contar só as bases com volume"
            pendente={pendente}
            onClick={() => executar(() => abrirInventario(true))}
            primario
          />
          <BotaoSecundario altura={36} onClick={() => executar(() => abrirInventario(false))}>
            Contar todas as bases ativas
          </BotaoSecundario>
        </div>
        <Mensagem erro={erro} aviso={aviso} centralizado />
      </div>
    )
  }

  const colunas: Coluna<LinhaInventario>[] = [
    {
      chave: 'perfume',
      titulo: 'Perfume base',
      largura: 'minmax(0,1fr)',
      render: (i) => (
        <span
          className="font-sans"
          style={{
            display: 'block',
            fontWeight: 600,
            fontSize: 12,
            lineHeight: 1.3,
            color: 'var(--color-corrente)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {i.perfume}
        </span>
      ),
    },
    {
      chave: 'sistema',
      titulo: 'Esperado agora',
      largura: '150px',
      alinhamento: 'right',
      // Congelado + o que se moveu depois. Comparar contra o congelado puro
      // inventava divergência a cada venda faturada durante a contagem.
      render: (i) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
          <Valor tamanho={12} peso={400} tom="var(--color-secundario)">
            {volume(i.esperadoMl)}
          </Valor>
          {i.movimentosMl !== 0 && (
            <span
              className="font-sans"
              style={{ fontSize: 9, lineHeight: 1.3, color: COR.atencao, whiteSpace: 'nowrap' }}
              title="Houve movimentação depois do congelamento — o esperado já a considera"
            >
              {`${volume(i.sistemaMl)} congelado · ${i.movimentosMl > 0 ? '+' : '−'}${volume(Math.abs(i.movimentosMl))} no meio`}
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'contado',
      titulo: 'Contado',
      largura: '112px',
      alinhamento: 'right',
      // Não contado é diferente de contado zero — por isso o travessão.
      render: (i) => <Valor tamanho={12}>{i.contado ? volume(i.contadoMl!) : '—'}</Valor>,
    },
    {
      chave: 'diferenca',
      titulo: 'Diferença',
      largura: '132px',
      alinhamento: 'right',
      render: (i) => (
        <Valor tamanho={12} tom={!i.contado ? 'var(--color-apagado)' : i.divergente ? 'erro' : 'ok'}>
          {!i.contado
            ? '—'
            : i.diferencaMl === 0
              ? 'sem diferença'
              : `${i.diferencaMl > 0 ? '+' : '−'} ${volume(Math.abs(i.diferencaMl))}`}
        </Valor>
      ),
    },
    {
      chave: 'responsavel',
      titulo: 'Responsável',
      largura: '150px',
      render: (i) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span
            className="font-sans"
            style={{
              display: 'block',
              fontWeight: 500,
              fontSize: 11,
              lineHeight: 1.3,
              color: i.contado ? 'rgba(242,237,227,.66)' : 'var(--color-atencao)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {i.responsavel ?? 'Não contado'}
          </span>
          <span
            className="font-mono"
            style={{ fontSize: 10, lineHeight: 1.25, color: 'rgba(242,237,227,.32)' }}
          >
            {i.quando ?? 'pendente'}
          </span>
        </span>
      ),
    },
    {
      chave: 'acao',
      titulo: 'Ação',
      largura: '104px',
      render: (i) => (
        <button
          type="button"
          onClick={() => setContando(i)}
          aria-label={`Contar ${i.perfume}`}
          className="font-sans hover:bg-[rgba(239,209,140,.16)]"
          style={{
            height: 27,
            padding: '0 11px',
            border: `1px solid ${i.contado ? 'rgba(255,255,255,.12)' : 'rgba(239,209,140,.28)'}`,
            background: i.contado ? 'transparent' : 'rgba(239,209,140,.07)',
            color: i.contado ? 'rgba(242,237,227,.6)' : 'var(--color-ouro)',
            fontWeight: 600,
            fontSize: 10.5,
            lineHeight: 1,
            borderRadius: 7,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {i.contado ? 'Recontar' : 'Contar'}
        </button>
      ),
    },
  ]

  // Nada impede mais confirmar com contagem incompleta — o que muda é o que
  // se está afirmando. Dizer isso antes vale mais que deixar o operador
  // descobrir depois que as bases não contadas ficaram de fora.
  const parcial = inv.pendentes > 0
  const nadaContado = inv.contadas === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <TituloSecao tamanho={16}>{`Contagem ${aberto.id}`}</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty', flex: 1, minWidth: 240 }}
        >
          {inv.divergentes
            ? `Confirmar lança ${plural(inv.divergentes, 'ajuste', 'ajustes')} em Movimentações, com o motivo “Inventário · divergência encontrada”.`
            : 'Nenhuma divergência a ajustar nesta contagem.'}
          {parcial &&
            ` ${plural(inv.pendentes, 'base fica de fora por não ter sido contada', 'bases ficam de fora por não terem sido contadas')} — o estoque delas não é tocado.`}
        </span>
        <BotaoSecundario altura={34} onClick={() => exportarFolha(inv, aberto.id)}>
          Exportar folha de contagem
        </BotaoSecundario>
        <BotaoSecundario
          altura={34}
          onClick={() => executar(() => cancelarInventario(aberto.id))}
        >
          Cancelar contagem
        </BotaoSecundario>
        <BotaoAcao
          rotulo={parcial ? `Confirmar as ${inv.contadas} contadas` : 'Confirmar inventário'}
          pendente={pendente}
          desabilitado={nadaContado}
          onClick={() =>
            executar(async () => {
              const r = await confirmarInventario(aberto.id, parcial)
              if (r.ok) setAviso(`${plural(r.ajustes, 'ajuste lançado', 'ajustes lançados')}.`)
              return r
            })
          }
          primario
        />
      </div>

      <Mensagem
        erro={
          erro ??
          (nadaContado ? 'Conte ao menos uma base antes de confirmar.' : null)
        }
        aviso={aviso}
      />

      <Tabela
        colunas={colunas}
        itens={inv.linhas}
        chaveDe={(i) => i.baseId}
        bandeiraDe={(i) => (!i.contado ? 'atencao' : i.divergente ? 'erro' : null)}
      />

      {contando && (
        <ModalContagem
          linha={contando}
          inventarioId={aberto.id}
          aoFechar={() => setContando(null)}
        />
      )}
    </div>
  )
}

function ModalContagem({
  linha,
  inventarioId,
  aoFechar,
}: {
  linha: LinhaInventario
  inventarioId: string
  aoFechar: () => void
}) {
  const [texto, setTexto] = useState(linha.contadoMl === null ? '' : String(linha.contadoMl))
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const vazio = texto.trim() === ''
  const contado = parseNum(texto)
  // Contra o ESPERADO (congelado + movimentos), não contra o congelado.
  const diferenca = contado - linha.esperadoMl

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await registrarContagem(inventarioId, linha.baseId, contado)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoFechar()
    })

  return (
    <Modal titulo={`Contar ${linha.perfume}`} largura={460} aoFechar={aoFechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Rotulo>Contagem física</Rotulo>
        <TituloSecao tamanho={15}>{linha.perfume}</TituloSecao>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Rotulo>Volume medido no frasco (ml)</Rotulo>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value.replace(/[^0-9.,]/g, ''))}
          inputMode="decimal"
          placeholder="0"
          autoFocus
          className="font-mono focus:border-ouro/45"
          style={{
            height: 40,
            padding: '0 13px',
            border: '1px solid rgba(239,209,140,.4)',
            background: 'rgba(255,255,255,.03)',
            borderRadius: 9,
            color: 'var(--color-corrente)',
            fontWeight: 500,
            fontSize: 15,
            outline: 0,
          }}
        />
        <span
          className="font-sans"
          style={{ fontSize: 10, lineHeight: 1.45, color: 'rgba(242,237,227,.4)', textWrap: 'pretty' }}
        >
          Contar zero é uma contagem — significa frasco vazio. Deixar em branco é não ter contado.
        </span>
      </label>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 13px',
          borderRadius: 10,
          background: 'rgba(255,255,255,.03)',
          border: '1px solid rgba(255,255,255,.07)',
        }}
      >
        <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-secundario)' }}>
          {linha.movimentosMl === 0
            ? `Sistema diz ${volume(linha.esperadoMl)}`
            : `Sistema diz ${volume(linha.esperadoMl)} · ${volume(linha.sistemaMl)} congelados ${linha.movimentosMl > 0 ? '+' : '−'} ${volume(Math.abs(linha.movimentosMl))} movimentados durante a contagem`}
        </span>
        <Valor tamanho={12.5} tom={vazio ? 'var(--color-apagado)' : diferenca === 0 ? 'ok' : 'erro'}>
          {vazio
            ? '—'
            : diferenca === 0
              ? 'sem diferença'
              : `${diferenca > 0 ? '+' : '−'} ${volume(Math.abs(diferenca))}`}
        </Valor>
      </div>

      {erro && (
        <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: COR.erro }}>
          {erro}
        </span>
      )}

      <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
        <BotaoSecundario altura={36} onClick={aoFechar}>
          Cancelar
        </BotaoSecundario>
        <BotaoAcao
          rotulo="Gravar contagem"
          pendente={pendente}
          desabilitado={vazio}
          onClick={salvar}
          primario
        />
      </div>
    </Modal>
  )
}

function BotaoAcao({
  rotulo,
  onClick,
  pendente,
  desabilitado,
  primario,
}: {
  rotulo: string
  onClick: () => void
  pendente: boolean
  desabilitado?: boolean
  primario?: boolean
}) {
  const travado = pendente || desabilitado
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={travado}
      className={`${primario ? 'botao-ouro' : ''} font-sans hover:brightness-[1.07]`}
      style={{
        height: 36,
        padding: '0 18px',
        fontWeight: 700,
        fontSize: 11.5,
        lineHeight: 1,
        borderRadius: 9,
        whiteSpace: 'nowrap',
        cursor: pendente ? 'wait' : desabilitado ? 'not-allowed' : 'pointer',
        opacity: travado ? 0.5 : 1,
      }}
    >
      {pendente ? 'Aguarde…' : rotulo}
    </button>
  )
}

function Mensagem({
  erro,
  aviso,
  centralizado,
}: {
  erro: string | null
  aviso: string | null
  centralizado?: boolean
}) {
  if (!erro && !aviso) return null
  return (
    <span
      className="font-sans"
      style={{
        fontSize: 11.5,
        lineHeight: 1.5,
        color: erro ? COR.erro : COR.ok,
        textAlign: centralizado ? 'center' : 'left',
        textWrap: 'pretty',
      }}
    >
      {erro ?? aviso}
    </span>
  )
}

/** Folha de contagem em CSV, para imprimir e levar até a prateleira. */
function exportarFolha(inv: ResumoInventario, inventarioId: string) {
  const linhas = [
    ['Perfume base', 'Sistema (ml)', 'Contado (ml)', 'Responsável'],
    ...inv.linhas.map((i) => [
      i.perfume,
      String(i.sistemaMl),
      i.contadoMl === null ? '' : String(i.contadoMl),
      i.responsavel ?? '',
    ]),
  ]
  const csv = linhas
    .map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(';'))
    .join('\n')

  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `folha-de-contagem-${inventarioId}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
