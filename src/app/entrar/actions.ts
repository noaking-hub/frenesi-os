'use server'

import { redirect } from 'next/navigation'

import { conferirBloqueio, ipDaRequisicao, limparFalhas, limparTentativasAntigas, registrarFalha } from '@/data/acesso'
import { enviarLinkDeRedefinicao } from '@/data/recuperacao-senha'
import { autenticacaoConfigurada, registrarAcesso, supabaseDaSessao } from '@/data/sessao'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { conferirTurnstile } from '@/data/turnstile'
import { completarEmail, esperaEmPalavras } from '@/domain'

/**
 * Entrada no ERP.
 *
 * O erro devolvido é sempre o mesmo, dê a senha errada ou o e-mail inexistente:
 * distinguir os dois transforma a tela de login num verificador de quem tem
 * conta aqui. E quem tenta invadir começa por essa lista.
 *
 * A ORDEM das checagens é a proteção. Bloqueio por tentativas vem primeiro,
 * antes do Turnstile e antes do Supabase: quem já está travado não deve custar
 * nem uma chamada externa. Depois o Turnstile, que separa gente de script. Só
 * então a credencial — a única checagem que custa uma ida ao Supabase.
 */
export async function entrar(
  _estado: { erro: string } | null,
  form: FormData,
): Promise<{ erro: string } | null> {
  // O domínio da casa é completado aqui também, e não só na tela: quem tem o
  // preenchimento automático do navegador desligado, ou usa teclado e envia
  // sem sair do campo, mereceria falhar por uma conveniência que não rodou.
  const email = completarEmail(String(form.get('email') ?? ''))
  const senha = String(form.get('senha') ?? '')
  const de = String(form.get('de') ?? '')
  const fichaTurnstile = (form.get('cf-turnstile-response') as string | null) ?? null

  if (!email || !senha) return { erro: 'Informe e-mail e senha.' }
  if (!autenticacaoConfigurada() || !supabaseConfigurado()) {
    return {
      erro: 'A autenticação não está configurada neste ambiente. Defina NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    }
  }

  const ip = await ipDaRequisicao()

  const travado = await conferirBloqueio(email, ip)
  if (travado.bloqueado) {
    return {
      erro: `Tentativas demais. Espere ${esperaEmPalavras(travado.faltamSegundos)} antes de tentar de novo — ou use "Esqueci a senha".`,
    }
  }

  const robo = await conferirTurnstile(fichaTurnstile, ip)
  if (!robo.ok) return { erro: robo.erro ?? 'A verificação de segurança não passou.' }

  const sb = await supabaseDaSessao()
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha })

  if (error || !data.user) {
    // Credencial errada e serviço quebrado são problemas diferentes, e tratar
    // os dois como "não confere" mandou uma investigação inteira para o lado
    // errado: o login estava falhando por erro de schema no Supabase, e a
    // tela dizia que a senha estava errada. O texto genérico continua para o
    // caso legítimo (400), porque distinguir "e-mail não existe" de "senha
    // errada" entrega a lista de quem tem conta aqui.
    const status = error?.status ?? 0
    if (status >= 500 || status === 0) {
      console.error('[entrar] o Supabase não respondeu ao login:', error?.message)
      return {
        erro: 'O serviço de autenticação não respondeu. Tente de novo em instantes — se insistir, é falha do Supabase, não da sua senha.',
      }
    }
    // Só a falha de credencial conta para o placar. Serviço fora do ar não é
    // culpa de quem está tentando entrar, e contá-la travaria o ERP inteiro
    // justamente no momento em que o Supabase estivesse oscilando.
    await registrarFalha(email, ip, 'credencial')
    return { erro: 'E-mail ou senha não conferem.' }
  }

  const { data: perfil } = await supabaseServer()
    .from('usuarios')
    .select('id, ativo')
    .eq('id', data.user.id)
    .maybeSingle()

  // Credencial válida mas sem perfil ativo no ERP: a sessão é desfeita na
  // hora, senão o cookie ficaria valendo para as rotas de API.
  //
  // "Não tem perfil" e "foi desativado" são situações diferentes e a saída
  // também: uma pede que criem o acesso, a outra que reativem. Dizer
  // "desativado" para quem nunca teve perfil manda a pessoa pedir a coisa
  // errada — foi o que aconteceu quando a credencial foi recriada no painel
  // do Supabase e o perfil ficou para trás.
  if (!perfil) {
    await sb.auth.signOut()
    return {
      erro:
        'A credencial confere, mas este e-mail ainda não tem acesso liberado no ERP. ' +
        'Peça a quem administra para criar o acesso em Configurações → Usuários.',
    }
  }
  if (!(perfil as { ativo: boolean }).ativo) {
    await sb.auth.signOut()
    return { erro: 'Este acesso está desativado. Fale com quem administra o ERP.' }
  }

  await limparFalhas(email)
  await registrarAcesso(data.user.id)
  void limparTentativasAntigas().catch(() => {})
  // Volta para onde a pessoa ia antes de ser barrada — e só para dentro do
  // próprio ERP: um "de" apontando para fora seria redirecionamento aberto.
  redirect(de.startsWith('/') && !de.startsWith('//') ? de : '/')
}

/**
 * "Esqueci a senha".
 *
 * A resposta é a MESMA existindo ou não a conta, e é o ponto inteiro desta
 * função. Uma tela que responde "não encontrei esse e-mail" entrega, sem
 * login e sem limite, a lista de quem trabalha na empresa — e é assim que se
 * monta a lista de alvos antes de tentar senha.
 *
 * O pedido conta como tentativa no mesmo placar do login. Sem isso, alguém
 * poderia usar a recuperação como torneira de e-mail contra a caixa de quem
 * trabalha aqui.
 */
export async function pedirRedefinicao(
  _estado: { ok?: string; erro?: string } | null,
  form: FormData,
): Promise<{ ok?: string; erro?: string } | null> {
  const email = completarEmail(String(form.get('email') ?? ''))
  const fichaTurnstile = (form.get('cf-turnstile-response') as string | null) ?? null

  if (!email) return { erro: 'Informe o e-mail da sua conta.' }

  const ip = await ipDaRequisicao()

  const travado = await conferirBloqueio(email, ip)
  if (travado.bloqueado) {
    return { erro: `Pedidos demais. Espere ${esperaEmPalavras(travado.faltamSegundos)}.` }
  }

  const robo = await conferirTurnstile(fichaTurnstile, ip)
  if (!robo.ok) return { erro: robo.erro ?? 'A verificação de segurança não passou.' }

  const MESMA_RESPOSTA =
    'Se este e-mail tiver acesso ao ERP, o link para escolher uma nova senha chega em instantes. Confira também a caixa de spam.'

  try {
    const r = await enviarLinkDeRedefinicao(email)
    // Ambiente sem provedor de e-mail é falha de configuração, não segredo: aí
    // dizer a verdade ajuda quem está montando o sistema e não entrega nada
    // sobre quem tem conta.
    if (r.erro) return { erro: r.erro }
    await registrarFalha(email, ip, 'pedido de redefinição')
    return { ok: MESMA_RESPOSTA }
  } catch (e) {
    console.error('[redefinicao] falha ao enviar:', e)
    return { ok: MESMA_RESPOSTA }
  }
}

export async function sair(): Promise<void> {
  if (autenticacaoConfigurada()) {
    const sb = await supabaseDaSessao()
    await sb.auth.signOut()
  }
  redirect('/entrar')
}
