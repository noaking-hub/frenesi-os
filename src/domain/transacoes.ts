/**
 * A ponte entre o pedido e o dinheiro: a transação da Yampi.
 *
 * O problema que isto resolve: o relatório do Mercado Pago traz o id do
 * pagamento e mais nada sobre o pedido. A busca de pagamentos traz a
 * `external_reference`, mas a Yampi manda ali um token de carrinho
 * (`hWNFxk2p…`), não o número do pedido — então nem o Mercado Pago sabe de
 * qual venda se trata. Casar por valor e data é palpite, e recusa sempre que
 * dois decants do mesmo preço caem no mesmo dia.
 *
 * A Yampi, porém, guarda em cada pedido a transação com o identificador que o
 * gateway devolveu. Esse identificador é o mesmo que aparece no extrato. É a
 * chave exata que faltava, e ela sempre esteve a uma chamada de distância.
 *
 * ── Por que colher TODOS os identificadores ────────────────────────────────
 *
 * Esta integração já errou três vezes por adivinhar nome de campo. A Yampi
 * chama o id do gateway ora de `transaction_id`, ora de `gateway_id`, ora de
 * `payment_id`, e a grafia muda entre versões da API e entre gateways.
 *
 * Então não se escolhe um: colhe-se todo valor que pareça identificador e
 * casa-se por qualquer um. A assimetria justifica: um candidato a mais nunca
 * casa com nada e não custa nada; um candidato a menos deixa a venda órfã
 * para sempre, sem erro nenhum aparecer.
 */

/** Uma transação de pedido, reduzida ao que o ERP usa. */
export interface TransacaoPedido {
  /** Id da transação dentro da Yampi — identidade da linha, não do gateway. */
  id: string
  gateway: string
  status: string
  valor: number
  parcelas: number
  /** Tudo que pode ser o id no gateway. Casa-se por qualquer um deles. */
  identificadores: string[]
}

/**
 * Um valor serve como identificador de gateway?
 *
 * Oito caracteres é o piso: id de pagamento do Mercado Pago tem onze ou doze
 * dígitos. Aceitar valores curtos deixaria entrar número de parcelas e id
 * interno de tabela, que casariam por acaso com alguma coisa um dia — e um
 * acerto por acaso na conciliação é pior que uma venda órfã, porque ninguém
 * volta a conferir o que o sistema já deu por resolvido.
 */
function pareceIdentificador(valor: unknown): string | null {
  if (typeof valor === 'number') {
    return Number.isInteger(valor) && valor >= 10_000_000 ? String(valor) : null
  }
  if (typeof valor !== 'string') return null
  const t = valor.trim()
  if (t.length < 8 || t.length > 64) return null
  // Só o que tem cara de id: dígitos, letras, hífen. Um e-mail ou uma URL
  // caindo aqui viraria candidato eterno que nunca casa.
  return /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/.test(t) ? t : null
}

/** Nomes de campo que costumam carregar o id do gateway. */
const PISTAS = /(transaction|payment|gateway|authoriz|acquirer|nsu|tid|charge|order)/i

function texto(v: unknown): string {
  return typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v)
}

function numero(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

/**
 * Colhe os identificadores de uma transação crua.
 *
 * Percorre um nível de profundidade porque a Yampi embrulha detalhe do
 * gateway em objeto aninhado (`{ gateway_data: { id } }`), e o id que interessa
 * mora justamente ali em algumas lojas.
 */
export function identificadoresDaTransacao(cru: Record<string, unknown>): string[] {
  const achados = new Set<string>()

  const olhar = (obj: Record<string, unknown>, profundidade: number) => {
    for (const [chave, valor] of Object.entries(obj)) {
      if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
        if (profundidade < 2) olhar(valor as Record<string, unknown>, profundidade + 1)
        continue
      }
      // Fora dos campos com pista, um valor comprido qualquer viraria
      // candidato — inclusive o token de carrinho, que é justamente o que não
      // casa com nada. Filtrar pelo nome do campo mantém a lista pequena.
      if (!PISTAS.test(chave)) continue
      const id = pareceIdentificador(valor)
      if (id) achados.add(id)
    }
  }

  olhar(cru, 0)
  return [...achados]
}

/**
 * Traduz as transações que vieram junto de um pedido da Yampi.
 *
 * A Yampi ora embrulha a relação em `{ data: [...] }`, ora devolve a lista
 * direta — as duas formas aparecem na mesma API dependendo do endpoint.
 */
export function transacoesDoPedido(pedido: Record<string, unknown>): TransacaoPedido[] {
  const bruto = pedido.transactions
  const lista = Array.isArray(bruto)
    ? bruto
    : bruto && typeof bruto === 'object' && Array.isArray((bruto as { data?: unknown }).data)
      ? ((bruto as { data: unknown[] }).data as unknown[])
      : []

  const transacoes: TransacaoPedido[] = []
  for (const item of lista) {
    if (!item || typeof item !== 'object') continue
    const t = item as Record<string, unknown>
    const identificadores = identificadoresDaTransacao(t)

    // Sem nenhum identificador não há ponte a construir, e guardar a linha
    // vazia só encheria a tabela de nada.
    if (identificadores.length === 0) continue

    transacoes.push({
      id: texto(t.id) || identificadores[0],
      gateway: texto(t.gateway ?? t.gateway_name ?? t.payment_method).slice(0, 40),
      status: texto(t.status ?? t.status_name).slice(0, 40),
      valor: numero(t.amount ?? t.value ?? t.value_total),
      parcelas: numero(t.installments ?? t.installment),
      identificadores,
    })
  }
  return transacoes
}
