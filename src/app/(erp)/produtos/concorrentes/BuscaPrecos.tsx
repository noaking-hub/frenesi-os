'use client'

import { useEffect, useRef, useState, useTransition } from 'react'

import { Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { brl, plural } from '@/domain'

import { buscarPrecos, buscarPrecosDaBase, type ResultadoBusca } from './busca'

/**
 * Consulta de preço: digite o perfume, veja o seu preço e o de cada loja.
 *
 * É a tela inteira do módulo. Tudo o mais — cadastro de fonte, coleta,
 * títulos por casar — é manutenção, e manutenção não pode ocupar o lugar da
 * pergunta que se faz todo dia: "por quanto o concorrente está vendendo
 * isto?".
 */
export function BuscaPrecos({ atualizadoEm }: { atualizadoEm: string | null }) {
  const [termo, setTermo] = useState('')
  const [resultado, setResultado] = useState<ResultadoBusca | null>(null)
  const [buscou, setBuscou] = useState(false)
  const [pendente, iniciarTransicao] = useTransition()
  const ultima = useRef('')

  // Busca enquanto digita, com respiro: cada tecla disparando consulta faria
  // o resultado piscar e a base trabalhar à toa.
  useEffect(() => {
    const alvo = termo.trim()
    if (alvo.length < 3) {
      setResultado(null)
      setBuscou(false)
      return
    }
    const id = setTimeout(() => {
      ultima.current = alvo
      iniciarTransicao(async () => {
        const r = await buscarPrecos(alvo)
        // Resposta de busca antiga não pode sobrescrever a atual.
        if (ultima.current !== alvo) return
        setResultado(r)
        setBuscou(true)
      })
    }, 350)
    return () => clearTimeout(id)
  }, [termo])

  const trocarBase = (baseId: string) =>
    iniciarTransicao(async () => {
      const r = await buscarPrecosDaBase(termo.trim(), baseId)
      if (r) setResultado(r)
    })

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 260, position: 'relative' }}>
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Digite o perfume: Idôle, Bleu de Chanel, Sauvage…"
            aria-label="Buscar preço de perfume"
            autoFocus
            className="font-sans focus:border-ouro/55"
            style={{
              width: '100%',
              height: 52,
              padding: '0 17px',
              border: '1px solid rgba(239,209,140,.34)',
              background: 'rgba(255,255,255,.03)',
              borderRadius: 12,
              color: 'var(--color-corrente)',
              fontSize: 16,
              outline: 0,
            }}
          />
        </span>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)' }}
        >
          {pendente
            ? 'Buscando…'
            : atualizadoEm
              ? `Preços de mercado atualizados em ${atualizadoEm}`
              : 'Nenhuma coleta feita ainda'}
        </span>
      </div>

      {termo.trim().length > 0 && termo.trim().length < 3 && (
        <Aviso texto="Digite ao menos três letras." />
      )}

      {/* Cada saída sem resultado tem um motivo diferente, e dizer qual é o
          que separa "não achei" de "não procurei". */}
      {buscou && resultado?.semBanco && (
        <Aviso texto="O Supabase precisa estar configurado para guardar e consultar preços de concorrente." />
      )}

      {buscou && !resultado && (
        <Aviso texto="A busca não retornou. Tente de novo em instantes." />
      )}

      {buscou && resultado && !resultado.semBanco && resultado.linhas.length === 0 && (
        <Aviso
          texto={`Nada encontrado para “${resultado.termo}”. O nome precisa aparecer como o concorrente escreve — tente só a palavra distintiva, como “Idôle” em vez do nome inteiro.`}
        />
      )}

      {resultado && resultado.linhas.length > 0 && (
        <Comparativo resultado={resultado} aoTrocarBase={trocarBase} />
      )}

      {!buscou && (
        <div
          style={{
            padding: '40px 24px',
            textAlign: 'center',
            border: '1px dashed rgba(255,255,255,.09)',
            borderRadius: 14,
          }}
        >
          <span
            className="font-sans"
            style={{
              fontSize: 12,
              lineHeight: 1.6,
              color: 'var(--color-terciario)',
              textWrap: 'pretty',
            }}
          >
            Digite o nome de um perfume para ver o seu preço ao lado do preço de cada concorrente,
            tamanho por tamanho.
          </span>
        </div>
      )}
    </section>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <span
      className="font-sans"
      style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
    >
      {texto}
    </span>
  )
}

function Comparativo({
  resultado,
  aoTrocarBase,
}: {
  resultado: ResultadoBusca
  aoTrocarBase: (baseId: string) => void
}) {
  const { nosso, alternativas, fontes, linhas } = resultado
  const colunas = `92px 118px ${fontes.map(() => 'minmax(96px,1fr)').join(' ')} 130px`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <TituloSecao tamanho={16}>{nosso ? nosso.nome : `“${resultado.termo}” no mercado`}</TituloSecao>
        <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
          {nosso
            ? nosso.marca
            : 'Nenhum perfume do seu catálogo casou com a busca — só o mercado aparece.'}
        </span>
      </div>

      {alternativas.length > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <Rotulo>Era outro?</Rotulo>
          {alternativas.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => aoTrocarBase(a.id)}
              className="hover:border-ouro/40 font-sans"
              style={{
                height: 26,
                padding: '0 10px',
                border: '1px solid rgba(255,255,255,.1)',
                background: 'transparent',
                color: 'rgba(242,237,227,.6)',
                fontSize: 10.5,
                borderRadius: 7,
                cursor: 'pointer',
              }}
            >
              {a.nome}
            </button>
          ))}
        </span>
      )}

      <div
        style={{
          border: '1px solid rgba(255,255,255,.07)',
          borderRadius: 13,
          overflowX: 'auto',
          background: 'rgba(255,255,255,.015)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: colunas,
            gap: 12,
            padding: '11px 16px',
            borderBottom: '1px solid rgba(255,255,255,.07)',
            background: 'rgba(255,255,255,.02)',
            minWidth: 'max-content',
          }}
        >
          <Rotulo>Tamanho</Rotulo>
          <Rotulo style={{ display: 'block', textAlign: 'right', color: COR.ouro }}>Nosso</Rotulo>
          {fontes.map((f) => (
            <Rotulo key={f} style={{ display: 'block', textAlign: 'right' }}>
              {f}
            </Rotulo>
          ))}
          <Rotulo style={{ display: 'block', textAlign: 'right' }}>Contra o menor</Rotulo>
        </div>

        {linhas.map((l) => (
          <div
            key={l.variante}
            style={{
              display: 'grid',
              gridTemplateColumns: colunas,
              gap: 12,
              alignItems: 'center',
              padding: '12px 16px',
              borderBottom: '1px solid rgba(255,255,255,.04)',
              minWidth: 'max-content',
            }}
          >
            <span
              className="font-sans"
              style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--color-corrente)' }}
            >
              {`${l.variante} ml`}
            </span>

            <Valor
              tamanho={13.5}
              tom={l.nosso === null ? 'var(--color-apagado)' : 'ouro'}
              style={{ display: 'block', textAlign: 'right' }}
            >
              {l.nosso === null ? '—' : brl(l.nosso)}
            </Valor>

            {fontes.map((f) => {
              const p = l.porFonte[f]
              const ehMenor = p && l.menor !== null && p.preco === l.menor
              return (
                <span key={f} style={{ display: 'block', textAlign: 'right', minWidth: 0 }}>
                  {p ? (
                    <a
                      href={p.url ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      title={p.titulo}
                      className="font-mono hover:brightness-125"
                      style={{
                        fontWeight: ehMenor ? 600 : 500,
                        fontSize: 12.5,
                        // Verde é o mais barato do mercado; vermelho, quem
                        // está abaixo de nós e por isso ameaça a venda.
                        color: ehMenor
                          ? COR.ok
                          : l.nosso !== null && p.preco < l.nosso
                            ? COR.erro
                            : 'rgba(242,237,227,.72)',
                        textDecoration: p.url ? 'none' : undefined,
                        cursor: p.url ? 'pointer' : 'default',
                      }}
                    >
                      {brl(p.preco)}
                    </a>
                  ) : (
                    <Valor tamanho={12} tom="var(--color-apagado)" style={{ display: 'block', textAlign: 'right' }}>
                      —
                    </Valor>
                  )}
                </span>
              )
            })}

            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
              <Valor
                tamanho={12}
                tom={
                  l.diferenca === null
                    ? 'var(--color-apagado)'
                    : l.diferenca > 0
                      ? 'erro'
                      : 'ok'
                }
                style={{ display: 'block', textAlign: 'right' }}
              >
                {l.diferenca === null
                  ? '—'
                  : l.diferenca === 0
                    ? 'empatado'
                    : `${l.diferenca > 0 ? '+' : '−'} ${brl(Math.abs(l.diferenca))}`}
              </Valor>
              <span
                className="font-sans"
                style={{ fontSize: 9.5, lineHeight: 1.2, color: 'rgba(242,237,227,.32)' }}
              >
                {l.menor === null ? 'sem preço no mercado' : `menor ${brl(l.menor)}`}
              </span>
            </span>
          </div>
        ))}
      </div>

      <span
        className="font-sans"
        style={{ fontSize: 10, lineHeight: 1.5, color: 'rgba(242,237,227,.34)', textWrap: 'pretty' }}
      >
        {`${plural(resultado.encontrados, 'preço encontrado', 'preços encontrados')} no mercado para esta busca. Clique no valor para abrir a página do concorrente. Cada loja entra com o menor preço que pratica no tamanho.`}
      </span>
    </div>
  )
}
