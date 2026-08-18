'use client'

import { useRef, useState } from 'react'

import { BotaoOuro, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { CONCORRENTES, brl, precoPorMl, primeiraPalavra, type CartaoDeProduto } from '@/domain'
import type { PesquisaAnterior, ReferenciaFrenesi, VitrineDaLoja } from '@/data/pesquisa-de-mercado'

import { pesquisarLoja, registrarRodada, reguaDaCasa } from './actions'

/**
 * Pesquisa de mercado — o price-lab dentro do ERP.
 *
 * Digita-se o perfume e as seis lojas concorrentes são consultadas em
 * PARALELO, uma chamada por loja: cada vitrine aparece assim que a loja
 * responde, e uma fora do ar não atrasa as outras. A rodada toda numa chamada
 * só encostava no teto da função do servidor — e o estouro virava página de
 * erro no celular.
 */

type EstadoVitrine =
  | { estado: 'buscando' }
  | { estado: 'pronta'; vitrine: VitrineDaLoja }
  | { estado: 'falhou'; erro: string }

export function PesquisaCliente({ historicoInicial }: { historicoInicial: PesquisaAnterior[] }) {
  const [termo, setTermo] = useState('')
  const [palavra, setPalavra] = useState<string | null>(null)
  const [vitrines, setVitrines] = useState<Record<string, EstadoVitrine>>({})
  const [frenesi, setFrenesi] = useState<ReferenciaFrenesi[]>([])
  const [historico, setHistorico] = useState(historicoInicial)
  const [buscando, setBuscando] = useState(false)
  // Rodada mais nova cala a antiga: sem isto, duas buscas seguidas misturavam
  // vitrines de perfumes diferentes na mesma tela.
  const rodadaRef = useRef(0)

  const buscar = (t: string) => {
    const limpo = t.trim()
    const p = primeiraPalavra(limpo)
    if (!p || buscando) return
    const rodada = ++rodadaRef.current

    setTermo(limpo)
    setPalavra(p)
    setBuscando(true)
    setFrenesi([])
    setVitrines(Object.fromEntries(CONCORRENTES.map((c) => [c.chave, { estado: 'buscando' }])))

    void reguaDaCasa(limpo).then((r) => {
      if (rodadaRef.current === rodada && r.ok) setFrenesi(r.frenesi)
    })

    const chamadas = CONCORRENTES.map((c) =>
      pesquisarLoja(c.chave, p)
        .then((r): EstadoVitrine =>
          r.ok ? { estado: 'pronta', vitrine: r.vitrine } : { estado: 'falhou', erro: r.erro },
        )
        .catch((): EstadoVitrine => ({ estado: 'falhou', erro: 'a consulta não respondeu' }))
        .then((estado) => {
          if (rodadaRef.current === rodada) {
            setVitrines((atual) => ({ ...atual, [c.chave]: estado }))
          }
          return { chave: c.chave, estado }
        }),
    )

    void Promise.all(chamadas).then(async (resultados) => {
      if (rodadaRef.current !== rodada) return
      setBuscando(false)
      // O histórico fecha a rodada — e se a gravação falhar, a tela já
      // mostrou os preços: ninguém fica sem resposta por causa de memória.
      try {
        const resumo = resultados.map((r) => ({
          chave: r.chave,
          cartoes: r.estado.estado === 'pronta' ? r.estado.vitrine.cartoes : [],
          erro:
            r.estado.estado === 'pronta'
              ? r.estado.vitrine.erro
              : r.estado.estado === 'falhou'
                ? r.estado.erro
                : null,
        }))
        setHistorico(await registrarRodada(limpo, p, resumo))
      } catch {
        // memória é coadjuvante
      }
    })
  }

  const prontas = Object.values(vitrines).filter((v) => v.estado !== 'buscando').length
  const totalAchado = Object.values(vitrines).reduce(
    (s, v) => s + (v.estado === 'pronta' ? v.vitrine.cartoes.length : 0),
    0,
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <TituloSecao>Pesquisa de mercado</TituloSecao>
        <span style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
          o preço do perfume nas seis lojas concorrentes, lado a lado
        </span>
      </div>

      {/* Busca */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') buscar(termo)
          }}
          placeholder="Nome do perfume — ex.: Invictus"
          style={{ ...campo, flex: '1 1 260px', height: 38 }}
        />
        <BotaoOuro altura={38} desabilitado={buscando || !termo.trim()} onClick={() => buscar(termo)}>
          {buscando ? `Pesquisando… ${prontas}/${CONCORRENTES.length}` : 'Pesquisar preços'}
        </BotaoOuro>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-terciario)', marginTop: -8 }}>
        A busca usa a primeira palavra do nome — é o que captura todas as variações de volume.
      </div>

      {/* Histórico */}
      {palavra === null && historico.length > 0 && (
        <section style={cartaoSecao}>
          <Rotulo>Pesquisas recentes</Rotulo>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 8 }}>
            {historico.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => buscar(h.termo)}
                className="hover:border-ouro/50"
                style={{
                  height: 30,
                  padding: '0 12px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,.14)',
                  background: 'rgba(255,255,255,.03)',
                  color: 'var(--color-secundario)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {h.termo}
                <span style={{ color: 'var(--color-terciario)', paddingLeft: 6, fontSize: 10.5 }}>
                  {h.total}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {palavra !== null && (
        <>
          {/* A régua da casa */}
          {frenesi.length > 0 && (
            <section style={{ ...cartaoSecao, border: '1px solid rgba(239,209,140,.35)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <Rotulo>Na FRENESI</Rotulo>
                <span style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
                  como estamos vendendo “{palavra}” hoje
                </span>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 10 }}>
                {frenesi.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      border: '1px solid rgba(255,255,255,.1)',
                      borderRadius: 10,
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,.02)',
                    }}
                  >
                    {f.imagem && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={f.imagem}
                        alt=""
                        style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 7 }}
                      />
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span className="font-sans" style={{ fontSize: 11.5, fontWeight: 600 }}>
                        {f.nome} · {f.variante}
                      </span>
                      <span className="font-mono" style={{ fontSize: 12, color: COR.ouro, fontWeight: 700 }}>
                        {brl(f.preco)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!buscando && (
            <div style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
              {totalAchado} produto{totalAchado === 1 ? '' : 's'} encontrado
              {totalAchado === 1 ? '' : 's'} para “{palavra}”.
            </div>
          )}

          {/* Uma vitrine por concorrente, na ordem fixa das lojas */}
          {CONCORRENTES.map((c) => {
            const v = vitrines[c.chave]
            return (
              <section key={c.chave} style={cartaoSecao}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span className="font-serif" style={{ fontSize: 15.5, fontWeight: 600 }}>
                    {c.nome}
                  </span>
                  {v?.estado === 'pronta' && (
                    <span style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
                      {v.vitrine.cartoes.length} resultado{v.vitrine.cartoes.length === 1 ? '' : 's'}
                    </span>
                  )}
                  <a
                    href={`${c.dominio}/search?q=${encodeURIComponent(palavra)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-ouro"
                    style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--color-secundario)', textDecoration: 'underline' }}
                  >
                    abrir busca no site ↗
                  </a>
                </div>

                {(!v || v.estado === 'buscando') && (
                  <div style={{ fontSize: 12, color: 'var(--color-terciario)', paddingTop: 8 }}>
                    Consultando…
                  </div>
                )}
                {v?.estado === 'falhou' && (
                  <div style={{ fontSize: 12, color: COR.atencao, paddingTop: 8 }}>
                    Não foi possível ler esta loja agora: {v.erro}
                  </div>
                )}
                {v?.estado === 'pronta' && v.vitrine.erro && (
                  <div style={{ fontSize: 12, color: COR.atencao, paddingTop: 8 }}>
                    Não foi possível ler esta loja agora: {v.vitrine.erro}
                  </div>
                )}
                {v?.estado === 'pronta' && !v.vitrine.erro && v.vitrine.cartoes.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--color-terciario)', paddingTop: 8 }}>
                    Nenhum resultado para “{palavra}” nesta loja.
                  </div>
                )}

                {v?.estado === 'pronta' && v.vitrine.cartoes.length > 0 && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                      gap: 10,
                      paddingTop: 12,
                    }}
                  >
                    {v.vitrine.cartoes.map((cartao) => (
                      <Cartao key={cartao.url} c={cartao} />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}

function Cartao({ c }: { c: CartaoDeProduto }) {
  const porMl = precoPorMl(c)
  return (
    <a
      href={c.url}
      target="_blank"
      rel="noreferrer"
      className="hover:border-ouro/40"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 10,
        padding: 10,
        background: 'rgba(255,255,255,.02)',
        textDecoration: 'none',
        color: 'inherit',
        minWidth: 0,
      }}
    >
      <div
        style={{
          aspectRatio: '1 / 1',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'rgba(255,255,255,.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {c.imagem ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.imagem}
            alt={c.titulo}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <span style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>sem imagem</span>
        )}
      </div>
      <span
        className="font-sans"
        style={{
          fontSize: 11.5,
          lineHeight: 1.35,
          fontWeight: 500,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          minHeight: 31,
        }}
      >
        {c.titulo}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 'auto' }}>
        <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: COR.ouro }}>
          {c.preco !== null ? brl(c.preco) : '—'}
        </span>
        {porMl !== null && (
          <span className="font-mono" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
            {brl(porMl)}/ml
          </span>
        )}
      </div>
    </a>
  )
}

const cartaoSecao = {
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 12,
  padding: '14px 16px',
  background: 'var(--color-mesa)',
} as const

const campo = {
  padding: '0 12px',
  border: '1px solid rgba(255,255,255,.14)',
  borderRadius: 8,
  background: 'rgba(255,255,255,.04)',
  color: 'var(--color-corrente)',
  fontSize: 13,
  outline: 0,
} as const
