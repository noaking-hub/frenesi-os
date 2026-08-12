import { describe, expect, it } from 'vitest'

import { dataDaTransportadora, idDoEvento, ocorrenciaDeEntrega, ordenarEventos } from '..'
import type { EventoTransportadora } from '..'

describe('ocorrência de entrega', () => {
  it('reconhece as formas em que a transportadora diz "entregue"', () => {
    expect(ocorrenciaDeEntrega('Objeto entregue ao destinatário')).toBe(true)
    expect(ocorrenciaDeEntrega('ENTREGA REALIZADA')).toBe(true)
    expect(ocorrenciaDeEntrega('Delivered')).toBe(true)
  })

  it('não confunde tentativa e devolução com entrega', () => {
    expect(ocorrenciaDeEntrega('Entrega não efetuada')).toBe(false)
    expect(ocorrenciaDeEntrega('Tentativa de entrega não realizada')).toBe(false)
    expect(ocorrenciaDeEntrega('Objeto devolvido ao remetente')).toBe(false)
    expect(ocorrenciaDeEntrega('Aguardando retirada no local')).toBe(false)
    expect(ocorrenciaDeEntrega('Objeto em trânsito')).toBe(false)
  })
})

describe('identidade do evento', () => {
  it('a mesma ocorrência lida duas vezes tem a mesma identidade', () => {
    const a = idDoEvento('ad743103236br', '2026-08-11T14:55:00.000Z', 'Objeto em trânsito', 'Curitiba · PR')
    const b = idDoEvento('AD743103236BR', '2026-08-11T14:55:00.000Z', 'objeto  em trânsito', 'curitiba · pr')
    expect(a).toBe(b)
  })

  it('o mesmo texto em cidades diferentes são eventos diferentes', () => {
    const curitiba = idDoEvento('AD1', null, 'Objeto em trânsito', 'Curitiba · PR')
    const sp = idDoEvento('AD1', null, 'Objeto em trânsito', 'São Paulo · SP')
    expect(curitiba).not.toBe(sp)
  })
})

describe('ordenação da linha do tempo', () => {
  const evento = (over: Partial<EventoTransportadora>): EventoTransportadora => ({
    id: 'x',
    codigo: 'AD743103236BR',
    quando: '2026-08-10T12:00:00.000Z',
    descricao: 'Objeto postado',
    local: null,
    origem: 'frenet',
    entregue: false,
    ...over,
  })

  it('mais recente primeiro, sem repetir o que já entrou', () => {
    const lista = ordenarEventos([
      evento({ id: 'a', quando: '2026-08-10T12:00:00.000Z' }),
      evento({ id: 'c', quando: '2026-08-12T09:00:00.000Z' }),
      evento({ id: 'a', quando: '2026-08-10T12:00:00.000Z' }),
      evento({ id: 'b', quando: '2026-08-11T18:00:00.000Z' }),
    ])
    expect(lista.map((e) => e.id)).toEqual(['c', 'b', 'a'])
  })

  it('evento sem data vai para o fim, não para o topo', () => {
    const lista = ordenarEventos([
      evento({ id: 'sem-data', quando: null }),
      evento({ id: 'com-data', quando: '2026-08-01T10:00:00.000Z' }),
    ])
    expect(lista.map((e) => e.id)).toEqual(['com-data', 'sem-data'])
  })
})

describe('data da transportadora', () => {
  it('data sem fuso é horário de Brasília, não UTC', () => {
    // Ler como UTC jogaria a ocorrência 3 h para a frente — e um evento no
    // futuro aparece para o cliente como algo que ainda vai acontecer.
    expect(dataDaTransportadora('2026-08-11 14:55:00')).toBe('2026-08-11T17:55:00.000Z')
    expect(dataDaTransportadora('2026-08-11T14:55:00')).toBe('2026-08-11T17:55:00.000Z')
  })

  it('data com fuso é respeitada como veio', () => {
    expect(dataDaTransportadora('2026-08-11T17:55:00Z')).toBe('2026-08-11T17:55:00.000Z')
    expect(dataDaTransportadora('2026-08-11T14:55:00-03:00')).toBe('2026-08-11T17:55:00.000Z')
  })

  it('vazio ou lixo não vira data inventada', () => {
    expect(dataDaTransportadora(null)).toBeNull()
    expect(dataDaTransportadora('')).toBeNull()
    expect(dataDaTransportadora('sem data')).toBeNull()
  })
})
