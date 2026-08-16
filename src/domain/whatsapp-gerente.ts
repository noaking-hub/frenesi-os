/**
 * O que o canal WhatsApp faz de puro — texto e comando.
 *
 * Fica no domínio porque é onde dá para testar sem provedor, sem webhook e sem
 * credencial. E porque as duas funções aqui carregam decisões de segurança que
 * merecem prova, não confiança.
 */

/**
 * Adapta a resposta ao canal — §24, "texto curto no WhatsApp".
 *
 * O ERP mostra blocos, tabelas e chips; o WhatsApp mostra texto. Mandar a mesma
 * resposta nos dois lugares produziria, no celular, um muro de asteriscos que
 * ninguém lê no semáforo.
 */
export function paraTextoDeWhatsapp(texto: string): string {
  return texto
    .replace(/^#{1,6}\s*/gm, '')
    // O markdown do WhatsApp usa UM asterisco para negrito, não dois.
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^\s*[-•]\s*/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface ComandoDoWhatsapp {
  verbo: 'aprovar' | 'cancelar'
  prefixo: string
}

/**
 * Comandos diretos — §25, "Aprovar, Ver detalhes, Cancelar".
 *
 * Eles NÃO passam pelo modelo, e essa é a decisão central deste arquivo.
 * Aprovar uma ação financeira por interpretação de linguagem natural devolveria
 * ao LLM justamente a decisão que o fluxo inteiro existe para tirar dele: um
 * "acho que ele quis dizer sim" não pode gravar lançamento.
 *
 * Por isso o padrão é ESTRITO — verbo, espaço, código, fim. "Pode aprovar,
 * acho" não casa, e não casar significa ir para o motor como pergunta, onde o
 * pior desfecho é uma resposta em vez de uma gravação.
 */
export function interpretarComando(texto: string): ComandoDoWhatsapp | null {
  const m = texto
    .trim()
    .toLowerCase()
    .match(/^(aprovar|aprovado|aprovo|confirmar|cancelar|cancela|cancelo)\s+([0-9a-f][0-9a-f-]{3,})$/)
  if (!m) return null
  return { verbo: m[1].startsWith('cancel') ? 'cancelar' : 'aprovar', prefixo: m[2] }
}

/** Normaliza para dígitos. "+55 (62) 99261-7792" e "5562992617792" são o mesmo. */
export function normalizarTelefone(bruto: string): string {
  return bruto.replace(/\D/g, '')
}
