import { afterEach, describe, expect, it, vi } from 'vitest'

import { hojeEmSaoPaulo } from '../extrato'

/**
 * O ERP responde pelo calendário de São Paulo, não pelo do servidor.
 *
 * A Netlify roda em UTC. Das 21h à meia-noite, todo dia, `toISOString()`
 * devolve o dia SEGUINTE — e foi assim que às 21h34 de 16/08 o Dashboard
 * abriu escrito "Hoje · 17/08", com faturamento zerado e queda de 100%
 * contra ontem: o dia que ele mostrava ainda não tinha começado.
 */
describe('o dia de hoje é o de São Paulo', () => {
  afterEach(() => vi.useRealTimers())

  function congelar(instante: string) {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(instante))
  }

  it('21h34 de 16/08 em Brasília ainda é dia 16, mesmo já sendo 17 em UTC', () => {
    // 2026-08-17T00:34:00Z é 2026-08-16T21:34 em São Paulo (UTC-3).
    congelar('2026-08-17T00:34:00Z')
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-08-17')
    expect(hojeEmSaoPaulo()).toBe('2026-08-16')
  })

  it('a virada acontece à meia-noite de Brasília, não à de Greenwich', () => {
    congelar('2026-08-17T02:59:00Z') // 23h59 do dia 16 em São Paulo
    expect(hojeEmSaoPaulo()).toBe('2026-08-16')

    congelar('2026-08-17T03:01:00Z') // 00h01 do dia 17 em São Paulo
    expect(hojeEmSaoPaulo()).toBe('2026-08-17')
  })

  it('durante o dia os dois coincidem — o defeito só aparecia à noite', () => {
    congelar('2026-08-16T15:00:00Z') // meio-dia em São Paulo
    expect(hojeEmSaoPaulo()).toBe(new Date().toISOString().slice(0, 10))
  })

  it('devolve sempre AAAA-MM-DD, que é o formato que o Postgres espera', () => {
    congelar('2026-01-05T12:00:00Z')
    expect(hojeEmSaoPaulo()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(hojeEmSaoPaulo()).toBe('2026-01-05')
  })
})
