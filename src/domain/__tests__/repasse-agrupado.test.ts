import { describe, expect, it } from 'vitest'

import { parcelasQueFechamODeposito, type ParcelaAberta } from '../repasse-agrupado'

const parcela = (
  checkoutId: string,
  previstaPara: string,
  liquido: number,
  numero = 1,
): ParcelaAberta => ({ checkoutId, numero, previstaPara, liquido })

describe('depósito agrupado da Pagaleve', () => {
  // O caso real de 18/08: o depósito de R$163,26 somava as três parcelas do
  // dia (31,67 + 16,16 + 12,41) e DUAS previstas para o dia seguinte,
  // adiantadas (31,89 + 71,13) — entre seis candidatas de 19/08.
  const abertas = [
    parcela('a', '2026-08-18', 31.67),
    parcela('b', '2026-08-18', 16.16),
    parcela('c', '2026-08-18', 12.41),
    parcela('d', '2026-08-19', 14.43),
    parcela('e', '2026-08-19', 28.65),
    parcela('f', '2026-08-19', 31.89),
    parcela('g', '2026-08-19', 48.34),
    parcela('h', '2026-08-19', 52.79),
    parcela('i', '2026-08-19', 71.13),
    parcela('j', '2026-08-20', 62.61),
  ]

  it('fecha o caso real de 18/08 no centavo, cruzando dias', () => {
    const r = parcelasQueFechamODeposito(163.26, '2026-08-18', abertas)
    expect(r).not.toBeNull()
    expect(r!.reduce((s, p) => s + Math.round(p.liquido * 100), 0)).toBe(16326)
    // As três do dia entram — o depósito paga primeiro o que venceu.
    const ids = r!.map((p) => p.checkoutId)
    expect(ids).toContain('a')
    expect(ids).toContain('b')
    expect(ids).toContain('c')
  })

  it('sem subconjunto exato, devolve null — chutar é pior que esperar', () => {
    expect(parcelasQueFechamODeposito(163.27, '2026-08-18', abertas)).toBeNull()
    expect(parcelasQueFechamODeposito(1.0, '2026-08-18', abertas)).toBeNull()
  })

  it('parcela fora da janela não participa', () => {
    const r = parcelasQueFechamODeposito(62.61, '2026-08-01', [parcela('j', '2026-08-20', 62.61)])
    expect(r).toBeNull()
    const dentro = parcelasQueFechamODeposito(62.61, '2026-08-19', [parcela('j', '2026-08-20', 62.61)])
    expect(dentro?.map((p) => p.checkoutId)).toEqual(['j'])
  })

  it('valor que casa uma única parcela do mesmo dia continua casando', () => {
    const r = parcelasQueFechamODeposito(28.65, '2026-08-19', abertas)
    expect(r?.map((p) => p.checkoutId)).toEqual(['e'])
  })
})
