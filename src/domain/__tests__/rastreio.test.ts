import { describe, expect, it } from 'vitest'

import {
  dataDaTransportadora,
  idDoEvento,
  ocorrenciaDeEntrega,
  ordenarEventos,
  servicoFrenetDe,
  servicosPeloFormato,
} from '..'
import type { EventoTransportadora } from '..'

/** Os serviços que a conta da Frenet devolve em `GET /shipping/info`. */
const SERVICOS = ['JTE_INT', '03220', '03298', 'F_3']

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

  it('lê o dd/MM/yyyy dos Correios, que convive com o ISO da J&T', () => {
    // A Frenet devolve os dois formatos na mesma conta, sem avisar qual vem.
    // Lido como ISO, `12/08/2026 09:56` dá data inválida — e o evento entraria
    // sem data, no fim da lista, como se fosse o registro mais pobre.
    expect(dataDaTransportadora('12/08/2026 09:56')).toBe('2026-08-12T12:56:00.000Z')
    expect(dataDaTransportadora('06/08/2026 09:47:31')).toBe('2026-08-06T12:47:31.000Z')
    expect(dataDaTransportadora('06/08/2026')).toBe('2026-08-06T03:00:00.000Z')
  })

  it('vazio ou lixo não vira data inventada', () => {
    expect(dataDaTransportadora(null)).toBeNull()
    expect(dataDaTransportadora('')).toBeNull()
    expect(dataDaTransportadora('sem data')).toBeNull()
  })
})

describe('serviço da Frenet a partir do rótulo da Yampi', () => {
  it('extrai o código do rótulo, que é o que a consulta exige', () => {
    expect(servicoFrenetDe('FRENET_SEDEX_03220', SERVICOS)).toBe('03220')
    expect(servicoFrenetDe('FRENET_PAC_03298', SERVICOS)).toBe('03298')
    expect(servicoFrenetDe('FRENET_JADLOG_PACKAGE_F_3', SERVICOS)).toBe('F_3')
  })

  it('rótulo de outro emissor não vira serviço da Frenet', () => {
    // Mandar o rótulo inteiro era o bug: a Frenet respondia 200 com
    // ErrorMessage e zero ocorrências, igualzinho a "ainda não escaneado".
    expect(servicoFrenetDe('ME_STANDARD_35', SERVICOS)).toBeNull()
    expect(servicoFrenetDe(null, SERVICOS)).toBeNull()
    expect(servicoFrenetDe('FRENET_SEDEX_03220', [])).toBeNull()
  })
})

describe('serviço pelo formato do código', () => {
  it('reconhece Correios, Jadlog e J&T pelo desenho do código', () => {
    expect(servicosPeloFormato('AD754669044BR')).toEqual(['03220', '03298'])
    expect(servicosPeloFormato('614554609')).toEqual(['F_3'])
    expect(servicosPeloFormato('888030860328538')).toEqual(['JTE_INT'])
  })

  it('código que não se parece com nenhum não recebe palpite', () => {
    // Metade dos pedidos veio antes do ERP, sem serviço gravado — chutar um
    // serviço qualquer gastaria consulta e ainda gravaria histórico de outro.
    expect(servicosPeloFormato('TXAQ485921993tx')).toEqual([])
    expect(servicosPeloFormato('')).toEqual([])
    expect(servicosPeloFormato(null)).toEqual([])
  })
})
