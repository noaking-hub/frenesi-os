import { describe, expect, it } from 'vitest'

import {
  cuponsDoFluxo,
  esperaTexto,
  resumirCampanhas,
  resumirCashback,
  resumirFila,
  resumirFluxos,
  retornoDe,
  saldoDe,
  statusCliente,
  TETO_VIP,
  iniciaisDe,
} from '..'
import type {
  CampanhaMkt,
  EtapaFluxo,
  FluxoEmail,
  GiftbackEmitido,
  SaldoCashback,
  TicketAtendimento,
} from '..'

const fluxo = (p: Partial<FluxoEmail>): FluxoEmail => ({
  id: 'f',
  nome: 'Fluxo',
  gatilho: 'Gatilho',
  etapas: 2,
  enviados: 100,
  aberturaPct: 50,
  cliquesPct: 10,
  receita: 1000,
  status: 'Ativo',
  ...p,
})

describe('fluxos de e-mail', () => {
  it('abertura média ponderada por envio, não média simples', () => {
    const r = resumirFluxos([
      fluxo({ enviados: 300, aberturaPct: 60 }),
      fluxo({ id: 'g', enviados: 100, aberturaPct: 20 }),
    ])
    // (60×300 + 20×100) / 400 = 50 — a média simples daria 40.
    expect(r.aberturaMedia).toBeCloseTo(50, 10)
    expect(r.receitaPorEmail).toBeCloseTo(2000 / 400, 10)
  })

  it('fluxo rascunho sem envios não quebra a conta', () => {
    const r = resumirFluxos([fluxo({ enviados: 0, receita: 0, status: 'Rascunho' })])
    expect(r.aberturaMedia).toBe(0)
    expect(r.rascunhos).toBe(1)
  })

  it('extrai cupons únicos das etapas, ignorando os automáticos', () => {
    const etapas: EtapaFluxo[] = [
      { quando: '1h', assunto: 'a', corpo: '', cupom: '', aberturaPct: 50, receita: 0 },
      { quando: '24h', assunto: 'b', corpo: '', cupom: 'VOLTA10', aberturaPct: 40, receita: 100 },
      { quando: '72h', assunto: 'c', corpo: '', cupom: 'VOLTA10', aberturaPct: 30, receita: 50 },
      { quando: '7d', assunto: 'd', corpo: '', cupom: 'JM · automático', aberturaPct: 20, receita: 0 },
    ]
    expect(cuponsDoFluxo(etapas)).toEqual(['VOLTA10'])
  })
})

describe('campanhas', () => {
  const camp = (p: Partial<CampanhaMkt>): CampanhaMkt => ({
    nome: 'C',
    canal: 'E-mail',
    publico: 'Base',
    periodo: '01/08',
    alcance: 100,
    conversaoPct: 1,
    receita: 1000,
    custo: 100,
    estado: 'Encerrada',
    ...p,
  })

  it('campanha sem custo não tem retorno — não é retorno infinito', () => {
    expect(retornoDe(camp({ custo: 0 }))).toBeNull()
  })

  it('melhor retorno sai da lista, ignorando quem não investiu', () => {
    const semCusto = camp({ nome: 'Orgânica', custo: 0, receita: 99999 })
    const boa = camp({ nome: 'Boa', custo: 100, receita: 1100 })
    const media = camp({ nome: 'Média', custo: 100, receita: 400 })
    const r = resumirCampanhas([semCusto, media, boa])
    expect(r.melhor.nome).toBe('Boa')
  })
})

describe('cashback e giftback', () => {
  const saldo = (p: Partial<SaldoCashback>): SaldoCashback => ({
    cliente: 'X',
    perfil: 'VIP',
    gerado: 100,
    usado: 0,
    expiraEmDias: 30,
    ...p,
  })
  const gb = (p: Partial<GiftbackEmitido>): GiftbackEmitido => ({
    codigo: 'GB-1',
    cliente: 'X',
    origem: '#1',
    valor: 40,
    minimo: 250,
    emitido: 'hoje',
    validade: '30 dias',
    estado: 'Disponível',
    sincronizado: true,
    ...p,
  })

  it('saldo é gerado menos usado — nunca um terceiro número', () => {
    expect(saldoDe(saldo({ gerado: 84, usado: 0 }))).toBe(84)
    expect(saldoDe(saldo({ gerado: 65, usado: 65 }))).toBe(0)
  })

  it('vencendo em 15 dias soma só quem tem saldo e prazo curto', () => {
    const r = resumirCashback(
      [
        saldo({ cliente: 'A', gerado: 84, expiraEmDias: 12 }),
        saldo({ cliente: 'B', gerado: 22, expiraEmDias: 3 }),
        saldo({ cliente: 'C', gerado: 126, expiraEmDias: 84 }),
        saldo({ cliente: 'D', gerado: 65, usado: 65, expiraEmDias: null }),
      ],
      [],
    )
    expect(r.vencendo15).toBe(84 + 22)
    expect(r.emCirculacao).toBe(84 + 22 + 126)
    expect(r.clientesComSaldo).toBe(3)
  })

  it('custo real conta só o que foi usado, não o emitido', () => {
    const r = resumirCashback(
      [saldo({ gerado: 100, usado: 30 })],
      [gb({ estado: 'Resgatado', valor: 50 }), gb({ estado: 'Disponível', valor: 80 })],
    )
    expect(r.custoReal).toBe(30 + 50)
    expect(r.giftbackDisponivel).toBe(80)
  })
})

describe('fila de atendimento', () => {
  const t = (p: Partial<TicketAtendimento>): TicketAtendimento => ({
    id: 'AT-1',
    cliente: 'X',
    pedido: '#1',
    canal: 'WhatsApp',
    assunto: 'Assunto',
    abertura: 'hoje',
    esperaMin: 60,
    prioridade: 'Média',
    responsavel: 'Alguém',
    origem: 'Pedidos',
    ...p,
  })

  it('formata a espera em minutos, horas e dias', () => {
    expect(esperaTexto(null)).toBe('Respondida')
    expect(esperaTexto(42)).toBe('42min')
    expect(esperaTexto(245)).toBe('4h 5min')
    expect(esperaTexto(1080)).toBe('18h')
    expect(esperaTexto(1440)).toBe('1 dia')
    expect(esperaTexto(2880)).toBe('2 dias')
  })

  it('a maior espera vem da própria fila e respondida não conta', () => {
    const r = resumirFila([
      t({ id: 'a', esperaMin: 900 }),
      t({ id: 'b', esperaMin: null }),
      t({ id: 'c', esperaMin: 245, responsavel: 'Não atribuída' }),
    ])
    expect(r.pendentes).toBe(2)
    expect(r.semResponsavel).toBe(1)
    expect(r.maisEspera?.id).toBe('a')
  })
})

describe('classificação de cliente', () => {
  it('inatividade vence o valor: VIP que sumiu é problema de retenção', () => {
    expect(statusCliente(9000, 12, 120)).toBe('Inativo')
  })

  it('VIP pelo total comprado', () => {
    expect(statusCliente(TETO_VIP, 4, 10)).toBe('VIP')
  })

  it('recorrente a partir do segundo pedido', () => {
    expect(statusCliente(500, 2, 10)).toBe('Recorrente')
    expect(statusCliente(500, 1, 10)).toBe('Novo')
  })

  it('cliente sem compra registrada não é dado por inativo', () => {
    expect(statusCliente(0, 0, null)).toBe('Novo')
  })

  it('iniciais pegam primeiro e último nome', () => {
    expect(iniciaisDe('Camila Rocha')).toBe('CR')
    expect(iniciaisDe('Ana')).toBe('A')
    expect(iniciaisDe('  ')).toBe('—')
  })
})
