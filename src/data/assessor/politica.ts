import 'server-only'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { LIMIAR_PADRAO, type ModoDeAutonomia } from '@/domain'

/**
 * A política de escrita do Gerente — onde ela mora e por quê.
 *
 * Antes era só uma variável de ambiente. Isso resolvia a trava arquitetural que
 * o escopo exige, mas tinha um custo: ligar autonomia virava um deploy, e uma
 * decisão de operação que depende de deploy é uma decisão que ninguém revisa
 * depois de tomada.
 *
 * Agora são duas camadas, e a ordem entre elas importa:
 *
 * 1. `GERENTE_ESCRITA = 'desligada'` é INTERRUPTOR DE EMERGÊNCIA. Força leitura
 *    e ignora o banco. Existe para o caso em que algo deu errado e a pessoa
 *    precisa parar tudo sem esperar build.
 * 2. Fora isso, vale a configuração da tela.
 *
 * O padrão de fábrica continua sendo o mais conservador: escrita desligada,
 * autonomia em "sugestão". Um sistema que já nasce podendo gravar sozinho é um
 * sistema em que ninguém decidiu que ele podia.
 */

export interface ConfiguracaoDoGerente {
  escritaLiberada: boolean
  modoAutonomia: ModoDeAutonomia
  limiarConfianca: number
  tetoValorAutomatico: number
  atualizadaEm: string | null
  atualizadaPor: string | null
  /** Verdadeiro quando a variável de ambiente está forçando leitura. */
  travadaPorAmbiente: boolean
}

const PADRAO: ConfiguracaoDoGerente = {
  escritaLiberada: false,
  modoAutonomia: 'sugestao',
  limiarConfianca: LIMIAR_PADRAO,
  tetoValorAutomatico: 500,
  atualizadaEm: null,
  atualizadaPor: null,
  travadaPorAmbiente: false,
}

export function travadaPorAmbiente(): boolean {
  return process.env.GERENTE_ESCRITA === 'desligada'
}

export async function lerConfiguracaoDoGerente(): Promise<ConfiguracaoDoGerente> {
  const trava = travadaPorAmbiente()
  if (!supabaseConfigurado()) return { ...PADRAO, travadaPorAmbiente: trava }

  const { data, error } = await supabaseServer()
    .from('gerente_configuracao')
    .select('*')
    .eq('id', true)
    .maybeSingle()

  // Falha de leitura da política NÃO abre a porta: sem saber a configuração, o
  // sistema opera no modo mais restrito. O contrário — assumir liberado quando
  // a consulta falha — é como uma indisponibilidade vira gravação indevida.
  if (error || !data) return { ...PADRAO, travadaPorAmbiente: trava }

  return {
    escritaLiberada: trava ? false : Boolean(data.escrita_liberada),
    modoAutonomia: (data.modo_autonomia ?? 'sugestao') as ModoDeAutonomia,
    limiarConfianca: Number(data.limiar_confianca ?? LIMIAR_PADRAO),
    tetoValorAutomatico: Number(data.teto_valor_automatico ?? 500),
    atualizadaEm: data.atualizada_em ? String(data.atualizada_em) : null,
    atualizadaPor: data.atualizada_por ? String(data.atualizada_por) : null,
    travadaPorAmbiente: trava,
  }
}

export async function salvarConfiguracaoDoGerente(dados: {
  escritaLiberada: boolean
  modoAutonomia: ModoDeAutonomia
  limiarConfianca: number
  tetoValorAutomatico: number
  por: string
}): Promise<void> {
  if (!supabaseConfigurado()) throw new Error('Supabase não configurado.')
  const { error } = await supabaseServer()
    .from('gerente_configuracao')
    .update({
      escrita_liberada: dados.escritaLiberada,
      modo_autonomia: dados.modoAutonomia,
      // Limiar fora de 0–1 não é preferência, é engano de digitação; prender
      // aqui evita gravar 95 onde se queria 0,95 e liberar tudo por acidente.
      limiar_confianca: Math.min(1, Math.max(0.5, dados.limiarConfianca)),
      teto_valor_automatico: Math.max(0, dados.tetoValorAutomatico),
      atualizada_em: new Date().toISOString(),
      atualizada_por: dados.por,
    })
    .eq('id', true)
  if (error) throw new Error(error.message)
}
