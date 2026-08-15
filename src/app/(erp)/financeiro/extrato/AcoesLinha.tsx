'use client'

import { useState, useTransition } from 'react'

import { TINTA } from '@/components/erp/ui'

import { classificarLinha, ignorarLinha } from './actions'

/**
 * Classificar e Ignorar de uma linha da fila.
 *
 * O seletor de categoria mora na coluna "Categoria / Sugestão" e este
 * formulário na coluna "Ações" — colunas diferentes da mesma grade. O
 * atributo `form` do HTML liga o `<select>` de lá a este `<form>` sem
 * precisar de estado compartilhado: o FormData chega com a categoria
 * escolhida, sugestão incluída, do jeito que o navegador já sabe fazer.
 */
export function AcoesLinha({
  origem,
  chave,
  descricao,
  tipo,
  formId,
}: {
  origem: string
  chave: string
  descricao: string
  tipo: 'entrada' | 'saida'
  formId: string
}) {
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function classificar(fd: FormData) {
    const categoria = String(fd.get('categoria') ?? '')
    // Saída sem categoria não vira lançamento útil: sem esta trava o clique
    // gravaria um lançamento que o DRE não sabe onde pôr.
    if (tipo === 'saida' && !categoria) {
      setErro('Escolha a categoria.')
      return
    }
    setErro(null)
    iniciar(async () => {
      const r = await classificarLinha(origem, chave, categoria, '')
      if (!r.ok) setErro(r.erro)
    })
  }

  function ignorar() {
    const motivo = window.prompt(
      `Por que "${descricao}" não vira lançamento?\n(transferência entre contas próprias, aporte, estorno que se anula…)`,
    )
    if (!motivo) return
    setErro(null)
    iniciar(async () => {
      const r = await ignorarLinha(origem, chave, motivo)
      if (!r.ok) setErro(r.erro)
    })
  }

  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
      <form id={formId} action={classificar} style={{ display: 'flex', gap: 6, margin: 0 }}>
        <button
          type="submit"
          disabled={pendente}
          className="botao-ouro font-sans hover:brightness-[1.07]"
          style={{
            height: 27,
            padding: '0 11px',
            border: 0,
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1,
            whiteSpace: 'nowrap',
            cursor: pendente ? 'not-allowed' : 'pointer',
            opacity: pendente ? 0.55 : 1,
          }}
        >
          {pendente ? 'Gravando…' : tipo === 'entrada' ? 'Aceitar' : 'Classificar'}
        </button>
        <button
          type="button"
          onClick={ignorar}
          disabled={pendente}
          className="font-sans hover:border-ouro/40 hover:text-ouro"
          style={{
            height: 27,
            padding: '0 11px',
            border: '1px solid rgba(255,255,255,.09)',
            background: 'rgba(255,255,255,.025)',
            borderRadius: 8,
            color: 'var(--color-secundario)',
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1,
            whiteSpace: 'nowrap',
            cursor: pendente ? 'not-allowed' : 'pointer',
            opacity: pendente ? 0.55 : 1,
          }}
        >
          Ignorar
        </button>
      </form>
      {erro && (
        <span className="font-sans" style={{ fontSize: 9.5, lineHeight: 1.4, color: TINTA.erro }}>
          {erro}
        </span>
      )}
    </span>
  )
}
