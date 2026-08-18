'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { CONTORNO, Etiqueta, Ico, Num, TINTA, VELADO, Vazio, type TomUi } from '@/components/erp/ui'
import { brl } from '@/domain'

/**
 * A fila, com seleção e aplicação em lote.
 *
 * Duas decisões de desenho carregam o resto:
 *
 * O que NÃO É CLASSIFICÁVEL aparece, bloqueado, com o motivo. Some-lo seria
 * mais limpo e mais enganoso: quem abre a tela e vê 39 pendências no alerta mas
 * 12 linhas aqui vai procurar as outras 27 até desconfiar do sistema. Mostrar
 * que existem e por que não entram é o que fecha essa conta.
 *
 * A seleção começa VAZIA. Marcar tudo por padrão transformaria "conferir" em
 * "desmarcar o que estiver errado", que é a mesma coisa com o ônus invertido —
 * e é assim que aprovação em massa vira carimbo.
 */

export interface SugestaoNaTela {
  id: string
  descricao: string
  valor: number
  tipo: 'entrada' | 'saida'
  categoriaId: string | null
  categoria: string | null
  confianca: number
  origem: string
  exigeRevisao: boolean
  motivo: string
  quando: string | null
  conta: string | null
  favorecido: string | null
  /** Falso só para transferência própria e crédito de venda. */
  classificavel: boolean
}

type Filtro = 'todos' | 'sugeridos' | 'revisao' | 'sem_sugestao'

export function Fila({
  sugestoes,
  categorias,
  escritaLiberada,
}: {
  sugestoes: SugestaoNaTela[]
  categorias: { id: string; nome: string; natureza: string }[]
  escritaLiberada: boolean
}) {
  const router = useRouter()
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  // Abrir numa aba vazia parece tela quebrada: começa na primeira que tem
  // conteúdo — quem só tem movimentos sem sugestão cai direto neles.
  const [filtro, setFiltro] = useState<Filtro>(() =>
    sugestoes.some((s) => s.categoriaId && !s.exigeRevisao) ? 'sugeridos' : 'todos',
  )
  const [categoriaAlvo, setCategoriaAlvo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string; loteId?: string } | null>(null)

  const visiveis = useMemo(() => {
    if (filtro === 'sugeridos') return sugestoes.filter((s) => s.categoriaId && !s.exigeRevisao)
    if (filtro === 'revisao') return sugestoes.filter((s) => s.categoriaId && s.exigeRevisao)
    if (filtro === 'sem_sugestao') return sugestoes.filter((s) => !s.categoriaId)
    return sugestoes
  }, [sugestoes, filtro])

  const selecionados = sugestoes.filter((s) => marcados.has(s.id))
  const valorSelecionado = selecionados.reduce((a, s) => a + s.valor, 0)

  // A categoria efetiva do lote: a escolhida à mão, ou a sugerida quando todos
  // os marcados concordam. Aplicar categorias diferentes num clique só seria
  // esconder a informação que decide.
  const sugeridaUnica = useMemo(() => {
    const ids = new Set(selecionados.map((s) => s.categoriaId))
    return ids.size === 1 ? (selecionados[0]?.categoriaId ?? null) : null
  }, [selecionados])

  const alvo = categoriaAlvo || sugeridaUnica || ''
  const nomeAlvo = categorias.find((c) => c.id === alvo)?.nome ?? ''

  function alternar(id: string) {
    setMarcados((antes) => {
      const novo = new Set(antes)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  function marcarVisiveis() {
    const classificaveis = visiveis.filter((s) => s.classificavel).map((s) => s.id)
    setMarcados((antes) =>
      classificaveis.every((id) => antes.has(id)) ? new Set() : new Set(classificaveis),
    )
  }

  async function aplicar() {
    if (!alvo || selecionados.length === 0) return
    setOcupado(true)
    setAviso(null)
    try {
      const r = await fetch('/api/assessor/classificar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: selecionados.map((s) => s.id), categoriaId: alvo }),
      })
      const d = (await r.json()) as { ok?: boolean; recibo?: string; erro?: string; batchId?: string }
      setAviso({
        ok: Boolean(d.ok),
        texto: d.erro ?? d.recibo ?? 'Sem resposta.',
        loteId: d.batchId,
      })
      if (d.ok) {
        setMarcados(new Set())
        setCategoriaAlvo('')
        router.refresh()
      }
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : String(e) })
    } finally {
      setOcupado(false)
    }
  }

  async function desfazer(loteId: string) {
    setOcupado(true)
    try {
      const r = await fetch('/api/assessor/classificar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ acao: 'desfazer', loteId }),
      })
      const d = (await r.json()) as { ok?: boolean; recibo?: string; erro?: string }
      setAviso({ ok: Boolean(d.ok), texto: d.erro ?? d.recibo ?? 'Sem resposta.' })
      if (d.ok) router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  const contagem = {
    todos: sugestoes.length,
    sugeridos: sugestoes.filter((s) => s.categoriaId && !s.exigeRevisao).length,
    revisao: sugestoes.filter((s) => s.categoriaId && s.exigeRevisao).length,
    sem_sugestao: sugestoes.filter((s) => !s.categoriaId).length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {(
          [
            ['sugeridos', 'Prontos'],
            ['revisao', 'Exigem revisão'],
            ['sem_sugestao', 'Sem sugestão'],
            ['todos', 'Todos'],
          ] as [Filtro, string][]
        ).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFiltro(id)}
            className="font-sans"
            style={{
              height: 30,
              padding: '0 12px',
              borderRadius: 8,
              border: `1px solid ${filtro === id ? CONTORNO.ouro : 'rgba(255,255,255,.08)'}`,
              background: filtro === id ? VELADO.ouro : 'transparent',
              color: filtro === id ? TINTA.ouro : 'rgba(242,237,227,.55)',
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {rotulo} · {contagem[id]}
          </button>
        ))}
      </div>

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
            <Ico n={aviso.ok ? 'check-circulo' : 'x-circulo'} tamanho={15} />
          </span>
          <span className="font-sans" style={{ flex: 1, fontSize: 12, color: 'rgba(242,237,227,.8)' }}>
            {aviso.texto}
          </span>
          {aviso.ok && aviso.loteId && (
            <button
              type="button"
              onClick={() => desfazer(aviso.loteId!)}
              disabled={ocupado}
              className="font-sans hover:text-ouro"
              style={{
                border: 0,
                background: 'transparent',
                color: 'rgba(242,237,227,.55)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              Desfazer
            </button>
          )}
        </div>
      )}

      {visiveis.length === 0 ? (
        <Vazio texto="Nada nesta aba." icone="check-circulo" />
      ) : (
        <>
          <button
            type="button"
            onClick={marcarVisiveis}
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
            Marcar / desmarcar os {visiveis.filter((s) => s.classificavel).length} classificáveis desta aba
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {visiveis.map((s) => (
              <Linha
                key={s.id}
                s={s}
                marcado={marcados.has(s.id)}
                aoAlternar={() => alternar(s.id)}
              />
            ))}
          </div>
        </>
      )}

      {selecionados.length > 0 && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
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
              {selecionados.length} movimento(s) · <Num tamanho={12.5}>{brl(valorSelecionado)}</Num>
            </span>
          </span>

          <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Etiqueta>Categoria</Etiqueta>
            <select
              value={alvo}
              onChange={(e) => setCategoriaAlvo(e.target.value)}
              className="font-sans"
              style={{
                height: 32,
                minWidth: 200,
                padding: '0 8px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,.11)',
                background: 'rgba(255,255,255,.03)',
                color: 'var(--color-tinta)',
                fontSize: 12,
              }}
            >
              <option value="">
                {sugeridaUnica ? 'Usar a sugerida' : 'Escolha a categoria…'}
              </option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </span>

          <div style={{ flex: 1, minWidth: 4 }} />

          <button
            type="button"
            onClick={() => setMarcados(new Set())}
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
            Limpar seleção
          </button>
          <button
            type="button"
            onClick={aplicar}
            disabled={ocupado || !alvo || !escritaLiberada}
            title={!escritaLiberada ? 'A escrita do Gerente está desligada.' : undefined}
            className="botao-ouro font-sans hover:brightness-[1.07]"
            style={{
              height: 32,
              padding: '0 16px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              boxShadow: 'var(--shadow-ouro)',
              cursor: ocupado || !alvo || !escritaLiberada ? 'not-allowed' : 'pointer',
              opacity: ocupado || !alvo || !escritaLiberada ? 0.45 : 1,
            }}
          >
            {ocupado
              ? 'Aplicando…'
              : `Classificar ${selecionados.length} como ${nomeAlvo || '…'}`}
          </button>
        </div>
      )}
    </div>
  )
}

function Linha({
  s,
  marcado,
  aoAlternar,
}: {
  s: SugestaoNaTela
  marcado: boolean
  aoAlternar: () => void
}) {
  // Bloqueado é SÓ o que classificar duplicaria (transferência própria e
  // crédito de venda). Sem sugestão não é bloqueio: é um movimento esperando
  // a categoria vir de quem sabe — marca, escolhe no rodapé e aplica.
  const bloqueado = !s.classificavel
  const tom: TomUi = bloqueado ? 'neutro' : s.exigeRevisao ? 'atencao' : s.categoriaId ? 'ok' : 'neutro'
  const detalhes = [
    s.quando ? `${s.quando.slice(8, 10)}/${s.quando.slice(5, 7)}` : null,
    s.conta,
    s.favorecido,
  ].filter(Boolean)

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
        opacity: bloqueado ? 0.6 : 1,
        flexWrap: 'wrap',
      }}
    >
      <button
        type="button"
        onClick={aoAlternar}
        disabled={bloqueado}
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
          cursor: bloqueado ? 'not-allowed' : 'pointer',
        }}
      >
        {marcado && <Ico n="check" tamanho={11} />}
      </button>

      <span style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          className="font-sans"
          style={{
            fontSize: 12,
            color: 'var(--color-tinta)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={s.descricao}
        >
          {s.descricao}
        </span>
        {detalhes.length > 0 && (
          <span className="font-sans" style={{ fontSize: 10.5, color: 'rgba(242,237,227,.42)' }}>
            {detalhes.join(' · ')}
          </span>
        )}
      </span>

      <Num tamanho={12} tom={s.tipo === 'entrada' ? 'ok' : undefined}>
        {s.tipo === 'entrada' ? '+' : '−'}
        {brl(s.valor)}
      </Num>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 130 }}>
        <Etiqueta>
          {bloqueado ? 'Não classificável' : s.categoriaId ? 'Sugestão' : 'Sem sugestão'}
        </Etiqueta>
        <span className="font-sans" style={{ fontSize: 11.5, color: TINTA[tom] }}>
          {s.categoria ?? '—'}
          {s.categoriaId && s.origem === 'historico' && (
            <span style={{ color: 'rgba(242,237,227,.35)' }}>
              {' '}
              · {(s.confianca * 100).toFixed(0)}%
            </span>
          )}
        </span>
      </span>

      <span
        title={s.motivo}
        style={{ color: TINTA[tom], display: 'grid', placeItems: 'center', flex: 'none' }}
      >
        {bloqueado ? (
          <Ico n="cadeado" tamanho={14} />
        ) : s.exigeRevisao ? (
          <Ico n="alerta" tamanho={14} />
        ) : s.categoriaId ? (
          <Ico n="check-circulo" tamanho={14} />
        ) : null}
      </span>
    </div>
  )
}
