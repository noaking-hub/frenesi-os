'use client'

import { useRouter } from 'next/navigation'

import { useState, useTransition } from 'react'

import { Modal } from '@/components/erp/Modal'
import { BotaoOuro, BotaoSecundario, Rotulo } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { parseNum } from '@/domain'

import { criarCupom } from './actions'

/**
 * Criação de cupom direto no checkout da Yampi.
 *
 * O ERP publica via API e recarrega a lista — o cupom que aparece depois do
 * salvar é o que a Yampi confirmou, não uma cópia otimista.
 */
export function NovoCupom() {
  const [aberto, setAberto] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [valor, setValor] = useState('10')
  const [percentual, setPercentual] = useState(true)
  const [expiraEm, setExpiraEm] = useState('')
  const [limite, setLimite] = useState('')
  const [naoAcumula, setNaoAcumula] = useState(true)
  const [porCliente, setPorCliente] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()
  const router = useRouter()

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await criarCupom({
        codigo,
        valor: parseNum(valor),
        percentual,
        expiraEm: expiraEm || undefined,
        limite: limite ? Math.max(0, Math.round(parseNum(limite))) : undefined,
        naoAcumula,
        usoUnicoPorCliente: porCliente,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setAberto(false)
      setCodigo('')
      setExpiraEm('')
      setLimite('')
      router.refresh()
    })

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

  return (
    <>
      <BotaoOuro altura={34} onClick={() => setAberto(true)}>
        + Novo cupom no checkout
      </BotaoOuro>

      {aberto && (
        <Modal titulo="Novo cupom na Yampi" aoFechar={() => setAberto(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Rotulo>Código</Rotulo>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="FRENESI10"
                className="font-mono focus:border-ouro/45"
                style={campo}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Rotulo>Desconto</Rotulo>
                <input
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  inputMode="decimal"
                  className="font-mono focus:border-ouro/45"
                  style={campo}
                />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Rotulo>Tipo</Rotulo>
                <select
                  value={percentual ? 'pct' : 'reais'}
                  onChange={(e) => setPercentual(e.target.value === 'pct')}
                  className="font-sans"
                  style={campo}
                >
                  <option value="pct">% do pedido</option>
                  <option value="reais">R$ fixos</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
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
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Rotulo>Limite de usos (opcional)</Rotulo>
                <input
                  value={limite}
                  onChange={(e) => setLimite(e.target.value)}
                  inputMode="numeric"
                  placeholder="Sem limite"
                  className="font-mono focus:border-ouro/45"
                  style={campo}
                />
              </div>
            </div>

            <label className="font-sans" style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: 'var(--color-corrente)', cursor: 'pointer' }}>
              <input type="checkbox" checked={naoAcumula} onChange={(e) => setNaoAcumula(e.target.checked)} />
              Não acumular com outras promoções ativas
            </label>
            <label className="font-sans" style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: 'var(--color-corrente)', cursor: 'pointer' }}>
              <input type="checkbox" checked={porCliente} onChange={(e) => setPorCliente(e.target.checked)} />
              Uso único (1 vez) por cliente
            </label>

            {erro && (
              <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: COR.erro, textWrap: 'pretty' }}>
                {erro}
              </span>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
              <BotaoSecundario altura={36} onClick={() => setAberto(false)}>
                Cancelar
              </BotaoSecundario>
              <BotaoOuro altura={36} onClick={salvar} desabilitado={pendente || !codigo.trim()}>
                {pendente ? 'Publicando…' : 'Publicar no checkout'}
              </BotaoOuro>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
