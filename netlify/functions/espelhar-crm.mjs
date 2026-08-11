/** Espelho diário do CRM (cashback + aniversários da Yampi) — 7h30 UTC, 4h30 em SP. */
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
