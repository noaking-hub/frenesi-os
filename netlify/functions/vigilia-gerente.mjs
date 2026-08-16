/**
 * A vigília do Gerente — de hora em hora, na Netlify.
 *
 * Só dispara a rota interna. O trabalho mora em /api/assessor/vigilia, que
 * recalcula a fila de prioridades e sincroniza os alertas persistidos.
 *
 * Fica em função própria, e não pendurada na sincronia financeira, por um
 * motivo aprendido na marra: a sincronia é longa e pode ser cortada por tempo
 * antes de chegar ao fim. Alerta que só roda em rodada de sorte é alerta que
 * não existe.
 *
 * Nota de manutenção: mudar este arquivo força o reempacote do bundle — é o
 * único jeito de a função enxergar variável de ambiente nova (CRON_SEGREDO).
 */
export default async function vigilia() {
  const resposta = await fetch(`${process.env.URL}/api/assessor/vigilia`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SEGREDO}` },
  })
  if (!resposta.ok) {
    throw new Error(`vigília respondeu ${resposta.status}: ${await resposta.text()}`)
  }
}

export const config = { schedule: '@hourly' }
