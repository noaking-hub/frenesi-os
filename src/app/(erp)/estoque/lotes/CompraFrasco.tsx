'use client'

import { useMemo, useState, useTransition } from 'react'

import { BotaoOuro, BotaoSecundario, Losango, Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { Modal } from '@/components/erp/Modal'
import { COR } from '@/components/erp/tokens'
import { brl, custoMedioPonderado, num, parseNum, volume } from '@/domain'
import type { PerfumeBase } from '@/domain'

import { registrarCompra } from './actions'

/**
 * Registrar compra de frasco: o ponto onde volume e custo por ml NASCEM.
 * O impacto (novo volume e novo custo médio) é mostrado antes de confirmar,
 * derivado da mesma regra da função do banco.
 */
export function CompraFrasco({ bases }: { bases: PerfumeBase[] }) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [baseId, setBaseId] = useState('')
  const [volumeTexto, setVolumeTexto] = useState('')
  const [custoTexto, setCustoTexto] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const termo = busca.trim().toLowerCase()
  const filtradas = useMemo(
    () =>
      (termo
        ? bases.filter(
            (b) => b.nome.toLowerCase().includes(termo) || b.marca.toLowerCase().includes(termo),
          )
        : bases
      ).slice(0, 60),
    [bases, termo],
  )
  const base = bases.find((b) => b.id === baseId) ?? null

  const volumeMl = parseNum(volumeTexto)
  const custoTotal = parseNum(custoTexto)
  // Botão apagado sem explicação é a pior combinação: quem preencheu tudo
  // menos um campo fica clicando sem entender. Nomeie o que falta.
  const faltando = [
    !base && 'escolher o perfume na lista',
    !(volumeMl > 0) && 'o volume comprado',
    !(custoTotal > 0) && 'o custo total',
    !fornecedor.trim() && 'o fornecedor',
  ].filter((f): f is string => typeof f === 'string')
  const valido = faltando.length === 0

  // Prévia derivada — a mesma conta que registrar_compra() fará no banco.
  const custoNovo =
    base && volumeMl > 0 && custoTotal > 0
      ? custoMedioPonderado(base.volumeMl, base.custoPorMl, volumeMl, custoTotal)
      : null

  const confirmar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await registrarCompra({
        baseId,
        volumeMl,
        custoTotal,
        fornecedor,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setSucesso(
        `Lote ${r.loteId} registrado: ${volume(volumeMl)} de ${base?.nome} por ${brl(custoTotal)}.`,
      )
      setBaseId('')
      setBusca('')
      setVolumeTexto('')
      setCustoTexto('')
      setFornecedor('')
      setAberto(false)
    })

  const campoEstilo = {
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

  return (
    <>
      <section
        style={{
          background: 'linear-gradient(160deg,#16141A,#101011)',
          border: '1px solid rgba(239,209,140,.16)',
          borderRadius: 16,
          padding: '15px 19px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Losango />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
          <TituloSecao tamanho={14.5} tom="ouro">
            Compras e reposições
          </TituloSecao>
          <span
            className="font-sans"
            style={{ fontSize: 10.5, lineHeight: 1.45, color: 'var(--color-terciario)', textWrap: 'pretty' }}
          >
            É aqui que o custo por ml nasce: a primeira compra define, a reposição faz a média
            ponderada. Volume entra no estoque e a sincronia com a Shopify passa a se sustentar.
          </span>
        </span>
        {sucesso && (
          <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.4, color: COR.ok, maxWidth: 320, textWrap: 'pretty' }}>
            {sucesso}
          </span>
        )}
        <BotaoOuro altura={34} onClick={() => { setSucesso(null); setAberto(true) }}>
          + Registrar compra de frasco
        </BotaoOuro>
      </section>

      {aberto && (
        <Modal titulo="Registrar compra de frasco" aoFechar={() => setAberto(false)}>
            <TituloSecao tamanho={16}>Registrar compra de frasco</TituloSecao>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <Rotulo>
                {base ? `Perfume base · ${base.nome}` : 'Perfume base · nenhum escolhido'}
              </Rotulo>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou marca…"
                className="font-sans"
                style={campoEstilo}
              />
              {/*
                Lista de botões, não `<select size>`: naquele, o navegador
                destaca a primeira linha mesmo sem nada selecionado, e quem
                digitava a busca achava que já tinha escolhido. Aqui só fica
                marcado o que foi clicado.
              */}
              <div
                role="listbox"
                aria-label="Escolher perfume base"
                style={{
                  maxHeight: 178,
                  overflowY: 'auto',
                  border: `1px solid ${base ? 'rgba(239,209,140,.28)' : 'rgba(255,255,255,.11)'}`,
                  borderRadius: 9,
                  background: 'rgba(255,255,255,.02)',
                }}
              >
                {filtradas.map((b) => {
                  const escolhido = b.id === baseId
                  return (
                    <button
                      key={b.id}
                      type="button"
                      role="option"
                      aria-selected={escolhido}
                      onClick={() => setBaseId(escolhido ? '' : b.id)}
                      className="font-sans hover:bg-[rgba(255,255,255,.04)]"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        width: '100%',
                        padding: '7px 11px',
                        border: 0,
                        borderLeft: `2px solid ${escolhido ? 'var(--color-ouro)' : 'transparent'}`,
                        background: escolhido ? 'rgba(239,209,140,.09)' : 'transparent',
                        textAlign: 'left',
                        cursor: 'pointer',
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: 'block',
                          fontWeight: escolhido ? 600 : 500,
                          fontSize: 11.5,
                          lineHeight: 1.35,
                          color: escolhido ? 'var(--color-ouro)' : 'var(--color-corrente)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {`${b.nome} · ${b.marca}`}
                      </span>
                      <span
                        style={{
                          flex: 'none',
                          fontSize: 10,
                          lineHeight: 1.2,
                          color:
                            b.custoPorMl === 0 ? 'var(--color-atencao)' : 'var(--color-terciario)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {b.custoPorMl === 0 ? 'sem custo ainda' : volume(b.volumeMl)}
                      </span>
                    </button>
                  )
                })}
                {filtradas.length === 0 && (
                  <span
                    className="font-sans"
                    style={{
                      display: 'block',
                      padding: '16px 11px',
                      fontSize: 10.5,
                      color: 'var(--color-terciario)',
                    }}
                  >
                    {termo
                      ? 'Nenhum perfume com esse nome — importe o catálogo da Shopify primeiro.'
                      : 'Nenhum perfume base cadastrado.'}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <Rotulo>Volume comprado (ml)</Rotulo>
                <input
                  value={volumeTexto}
                  onChange={(e) => setVolumeTexto(e.target.value.replace(/[^0-9.,]/g, ''))}
                  inputMode="decimal"
                  placeholder="ex.: 750"
                  className="font-mono"
                  style={campoEstilo}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <Rotulo>Custo total (R$)</Rotulo>
                <input
                  value={custoTexto}
                  onChange={(e) => setCustoTexto(e.target.value.replace(/[^0-9.,]/g, ''))}
                  inputMode="decimal"
                  placeholder="ex.: 2325,00"
                  className="font-mono"
                  style={campoEstilo}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <Rotulo>Fornecedor</Rotulo>
                <input
                  value={fornecedor}
                  onChange={(e) => setFornecedor(e.target.value)}
                  placeholder="ex.: Importadora X"
                  className="font-sans"
                  style={campoEstilo}
                />
              </label>
            </div>

            {base && custoNovo !== null && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: 13,
                  borderRadius: 10,
                  background: 'rgba(239,209,140,.045)',
                  border: '1px solid rgba(239,209,140,.16)',
                }}
              >
                <Rotulo style={{ color: 'rgba(239,209,140,.6)' }}>O que esta compra faz</Rotulo>
                <span style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <Rotulo>Volume</Rotulo>
                    <Valor tamanho={13}>
                      {`${volume(base.volumeMl)} → ${volume(base.volumeMl + volumeMl)}`}
                    </Valor>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <Rotulo>Custo desta compra</Rotulo>
                    <Valor tamanho={13}>{`${brl(custoTotal / volumeMl)}/ml`}</Valor>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <Rotulo>Custo médio da base</Rotulo>
                    <Valor tamanho={13} tom="ouro">
                      {base.volumeMl > 0 && base.custoPorMl > 0
                        ? `${brl(base.custoPorMl)} → ${brl(Math.round(custoNovo * 10000) / 10000)}/ml`
                        : `${brl(Math.round(custoNovo * 10000) / 10000)}/ml · esta compra define`}
                    </Valor>
                  </span>
                </span>
                <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
                  {/* A mesma condição da conta: só há média quando existe volume COM custo. */}
                  {base.volumeMl > 0 && base.custoPorMl > 0
                    ? `Média ponderada: ${volume(base.volumeMl)} existentes a ${brl(base.custoPorMl)}/ml + ${volume(volumeMl)} novos.`
                    : 'Sem volume com custo conhecido no estoque: esta compra passa a ser a referência da base.'}
                </span>
              </div>
            )}

            {erro && (
              <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: COR.erro, textWrap: 'pretty' }}>
                {erro}
              </span>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 9, justifyContent: 'flex-end' }}>
              {!valido && (
                <span
                  className="font-sans"
                  style={{
                    flex: 1,
                    fontSize: 10.5,
                    lineHeight: 1.45,
                    color: 'var(--color-atencao)',
                    textWrap: 'pretty',
                  }}
                >
                  {`Falta ${faltando.join(', ').replace(/, ([^,]*)$/, ' e $1')}.`}
                </span>
              )}
              <BotaoSecundario altura={36} onClick={() => setAberto(false)}>
                Cancelar
              </BotaoSecundario>
              <button
                type="button"
                onClick={confirmar}
                disabled={!valido || pendente}
                className="botao-ouro font-sans hover:brightness-[1.07]"
                style={{
                  height: 36,
                  padding: '0 18px',
                  fontWeight: 700,
                  fontSize: 11.5,
                  lineHeight: 1,
                  borderRadius: 9,
                  cursor: valido && !pendente ? 'pointer' : 'not-allowed',
                  opacity: valido && !pendente ? 1 : 0.45,
                }}
              >
                {pendente ? 'Registrando…' : `Registrar compra${base ? ` · ${num(volumeMl)} ml` : ''}`}
              </button>
            </div>
        </Modal>
      )}
    </>
  )
}
