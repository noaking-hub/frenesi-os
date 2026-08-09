import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

import { RemetenteCliente, type LinhaLog, type LinhaRegra } from './RemetenteCliente'

/** `2026-08-09T14:22:00Z` → `09/08 14:22`. */
function quando(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

export default async function Notificacoes() {
  if (!supabaseConfigurado()) {
    return <RemetenteCliente regras={[]} log={[]} />
  }

  const sb = supabaseServer()
  const [{ data: regras }, { data: log }] = await Promise.all([
    sb.from('notificacoes_regras').select('evento, remetente, assunto').order('evento'),
    sb
      .from('notificacoes_enviadas')
      .select('chave, pedido_id, evento, destinatario, estado, motivo, criado_em')
      .order('criado_em', { ascending: false })
      .limit(100),
  ])

  return (
    <RemetenteCliente
      regras={(regras ?? []) as LinhaRegra[]}
      log={((log ?? []) as Record<string, unknown>[]).map(
        (l): LinhaLog => ({
          chave: l.chave as string,
          pedidoId: (l.pedido_id as string | null) ?? null,
          evento: l.evento as string,
          destinatario: l.destinatario as string,
          estado: l.estado as LinhaLog['estado'],
          motivo: (l.motivo as string) ?? '',
          quando: quando(l.criado_em as string),
        }),
      )}
    />
  )
}
