/**
 * As regras da porta do ERP — domínio puro.
 *
 * Três coisas moram aqui, e todas são decisão, não desenho: completar o
 * domínio corporativo, decidir quando uma sequência de erros vira bloqueio, e
 * dizer se uma senha nova pode ser aceita. Ficam fora de React e fora do banco
 * porque são exatamente o tipo de regra que precisa ser testada sem subir
 * nada — e porque a mesma decisão vale para o formulário e para o servidor.
 */

/** O domínio da casa. Quem trabalha aqui tem e-mail neste domínio. */
export const DOMINIO_DA_CASA = 'frenesiperfumes.com.br'

/**
 * Completa o e-mail com o domínio da casa.
 *
 * A regra é conservadora de propósito: só completa quando não há dúvida. Se a
 * pessoa digitou um domínio diferente e completo — o Gmail dela, por exemplo —
 * nada é tocado. Corrigir o que o usuário escreveu inteiro seria adivinhar, e
 * adivinhar num campo de login produz erro de senha que ninguém entende.
 */
export function completarEmail(valor: string, dominio = DOMINIO_DA_CASA): string {
  const limpo = valor.trim().toLowerCase()
  if (!limpo) return ''

  const arroba = limpo.indexOf('@')
  if (arroba === -1) return `${limpo}@${dominio}`

  const local = limpo.slice(0, arroba)
  const escrito = limpo.slice(arroba + 1)
  if (!local) return limpo

  // Nada depois do @, ou um pedaço do domínio da casa: completa.
  if (!escrito || dominio.startsWith(escrito)) return `${local}@${dominio}`
  return limpo
}

/**
 * A sugestão que a tela oferece — null quando não há o que sugerir.
 *
 * Devolver null quando o valor já está completo é o que impede a interface de
 * piscar um "usar rafael@frenesiperfumes.com.br" embaixo de um campo que já diz
 * exatamente isso.
 */
export function sugestaoDeEmail(valor: string, dominio = DOMINIO_DA_CASA): string | null {
  const limpo = valor.trim().toLowerCase()
  if (!limpo) return null
  const completo = completarEmail(limpo, dominio)
  return completo === limpo ? null : completo
}

// ── Força bruta ────────────────────────────────────────────────────────────

/** Janela em que as falhas são contadas. Fora dela, o passado não pesa. */
export const JANELA_DE_TENTATIVAS_MS = 15 * 60_000

/**
 * A escada de espera, em segundos, por número de falhas na janela.
 *
 * Escada e não porta única: as quatro primeiras falhas passam sem atrito
 * porque errar a senha quatro vezes é humano, e travar quem só digitou errado
 * transforma segurança em suporte. A partir da quinta o custo cresce rápido —
 * é aí que o padrão deixa de parecer gente e passa a parecer script.
 */
export function esperaPorFalhas(falhas: number): number {
  if (falhas >= 12) return 30 * 60
  if (falhas >= 8) return 5 * 60
  if (falhas >= 5) return 60
  return 0
}

/**
 * Um IP que erra muito, espalhado por vários e-mails, é outra coisa: não é
 * alguém que esqueceu a senha, é alguém varrendo a lista. O teto por IP é mais
 * alto porque escritório com saída única compartilha endereço — mas existe.
 */
export function esperaPorFalhasDoIp(falhas: number): number {
  if (falhas >= 40) return 30 * 60
  if (falhas >= 20) return 5 * 60
  return 0
}

export interface Bloqueio {
  bloqueado: boolean
  /** Quanto falta, em segundos. Zero quando não há bloqueio. */
  faltamSegundos: number
  motivo?: string
}

/**
 * Decide se esta tentativa entra.
 *
 * A conta é feita a partir da ÚLTIMA falha, não da primeira: assim cada nova
 * tentativa errada reinicia a espera, e insistir custa mais do que parar.
 */
export function decidirBloqueio(
  falhasDoEmail: Date[],
  falhasDoIp: Date[],
  agora: Date = new Date(),
): Bloqueio {
  const dentro = (d: Date[]) =>
    d.filter((q) => agora.getTime() - q.getTime() < JANELA_DE_TENTATIVAS_MS)

  const email = dentro(falhasDoEmail)
  const ip = dentro(falhasDoIp)

  const candidatos: { espera: number; ultima: number; motivo: string }[] = []
  const esperaEmail = esperaPorFalhas(email.length)
  if (esperaEmail > 0) {
    candidatos.push({
      espera: esperaEmail,
      ultima: Math.max(...email.map((d) => d.getTime())),
      motivo: 'tentativas demais neste e-mail',
    })
  }
  const esperaIp = esperaPorFalhasDoIp(ip.length)
  if (esperaIp > 0) {
    candidatos.push({
      espera: esperaIp,
      ultima: Math.max(...ip.map((d) => d.getTime())),
      motivo: 'tentativas demais desta origem',
    })
  }

  if (candidatos.length === 0) return { bloqueado: false, faltamSegundos: 0 }

  const pior = candidatos.reduce((a, b) =>
    b.ultima + b.espera * 1000 > a.ultima + a.espera * 1000 ? b : a,
  )
  const faltam = Math.ceil((pior.ultima + pior.espera * 1000 - agora.getTime()) / 1000)
  if (faltam <= 0) return { bloqueado: false, faltamSegundos: 0 }
  return { bloqueado: true, faltamSegundos: faltam, motivo: pior.motivo }
}

/** "40 segundos", "4 minutos" — o texto que a tela mostra sem fazer conta. */
export function esperaEmPalavras(segundos: number): string {
  if (segundos <= 60) return `${Math.max(1, segundos)} segundo${segundos === 1 ? '' : 's'}`
  const minutos = Math.ceil(segundos / 60)
  return `${minutos} minuto${minutos === 1 ? '' : 's'}`
}

// ── Senha nova ─────────────────────────────────────────────────────────────

/** O mínimo do ERP. Igual ao da troca de senha no perfil — uma regra só. */
export const MINIMO_DA_SENHA = 10

/**
 * As senhas que não podem existir aqui.
 *
 * Lista curta e óbvia: não é um dicionário de vazamentos, é a barreira contra
 * o caso real de alguém redefinir para "frenesi2026" com pressa e voltar ao
 * trabalho. O que pega o resto é o tamanho mínimo.
 */
const PROIBIDAS = ['senha', 'password', '123456', 'frenesi', 'perfume', 'qwerty', 'admin']

export function validarSenhaNova(
  senha: string,
  confirmacao: string,
  email = '',
): { ok: true } | { ok: false; erro: string } {
  if (senha.length < MINIMO_DA_SENHA) {
    return { ok: false, erro: `A senha precisa ter pelo menos ${MINIMO_DA_SENHA} caracteres.` }
  }
  if (senha !== confirmacao) return { ok: false, erro: 'A confirmação não bate com a senha.' }

  const baixa = senha.toLowerCase()
  if (PROIBIDAS.some((p) => baixa.includes(p))) {
    return { ok: false, erro: 'Essa senha é previsível demais. Escolha outra, sem o nome da marca.' }
  }
  const local = email.split('@')[0]?.toLowerCase() ?? ''
  if (local.length >= 3 && baixa.includes(local)) {
    return { ok: false, erro: 'A senha não pode conter o seu e-mail.' }
  }
  return { ok: true }
}

/**
 * Uma medida grosseira de força, só para a barra da tela.
 *
 * Não é entropia de verdade e não decide nada — quem decide é
 * `validarSenhaNova`. Serve para a pessoa ver que uma senha longa e variada
 * vale mais do que uma curta com um `!` no fim.
 */
export function forcaDaSenha(senha: string): { nivel: 0 | 1 | 2 | 3; rotulo: string } {
  if (!senha) return { nivel: 0, rotulo: '—' }
  let pontos = 0
  if (senha.length >= MINIMO_DA_SENHA) pontos++
  if (senha.length >= 16) pontos++
  if (/[a-z]/.test(senha) && /[A-Z]/.test(senha)) pontos++
  if (/\d/.test(senha)) pontos++
  if (/[^\w\s]/.test(senha)) pontos++
  if (pontos <= 1) return { nivel: 1, rotulo: 'fraca' }
  if (pontos <= 3) return { nivel: 2, rotulo: 'razoável' }
  return { nivel: 3, rotulo: 'forte' }
}
