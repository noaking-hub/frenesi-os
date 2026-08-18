import 'server-only'

import { sessaoAtual } from './sessao'

/**
 * Quem assina o que o ERP grava.
 *
 * Este arquivo existia com uma constante: `OPERADOR = 'Marina F.'`, escolhida
 * quando ainda não havia login, e o comentário dela prometia que sairia "no dia
 * em que vier da sessão". Esse dia chegou e a promessa não foi cobrada — e o
 * resultado é que meia centena de campos de auditoria em todo o ERP passaram a
 * afirmar que uma pessoa que NÃO EXISTE fez a alteração.
 *
 * Auditoria que nomeia alguém errado é pior que auditoria vazia: a vazia
 * admite que não sabe, e a errada acusa. O dono viu "Última alteração por
 * Marina F." numa regra que ele mesmo tinha acabado de salvar.
 */

/**
 * O nome de quem está logado, para carimbar o registro.
 *
 * Sem sessão devolve 'Sistema' — que é a verdade nas rotinas agendadas, onde
 * de fato não há gente do outro lado. Nunca devolve um nome inventado: se o
 * ERP não sabe quem fez, ele diz que foi o sistema.
 */
export async function operadorAtual(): Promise<string> {
  const sessao = await sessaoAtual()
  return sessao?.nome?.trim() || sessao?.email?.trim() || SISTEMA
}

/**
 * A assinatura das rotinas que rodam sem gente: cron, webhook, conversão
 * automática. Honesta por construção — ninguém clicou.
 */
export const SISTEMA = 'Sistema'

// A constante `OPERADOR` foi aposentada: os 41 pontos que a importavam
// passaram a chamar `operadorAtual()`, e a auditoria voltou a nomear quem
// de fato clicou — ou 'Sistema', quando ninguém clicou.
