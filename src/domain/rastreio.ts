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
 * Data da Frenet para ISO.
 *
 * Ela devolve `2026-08-11T14:55:00` sem fuso — e é horário de Brasília. Ler
 * como UTC jogaria cada evento três horas para a frente, o que na prática
 * mostra ao cliente uma entrega que "ainda vai acontecer".
 */
export function dataDaTransportadora(bruta: string | null | undefined): string | null {
  const texto = (bruta ?? '').trim()
  if (!texto) return null
  const comFuso = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(texto)
  const iso = texto.includes('T') ? texto : texto.replace(' ', 'T')
  const d = new Date(comFuso ? iso : `${iso.slice(0, 19)}-03:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
