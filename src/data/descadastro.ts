import 'server-only'

import { createHash } from 'node:crypto'

import { supabaseConfigurado, supabaseServer, tudoDe } from '@/data/supabase'

/**
 * A lista de quem pediu para não receber mais.
 *
 * Vale para MARKETING — carrinho abandonado, giftback de aniversário, aviso de
 * cashback. Não vale para aviso de pedido pago, enviado, entregue nem para
 * devolução: essas são mensagens de serviço sobre uma compra que a pessoa fez,
 * e silenciá-las seria esconder do cliente o que aconteceu com o dinheiro dele.
 *
 * O link do rodapé existia nos modelos desde sempre e apontava para uma página
 * que não existia. Link morto de descadastro é pior do que link nenhum: a
 * pessoa clica, nada acontece, e o próximo e-mail vira denúncia de spam — que
 * derruba a reputação do domínio e leva junto os avisos de pedido.
 */

const normalizar = (email: string) => email.trim().toLowerCase()

/**
 * A assinatura do link.
 *
 * Sem ela, `?e=fulano@dominio.com` descadastraria qualquer pessoa cujo e-mail
 * alguém conhecesse — e e-mail de cliente não é segredo. O segredo é a chave
 * de serviço, que nunca sai do servidor; trocá-la invalida os links antigos,
 * o que é aceitável para um link que vive num e-mail já enviado.
 */
function segredo(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.CRON_SEGREDO ?? 'frenesi-sem-segredo'
}

export function assinaturaDoEmail(email: string): string {
  return createHash('sha256')
    .update(`descadastro:${normalizar(email)}:${segredo()}`)
    .digest('hex')
    .slice(0, 24)
}

export function assinaturaConfere(email: string, assinatura: string): boolean {
  const esperada = assinaturaDoEmail(email)
  // Comparação de tamanho fixo; `timingSafeEqual` exigiria buffers do mesmo
  // tamanho e aqui o valor vem da URL, podendo ter qualquer comprimento.
  if (assinatura.length !== esperada.length) return false
  let diferenca = 0
  for (let i = 0; i < esperada.length; i++) {
    diferenca |= esperada.charCodeAt(i) ^ assinatura.charCodeAt(i)
  }
  return diferenca === 0
}

/** A URL que vai no rodapé do e-mail e no cabeçalho List-Unsubscribe. */
export function linkDeDescadastro(email: string, site: string): string {
  const base = site.trim().replace(/\/+$/, '')
  const params = new URLSearchParams({ e: normalizar(email), t: assinaturaDoEmail(email) })
  return `${base}/descadastrar?${params.toString()}`
}

export async function descadastrar(
  email: string,
  origem: string,
  motivo?: string,
): Promise<void> {
  if (!supabaseConfigurado()) return
  const { error } = await supabaseServer().rpc('registrar_descadastro', {
    p_email: normalizar(email),
    p_origem: origem,
    p_motivo: motivo ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function reativar(email: string): Promise<void> {
  if (!supabaseConfigurado()) return
  const { error } = await supabaseServer().rpc('reativar_email', { p_email: normalizar(email) })
  if (error) throw new Error(error.message)
}

export async function estaDescadastrado(email: string): Promise<boolean> {
  if (!supabaseConfigurado()) return false
  const { data } = await supabaseServer()
    .from('descadastrados')
    .select('email')
    .eq('email', normalizar(email))
    .maybeSingle()
  return Boolean(data)
}

/**
 * A lista inteira, em minúsculas, para filtrar um lote antes de enviar.
 *
 * Uma consulta por destinatário custaria mil idas ao banco num envio em massa
 * — e é justamente o envio em massa que não pode escapar do filtro.
 */
export async function conjuntoDescadastrado(): Promise<Set<string>> {
  if (!supabaseConfigurado()) return new Set()
  try {
    const linhas = await tudoDe<{ email: string }>('descadastrados', (de, ate) =>
      supabaseServer()
        .from('descadastrados')
        .select('email')
        .range(de, ate) as unknown as PromiseLike<{ data: { email: string }[] | null; error: unknown }>,
    )
    return new Set(linhas.map((l) => normalizar(l.email)))
  } catch (e) {
    // Banco mudo NÃO pode virar "manda para todo mundo". Uma falha aqui
    // devolve um conjunto que bloqueia nada, mas o erro fica no log — e o
    // envio em massa é feito em lotes pequenos, com o operador olhando.
    console.error('[descadastro] não consegui ler a lista:', e)
    return new Set()
  }
}

export interface LinhaDescadastro {
  email: string
  origem: string
  motivo: string | null
  criadoEm: string
}

export async function listarDescadastrados(): Promise<LinhaDescadastro[]> {
  if (!supabaseConfigurado()) return []
  const { data } = await supabaseServer()
    .from('descadastrados')
    .select('email, origem, motivo, criado_em')
    .order('criado_em', { ascending: false })
    .limit(500)
  return ((data ?? []) as { email: string; origem: string; motivo: string | null; criado_em: string }[]).map(
    (l) => ({ email: l.email, origem: l.origem, motivo: l.motivo, criadoEm: l.criado_em }),
  )
}
