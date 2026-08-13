import { describe, expect, it } from 'vitest'

import {
  HORAS_SEM_ATUALIZACAO,
  ROTULO_LOGISTICO,
  ehOcorrencia,
  ehTerminal,
  paradoDemais,
  resumirEvento,
  situacaoLogistica,
  statusDoEvento,
} from '../logistica'

/**
 * As frases dos primeiros blocos são LITERAIS do banco — copiadas de
 * `rastreio_eventos`, com o espaço duplo e a pesquisa de satisfação que os
 * Correios anexam. Reescrevê-las para ficarem bonitas transformaria o teste
 * numa checagem do regex contra ele mesmo.
 */
describe('statusDoEvento — frases reais gravadas', () => {
  it('lê os Correios', () => {
    expect(statusDoEvento('Objeto postado')).toBe('postado')
    expect(statusDoEvento('Objeto em transferência - por favor aguarde')).toBe('em-transito')
    expect(
      statusDoEvento(
        'Objeto saiu para entrega ao destinatário - É preciso ter alguém no endereço para receber o carteiro',
      ),
    ).toBe('saiu-para-entrega')
    expect(
      statusDoEvento(
        'Objeto entregue ao destinatário - Queremos te ouvir! Responda a uma pesquisa rápida e nos ajude a melhorar a sua experiência: https://survey3.medallia.com/?correios-nps-sms-sro&obj=AD778124948BR',
      ),
    ).toBe('entregue')
  })

  it('lê a J&T, que escreve com prefixo de cidade', () => {
    expect(statusDoEvento('[Muriaé] [MRE -MG] Seu entregador  retirou a encomenda')).toBe(
      'saiu-para-entrega',
    )
  })

  it('não confunde "aguardando postagem pelo remetente" com devolução', () => {
    // A palavra "remetente" aparece nos dois extremos do ciclo: no objeto que
    // ainda não saiu e no que está voltando.
    expect(statusDoEvento('Etiqueta emitida - Aguardando postagem pelo remetente')).toBe('etiqueta')
  })
})

describe('statusDoEvento — o específico vence o genérico', () => {
  it('tentativa não vira "saiu para entrega" nem "entregue"', () => {
    expect(statusDoEvento('Tentativa de entrega não efetuada')).toBe('tentativa')
    expect(statusDoEvento('Não foi possível entregar - destinatário ausente')).toBe('tentativa')
  })

  it('devolução não vira entrega', () => {
    expect(statusDoEvento('Objeto devolvido ao remetente')).toBe('devolucao')
    expect(statusDoEvento('Entrega impossibilitada - objeto em devolução')).toBe('devolucao')
  })

  it('agência de trânsito não vira retirada', () => {
    expect(statusDoEvento('Objeto chegou na agência de destino')).toBe('em-transito')
    expect(statusDoEvento('Objeto aguardando retirada no endereço indicado')).toBe(
      'aguardando-retirada',
    )
  })

  it('devolve null para frase que ninguém mapeou', () => {
    // Chutar "em trânsito" aqui esconderia justamente o evento novo.
    expect(statusDoEvento('Bipagem de conferência interna XPTO')).toBeNull()
  })
})

describe('situacaoLogistica', () => {
  const agora = new Date('2026-08-13T12:00:00Z')

  it('sem código e sem evento é "sem rastreio"', () => {
    const s = situacaoLogistica({ rastreio: null }, agora)
    expect(s.status).toBe('sem-rastreio')
    expect(s.horasSemAtualizacao).toBeNull()
  })

  it('entrega confirmada fora da transportadora ainda é entrega', () => {
    // Motoboy e baixa manual não geram evento de transportadora nenhum.
    const s = situacaoLogistica({ rastreio: null, entregueEm: '2026-08-10T10:00:00Z' }, agora)
    expect(s.status).toBe('entregue')
  })

  it('usa o evento mais recente que soube traduzir', () => {
    const s = situacaoLogistica(
      {
        rastreio: 'AD123456789BR',
        eventos: [
          { quando: '2026-08-13T09:00:00Z', descricao: 'Bipagem interna sem significado' },
          { quando: '2026-08-12T08:00:00Z', descricao: 'Objeto saiu para entrega ao destinatário' },
          { quando: '2026-08-10T08:00:00Z', descricao: 'Objeto postado' },
        ],
      },
      agora,
    )
    // O evento intraduzível não pode fazer o pedido regredir.
    expect(s.status).toBe('saiu-para-entrega')
    // Mas as horas sem atualização contam do evento MAIS recente de todos.
    expect(s.horasSemAtualizacao).toBe(3)
  })

  it('conta as tentativas de entrega', () => {
    const s = situacaoLogistica(
      {
        rastreio: 'AD1BR',
        eventos: [
          { quando: '2026-08-12T08:00:00Z', descricao: 'Tentativa de entrega não efetuada' },
          { quando: '2026-08-11T08:00:00Z', descricao: 'Tentativa de entrega não efetuada' },
          { quando: '2026-08-10T08:00:00Z', descricao: 'Objeto postado' },
        ],
      },
      agora,
    )
    expect(s.tentativas).toBe(2)
    expect(s.status).toBe('tentativa')
  })

  it('código emitido sem evento reconhecido fica em "postado"', () => {
    const s = situacaoLogistica({ rastreio: 'TXAQ123tx', eventos: [] }, agora)
    expect(s.status).toBe('postado')
  })

  it('ordena por data, e não pela ordem em que os eventos chegaram', () => {
    const s = situacaoLogistica(
      {
        rastreio: 'AD1BR',
        eventos: [
          { quando: '2026-08-10T08:00:00Z', descricao: 'Objeto postado' },
          { quando: '2026-08-12T08:00:00Z', descricao: 'Objeto entregue ao destinatário' },
        ],
      },
      agora,
    )
    expect(s.status).toBe('entregue')
  })
})

describe('paradoDemais', () => {
  const agora = new Date('2026-08-13T12:00:00Z')

  it('objeto em trânsito parado há mais de 72 h é pendência', () => {
    const s = situacaoLogistica(
      {
        rastreio: 'AD1BR',
        eventos: [{ quando: '2026-08-09T08:00:00Z', descricao: 'Objeto em transferência' }],
      },
      agora,
    )
    expect(s.horasSemAtualizacao).toBeGreaterThanOrEqual(HORAS_SEM_ATUALIZACAO)
    expect(paradoDemais(s)).toBe(true)
  })

  it('entregue nunca é pendência, por mais antigo que seja', () => {
    const s = situacaoLogistica(
      {
        rastreio: 'AD1BR',
        eventos: [{ quando: '2026-05-01T08:00:00Z', descricao: 'Objeto entregue ao destinatário' }],
      },
      agora,
    )
    expect(paradoDemais(s)).toBe(false)
  })
})

describe('classificação', () => {
  it('terminal encerra a consulta recorrente', () => {
    expect(ehTerminal('entregue')).toBe(true)
    expect(ehTerminal('devolucao')).toBe(true)
    expect(ehTerminal('em-transito')).toBe(false)
  })

  it('ocorrência é o que não anda sozinho', () => {
    expect(ehOcorrencia('tentativa')).toBe(true)
    expect(ehOcorrencia('aguardando-retirada')).toBe(true)
    expect(ehOcorrencia('extraviado')).toBe(true)
    expect(ehOcorrencia('em-transito')).toBe(false)
    expect(ehOcorrencia('entregue')).toBe(false)
  })

  it('todo status tem rótulo em português', () => {
    for (const [chave, rotulo] of Object.entries(ROTULO_LOGISTICO)) {
      expect(rotulo, chave).toMatch(/\S/)
    }
  })
})

describe('resumirEvento', () => {
  it('corta a pesquisa de satisfação dos Correios', () => {
    expect(
      resumirEvento(
        'Objeto entregue ao destinatário - Queremos te ouvir! Responda a uma pesquisa rápida: https://survey3.medallia.com/?x=1',
      ),
    ).toBe('Objeto entregue ao destinatário')
  })

  it('tira o prefixo de cidade da J&T e o espaço duplo', () => {
    expect(resumirEvento('[Muriaé] [MRE -MG] Seu entregador  retirou a encomenda')).toBe(
      'Seu entregador retirou a encomenda',
    )
  })
})
