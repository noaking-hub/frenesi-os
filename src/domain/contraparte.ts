/**
 * Quem está do OUTRO lado do dinheiro.
 *
 * O Mercado Pago descreve um movimento com os dois lados juntos, separados por
 * barra: `<quem pagou> | <para quem>`. Numa venda sai
 * `Gabrielly Rodrigues | FRENESI`; numa compra feita pela conta sai
 * `M & R COMERCIO DE PRODUTOS DE HIGIENE PESSOAL LTDA | SienoD`.
 *
 * O ERP guardava a string inteira no campo `contraparte`, e isso produziu 46
 * linhas em que a "contraparte" da FRENESI era a própria FRENESI — 43 delas
 * VENDAS, R$ 4.726,05, onde o outro lado é o cliente e o que ficou gravado foi
 * a razão social da casa. Nome próprio ocupando o campo do outro é pior que
 * campo vazio: vazio se vê, nome errado se acredita.
 *
 * Pior ainda para as regras de categoria, que casam por trecho: uma regra com
 * qualquer pedaço do nome da própria empresa dispararia nas 46 de uma vez.
 *
 * A limpeza é boba e é a certa — jogar fora os pedaços que são a própria casa e
 * ficar com o que sobra. Sobrando nada, o campo fica vazio, que é a resposta
 * honesta para "de quem é esse dinheiro?" quando o extrato só falou de nós.
 */

/**
 * Como a operação aparece nos extratos, em todas as formas que já foram vistas.
 *
 * Razão social, nome fantasia e o CNPJ sem formatação. A comparação é frouxa de
 * propósito (sem acento, sem pontuação, minúsculas): o mesmo nome chega
 * `M & R COMERCIO`, `M&R Comercio` e `M & R COMÉRCIO` dependendo de qual campo
 * da API respondeu.
 */
export const IDENTIDADES_DA_CASA = [
  'm r comercio de produtos de higiene pessoal',
  'm r comercio de produtos de higiene',
  'frenesi',
  'frenesi perfumes',
  '55051574000108',
]

/** Sem acento, sem pontuação, minúsculo — para comparar nome com nome. */
export function achatarNome(bruto: string): string {
  return bruto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** É a própria FRENESI se apresentando com um de seus nomes? */
export function ehACasa(pedaco: string): boolean {
  const achatado = achatarNome(pedaco)
  if (!achatado) return true
  // A fronteira de PALAVRA importa: `startsWith('frenesi')` cru engolia o
  // cliente chamado "Frenesio Alves da Silva", apagando o nome dele do
  // lançamento. Exigir o espaço depois separa "Frenesi Perfumes" de "Frenesio".
  return IDENTIDADES_DA_CASA.some((id) => achatado === id || achatado.startsWith(`${id} `))
}

/**
 * O outro lado, limpo do nome da casa.
 *
 * `Gabrielly Rodrigues | FRENESI` → `Gabrielly Rodrigues`
 * `M & R COMERCIO ... LTDA | SienoD` → `SienoD`
 * `M & R COMERCIO ... LTDA` → `` (só falou de nós; não há outro lado a nomear)
 *
 * Vazio é resultado legítimo e precisa continuar sendo: quem chama grava '' e a
 * rotina de enriquecimento tenta de novo noutra rodada, com outra fonte. Um
 * palpite gravado impediria essa segunda chance para sempre.
 */
/**
 * A categoria de despesa que a contraparte do saque denuncia sozinha.
 *
 * O extrato do Mercado Pago descreve todo saque como "Transferência para
 * conta bancária" — pagar o Google e repassar para o Inter saem idênticos.
 * Quando a API entrega o NOME de quem recebeu, alguns nomes decidem sem
 * ajuda: "Google Brasil Internet Ltda" é tráfego pago, não transferência.
 * Só entram aqui os inequívocos; qualquer outro nome devolve null e a
 * decisão continua sendo de quem opera.
 */
export function categoriaPelaContraparte(nome: string | null | undefined): string | null {
  const t = achatarNome(nome ?? '')
  if (!t) return null
  if (/\bgoogle\b/.test(t)) return 'google-ads-trafego-pago'
  if (/\bmeta\b|facebook|\binstagram\b/.test(t)) return 'meta-ads-trafego-pago'
  if (/tiktok/.test(t)) return 'marketing-e-ads'
  if (/melhor envio|etiqueta/.test(t)) return 'frete'
  return null
}

export function contraparteDe(bruto: string | null | undefined): string {
  if (!bruto) return ''
  const pedacos = bruto
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const deFora = pedacos.filter((p) => !ehACasa(p))
  // Nenhum pedaço sobreviveu: o extrato só nomeou a própria casa.
  if (deFora.length === 0) return ''
  // Mais de um sobrevivente é raro e ambíguo; a junção preserva o que veio, em
  // vez de escolher um lado com base em palpite.
  return deFora.join(' | ')
}
