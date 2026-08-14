import { describe, expect, it } from 'vitest'

import { PRAZO_EXPEDICAO_DIAS, acoesDisponiveis, aferirItem, aguardaBaixaShopify, diasAlemDoPrazo, ehEntregaLocal, ehExcecao, emAberto, etapaDe, identificarFrete, resumirEnvios, resumirOcorrencias, servicoLegivel, situacaoDoPedido, slaDeEntrega, slaDeExpedicao, triarDevolucao } from '..'
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

describe('SLA de entrega — o prazo da transportadora, depois do despacho', () => {
  const agora = new Date('2026-08-13T12:00:00Z')

  it('conta da postagem usando os dias cotados', () => {
    // Postado dia 10 com prazo de 5 dias: entrega até 15/08.
    const s = slaDeEntrega(
      { situacao: 'enviado', entregueEm: null, postadoEm: '2026-08-10T08:00:00Z', prazoDias: 5 },
      agora,
    )
    expect(s.estado).toBe('no-prazo')
    expect(s.rotulo).toBe('Entrega até 15/08')
  })

  it('vence hoje e atrasa em dias inteiros', () => {
    expect(
      slaDeEntrega(
        { situacao: 'enviado', entregueEm: null, postadoEm: '2026-08-10T08:00:00Z', prazoDias: 3 },
        agora,
      ).estado,
    ).toBe('vence-hoje')
    const atrasado = slaDeEntrega(
      { situacao: 'enviado', entregueEm: null, postadoEm: '2026-08-05T08:00:00Z', prazoDias: 5 },
      agora,
    )
    expect(atrasado.estado).toBe('atrasado')
    expect(atrasado.rotulo).toBe('Entrega atrasada · 3 dias')
  })

  it('sem postagem ou sem prazo cotado, a resposta é "sem previsão" — nunca uma data inventada', () => {
    expect(
      slaDeEntrega({ situacao: 'enviado', entregueEm: null, postadoEm: null, prazoDias: 5 }, agora)
        .estado,
    ).toBe('sem-previsao')
    expect(
      slaDeEntrega(
        { situacao: 'enviado', entregueEm: null, postadoEm: '2026-08-10T08:00:00Z', prazoDias: null },
        agora,
      ).estado,
    ).toBe('sem-previsao')
  })

  it('a promessa do checkout tem precedência sobre a cotação', () => {
    // Promessa 19/08 vence prazo cotado que daria 15/08: o cliente cobra pela
    // data que viu ao comprar, e é por ela que a régua responde.
    const s = slaDeEntrega(
      {
        situacao: 'enviado',
        entregueEm: null,
        postadoEm: '2026-08-10T08:00:00Z',
        prazoDias: 5,
        prometidoEm: '2026-08-19T03:00:00Z',
      },
      agora,
    )
    expect(s.estado).toBe('no-prazo')
    expect(s.rotulo).toBe('Entrega até 19/08')
  })

  it('a promessa vale mesmo sem postagem, e atrasa quando o dia passa', () => {
    expect(
      slaDeEntrega(
        { situacao: 'enviado', entregueEm: null, postadoEm: null, prazoDias: null, prometidoEm: '2026-08-19T03:00:00Z' },
        agora,
      ).estado,
    ).toBe('no-prazo')
    const atrasada = slaDeEntrega(
      { situacao: 'enviado', entregueEm: null, postadoEm: null, prazoDias: null, prometidoEm: '2026-08-11T03:00:00Z' },
      agora,
    )
    expect(atrasada.estado).toBe('atrasado')
    expect(atrasada.rotulo).toBe('Entrega atrasada · 2 dias')
  })

  it('promessa fora do formato ISO é ignorada — cai na cotação, nunca em data errada', () => {
    // `new Date('19/08/2026')` inventaria um mês: só ISO entra na conta.
    const s = slaDeEntrega(
      {
        situacao: 'enviado',
        entregueEm: null,
        postadoEm: '2026-08-10T08:00:00Z',
        prazoDias: 5,
        prometidoEm: '19/08/2026',
      },
      agora,
    )
    expect(s.rotulo).toBe('Entrega até 15/08')
  })

  it('entregue encerra a régua', () => {
    expect(
      slaDeEntrega(
        { situacao: 'entregue', entregueEm: '2026-08-12T10:00:00Z', postadoEm: '2026-08-10T08:00:00Z', prazoDias: 5 },
        agora,
      ).estado,
    ).toBe('entregue')
  })
})

describe('serviço legível', () => {
  it('traduz os códigos de máquina para gente', () => {
    expect(servicoLegivel('FRENET_PAC_03298')).toBe('Frenet · PAC')
    expect(servicoLegivel('ME_STANDARD_35')).toBe('Melhor Envio · Standard')
    expect(servicoLegivel('ME_EXPRESS_31')).toBe('Melhor Envio · Express')
    expect(servicoLegivel('MOTOBOY')).toBe('Motoboy')
    expect(servicoLegivel(null)).toBeNull()
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

describe('situação do pedido', () => {
  const base = {
    statusYampi: 'paid Pago',
    pagamento: 'pago' as const,
    entregue: false,
    rastreio: null,
  }

  it('lê os quatro momentos que a operação realmente tem', () => {
    expect(situacaoDoPedido(base)).toBe('pago')
    expect(situacaoDoPedido({ ...base, statusYampi: 'invoiced Faturado' })).toBe('faturado')
    expect(situacaoDoPedido({ ...base, statusYampi: 'shipped Enviado' })).toBe('enviado')
    expect(situacaoDoPedido({ ...base, entregue: true })).toBe('entregue')
  })

  it('código de rastreio já vale como enviado', () => {
    // A Yampi às vezes emite o código antes de mexer no status.
    expect(situacaoDoPedido({ ...base, rastreio: 'AD1BR' })).toBe('enviado')
  })

  it('cancelado interrompe, venha o que vier no status', () => {
    expect(situacaoDoPedido({ ...base, pagamento: 'cancelado', entregue: true })).toBe('cancelado')
  })

  it('em produção sobrevive à importação seguinte', () => {
    // É o único momento que a Yampi não conhece. Derivá-lo do status dela o
    // apagaria toda vez que a rotina rodasse.
    expect(situacaoDoPedido({ ...base, atual: 'em_producao' })).toBe('em_producao')
    expect(situacaoDoPedido({ ...base, producaoEm: '2026-08-13T10:00:00Z' })).toBe('em_producao')
  })

  it('faturamento passa por cima da produção', () => {
    // A Yampi avançou: o que ela sabe agora é mais recente que o nosso.
    expect(
      situacaoDoPedido({ ...base, statusYampi: 'invoiced', atual: 'em_producao' }),
    ).toBe('faturado')
  })

  it('o ciclo é de mão única', () => {
    // Correção manual no painel da Yampi não pode fazer um pedido enviado
    // regredir para pago na nossa tela.
    expect(situacaoDoPedido({ ...base, statusYampi: 'paid', atual: 'enviado' })).toBe('enviado')
    expect(situacaoDoPedido({ ...base, statusYampi: 'invoiced', atual: 'entregue' })).toBe('entregue')
  })
})

describe('entrega local', () => {
  it('MOTOBOY é a convenção desde 01/08 e manda sobre o resto', () => {
    expect(ehEntregaLocal({ servicoFrete: 'MOTOBOY', destino: 'São Paulo · SP', rastreio: null })).toBe(true)
  })

  it('antes da convenção, o destino é a única pista', () => {
    expect(ehEntregaLocal({ servicoFrete: null, destino: 'Muriaé · MG', rastreio: null })).toBe(true)
    expect(ehEntregaLocal({ servicoFrete: null, destino: 'Muriae · MG', rastreio: null })).toBe(true)
  })

  it('código de rastreio significa transportadora, não entrega em mãos', () => {
    // Cliente de Muriaé que pediu envio pelos Correios não é entrega local —
    // e tratá-lo como tal baixaria o estoque na hora errada.
    expect(ehEntregaLocal({ servicoFrete: null, destino: 'Muriaé · MG', rastreio: 'AD1BR' })).toBe(false)
  })

  it('pedido comum não vira local', () => {
    expect(ehEntregaLocal({ servicoFrete: 'FRENET_SEDEX_03220', destino: 'Recife · PE', rastreio: null })).toBe(false)
    expect(ehEntregaLocal({ servicoFrete: null, destino: null, rastreio: null })).toBe(false)
  })
})

describe('SLA de expedição', () => {
  const agora = new Date('2026-08-13T12:00:00Z')
  const base = { situacao: 'pago' as const, entregueEm: null }

  it('o prazo padrão é a régua da operação: 72 horas do pagamento', () => {
    expect(PRAZO_EXPEDICAO_DIAS).toBe(3)
    // Comprado dia 11, sem prazo explícito: vence dia 14 — amanhã.
    expect(slaDeExpedicao({ ...base, compradoEm: '2026-08-11T09:00:00Z' }, undefined, agora).rotulo)
      .toBe('Amanhã')
    // Comprado dia 10: vence hoje, dia 13.
    expect(slaDeExpedicao({ ...base, compradoEm: '2026-08-10T09:00:00Z' }, undefined, agora).estado)
      .toBe('hoje')
  })

  it('fala a língua da operação, não em horas', () => {
    expect(slaDeExpedicao({ ...base, compradoEm: '2026-08-11T09:00:00Z' }, 2, agora).rotulo).toBe('Vence hoje')
    expect(slaDeExpedicao({ ...base, compradoEm: '2026-08-12T09:00:00Z' }, 2, agora).rotulo).toBe('Amanhã')
    expect(slaDeExpedicao({ ...base, compradoEm: '2026-08-09T09:00:00Z' }, 2, agora).rotulo).toBe('Em atraso · 2 dias')
  })

  it('compara por DIA, não por hora corrida', () => {
    // Pedido das 18h não pode parecer atrasado às 9h do dia seguinte.
    const tarde = slaDeExpedicao({ ...base, compradoEm: '2026-08-11T21:00:00Z' }, 2, agora)
    expect(tarde.estado).toBe('hoje')
  })

  it('quem já despachou sai da fila de prazo', () => {
    // Cobrar prazo de expedição de pedido enviado encheria as pendências de
    // trabalho terminado.
    expect(slaDeExpedicao({ ...base, situacao: 'enviado', compradoEm: '2026-07-01T00:00:00Z' }, 2, agora).estado).toBe('em-dia')
  })

  it('entregue mostra a data, cancelado não cobra prazo', () => {
    const e = slaDeExpedicao(
      { situacao: 'entregue', compradoEm: '2026-08-01T00:00:00Z', entregueEm: '2026-08-12T14:00:00Z' },
      2,
      agora,
    )
    expect(e.estado).toBe('entregue')
    expect(e.rotulo).toContain('12/08')

    // dd/MM/yyyy NÃO vira data: `new Date('06/03/2026')` devolve 2 de junho,
    // não 6 de março. A tela prefere não datar a datar errado.
    const ilegivel = slaDeExpedicao(
      { situacao: 'entregue', compradoEm: '2026-08-01T00:00:00Z', entregueEm: '06/03/2026' },
      2,
      agora,
    )
    expect(ilegivel.rotulo).toBe('Entregue')
    expect(slaDeExpedicao({ ...base, situacao: 'cancelado', compradoEm: '2026-08-01T00:00:00Z' }, 2, agora).rotulo).toBe('Cancelado')
  })

  it('data ilegível vira "sem previsão", nunca uma data inventada', () => {
    expect(slaDeExpedicao({ ...base, compradoEm: 'nada' }, 2, agora).estado).toBe('sem-previsao')
  })
})
