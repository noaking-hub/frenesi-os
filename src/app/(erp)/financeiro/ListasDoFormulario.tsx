'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'

import type { CategoriaGerencial, ContaFinanceira } from '@/domain'

/**
 * As listas que os diálogos de edição precisam — contas, categorias e centros
 * de custo — entregues UMA vez para a tela inteira.
 *
 * Antes cada linha da tabela recebia as três listas como propriedade do seu
 * botão de ações. Funcionava enquanto a tela tinha poucas centenas de linhas;
 * com 1.166 lançamentos virou 1.166 cópias de 31 objetos no payload que o
 * servidor manda para o navegador, e a função de renderização passou a
 * estourar antes de responder — a tela caía com "This page couldn't load".
 *
 * O erro não era o volume de lançamentos: era mandar o mesmo dado uma vez por
 * linha. Aqui ele atravessa a fronteira servidor→cliente uma vez só, e cada
 * botão lê do contexto. O custo passa a não depender do número de linhas.
 */
export interface ListasDeEdicao {
  contas?: ContaFinanceira[]
  categorias?: CategoriaGerencial[]
  centros?: { id: string; nome: string }[]
}

const Listas = createContext<ListasDeEdicao>({})

export function ProvedorDeListas({
  children,
  contas,
  categorias,
  centros,
}: ListasDeEdicao & { children: ReactNode }) {
  // `value={{contas, categorias, centros}}` cru é objeto novo a cada render, e
  // identidade nova de contexto re-renderiza TODO consumidor — aqui, o botão de
  // ações de cada uma das 50 linhas da página, mesmo quando as listas não
  // mudaram um item. Com o `useMemo` o custo volta a depender das listas, que é
  // o que este provedor foi criado para garantir.
  const listas = useMemo(
    () => ({ contas, categorias, centros }),
    [contas, categorias, centros],
  )
  return <Listas.Provider value={listas}>{children}</Listas.Provider>
}

/** Vazio fora do provedor — e aí o lápis some, em vez de abrir combos vazios. */
export function useListasDeEdicao(): ListasDeEdicao {
  return useContext(Listas)
}
