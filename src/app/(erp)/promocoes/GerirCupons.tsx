'use client'

import { useState, useTransition } from 'react'

import { Modal } from '@/components/erp/Modal'
import { BotaoOuro, BotaoSecundario, Rotulo } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import type { CupomYampi } from '@/data/yampi-crm'
import { parseNum, plural } from '@/domain'

import { atualizarCupom, criarCuponsEmLote, excluirCupom, type ResultadoLote } from './actions'

const campo: React.CSSProperties = {
  height: 36,
  padding: '0 12px',
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.04)',
  color: 'var(--color-corrente)',
  fontSize: 12.5,
  borderRadius: 8,
  outline: 'none',
  width: '100%',
}

/**
 * Cadastro em lote: a coluna de códigos da planilha, colada de uma vez.
 *
 * A regra vem preenchida com o padrão dos cupons de avaliação — 10%, uso
 * único, sem acumular — porque é para isso que o lote existe: cada cliente
 * que manda foto ou vídeo do decant ganha um código próprio.
 */
export function LoteCupons() {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [valor, setValor] = useState('10')
  const [usoUnico, setUsoUnico] = useState(true)
  const [naoAcumula, setNaoAcumula] = useState(true)
  const [expiraEm, setExpiraEm] = useState('')
  const [resultado, setResultado] = useState<ResultadoLote | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const codigos = [
    ...new Set(
      texto
        .split(/[\s,;]+/)
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c.length >= 3),
    ),
  ]

  const criar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setResultado(null)
      const r = await criarCuponsEmLote(codigos, {
        valor: parseNum(valor),
        percentual: true,
        limite: usoUnico ? 1 : undefined,
        naoAcumula,
        expiraEm: expiraEm || undefined,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setResultado(r.resultado)
      if (r.resultado.falhas.length === 0) setTexto('')
    })

  return (
    <>
      <BotaoSecundario altura={34} onClick={() => setAberto(true)}>
        Cadastrar em lote
      </BotaoSecundario>

      {aberto && (
        <Modal titulo="Cupons em lote na Yampi" aoFechar={() => setAberto(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Rotulo>{`Códigos — cole a coluna da planilha (${plural(codigos.length, 'código reconhecido', 'códigos reconhecidos')})`}</Rotulo>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={'AVAL-MARIA10\nAVAL-JOAO10\nAVAL-ANA10'}
                rows={7}
                className="font-mono focus:border-ouro/45"
                style={{ ...campo, height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Rotulo>Desconto (%)</Rotulo>
                <input
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  inputMode="decimal"
                  className="font-mono focus:border-ouro/45"
                  style={campo}
                />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Rotulo>Expira em (opcional)</Rotulo>
                <input
                  type="date"
                  value={expiraEm}
                  onChange={(e) => setExpiraEm(e.target.value)}
                  className="font-mono focus:border-ouro/45"
                  style={campo}
                />
              </div>
            </div>

            <label className="font-sans" style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: 'var(--color-corrente)', cursor: 'pointer' }}>
              <input type="checkbox" checked={usoUnico} onChange={(e) => setUsoUnico(e.target.checked)} />
              Uso único — cada código vale uma compra
            </label>
            <label className="font-sans" style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: 'var(--color-corrente)', cursor: 'pointer' }}>
              <input type="checkbox" checked={naoAcumula} onChange={(e) => setNaoAcumula(e.target.checked)} />
              Não acumular com outras promoções ativas
            </label>

            {erro && (
              <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: COR.erro, textWrap: 'pretty' }}>
                {erro}
              </span>
            )}

            {resultado && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: COR.ok }}>
                  {`${plural(resultado.criados.length, 'cupom publicado', 'cupons publicados')} no checkout.`}
                </span>
                {resultado.falhas.slice(0, 6).map((f) => (
                  <span key={f.codigo} className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: COR.erro, textWrap: 'pretty' }}>
                    {`${f.codigo}: ${f.erro}`}
                  </span>
                ))}
                {resultado.falhas.length > 6 && (
                  <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
                    {`+ ${resultado.falhas.length - 6} falhas`}
                  </span>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
              <BotaoSecundario altura={36} onClick={() => setAberto(false)}>
                Fechar
              </BotaoSecundario>
              <BotaoOuro altura={36} onClick={criar} desabilitado={pendente || codigos.length === 0}>
                {pendente
                  ? 'Publicando…'
                  : `Publicar ${plural(codigos.length, 'cupom', 'cupons')}`}
              </BotaoOuro>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

/** Editar e excluir um cupom, replicando na Yampi na hora. */
export function AcoesCupom({ cupom }: { cupom: CupomYampi }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const [expiraEm, setExpiraEm] = useState(cupom.expiraEm ? cupom.expiraEm.slice(0, 10) : '')
  const [limite, setLimite] = useState(cupom.limite ? String(cupom.limite) : '')
  const [ativo, setAtivo] = useState(cupom.ativo)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  if (!cupom.id) {
    return (
      <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.3)' }} title="A Yampi não devolveu o id deste cupom">
        —
      </span>
    )
  }
  const id = cupom.id

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await atualizarCupom(id, {
        ...(valor.trim() ? { valor: parseNum(valor), percentual: true } : {}),
        expiraEm: expiraEm || null,
        limite: limite ? Math.max(0, Math.round(parseNum(limite))) : null,
        ativo,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setEditando(false)
    })

  const excluir = () =>
    iniciarTransicao(async () => {
      if (!window.confirm(`Excluir o cupom ${cupom.codigo} do checkout da Yampi?`)) return
      setErro(null)
      const r = await excluirCupom(id)
      if (!r.ok) setErro(r.erro)
    })

  const botaozinho: React.CSSProperties = {
    border: 0,
    background: 'transparent',
    fontWeight: 600,
    fontSize: 10.5,
    lineHeight: 1,
    cursor: 'pointer',
    padding: '4px 5px',
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <button type="button" onClick={() => setEditando(true)} disabled={pendente} className="hover:text-ouro font-sans" style={{ ...botaozinho, color: 'rgba(242,237,227,.55)' }}>
        editar
      </button>
      <button type="button" onClick={excluir} disabled={pendente} className="hover:brightness-125 font-sans" style={{ ...botaozinho, color: COR.erro, opacity: 0.75 }}>
        excluir
      </button>

      {editando && (
        <Modal titulo={`Editar ${cupom.codigo}`} aoFechar={() => setEditando(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
              {`Regra atual: ${cupom.regra}. Os campos abaixo substituem o que estiver preenchido; a mudança vale no checkout na hora.`}
            </span>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Rotulo>Novo desconto % (vazio = mantém)</Rotulo>
                <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className="font-mono focus:border-ouro/45" style={campo} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Rotulo>Limite de usos (vazio = sem limite)</Rotulo>
                <input value={limite} onChange={(e) => setLimite(e.target.value)} inputMode="numeric" className="font-mono focus:border-ouro/45" style={campo} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Rotulo>Expira em (vazio = sem prazo)</Rotulo>
                <input type="date" value={expiraEm} onChange={(e) => setExpiraEm(e.target.value)} className="font-mono focus:border-ouro/45" style={campo} />
              </div>
              <label className="font-sans" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9, height: 36, fontSize: 12, color: 'var(--color-corrente)', cursor: 'pointer' }}>
                <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
                Cupom ativo
              </label>
            </div>

            {erro && (
              <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: COR.erro, textWrap: 'pretty' }}>
                {erro}
              </span>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
              <BotaoSecundario altura={36} onClick={() => setEditando(false)}>
                Cancelar
              </BotaoSecundario>
              <BotaoOuro altura={36} onClick={salvar} desabilitado={pendente}>
                {pendente ? 'Salvando…' : 'Salvar na Yampi'}
              </BotaoOuro>
            </div>
          </div>
        </Modal>
      )}
    </span>
  )
}
