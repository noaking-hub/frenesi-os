'use client'

import { useMemo, useState, useTransition } from 'react'

import { BotaoOuro, BotaoSecundario, Losango, Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
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
  const valido = Boolean(base) && volumeMl > 0 && custoTotal > 0 && fornecedor.trim().length > 0

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
        <div
          onClick={() => setAberto(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 70,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 40,
            background: 'rgba(5,5,4,.66)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            role="dialog"
            aria-label="Registrar compra de frasco"
            onClick={(e) => e.stopPropagation()}
            className="animate-[fr-in_.22s_ease_both]"
            style={{
              width: 620,
              maxHeight: '100%',
              overflowY: 'auto',
              background: 'linear-gradient(170deg,#17161A,#111112)',
              border: '1px solid rgba(239,209,140,.2)',
              borderRadius: 16,
              padding: '20px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: 15,
            }}
          >
            <TituloSecao tamanho={16}>Registrar compra de frasco</TituloSecao>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <Rotulo>Perfume base</Rotulo>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou marca…"
                className="font-sans"
                style={campoEstilo}
              />
              <select
                value={baseId}
                onChange={(e) => setBaseId(e.target.value)}
                size={6}
                aria-label="Escolher perfume base"
                className="font-sans"
                style={{ ...campoEstilo, height: 'auto', padding: '6px 8px', fontSize: 12 }}
              >
                {filtradas.map((b) => (
                  <option key={b.id} value={b.id}>
                    {`${b.nome} · ${b.marca}${b.custoPorMl === 0 ? ' · sem custo ainda' : ''}`}
                  </option>
                ))}
              </select>
              {termo && filtradas.length === 0 && (
                <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
                  Nenhum perfume com esse nome — importe o catálogo da Shopify primeiro.
                </span>
              )}
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

            <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
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
          </div>
        </div>
      )}
    </>
  )
}
