'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { BotaoOuro, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { CONCORRENTES, brl, precoPorMl, primeiraPalavra, type CartaoDeProduto, type VariacaoDeProduto } from '@/domain'
import type { PesquisaAnterior, VitrineDaLoja } from '@/data/pesquisa-de-mercado'

import { pesquisarLoja, registrarRodada, verVariacoes } from './actions'

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
  const [detalhe, setDetalhe] = useState<CartaoDeProduto | null>(null)
  const [palavra, setPalavra] = useState<string | null>(null)
  const [vitrines, setVitrines] = useState<Record<string, EstadoVitrine>>({})
  const [historico, setHistorico] = useState(historicoInicial)
  const [buscando, setBuscando] = useState(false)
  const [desatualizada, setDesatualizada] = useState(false)
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
    setDesatualizada(false)
    setVitrines(Object.fromEntries(CONCORRENTES.map((c) => [c.chave, { estado: 'buscando' }])))

    // Uma retentativa por loja: soluço de rede não pode custar a vitrine.
    const comRetentativa = (chave: string) =>
      pesquisarLoja(chave, limpo).catch(
        () => new Promise<Awaited<ReturnType<typeof pesquisarLoja>>>((resolve, reject) => {
          setTimeout(() => pesquisarLoja(chave, limpo).then(resolve, reject), 800)
        }),
      )

    const chamadas = CONCORRENTES.map((c) =>
      comRetentativa(c.chave)
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
      // TODAS rejeitadas é outra doença: quase sempre a aba é de antes de um
      // deploy e as actions que ela conhece não existem mais no servidor.
      // Recarregar resolve — e é isso que a tela precisa dizer.
      setDesatualizada(resultados.every((r) => r.estado.estado === 'falhou'))
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

      {desatualizada && (
        <section
          style={{
            ...cartaoSecao,
            border: `1px solid ${COR.atencao}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span className="font-sans" style={{ fontSize: 12.5, color: 'var(--color-corrente)', flex: '1 1 240px' }}>
            Nenhuma consulta chegou ao servidor — o ERP provavelmente foi atualizado enquanto esta
            aba estava aberta. Recarregue a página e pesquise de novo.
          </span>
          <BotaoOuro altura={32} onClick={() => window.location.reload()}>
            Recarregar
          </BotaoOuro>
        </section>
      )}

      {palavra !== null && (
        <>
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
                      <Cartao key={cartao.url} c={cartao} aoAbrirVariacoes={() => setDetalhe(cartao)} />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </>
      )}
      {detalhe && <PainelVariacoes cartao={detalhe} aoFechar={() => setDetalhe(null)} />}
    </div>
  )
}

function Cartao({ c, aoAbrirVariacoes }: { c: CartaoDeProduto; aoAbrirVariacoes: () => void }) {
  const porMl = precoPorMl(c)
  return (
    <div
      className="hover:border-ouro/40"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 10,
        padding: 10,
        background: 'rgba(255,255,255,.02)',
        color: 'inherit',
        minWidth: 0,
      }}
    >
      {/* A imagem abre as VARIAÇÕES (tamanho × preço) lidas do site do
          concorrente; o título continua levando ao produto lá. */}
      <button
        type="button"
        onClick={aoAbrirVariacoes}
        title="Ver os preços de cada tamanho"
        style={{
          aspectRatio: '1 / 1',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'rgba(255,255,255,.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 0,
          padding: 0,
          cursor: 'pointer',
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
          <span style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>ver variações</span>
        )}
      </button>
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
        <a
          href={c.url}
          target="_blank"
          rel="noreferrer"
          className="hover:text-ouro"
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          {c.titulo}
        </a>
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
    </div>
  )
}

/**
 * O painel de variações: o que cada tamanho custa NAQUELA loja, lido da
 * própria página do produto na hora do clique.
 */
function PainelVariacoes({ cartao, aoFechar }: { cartao: CartaoDeProduto; aoFechar: () => void }) {
  const [estado, setEstado] = useState<
    | { fase: 'carregando' }
    | { fase: 'pronta'; variacoes: VariacaoDeProduto[] }
    | { fase: 'erro'; erro: string }
  >({ fase: 'carregando' })

  useEffect(() => {
    let viva = true
    verVariacoes(cartao.url).then((r) => {
      if (!viva) return
      setEstado(r.ok ? { fase: 'pronta', variacoes: r.variacoes } : { fase: 'erro', erro: r.erro })
    })
    return () => {
      viva = false
    }
  }, [cartao.url])

  // Portal no <body>: dentro do shell, um ancestral com transform vira o
  // "containing block" do position:fixed e o painel abria lá embaixo,
  // obrigando a rolar até ele. No body, fixed é fixed — centro da janela.
  return createPortal(
    <div
      onClick={aoFechar}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(10,9,8,.72)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(440px, 100%)',
          maxHeight: '80vh',
          overflowY: 'auto',
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,.12)',
          background: 'var(--color-mesa)',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          // Cor explícita: o portal nasce no <body>, fora da árvore que dava
          // a cor do texto — sem isto o nome da variação herdava um tom
          // escuro ilegível sobre o fundo escuro.
          color: 'var(--color-corrente)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          {cartao.imagem && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cartao.imagem}
              alt=""
              style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, flex: 'none' }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="font-sans"
              style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, color: 'var(--color-corrente)' }}
            >
              {cartao.titulo}
            </div>
            <a
              href={cartao.url}
              target="_blank"
              rel="noreferrer"
              className="font-sans hover:text-ouro"
              style={{ fontSize: 11, color: COR.ouro, textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              abrir no site ↗
            </a>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            style={{ border: 0, background: 'transparent', color: 'var(--color-terciario)', cursor: 'pointer', fontSize: 16 }}
          >
            ✕
          </button>
        </div>

        {estado.fase === 'carregando' && (
          <div className="font-sans" style={{ fontSize: 12, color: 'var(--color-terciario)' }}>
            Lendo as variações no site do concorrente…
          </div>
        )}
        {estado.fase === 'erro' && (
          <div className="font-sans" style={{ fontSize: 12, color: 'var(--color-terciario)' }}>
            {estado.erro}
          </div>
        )}
        {estado.fase === 'pronta' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {estado.variacoes.map((v, i) => {
              const ml = v.nome.match(/(\d+(?:[.,]\d+)?)\s*ml/i)
              const porMl =
                v.preco !== null && ml
                  ? Math.round((v.preco / Number.parseFloat(ml[1].replace(',', '.'))) * 100) / 100
                  : null
              return (
                <div
                  key={`${v.nome}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,.07)',
                    background: 'rgba(255,255,255,.02)',
                    opacity: v.disponivel ? 1 : 0.55,
                  }}
                >
                  <span className="font-sans" style={{ flex: 1, fontSize: 12.5, color: 'var(--color-corrente)' }}>
                    {v.nome}
                  </span>
                  {!v.disponivel && (
                    <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
                      esgotado
                    </span>
                  )}
                  {porMl !== null && (
                    <span className="font-mono" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
                      {brl(porMl)}/ml
                    </span>
                  )}
                  <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: COR.ouro }}>
                    {v.preco !== null ? brl(v.preco) : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
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
