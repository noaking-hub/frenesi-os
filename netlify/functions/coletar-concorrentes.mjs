/** Coleta diária dos preços de concorrente — 9h UTC, na Netlify. */
// Nota de manutenção: mudar este arquivo força o reempacote do bundle — é o
// único jeito de a função enxergar variável de ambiente nova (CRON_SEGREDO).
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
