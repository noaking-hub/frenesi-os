/** Coleta diária dos preços de concorrente — 9h UTC, na Netlify. */
export default async function coletar() {
  const resposta = await fetch(`${process.env.URL}/api/concorrentes/coletar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SEGREDO}` },
  })
  if (!resposta.ok) {
    throw new Error(`coleta respondeu ${resposta.status}: ${await resposta.text()}`)
  }
}

export const config = { schedule: '0 9 * * *' }
