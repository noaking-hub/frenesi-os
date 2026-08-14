/** Espelho diário do CRM (cashback + aniversários da Yampi) — 7h30 UTC, 4h30 em SP. */
// Nota de manutenção: mudar este arquivo força o reempacote do bundle — é o
// único jeito de a função enxergar variável de ambiente nova (CRON_SEGREDO).
export default async function espelhar() {
  const resposta = await fetch(`${process.env.URL}/api/crm/espelhar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SEGREDO}` },
  })
  if (!resposta.ok) {
    throw new Error(`espelho do CRM respondeu ${resposta.status}: ${await resposta.text()}`)
  }
}

export const config = { schedule: '30 7 * * *' }
