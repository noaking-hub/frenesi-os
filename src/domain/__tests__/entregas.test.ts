import { describe, expect, it } from 'vitest'

import {
  acoesDisponiveis,
  aferirItem,
  aguardaBaixaShopify,
  diasAlemDoPrazo,
  ehExcecao,
  emAberto,
  etapaDe,
  identificarFrete,
  resumirEnvios,
  resumirOcorrencias,
  triarDevolucao,
} from '..'
import type { Envio, Ocorrencia } from '..'

const envio = (p: Partial<Envio>): Envio => ({
  pedidoId: '#1',
  cliente: 'Cliente',
  destino: 'São Paulo · SP',
  transportadora: 'Correios · PAC',
  gateway: 'Melhor Envio',
  rastreio: 'OS1',
  status: 'em-transito',
  ultimoEvento: 'Objeto em trânsito',
  eventoQuando: 'hoje',
  shopify: 'em-transito',
  eventos: [],
  ...p,
})

describe('identificação da transportadora', () => {
  it('o serviço da Yampi nomeia a transportadora quando é legível', () => {
    expect(identificarFrete('FRENET_SEDEX_03220', 'AD754669044BR')).toEqual({
      transportadora: 'Correios',
      gateway: 'Frenet',
    })
    expect(identificarFrete('FRENET_JADLOG_PACKAGE_F_3', '614554609')).toEqual({
      transportadora: 'Jadlog',
      gateway: 'Frenet',
    })
  })

  it('rótulo opaco do Melhor Envio não vira nome de transportadora', () => {
    // A tela chegou a oferecer "Rastrear na ME_STANDARD_33 →" — o código do
    // serviço exibido como se fosse uma empresa. O formato do código resolve.
    expect(identificarFrete('ME_STANDARD_33', '888030874765341')).toEqual({
      transportadora: 'J&T Express',
      gateway: 'Melhor Envio',
    })
    expect(identificarFrete('ME_STANDARD_35', 'TXAQ501445605tx')).toEqual({
      transportadora: 'Não informada',
      gateway: 'Melhor Envio',
    })
  })

  it('sem serviço nenhum, o código ainda entrega a transportadora', () => {
    // Metade da base é anterior ao ERP e veio sem `shipment_service`.
    expect(identificarFrete(null, 'AP331906566BR').transportadora).toBe('Correios')
    expect(identificarFrete(null, '602350827').transportadora).toBe('Jadlog')
    expect(identificarFrete(null, null).transportadora).toBe('Não informada')
  })
})

describe('rastreamento e baixa na Shopify', () => {
  it('marca para baixa o que a Yampi entregou e a Shopify não sabe', () => {
    expect(aguardaBaixaShopify(envio({ status: 'entregue', shopify: 'aguardando-baixa' }))).toBe(true)
  })

  it('não pede baixa de pedido já baixado', () => {
    expect(aguardaBaixaShopify(envio({ status: 'entregue', shopify: 'entregue' }))).toBe(false)
  })

  it('não pede baixa antes da entrega', () => {
    expect(aguardaBaixaShopify(envio({ status: 'em-transito', shopify: 'em-transito' }))).toBe(false)
  })

  it('trata sem movimentação e entrega falha como exceção', () => {
    expect(ehExcecao(envio({ status: 'sem-movimentacao' }))).toBe(true)
    expect(ehExcecao(envio({ status: 'entrega-nao-efetuada' }))).toBe(true)
    expect(ehExcecao(envio({ status: 'aguardando-postagem' }))).toBe(false)
  })

  it('resume a fila de baixa junto com os demais estados', () => {
    const r = resumirEnvios([
      envio({ pedidoId: '#1', status: 'entregue', shopify: 'aguardando-baixa' }),
      envio({ pedidoId: '#2', status: 'entregue', shopify: 'entregue' }),
      envio({ pedidoId: '#3', status: 'em-transito' }),
      envio({ pedidoId: '#4', status: 'sem-movimentacao' }),
    ])
    expect(r.entregues).toBe(2)
    expect(r.baixados).toBe(1)
    expect(r.aguardandoBaixa).toBe(1)
    expect(r.emTransito).toBe(1)
    expect(r.excecoes).toBe(1)
  })
})

describe('ocorrências de entrega', () => {
  const oc = (p: Partial<Ocorrencia>): Ocorrencia => ({
    id: 'OE-1',
    pedidoId: '#1',
    cliente: 'Cliente',
    destino: 'São Paulo · SP',
    transportadora: 'Correios',
    gateway: 'Frenet',
    rastreio: 'X1',
    tipo: 'atraso',
    dias: 3,
    prazo: 0,
    abertura: 'hoje',
    estado: 'aberta',
    acao: 'Cobrar prazo',
    valor: 100,
    ...p,
  })

  it('conta dias além do prazo só quando estourou', () => {
    expect(diasAlemDoPrazo(oc({ prazo: -3 }))).toBe(3)
    expect(diasAlemDoPrazo(oc({ prazo: 0 }))).toBe(0)
    expect(diasAlemDoPrazo(oc({ prazo: 2 }))).toBe(0)
  })

  it('soma valor parado só das ocorrências abertas', () => {
    const r = resumirOcorrencias([
      oc({ id: 'A', valor: 500, estado: 'aberta', prazo: -3 }),
      oc({ id: 'B', valor: 200, estado: 'aguardando-cliente', prazo: 0 }),
      oc({ id: 'C', valor: 900, estado: 'resolvida', prazo: -1 }),
    ])
    expect(r.abertas).toBe(2)
    expect(r.valorParado).toBe(700)
    expect(r.aguardandoCliente).toBe(1)
    // Resolvida ainda conta como atrasada no histórico, mas não segura dinheiro.
    expect(r.atrasadas).toBe(2)
    expect(r.mediaAtraso).toBe(2)
  })
})

describe('triagem de devolução', () => {
  it('aceita até 10% abaixo do volume fracionado', () => {
    const item = aferirItem('Erba Pura', 5, 4.5)
    expect(item.minimoMl).toBeCloseTo(4.5, 5)
    expect(item.dentroDaTolerancia).toBe(true)
    expect(item.pct).toBe(90)
  })

  it('recusa abaixo do mínimo', () => {
    const item = aferirItem('Oud Wood', 5, 3.9)
    expect(item.dentroDaTolerancia).toBe(false)
    expect(item.faltaMl).toBeCloseTo(1.1, 5)
    expect(item.pct).toBe(78)
  })

  it('bloqueia arrependimento com produto usado', () => {
    const t = triarDevolucao([aferirItem('Oud Wood', 5, 3.9)], 'Arrependimento', 'violado')
    expect(t.usado).toBe(true)
    expect(t.bloqueado).toBe(true)
    expect(t.severidade).toBe('erro')
    expect(t.mensagem).toContain('não é aceito')
  })

  it('não bloqueia defeito com volume baixo — a perda é esperada', () => {
    const t = triarDevolucao([aferirItem('Delina', 5, 1.2)], 'Defeito', 'rompido-no-transporte')
    expect(t.usado).toBe(true)
    expect(t.bloqueado).toBe(false)
    expect(t.severidade).toBe('atencao')
    expect(t.mensagem).toContain('perda é esperada')
  })

  it('aprova quando tudo está dentro da tolerância', () => {
    const t = triarDevolucao(
      [aferirItem('Erba Pura', 5, 5), aferirItem('Sauvage Elixir', 8, 7.6)],
      'Arrependimento',
      'intacto',
    )
    expect(t.usado).toBe(false)
    expect(t.bloqueado).toBe(false)
    expect(t.severidade).toBe('ok')
    expect(t.mensagem).toContain('lacre está intacto')
  })

  it('destaca o item que mais se afastou do fracionado', () => {
    const t = triarDevolucao(
      [aferirItem('Baccarat', 5, 4.9), aferirItem('Delina', 5, 1.2), aferirItem('Aventus', 5, 4.8)],
      'Defeito',
      'rompido-no-transporte',
    )
    expect(t.pior?.perfume).toBe('Delina')
    expect(t.mensagem).toContain('Delina')
  })
})

describe('ciclo de vida da devolução', () => {
  it('libera aprovar e recusar só enquanto está em análise', () => {
    expect(acoesDisponiveis('Nova', false).emAnalise).toBe(true)
    expect(acoesDisponiveis('Aguardando fotos', false).emAnalise).toBe(true)
    expect(acoesDisponiveis('Aprovada', false).emAnalise).toBe(false)
  })

  it('só gera reverso depois de aprovada e enquanto não existir código', () => {
    expect(acoesDisponiveis('Aprovada', false).podeGerarReverso).toBe(true)
    expect(acoesDisponiveis('Aprovada', true).podeGerarReverso).toBe(false)
    expect(acoesDisponiveis('Nova', false).podeGerarReverso).toBe(false)
  })

  it('só conclui depois de receber', () => {
    expect(acoesDisponiveis('Recebida', true).podeConcluir).toBe(true)
    expect(acoesDisponiveis('Em trânsito reverso', true).podeConcluir).toBe(false)
  })

  it('avança a etapa do fluxo conforme o status', () => {
    expect(etapaDe('Nova')).toBe(0)
    expect(etapaDe('Em análise')).toBe(1)
    expect(etapaDe('Aprovada')).toBe(2)
    expect(etapaDe('Recebida')).toBe(3)
    expect(etapaDe('Concluída')).toBe(4)
    // Recusada encerra na análise, não avança para o reverso.
    expect(etapaDe('Recusada')).toBe(1)
  })

  it('tira do "em aberto" só o que foi concluído ou recusado', () => {
    expect(emAberto('Nova')).toBe(true)
    expect(emAberto('Em trânsito reverso')).toBe(true)
    expect(emAberto('Concluída')).toBe(false)
    expect(emAberto('Recusada')).toBe(false)
  })
})
