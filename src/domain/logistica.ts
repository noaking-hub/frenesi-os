/**
 * Normalização de eventos de transportadora.
 *
 * Cada transportadora escreve o mesmo fato com palavras próprias: os Correios
 * dizem "Objeto saiu para entrega ao destinatário", a J&T diz "Seu entregador
 * retirou a encomenda", a Jadlog diz "EM ROTA DE ENTREGA". Sem tradução, a
 * tela precisaria de uma coluna por transportadora e nenhum filtro funcionaria
 * — "mostre tudo que saiu para entrega" seria três buscas de texto diferentes.
 *
 * A regra do escopo é preservar o original E guardar o normalizado. É o que
 * acontece aqui: a mensagem crua continua sendo exibida na linha do tempo; o
 * status padronizado é o que alimenta cartão, aba, filtro e alerta.
 *
 * A ordem dos testes importa e não é alfabética: "devolvido ao remetente"
 * contém "entregue" em algumas redações, e "tentativa de entrega" contém
 * "entrega". O mais específico é testado primeiro.
 */

export type StatusLogistico =
  | 'sem-rastreio'
  | 'etiqueta'
  | 'postado'
  | 'em-transito'
  | 'saiu-para-entrega'
  | 'tentativa'
  | 'aguardando-retirada'
  | 'entregue'
  | 'devolucao'
  | 'extraviado'

export const ROTULO_LOGISTICO: Record<StatusLogistico, string> = {
  'sem-rastreio': 'Sem rastreio',
  etiqueta: 'Aguardando postagem',
  postado: 'Postado',
  'em-transito': 'Em trânsito',
  'saiu-para-entrega': 'Saiu para entrega',
  tentativa: 'Tentativa de entrega',
  'aguardando-retirada': 'Aguardando retirada',
  entregue: 'Entregue',
  devolucao: 'Devolução ao remetente',
  extraviado: 'Extraviado',
}

/** Estado terminal: a varredura para de consultar e o pedido sai da fila. */
export function ehTerminal(s: StatusLogistico): boolean {
  return s === 'entregue' || s === 'devolucao'
}

/**
 * Situação que exige alguém agindo — é o que alimenta a aba "Com ocorrência".
 *
 * Tentativa frustrada, objeto parado em agência e extravio não se resolvem
 * sozinhos: ou a operação fala com o cliente, ou o pedido morre no lugar.
 */
export function ehOcorrencia(s: StatusLogistico): boolean {
  return s === 'tentativa' || s === 'aguardando-retirada' || s === 'extraviado' || s === 'devolucao'
}

/** Sem acento e em minúscula: a mesma frase chega das duas formas. */
function chave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * Traduz a mensagem crua da transportadora para o status padronizado.
 *
 * `null` quando a frase não se parece com nada conhecido — e isso é
 * deliberado: chutar "em trânsito" para um texto não reconhecido esconderia
 * justamente o evento novo que ninguém mapeou ainda.
 */
export function statusDoEvento(descricao: string): StatusLogistico | null {
  const t = chave(descricao)

  // Devolução antes de entrega: "devolvido ao remetente" e "entrega
  // impossibilitada - em devolucao" contêm as duas palavras.
  //
  // A palavra "remetente" sozinha NÃO serve de sinal: ela aparece igualmente em
  // "aguardando postagem pelo remetente", que é o oposto — o objeto nem saiu.
  if (/devolv|devoluc|retorno ao remetente|reverso/.test(t)) return 'devolucao'
  if (/extravi|avaria|roubo|furto|sinistro/.test(t)) return 'extraviado'

  // Tentativa antes de "saiu para entrega": a frase da tentativa quase sempre
  // repete a palavra entrega.
  if (/tentativa|nao foi possivel entregar|destinatario ausente|ausente|carteiro nao atendido/.test(t)) {
    return 'tentativa'
  }
  // "Chegou à agência" é trânsito, não retirada — por isso a agência sozinha
  // não conta; o que conta é a frase dizer que o CLIENTE precisa ir buscar.
  if (/aguardando retirada|disponivel para retirada|retirar n[ao]|aguardando o cliente|retirada no endereco/.test(t)) {
    return 'aguardando-retirada'
  }

  if (/entregue|entrega efetuada|entrega realizada|recebido pelo destinatario/.test(t)) {
    return 'entregue'
  }
  if (/saiu para entrega|em rota de entrega|rota de entrega|entregador\s+\w*\s*retirou|com o entregador/.test(t)) {
    return 'saiu-para-entrega'
  }
  if (/transferencia|em transito|encaminhado|chegou|trocou de|transito/.test(t)) return 'em-transito'
  if (/postado|coleta realizada|coletado|recebido pela transportadora|expedido/.test(t)) return 'postado'
  if (/etiqueta|aguardando postagem|pre-?postagem|aguardando coleta/.test(t)) return 'etiqueta'

  return null
}

export interface EventoLido {
  quando: string | null
  descricao: string
  local?: string | null
  entregue?: boolean
}

export interface SituacaoLogistica {
  status: StatusLogistico
  /** Momento do evento que definiu o status. */
  desde: string | null
  /** Mensagem original — a tela mostra as duas coisas, nunca só a tradução. */
  original: string | null
  local: string | null
  /** Quantas tentativas de entrega a transportadora registrou. */
  tentativas: number
  /**
   * Horas desde o último evento. Acima de 72 h com o objeto em trânsito é
   * pendência: não é erro da transportadora, é sinal de que algo travou.
   */
  horasSemAtualizacao: number | null
}

/**
 * A situação logística de um pedido, a partir dos eventos já gravados.
 *
 * O status vem do evento mais RECENTE que o ERP soube traduzir, e não do
 * primeiro da lista: um evento novo em linguagem desconhecida não pode fazer o
 * pedido regredir para "sem rastreio". Quando nenhum evento é reconhecido mas
 * existe código, o pedido fica em "Postado" — é o mínimo que se sabe: ele saiu.
 */
export function situacaoLogistica(
  dados: {
    rastreio: string | null
    entregueEm?: string | null
    /** Do mais recente para o mais antigo, como o banco devolve. */
    eventos?: EventoLido[]
  },
  agora = new Date(),
): SituacaoLogistica {
  const eventos = dados.eventos ?? []

  if (!dados.rastreio && eventos.length === 0) {
    return {
      status: dados.entregueEm ? 'entregue' : 'sem-rastreio',
      desde: dados.entregueEm ?? null,
      original: null,
      local: null,
      tentativas: 0,
      horasSemAtualizacao: null,
    }
  }

  const ordenados = [...eventos].sort((a, b) => (b.quando ?? '').localeCompare(a.quando ?? ''))
  const tentativas = ordenados.filter((e) => statusDoEvento(e.descricao) === 'tentativa').length

  const decisivo = ordenados.find((e) => statusDoEvento(e.descricao) !== null)
  const ultimo = ordenados[0] ?? null

  const horas = ultimo?.quando
    ? Math.max(0, Math.round((agora.getTime() - Date.parse(ultimo.quando)) / 3_600_000))
    : null

  if (!decisivo) {
    // Entrega confirmada por outra fonte (Yampi, baixa manual) vale mesmo sem
    // um evento de transportadora que a descreva.
    const status: StatusLogistico = dados.entregueEm ? 'entregue' : 'postado'
    return {
      status,
      desde: dados.entregueEm ?? ultimo?.quando ?? null,
      original: ultimo?.descricao ?? null,
      local: ultimo?.local ?? null,
      tentativas,
      horasSemAtualizacao: Number.isFinite(horas) ? horas : null,
    }
  }

  return {
    status: statusDoEvento(decisivo.descricao) as StatusLogistico,
    desde: decisivo.quando,
    original: decisivo.descricao,
    local: decisivo.local ?? null,
    tentativas,
    horasSemAtualizacao: horas,
  }
}

/** Acima disto, objeto em trânsito parado vira pendência na tela. */
export const HORAS_SEM_ATUALIZACAO = 72

export function paradoDemais(s: SituacaoLogistica): boolean {
  if (ehTerminal(s.status) || s.status === 'sem-rastreio') return false
  return (s.horasSemAtualizacao ?? 0) >= HORAS_SEM_ATUALIZACAO
}

/**
 * O status operacional da linha — a resposta de "onde este pedido está AGORA".
 *
 * As três dimensões (financeira, operacional, logística) continuam guardadas
 * separadas, como o escopo exige. Esta função só decide qual delas é a MAIS
 * INFORMATIVA para a coluna de status: depois do despacho, quem sabe do pedido
 * é a transportadora; antes dele, o que importa é a fila interna e o prazo.
 *
 * A precedência é a da urgência, não a do ciclo: tentativa de entrega vence
 * "em trânsito" porque é ela que precisa de alguém; "em atraso" vence
 * "aguardando envio" porque é o atraso que o escopo manda destacar.
 */
export interface StatusOperacional {
  rotulo: string
  tom: 'ok' | 'atencao' | 'erro' | 'info' | 'ouro' | 'neutro'
}

export function statusOperacional(dados: {
  situacao: 'pago' | 'em_producao' | 'faturado' | 'enviado' | 'entregue' | 'cancelado'
  /** Estado do SLA de expedição — só interessa o atraso. */
  slaEmAtraso: boolean
  log: SituacaoLogistica
  /** Motoboy: nunca despacha, nunca fatura — o ciclo fecha na confirmação. */
  entregaLocal?: boolean
}): StatusOperacional {
  const { situacao, slaEmAtraso, log } = dados

  if (situacao === 'cancelado') return { rotulo: 'Cancelado', tom: 'neutro' }
  if (situacao === 'entregue' || log.status === 'entregue') return { rotulo: 'Entregue', tom: 'ok' }

  // Entrega local pendente é uma fila PRÓPRIA, não "aguardando envio": não há
  // envio a aguardar, e chamá-la de atrasada por prazo de expedição encheria o
  // cartão de vermelho com pedidos que o motoboy entregou há meses e ninguém
  // confirmou no sistema.
  if (dados.entregaLocal) return { rotulo: 'Entrega local', tom: 'atencao' }

  // Exceções logísticas primeiro: são as linhas que o escopo manda gritar.
  if (log.status === 'devolucao') return { rotulo: 'Devolução', tom: 'erro' }
  if (log.status === 'extraviado') return { rotulo: 'Extraviado', tom: 'erro' }
  if (log.status === 'tentativa') return { rotulo: 'Tentativa de entrega', tom: 'erro' }
  if (log.status === 'aguardando-retirada') return { rotulo: 'Aguardando retirada', tom: 'atencao' }
  if (log.status === 'saiu-para-entrega') return { rotulo: 'Saiu para entrega', tom: 'ouro' }
  if (log.status === 'em-transito' || log.status === 'postado') {
    return { rotulo: 'Em trânsito', tom: 'info' }
  }

  // Despachado sem leitura de transportadora ainda: o fato mais recente é o
  // despacho — e não o atraso de expedição, que ficou para trás.
  if (situacao === 'enviado') return { rotulo: 'Enviado', tom: 'info' }

  if (slaEmAtraso) return { rotulo: 'Em atraso', tom: 'erro' }
  if (situacao === 'em_producao') return { rotulo: 'Em produção', tom: 'ouro' }
  if (situacao === 'faturado') return { rotulo: 'Faturado', tom: 'ouro' }
  return { rotulo: 'Aguardando envio', tom: 'info' }
}

/**
 * Limpa a mensagem da transportadora para caber numa linha.
 *
 * Os Correios anexam uma pesquisa de satisfação com URL ao evento de entrega;
 * a J&T prefixa a cidade entre colchetes. Nenhum dos dois é informação
 * operacional, e ambos empurram o texto útil para fora da tela.
 */
export function resumirEvento(descricao: string): string {
  return descricao
    .replace(/\s*-\s*(queremos te ouvir|responda a uma pesquisa)[\s\S]*$/i, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s*(\[[^\]]+\]\s*)+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
