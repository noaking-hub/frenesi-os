/**
 * Agendador da sincronia do financeiro — de hora em hora, na Netlify.
 *
 * Só dispara a rota interna e confere a resposta; o trabalho mora em
 * /api/financeiro/sincronizar. Se a plataforma cortar a execução antes do
 * relatório do Mercado Pago ficar pronto, nada se perde: o pedido de
 * relatório fica persistido no banco e a rodada seguinte importa o arquivo
 * já gerado — o desenho tolera exatamente esse corte.
 */
export default async function sincronizar() {
  // URL é injetada pela Netlify com o endereço público do site.
  const resposta = await fetch(`${process.env.URL}/api/financeiro/sincronizar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SEGREDO}` },
  })
  if (!resposta.ok) {
    throw new Error(`sincronia respondeu ${resposta.status}: ${await resposta.text()}`)
  }
}

export const config = { schedule: '@hourly' }
