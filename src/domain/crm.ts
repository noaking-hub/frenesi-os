/**
 * CRM: fluxos de e-mail, campanhas, cashback/giftback e fila de atendimento.
 *
 * Tudo aqui deriva de fatos primitivos: saldo de cashback é gerado − usado,
 * abertura média é ponderada por envio, e o "melhor retorno" de campanha sai
 * da própria lista — nunca de um campo marcado à mão.
 */

// ── Fluxos de e-mail ───────────────────────────────────────────────────────

export interface FluxoEmail {
  id: string
  nome: string
  gatilho: string
  etapas: number
  enviados: number
  aberturaPct: number
  cliquesPct: number
  receita: number
  status: 'Ativo' | 'Rascunho'
}

export interface EtapaFluxo {
  quando: string
  assunto: string
  corpo: string
  /** Código de cupom usado na etapa; vazio quando não há. */
  cupom: string
  aberturaPct: number
  receita: number
}

export interface ResumoFluxos {
  ativos: number
  rascunhos: number
  enviados: number
  receita: number
  /** Abertura média ponderada pelo número de envios de cada fluxo. */
  aberturaMedia: number
  receitaPorEmail: number
}

export function resumirFluxos(fluxos: FluxoEmail[]): ResumoFluxos {
  const enviados = fluxos.reduce((a, f) => a + f.enviados, 0)
  const receita = fluxos.reduce((a, f) => a + f.receita, 0)
  return {
    ativos: fluxos.filter((f) => f.status === 'Ativo').length,
    rascunhos: fluxos.filter((f) => f.status !== 'Ativo').length,
    enviados,
    receita,
    aberturaMedia: enviados
      ? fluxos.reduce((a, f) => a + f.aberturaPct * f.enviados, 0) / enviados
      : 0,
    receitaPorEmail: enviados ? receita / enviados : 0,
  }
}

/**
 * Cupons citados nas etapas de um fluxo. Cada um precisa existir na Shopify E
 * na Yampi — é o mesmo princípio da tela de Promoções. Códigos gerados
 * automaticamente (Judge.me) ficam de fora: não são cadastrados à mão.
 */
export function cuponsDoFluxo(etapas: EtapaFluxo[]): string[] {
  return [...new Set(etapas.map((e) => e.cupom).filter((c) => c && !c.includes('automático')))]
}

// ── Campanhas ──────────────────────────────────────────────────────────────

export interface CampanhaMkt {
  nome: string
  canal: string
  publico: string
  periodo: string
  alcance: number
  conversaoPct: number
  receita: number
  custo: number
  estado: 'Em veiculação' | 'Agendada' | 'Encerrada'
}

/** Receita sobre investimento. `null` quando a campanha não teve custo. */
export function retornoDe(c: CampanhaMkt): number | null {
  return c.custo > 0 ? c.receita / c.custo : null
}

export interface ResumoCampanhas {
  total: number
  ativas: number
  alcance: number
  receita: number
  custo: number
  retornoMedio: number
  /** Campanha de melhor retorno sobre investimento — só entre as que têm custo. */
  melhor: CampanhaMkt
}

export function resumirCampanhas(lista: CampanhaMkt[]): ResumoCampanhas {
  const receita = lista.reduce((a, c) => a + c.receita, 0)
  const custo = lista.reduce((a, c) => a + c.custo, 0)
  const melhor = lista
    .slice()
    .sort((a, b) => (retornoDe(b) ?? 0) - (retornoDe(a) ?? 0))[0]
  return {
    total: lista.length,
    ativas: lista.filter((c) => c.estado === 'Em veiculação').length,
    alcance: lista.reduce((a, c) => a + c.alcance, 0),
    receita,
    custo,
    retornoMedio: custo > 0 ? receita / custo : 0,
    melhor,
  }
}

// ── Cashback e giftback ────────────────────────────────────────────────────

export interface RegraCashback {
  faixa: string
  pct: number
  validade: string
  minimo: number
  ativa: boolean
}

export interface SaldoCashback {
  cliente: string
  perfil: 'VIP' | 'Recorrente'
  gerado: number
  usado: number
  /** Dias até expirar; `null` quando já foi todo resgatado. */
  expiraEmDias: number | null
}

/** Saldo é SEMPRE gerado − usado — nunca um terceiro número digitado. */
export function saldoDe(s: SaldoCashback): number {
  return s.gerado - s.usado
}

export interface GiftbackEmitido {
  codigo: string
  cliente: string
  origem: string
  valor: number
  minimo: number
  emitido: string
  validade: string
  estado: 'Disponível' | 'Resgatado' | 'Expirado'
  /** Existe nas DUAS plataformas. Só na Shopify = o checkout recusa. */
  sincronizado: boolean
}

export interface ResumoCashback {
  emCirculacao: number
  clientesComSaldo: number
  /** Saldo que vence em até 15 dias — candidato a lembrete por e-mail. */
  vencendo15: number
  gerado: number
  usado: number
  taxaResgatePct: number
  giftbackDisponivel: number
  giftbacksAtivos: number
  /** Custo real: só o que foi efetivamente usado, não o emitido. */
  custoReal: number
}

export function resumirCashback(
  saldos: SaldoCashback[],
  giftbacks: GiftbackEmitido[],
): ResumoCashback {
  const gerado = saldos.reduce((a, s) => a + s.gerado, 0)
  const usado = saldos.reduce((a, s) => a + s.usado, 0)
  const comSaldo = saldos.filter((s) => saldoDe(s) > 0)
  const gbResgatado = giftbacks
    .filter((g) => g.estado === 'Resgatado')
    .reduce((a, g) => a + g.valor, 0)
  const disponiveis = giftbacks.filter((g) => g.estado === 'Disponível')
  return {
    emCirculacao: comSaldo.reduce((a, s) => a + saldoDe(s), 0),
    clientesComSaldo: comSaldo.length,
    vencendo15: comSaldo
      .filter((s) => s.expiraEmDias !== null && s.expiraEmDias <= 15)
      .reduce((a, s) => a + saldoDe(s), 0),
    gerado,
    usado,
    taxaResgatePct: gerado ? (usado / gerado) * 100 : 0,
    giftbackDisponivel: disponiveis.reduce((a, g) => a + g.valor, 0),
    giftbacksAtivos: disponiveis.length,
    custoReal: usado + gbResgatado,
  }
}

// ── Fila de atendimento ────────────────────────────────────────────────────

export interface TicketAtendimento {
  id: string
  cliente: string
  pedido: string
  canal: string
  assunto: string
  abertura: string
  /** Minutos esperando resposta; `null` quando já respondida. */
  esperaMin: number | null
  prioridade: 'Alta' | 'Média' | 'Baixa'
  responsavel: string
  origem: string
}

/** "42min", "4h 5min", "2 dias" — ou "Respondida" quando não há espera. */
export function esperaTexto(min: number | null): string {
  if (min === null) return 'Respondida'
  if (min < 60) return `${min}min`
  if (min < 1440) {
    const h = Math.floor(min / 60)
    const r = min % 60
    return r ? `${h}h ${r}min` : `${h}h`
  }
  const d = Math.round(min / 1440)
  return d === 1 ? '1 dia' : `${d} dias`
}

export interface ResumoFila {
  pendentes: number
  semResponsavel: number
  altas: number
  /** Ticket pendente há mais tempo — derivado da própria fila. */
  maisEspera: TicketAtendimento | null
}

export function resumirFila(tickets: TicketAtendimento[]): ResumoFila {
  const pendentes = tickets.filter((t) => t.esperaMin !== null)
  return {
    pendentes: pendentes.length,
    semResponsavel: tickets.filter((t) => t.responsavel === 'Não atribuída').length,
    altas: tickets.filter((t) => t.prioridade === 'Alta').length,
    maisEspera:
      pendentes.slice().sort((a, b) => (b.esperaMin ?? 0) - (a.esperaMin ?? 0))[0] ?? null,
  }
}
