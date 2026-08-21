'use client'

import { useState, useTransition } from 'react'

import { COR, FUNDO, BORDA } from '@/components/erp/tokens'
import { servicoLegivel } from '@/domain'

import { registrarRastreioManual, type PendenteDeRastreio } from './actions'

/**
 * A fila de quem foi postado e ainda não tem código no ERP.
 *
 * A etiqueta dos Correios e da Jadlog sai do PAINEL da Frenet, onde o frete
 * custa menos — e nenhuma API lista as etiquetas de uma conta de lá. O ERP
 * sabe rastrear um código; não sabe adivinhar que ele existe. Até esta tela, o
 * único lugar do mundo onde esse código podia ser digitado era a Yampi, e o
 * pedido ficava em "aguardando envio" — sem aviso ao cliente, sem baixa na
 * Shopify — até alguém preencher lá.
 *
 * É uma lista com um campo por linha, e não um modal por pedido, porque o
 * gesto real é este: sete pacotes postados de uma vez, sete códigos na mão,
 * uma tela só. Abrir e fechar sete fichas é o mesmo trabalho que fez a
 * pendência acumular.
 *
 * Some sozinha quando a fila esvazia. Seção vazia em tela de operação vira
 * ruído que o olho aprende a pular — e no dia em que voltar a ter conteúdo,
 * ninguém repara.
 */
export function FilaDeRastreio({ pendentes }: { pendentes: PendenteDeRastreio[] }) {
  // Guarda local do que já foi resolvido: a lista vem do servidor e só é
  // relida no próximo carregamento da página. Sem isso, a linha gravada
  // continuaria na tela e o operador digitaria o mesmo código duas vezes.
  const [resolvidos, setResolvidos] = useState<Record<string, string>>({})
  const [avisos, setAvisos] = useState<Record<string, string>>({})

  const abertos = pendentes.filter((p) => !resolvidos[p.id])
  if (pendentes.length === 0) return null

  return (
    <section
      style={{
        border: `1px solid ${BORDA.ouro}`,
        background: FUNDO.ouro,
        borderRadius: 14,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 11,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
        <h2
          className="font-display"
          style={{ fontSize: 14, fontWeight: 600, color: COR.ouro, margin: 0 }}
        >
          Aguardando código de rastreio
        </h2>
        <span className="font-mono" style={{ fontSize: 12, color: COR.ouro }}>
          {abertos.length}
        </span>
        <span
          className="font-sans"
          style={{
            fontSize: 10.5,
            lineHeight: 1.45,
            color: 'var(--color-terciario)',
            textWrap: 'pretty',
            flexBasis: '100%',
          }}
        >
          Pedidos pagos, sem entrega local e sem código. A etiqueta emitida no painel da Frenet não
          chega ao ERP por nenhuma integração — informe o código aqui e o pedido passa a
          &quot;enviado&quot;, o aviso vai ao cliente e a Frenet começa a rastrear.
        </span>
      </header>

      {abertos.length === 0 ? (
        <span className="font-sans" style={{ fontSize: 11.5, color: COR.ok }}>
          Fila zerada — todos os pedidos desta lista receberam código.
        </span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {abertos.map((p) => (
            <LinhaPendente
              key={p.id}
              pendente={p}
              aoResolver={(codigo, aviso) => {
                setResolvidos((r) => ({ ...r, [p.id]: codigo }))
                if (aviso) setAvisos((a) => ({ ...a, [p.id]: aviso }))
              }}
            />
          ))}
        </div>
      )}

      {Object.entries(resolvidos).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {Object.entries(resolvidos).map(([id, codigo]) => {
            const p = pendentes.find((x) => x.id === id)
            return (
              <span
                key={id}
                className="font-sans"
                style={{ fontSize: 10.5, lineHeight: 1.45, color: 'var(--color-terciario)', textWrap: 'pretty' }}
              >
                <span style={{ color: COR.ok }}>✓</span> {p?.codigo ?? id} ·{' '}
                <span className="font-mono">{codigo}</span>
                {avisos[id] ? ` — ${avisos[id]}` : ' — enviado'}
              </span>
            )
          })}
        </div>
      )}
    </section>
  )
}

function LinhaPendente({
  pendente,
  aoResolver,
}: {
  pendente: PendenteDeRastreio
  aoResolver: (codigo: string, aviso: string | null) => void
}) {
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [gravando, gravar] = useTransition()

  const limpo = codigo.replace(/\s+/g, '')
  const pronto = limpo.length >= 6

  const salvar = () =>
    gravar(async () => {
      setErro(null)
      const r = await registrarRastreioManual(pendente.id, codigo)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoResolver(limpo.toUpperCase(), r.aviso)
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span
          className="font-mono"
          style={{ fontSize: 11.5, color: COR.ouro, minWidth: 74, flex: 'none' }}
        >
          {pendente.codigo}
        </span>
        <span
          className="font-sans"
          style={{
            fontSize: 11.5,
            color: 'var(--color-corrente)',
            flex: '1 1 150px',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={pendente.cliente}
        >
          {pendente.cliente}
        </span>
        {/* O serviço COTADO no checkout — pista de qual transportadora
            procurar no painel, não prova de onde a etiqueta saiu. */}
        <span
          className="font-sans"
          style={{ fontSize: 10.5, color: 'var(--color-terciario)', flex: 'none' }}
        >
          {servicoLegivel(pendente.servicoFrete) ?? '—'}
        </span>
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && pronto && !gravando) salvar()
          }}
          placeholder="Código da etiqueta"
          spellCheck={false}
          autoCapitalize="characters"
          aria-label={`Código de rastreio do pedido ${pendente.codigo}`}
          className="font-mono"
          style={{
            flex: '1 1 168px',
            minWidth: 0,
            padding: '6px 9px',
            fontSize: 11.5,
            color: 'var(--color-corrente)',
            background: 'rgba(255,255,255,.04)',
            border: '1px solid var(--color-borda-sutil)',
            borderRadius: 8,
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={salvar}
          disabled={!pronto || gravando}
          className="font-sans"
          style={{
            border: `1px solid ${BORDA.ouro}`,
            background: FUNDO.ouro,
            color: COR.ouro,
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 11.5,
            flex: 'none',
            cursor: gravando ? 'wait' : pronto ? 'pointer' : 'not-allowed',
            opacity: pronto ? 1 : 0.45,
          }}
        >
          {gravando ? 'Gravando…' : 'Salvar'}
        </button>
      </div>
      {erro && (
        <span className="font-sans" style={{ fontSize: 10.5, color: COR.erro, textWrap: 'pretty' }}>
          {erro}
        </span>
      )}
    </div>
  )
}
