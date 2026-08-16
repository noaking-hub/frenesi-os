'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { CONTORNO, Etiqueta, Ico, Num, TINTA, VELADO } from '@/components/erp/ui'
import { brl, diaCurtoPt } from '@/domain'

import { resolverDestinoDoRepasse } from '../acoes-gerenciais'

/**
 * A fila de destino, com seleção e resposta em lote.
 *
 * A resposta é EXCLUSIVA por desenho: escolher a conta limpa a categoria e
 * vice-versa. Um formulário que aceitasse as duas ao mesmo tempo estaria
 * perguntando se o dinheiro foi para o Inter e para a Meta — e o banco recusa
 * exatamente isso. Melhor não deixar a pergunta sem sentido nem ser feita.
 *
 * O lote existe porque a maioria dos saques vai para a mesma conta: marcar
 * quarenta linhas e responder uma vez é o que torna sessenta pendências
 * resolvíveis numa sentada. O que muda de linha para linha — o anúncio, o
 * fornecedor — continua sendo respondido linha a linha.
 *
 * A seleção começa vazia, pelo mesmo motivo da fila de classificação: marcar
 * tudo por padrão inverteria o ônus e transformaria conferência em carimbo.
 */

export interface RepasseNaTela {
  id: string
  descricao: string
  valor: number
  quando: string | null
  conta: string
  contaId: string
}

type Resposta = { tipo: 'conta'; id: string } | { tipo: 'categoria'; id: string } | null

export function Fila({
  itens,
  contas,
  categorias,
}: {
  itens: RepasseNaTela[]
  contas: { id: string; nome: string; banco: string }[]
  categorias: { id: string; nome: string }[]
}) {
  const router = useRouter()
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [resposta, setResposta] = useState<Resposta>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const selecionados = useMemo(() => itens.filter((i) => marcados.has(i.id)), [itens, marcados])
  const valorSelecionado = selecionados.reduce((a, i) => a + i.valor, 0)

  // A conta de origem sai da lista de destinos: transferir do Mercado Pago
  // para o Mercado Pago não é um destino, é um erro de digitação — e o banco
  // devolveria "origem e destino são a mesma conta" depois do clique.
  const origens = new Set(selecionados.map((i) => i.contaId))
  const destinos = contas.filter((c) => !origens.has(c.id))

  function alternar(id: string) {
    setMarcados((antes) => {
      const novo = new Set(antes)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  function marcarTodos() {
    setMarcados((antes) => (antes.size === itens.length ? new Set() : new Set(itens.map((i) => i.id))))
  }

  async function responder() {
    if (!resposta || selecionados.length === 0) return
    setOcupado(true)
    setAviso(null)
    try {
      const r = await resolverDestinoDoRepasse(
        selecionados.map((i) => i.id),
        resposta.tipo === 'conta' ? { contaId: resposta.id } : { categoriaId: resposta.id },
      )
      if (!r.ok) {
        setAviso({ ok: false, texto: r.erro })
        return
      }
      const parcial = r.recusados.length
        ? ` ${r.recusados.length} não passaram: ${r.recusados[0].erro}`
        : ''
      setAviso({
        ok: r.recusados.length === 0,
        texto: `${r.resolvidos} ${r.resolvidos === 1 ? 'repasse resolvido' : 'repasses resolvidos'}.${parcial}`,
      })
      setMarcados(new Set())
      setResposta(null)
      router.refresh()
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : String(e) })
    } finally {
      setOcupado(false)
    }
  }

  const nomeDaResposta =
    resposta?.tipo === 'conta'
      ? contas.find((c) => c.id === resposta.id)?.nome
      : categorias.find((c) => c.id === resposta?.id)?.nome

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {aviso && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '11px 13px',
            borderRadius: 11,
            border: `1px solid ${CONTORNO[aviso.ok ? 'ok' : 'erro']}`,
            background: VELADO[aviso.ok ? 'ok' : 'erro'],
          }}
        >
          <span style={{ color: TINTA[aviso.ok ? 'ok' : 'erro'], flex: 'none' }}>
            <Ico n={aviso.ok ? 'check-circulo' : 'alerta-circulo'} tamanho={15} />
          </span>
          <span className="font-sans" style={{ fontSize: 12, color: 'rgba(242,237,227,.8)' }}>
            {aviso.texto}
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={marcarTodos}
        className="font-sans hover:text-ouro"
        style={{
          alignSelf: 'flex-start',
          border: 0,
          background: 'transparent',
          color: 'rgba(242,237,227,.45)',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        {marcados.size === itens.length ? 'Desmarcar todos' : `Marcar os ${itens.length} da fila`}
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {itens.map((i) => (
          <Linha key={i.id} i={i} marcado={marcados.has(i.id)} aoAlternar={() => alternar(i.id)} />
        ))}
      </div>

      {selecionados.length > 0 && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 12,
            flexWrap: 'wrap',
            padding: '13px 14px',
            borderRadius: 12,
            border: `1px solid ${CONTORNO.ouro}`,
            background: 'rgba(23,22,26,.97)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Etiqueta>Selecionados</Etiqueta>
            <span className="font-sans" style={{ fontSize: 12.5, color: 'var(--color-tinta)' }}>
              {selecionados.length} · <Num tamanho={12.5}>{brl(valorSelecionado)}</Num>
            </span>
          </span>

          <Escolha
            rotulo="Foi para conta própria"
            vazio={destinos.length ? 'Escolha a conta…' : 'Sem outra conta ativa'}
            opcoes={destinos.map((c) => ({ id: c.id, nome: `${c.nome} · ${c.banco}` }))}
            valor={resposta?.tipo === 'conta' ? resposta.id : ''}
            aoEscolher={(id) => setResposta(id ? { tipo: 'conta', id } : null)}
          />

          <span
            className="font-sans"
            style={{ fontSize: 11, color: 'rgba(242,237,227,.35)', paddingBottom: 9 }}
          >
            ou
          </span>

          <Escolha
            rotulo="Foi despesa"
            vazio="Escolha a categoria…"
            opcoes={categorias.map((c) => ({ id: c.id, nome: c.nome }))}
            valor={resposta?.tipo === 'categoria' ? resposta.id : ''}
            aoEscolher={(id) => setResposta(id ? { tipo: 'categoria', id } : null)}
          />

          <div style={{ flex: 1, minWidth: 4 }} />

          <button
            type="button"
            onClick={() => {
              setMarcados(new Set())
              setResposta(null)
            }}
            className="font-sans hover:text-ouro"
            style={{
              height: 32,
              padding: '0 12px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,.11)',
              background: 'transparent',
              color: 'var(--color-secundario)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={responder}
            disabled={ocupado || !resposta}
            className="botao-ouro font-sans hover:brightness-[1.07]"
            style={{
              height: 32,
              padding: '0 16px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              boxShadow: 'var(--shadow-ouro)',
              cursor: ocupado || !resposta ? 'not-allowed' : 'pointer',
              opacity: ocupado || !resposta ? 0.45 : 1,
            }}
          >
            {ocupado
              ? 'Gravando…'
              : resposta
                ? `Registrar ${selecionados.length} em ${nomeDaResposta}`
                : 'Escolha o destino'}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Um dos dois lados da resposta.
 *
 * Escolher aqui zera o outro lado — é o `aoEscolher` do pai que faz isso, ao
 * substituir a resposta inteira em vez de mesclar campos.
 */
function Escolha({
  rotulo,
  vazio,
  opcoes,
  valor,
  aoEscolher,
}: {
  rotulo: string
  vazio: string
  opcoes: { id: string; nome: string }[]
  valor: string
  aoEscolher: (id: string) => void
}) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Etiqueta>{rotulo}</Etiqueta>
      <select
        value={valor}
        disabled={opcoes.length === 0}
        onChange={(e) => aoEscolher(e.target.value)}
        className="font-sans"
        style={{
          height: 32,
          minWidth: 190,
          padding: '0 8px',
          borderRadius: 8,
          border: `1px solid ${valor ? CONTORNO.ouro : 'rgba(255,255,255,.11)'}`,
          background: valor ? VELADO.ouro : 'rgba(255,255,255,.03)',
          color: 'var(--color-tinta)',
          fontSize: 12,
          cursor: opcoes.length === 0 ? 'not-allowed' : 'pointer',
          opacity: opcoes.length === 0 ? 0.45 : 1,
        }}
      >
        <option value="">{vazio}</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </select>
    </span>
  )
}

function Linha({
  i,
  marcado,
  aoAlternar,
}: {
  i: RepasseNaTela
  marcado: boolean
  aoAlternar: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '9px 11px',
        borderRadius: 9,
        border: `1px solid ${marcado ? CONTORNO.ouro : 'rgba(255,255,255,.05)'}`,
        background: marcado ? VELADO.ouro : 'rgba(255,255,255,.015)',
        flexWrap: 'wrap',
      }}
    >
      <button
        type="button"
        onClick={aoAlternar}
        aria-label={marcado ? 'Desmarcar' : 'Marcar'}
        style={{
          width: 17,
          height: 17,
          flex: 'none',
          borderRadius: 4,
          border: `1px solid ${marcado ? TINTA.ouro : 'rgba(255,255,255,.22)'}`,
          background: marcado ? TINTA.ouro : 'transparent',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--color-sobre-ouro)',
          cursor: 'pointer',
        }}
      >
        {marcado && <Ico n="check" tamanho={11} />}
      </button>

      <span
        className="font-sans"
        style={{ width: 62, flex: 'none', fontSize: 11.5, color: 'rgba(242,237,227,.55)' }}
      >
        {i.quando ? diaCurtoPt(i.quando) : '—'}
      </span>

      <span
        className="font-sans"
        style={{
          flex: 1,
          minWidth: 180,
          fontSize: 12,
          color: 'var(--color-tinta)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={i.descricao}
      >
        {i.descricao}
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 108 }}>
        <Etiqueta>Saiu de</Etiqueta>
        <span className="font-sans" style={{ fontSize: 11.5, color: 'rgba(242,237,227,.7)' }}>
          {i.conta}
        </span>
      </span>

      <Num tamanho={12}>−{brl(i.valor)}</Num>
    </div>
  )
}
