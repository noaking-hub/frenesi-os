'use client'

import { createContext, useContext, type ReactNode } from 'react'

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
  ...listas
}: ListasDeEdicao & { children: ReactNode }) {
  return <Listas.Provider value={listas}>{children}</Listas.Provider>
}

/** Vazio fora do provedor — e aí o lápis some, em vez de abrir combos vazios. */
export function useListasDeEdicao(): ListasDeEdicao {
  return useContext(Listas)
}
