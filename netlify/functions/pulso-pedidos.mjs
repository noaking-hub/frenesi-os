/**
 * Agendador do pulso de pedidos — a cada 5 minutos, na Netlify.
 *
 * A rotina horária (sincronizar-financeiro) faz a manutenção completa, mas é
 * uma corrente longa que a plataforma corta no meio com frequência — e venda
 * é o dado que não pode esperar a sorte da próxima hora. Este pulso dispara a
 * rota fininha que só traz pedidos novos e goteja o espelho de envios.
 */
export default async function pulsar() {
  // URL é injetada pela Netlify com o endereço público do site.
  const resposta = await fetch(`${process.env.URL}/api/pedidos/pulso`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SEGREDO}` },
  })
  if (!resposta.ok) {
    throw new Error(`pulso respondeu ${resposta.status}: ${await resposta.text()}`)
  }
}

export const config = { schedule: '*/5 * * * *' }
