/**
 * Agendador do pulso de pedidos — a cada 5 minutos, na Netlify.
 *
 * A rotina horária (sincronizar-financeiro) faz a manutenção completa, mas é
 * uma corrente longa que a plataforma corta no meio com frequência — e venda
 * é o dado que não pode esperar a sorte da próxima hora. Este pulso dispara a
 * rota fininha que só traz pedidos novos e goteja o espelho de envios.
 */
// Nota de manutenção: mudar QUALQUER coisa neste arquivo força a Netlify a
// reempacotar a função. Isso importa porque o bundle congela o ambiente:
// criar/alterar uma variável (como o CRON_SEGREDO) não chega a uma função
// agendada cujo bundle veio do cache — foi assim que todas rodaram meses
// sem o segredo, recebendo 401 em silêncio.
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
