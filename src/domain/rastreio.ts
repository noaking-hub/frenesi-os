/**
 * Eventos de rastreio da transportadora — a parte pura.
 *
 * O mesmo escaneamento chega por dois caminhos: o webhook, que empurra assim
 * que acontece, e a varredura de reforço, que existe porque webhook se perde.
 * Sem uma identidade estável, o cliente veria "Objeto em trânsito" duas vezes
 * na mesma linha do tempo. A identidade é o conteúdo do evento: código +
 * momento + descrição.
 */

export type OrigemRastreio = 'frenet' | 'melhorenvio'

export interface EventoTransportadora {
  /** Identidade estável — deduplicação entre webhook e varredura. */
  id: string
  codigo: string
  /** ISO, ou null quando a transportadora não datou a ocorrência. */
  quando: string | null
  descricao: string
  local: string | null
  origem: OrigemRastreio
  /** Esta ocorrência é a entrega concluída. */
  entregue: boolean
}

/** Texto sem acento, minúsculo e sem espaço repetido — para comparar. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A ocorrência anuncia a entrega concluída.
 *
 * "Entrega não efetuada" e "aguardando retirada" contêm a palavra "entrega"
 * sem serem entrega — por isso a negativa é testada ANTES da positiva.
 */
export function ocorrenciaDeEntrega(descricao: string): boolean {
  const t = normalizar(descricao)
  if (/nao (foi )?entregue|nao efetuada|tentativa|devolucao|devolvido|extraviad|aguardando retirada/.test(t)) {
    return false
  }
  return /entregue|entrega realizada|delivered|entrega concluida/.test(t)
}

/**
 * Identidade do evento.
 *
 * Sem a data (que algumas ocorrências não trazem) a chave cairia sobre
 * descrição repetida — "Objeto em trânsito" acontece muitas vezes na mesma
 * viagem, em cidades diferentes. Por isso o local entra na chave.
 */
export function idDoEvento(
  codigo: string,
  quando: string | null,
  descricao: string,
  local: string | null,
): string {
  const partes = [
    codigo.trim().toUpperCase(),
    quando ? quando.slice(0, 19) : 'sem-data',
    normalizar(descricao).slice(0, 80),
    normalizar(local ?? '').slice(0, 40),
  ]
  return partes.join('|')
}

/**
 * Ordena do mais recente para o mais antigo e remove repetição.
 *
 * Evento sem data vai para o fim: ele é sempre o registro mais pobre, e no
 * topo da lista roubaria o lugar do que o cliente quer ver primeiro.
 */
export function ordenarEventos(eventos: EventoTransportadora[]): EventoTransportadora[] {
  const vistos = new Set<string>()
  return eventos
    .filter((e) => {
      if (vistos.has(e.id)) return false
      vistos.add(e.id)
      return true
    })
    .sort((a, b) => {
      if (!a.quando && !b.quando) return 0
      if (!a.quando) return 1
      if (!b.quando) return -1
      return b.quando.localeCompare(a.quando)
    })
}

/**
 * Data da transportadora para ISO.
 *
 * O formato muda com a transportadora que a Frenet consultou, e não há aviso
 * de qual virá: os Correios devolvem `12/08/2026 09:56` e a J&T devolve
 * `2026-08-10 19:25:26`. Ler o primeiro com `new Date` dá data inválida — e o
 * evento entraria na timeline sem data, no fim da lista, como se fosse o mais
 * pobre de todos.
 *
 * Nenhum dos dois traz fuso, e os dois são horário de Brasília. Ler como UTC
 * jogaria cada evento três horas para a frente, o que na prática mostra ao
 * cliente uma entrega que "ainda vai acontecer".
 */
export function dataDaTransportadora(bruta: string | null | undefined): string | null {
  const texto = (bruta ?? '').trim()
  if (!texto) return null

  // dd/MM/yyyy HH:mm[:ss] — o formato dos Correios pela Frenet.
  const br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (br) {
    const [, dia, mes, ano, hora = '00', min = '00', seg = '00'] = br
    const d = new Date(`${ano}-${mes}-${dia}T${hora}:${min}:${seg}-03:00`)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }

  const comFuso = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(texto)
  const iso = texto.includes('T') ? texto : texto.replace(' ', 'T')
  const d = new Date(comFuso ? iso : `${iso.slice(0, 19)}-03:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * O código de serviço que a Frenet exige na consulta de rastreio.
 *
 * A Frenet não aceita consulta sem serviço: sem ele, ou com um valor que ela
 * não reconhece, a resposta volta 200 com `ErrorMessage` e ZERO ocorrências —
 * exatamente igual a "o objeto ainda não foi escaneado". E o que a Yampi grava
 * em `servico_frete` não é o código dela: é `FRENET_SEDEX_03220`, um rótulo
 * com o código no fim. O de verdade (`03220`, `03298`, `F_3`, `JTE_INT`) vem
 * de `GET /shipping/info`.
 *
 * O casamento é por sufixo porque o meio do rótulo é descrição livre —
 * `FRENET_JADLOG_PACKAGE_F_3` termina em `F_3`, e é só isso que importa.
 */
export function servicoFrenetDe(
  servicoFrete: string | null | undefined,
  codigosConhecidos: string[],
): string | null {
  const rotulo = (servicoFrete ?? '').trim().toUpperCase()
  if (!rotulo) return null
  // Do mais longo para o mais curto: `F_3` também é sufixo de um hipotético
  // `XF_3`, e o código mais específico é sempre o certo.
  for (const codigo of [...codigosConhecidos].sort((a, b) => b.length - a.length)) {
    const alvo = codigo.trim().toUpperCase()
    if (alvo && (rotulo === alvo || rotulo.endsWith(`_${alvo}`) || rotulo.endsWith(alvo))) return alvo
  }
  return null
}

/**
 * Palpite de serviço a partir do FORMATO do código.
 *
 * Metade dos pedidos veio de antes do ERP e chegou sem `servico_frete`, e
 * etiqueta emitida no Melhor Envio traz rótulo que a Frenet não conhece. O
 * formato do código, porém, denuncia a transportadora: `AD754669044BR` é dos
 * Correios, nove dígitos é Jadlog, quinze dígitos é J&T.
 *
 * Devolve uma LISTA porque Correios tem dois serviços com o mesmo formato e só
 * a consulta separa SEDEX de PAC — tentar os dois custa uma chamada a mais e
 * evita deixar o pedido sem histórico.
 */
export function servicosPeloFormato(codigo: string | null | undefined): string[] {
  const c = (codigo ?? '').trim().toUpperCase()
  if (!c) return []
  if (/^[A-Z]{2}\d{9}BR$/.test(c)) return ['03220', '03298']
  if (/^\d{15}$/.test(c)) return ['JTE_INT']
  if (/^\d{8,11}$/.test(c)) return ['F_3']
  return []
}
