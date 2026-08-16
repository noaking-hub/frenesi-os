import 'server-only'

import { headers } from 'next/headers'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { decidirBloqueio, JANELA_DE_TENTATIVAS_MS, type Bloqueio } from '@/domain'

/**
 * A contagem de tentativas da porta do ERP.
 *
 * Ela mora no banco, e não em memória do processo, porque a Netlify roda cada
 * requisição numa instância que pode ser nova. Um contador em memória zeraria
 * a cada chamada — seria uma proteção que existe no código, não na prática, e
 * essas são as piores: dão a sensação de estar protegido.
 *
 * Nada aqui guarda senha, nem hash de senha. Só e-mail, origem e horário.
 */

/**
 * De onde veio a requisição.
 *
 * A Netlify põe o IP real do visitante em `x-nf-client-connection-ip`; o
 * `x-forwarded-for` é a alternativa padrão e pode vir com uma cadeia de
 * proxies, onde o primeiro é o cliente. Vazio quando não dá para saber — e aí
 * a proteção por IP simplesmente não se aplica, em vez de agrupar o mundo
 * inteiro sob a mesma chave e travar todo mundo junto.
 */
export async function ipDaRequisicao(): Promise<string | null> {
  const h = await headers()
  const nf = h.get('x-nf-client-connection-ip')
  if (nf) return nf.trim()
  const encaminhado = h.get('x-forwarded-for')
  if (encaminhado) return encaminhado.split(',')[0]?.trim() || null
  return null
}

/** Registra que ESTA tentativa falhou. Falha em gravar não bloqueia o login. */
export async function registrarFalha(email: string, ip: string | null, motivo: string) {
  if (!supabaseConfigurado()) return
  const { error } = await supabaseServer().from('login_tentativas').insert({
    email: email.trim().toLowerCase(),
    ip,
    motivo,
  })
  if (error) console.error('[acesso] não consegui registrar a tentativa:', error.message)
}

/**
 * Limpa o placar deste e-mail.
 *
 * Chamado no login que dá certo: quem lembrou a senha não deve continuar
 * pagando pelas quatro vezes em que errou antes.
 */
export async function limparFalhas(email: string) {
  if (!supabaseConfigurado()) return
  await supabaseServer()
    .from('login_tentativas')
    .delete()
    .eq('email', email.trim().toLowerCase())
}

/**
 * Pergunta à porta se esta tentativa entra.
 *
 * Quando o banco não responde, a decisão é DEIXAR PASSAR. É a escolha certa
 * aqui: um erro de infraestrutura não pode trancar o dono do ERP para fora do
 * próprio sistema, e a senha continua sendo exigida de qualquer forma — o que
 * se perde é o freio contra insistência, não a autenticação.
 */
export async function conferirBloqueio(email: string, ip: string | null): Promise<Bloqueio> {
  if (!supabaseConfigurado()) return { bloqueado: false, faltamSegundos: 0 }

  const desde = new Date(Date.now() - JANELA_DE_TENTATIVAS_MS).toISOString()
  const alvo = email.trim().toLowerCase()

  try {
    const [porEmail, porIp] = await Promise.all([
      supabaseServer()
        .from('login_tentativas')
        .select('criada_em')
        .eq('email', alvo)
        .gte('criada_em', desde)
        .order('criada_em', { ascending: false })
        .limit(50),
      ip
        ? supabaseServer()
            .from('login_tentativas')
            .select('criada_em')
            .eq('ip', ip)
            .gte('criada_em', desde)
            .order('criada_em', { ascending: false })
            .limit(60)
        : Promise.resolve({ data: [] as { criada_em: string }[], error: null }),
    ])

    const datas = (r: { data: { criada_em: string }[] | null }) =>
      (r.data ?? []).map((t) => new Date(t.criada_em))

    return decidirBloqueio(datas(porEmail), datas(porIp))
  } catch (e) {
    console.error('[acesso] não consegui ler as tentativas:', e)
    return { bloqueado: false, faltamSegundos: 0 }
  }
}

/** Descarta o que é velho demais para proteger alguém. Roda em segundo plano. */
export async function limparTentativasAntigas() {
  if (!supabaseConfigurado()) return
  await supabaseServer().rpc('limpar_login_tentativas')
}
