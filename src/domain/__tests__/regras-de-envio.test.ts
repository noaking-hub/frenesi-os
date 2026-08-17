import { describe, expect, it } from 'vitest'

import { problemasDaRegra, toqueDevido, type RegraDeEnvio } from '../regras-de-envio'

const carrinho = (over: Partial<RegraDeEnvio> = {}): RegraDeEnvio => ({
  campanha: 'carrinho',
  nome: 'Recuperação de carrinho',
  ligada: false,
  yampiTambemEnvia: true,
  observacao: null,
  atualizadaEm: null,
  atualizadaPor: null,
  toques: [
    { horas: 4, cupom: false },
    { horas: 24, cupom: false },
    { horas: 72, cupom: true },
  ],
  janelaMaxDias: 7,
  cupomPct: 10,
  cupomValidadeDias: 7,
  ...over,
})

describe('validação das regras', () => {
  it('aceita a cadência combinada com o dono: 4h, 24h e 72h com cupom', () => {
    expect(problemasDaRegra(carrinho())).toEqual([])
  })

  it('recusa toque fora de ordem', () => {
    // Sem esta conferência o "última chance" sairia antes do "esqueceu algo?".
    const r = carrinho({ toques: [{ horas: 24, cupom: false }, { horas: 4, cupom: true }] })
    expect(problemasDaRegra(r).some((e) => e.includes('DEPOIS'))).toBe(true)
  })

  it('recusa toque que cai fora da janela de busca', () => {
    // A regra prometeria um e-mail que a busca de carrinhos nunca alcança, e o
    // operador ficaria esperando um envio que não sai.
    const r = carrinho({ toques: [{ horas: 4, cupom: false }, { horas: 300, cupom: true }], janelaMaxDias: 7 })
    expect(problemasDaRegra(r).some((e) => e.includes('fora da janela'))).toBe(true)
  })

  it('junta TODOS os problemas, não só o primeiro', () => {
    // Corrigir um campo e descobrir o próximo no clique seguinte é o formulário
    // fazendo o operador de bobo.
    const r = carrinho({ toques: [{ horas: 0, cupom: false }], cupomPct: 200 })
    expect(problemasDaRegra(r).length).toBeGreaterThan(1)
  })

  it('cashback recusa antecedências repetidas', () => {
    const r: RegraDeEnvio = {
      campanha: 'cashback', nome: 'Cashback', ligada: false, yampiTambemEnvia: true,
      observacao: null, atualizadaEm: null, atualizadaPor: null, diasAntes: [15, 15],
    }
    expect(problemasDaRegra(r).some((e) => e.includes('repetidas'))).toBe(true)
  })

  it('aniversário aceita 0 = no dia, com 30 dias de validade', () => {
    const r: RegraDeEnvio = {
      campanha: 'aniversario', nome: 'Aniversário', ligada: false, yampiTambemEnvia: false,
      observacao: null, atualizadaEm: null, atualizadaPor: null,
      diasAntes: 0, cupomPct: 15, cupomValidadeDias: 30,
    }
    expect(problemasDaRegra(r)).toEqual([])
  })
})

describe('qual toque este carrinho merece', () => {
  const r = carrinho()

  it('não toca antes da hora', () => {
    expect(toqueDevido(r, 2, 0)).toBeNull()
  })

  it('manda o primeiro depois de 4h', () => {
    expect(toqueDevido(r, 4, 0)).toBe(0)
    expect(toqueDevido(r, 20, 0)).toBe(0)
  })

  it('pula para o toque da IDADE do carrinho, não para o próximo da fila', () => {
    // Um carrinho parado três dias porque a rotina estava desligada deve
    // receber o toque certo para a idade dele. Mandar o "esqueceu algo?" de 4h
    // três dias depois é o sistema anunciando que estava dormindo.
    expect(toqueDevido(r, 80, 0)).toBe(2)
  })

  it('para quando todos os toques já saíram', () => {
    expect(toqueDevido(r, 500, 3)).toBeNull()
  })

  it('respeita o que já foi enviado', () => {
    expect(toqueDevido(r, 30, 1)).toBe(1)
    expect(toqueDevido(r, 30, 2)).toBeNull()
  })
})
