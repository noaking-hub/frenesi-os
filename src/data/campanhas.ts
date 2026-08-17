import 'server-only'

import { enviarEmailsCarrinho } from '@/app/(erp)/crm/carrinhos/actions'
import { enviarAvisoCashback } from '@/app/(erp)/crm/cashback/actions'
import { enviarPresente } from '@/app/(erp)/crm/giftback/actions'
import { hojeEmSaoPaulo, toqueDevido, type RegraDeEnvio } from '@/domain'

import { carteirasYampi } from './cashback'
import { aniversariantes } from './giftback'
import { lerRegrasDeEnvio } from './regras-de-envio'
import { supabaseConfigurado, supabaseServer } from './supabase'
import { lerCarrinhosYampi } from './yampi-crm'

/**
 * A rotina que faz as três campanhas de relacionamento acontecerem sozinhas.
 *
 * Carrinho, aniversário e cashback dependiam de alguém abrir a tela do CRM e
 * clicar — e por isso só aconteciam quando alguém lembrava. As regras (quando,
 * quantas vezes, com qual cupom) moram em `regras_de_envio` e são editadas em
 * Configurações → Notificações; aqui é só a execução delas.
 *
 * As três travas que salvaram os avisos de pedido de virar enxurrada valem
 * igual aqui, e não são opcionais:
 *
 * 1. CHAVE DERIVADA DO FATO, não do instante da rodada. `carrinho:ABC:toque2`
 *    é o mesmo fato hoje e amanhã, então a linha do log recusa a segunda
 *    tentativa por chave duplicada — mesmo se a rotina rodar duas vezes.
 * 2. RESERVA ANTES DO ENVIO. A vaga é gravada primeiro; só quem conseguiu
 *    inserir manda o e-mail. Duas rodadas concorrentes não duplicam.
 * 3. CARGA INICIAL DISPENSANDO O VELHO. Ligar o carrinho com a regra de 4h
 *    encontraria três dias de abandono acumulado e mandaria dezenas de e-mails
 *    no mesmo minuto, de carrinhos que a pessoa já esqueceu. `dispensarPassado`
 *    carimba tudo o que já é velho ANTES de a campanha ser ligada.
 */

export interface ResultadoCampanha {
  campanha: string
  candidatos: number
  enviados: number
  dispensados: number
  falhas: string[]
  /** A campanha está desligada na tela; nada foi tentado. */
  desligada: boolean
  /**
   * Quanto a campanha levou. Existe porque a carga inicial do carrinho morreu
   * três vezes no teto de 26s da Netlify sem deixar rastro: o pg_net registrava
   * timeout, e não havia como saber se o tempo foi da Yampi ou do banco.
   */
  duracaoMs?: number
}

/** Teto por rodada. O provedor tem limite por segundo, e a função tem 26s. */
const POR_RODADA = 25

/**
 * Reserva a vaga de um fato. Devolve false quando alguém já a tinha.
 *
 * É a mesma mecânica dos avisos de pedido: `ignoreDuplicates` faz o banco
 * decidir, e não a aplicação. Conferir antes com um SELECT abriria a janela
 * entre a consulta e o INSERT, que é exatamente onde a duplicata nasce.
 */
async function reservar(
  chave: string,
  evento: string,
  destinatario: string,
  assunto: string,
  estado: 'enviando' | 'dispensado' = 'enviando',
  motivo?: string,
): Promise<boolean> {
  const { data } = await supabaseServer()
    .from('notificacoes_enviadas')
    .upsert(
      {
        chave,
        evento,
        destinatario,
        assunto,
        estado,
        motivo: motivo ?? '',
        ...(estado === 'dispensado' ? { concluido_em: new Date().toISOString() } : {}),
      },
      { onConflict: 'chave', ignoreDuplicates: true },
    )
    .select('chave')
  return (data ?? []).length > 0
}

/**
 * Reserva muitas vagas de uma vez, para a carga inicial.
 *
 * A carga do carrinho reservava uma por vez, e cada uma é uma ida ao banco: com
 * algumas centenas de carrinhos acumulados, a soma das idas estourava o teto de
 * 26s da Netlify no meio da varredura. O que se via depois era um punhado de
 * dispensados gravados, nenhuma resposta, e nenhuma forma de saber se faltava
 * pouco ou muito — a rodada seguinte recomeçava do zero e morria de novo.
 *
 * Aqui é uma ida só. `ignoreDuplicates` continua sendo quem decide: o retorno
 * traz apenas as chaves que ESTA chamada inseriu, então repetir a carga não
 * conta duas vezes.
 */
async function reservarEmLote(
  linhas: { chave: string; evento: string; destinatario: string; motivo: string }[],
): Promise<number> {
  if (linhas.length === 0) return 0
  const agora = new Date().toISOString()
  let gravadas = 0
  // Em blocos, porque um INSERT com milhares de linhas vira um corpo grande
  // demais para o PostgREST — e o erro dele seria um 413 mudo.
  for (let i = 0; i < linhas.length; i += 200) {
    const { data, error } = await supabaseServer()
      .from('notificacoes_enviadas')
      .upsert(
        linhas.slice(i, i + 200).map((l) => ({
          ...l,
          assunto: '(não enviado)',
          estado: 'dispensado',
          concluido_em: agora,
        })),
        { onConflict: 'chave', ignoreDuplicates: true },
      )
      .select('chave')
    if (error) throw new Error(error.message)
    gravadas += (data ?? []).length
  }
  return gravadas
}

async function concluir(chave: string, ok: boolean, motivo = '', corpo?: string) {
  await supabaseServer()
    .from('notificacoes_enviadas')
    .update({
      estado: ok ? 'enviado' : 'falhou',
      motivo: motivo.slice(0, 300),
      concluido_em: new Date().toISOString(),
      ...(corpo ? { corpo_html: corpo } : {}),
    })
    .eq('chave', chave)
}

const vazio = (campanha: string, desligada = false): ResultadoCampanha => ({
  campanha,
  candidatos: 0,
  enviados: 0,
  dispensados: 0,
  falhas: [],
  desligada,
})

// ── Carrinho abandonado ─────────────────────────────────────────────────────

/**
 * Quantos toques cada carrinho já recebeu, numa leitura só.
 *
 * A fonte é o log, e não um contador na linha do carrinho: o log é o que
 * sobrevive a reimportar o carrinho da Yampi. Antes esta contagem era um SELECT
 * por carrinho dentro do laço — correto e inviável: algumas centenas de idas ao
 * banco em sequência não cabem nos 26s da Netlify, e a varredura morria no meio.
 */
async function toquesPorCarrinho(): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  const BLOCO = 1000
  for (let inicio = 0; inicio < 50_000; inicio += BLOCO) {
    const { data, error } = await supabaseServer()
      .from('notificacoes_enviadas')
      .select('chave')
      .like('chave', 'carrinho:%')
      .range(inicio, inicio + BLOCO - 1)
    if (error) throw new Error(error.message)
    for (const linha of data ?? []) {
      // `carrinho:<id>:toque2` — o id é o miolo.
      const id = String(linha.chave).split(':')[1]
      if (id) mapa.set(id, (mapa.get(id) ?? 0) + 1)
    }
    if ((data ?? []).length < BLOCO) break
  }
  return mapa
}

async function rodarCarrinho(regra: RegraDeEnvio, apenasDispensar: boolean): Promise<ResultadoCampanha> {
  const r = vazio('carrinho')
  const [leitura, jaEnviados] = await Promise.all([lerCarrinhosYampi(), toquesPorCarrinho()])
  const agora = Date.now()
  const janelaMs = (regra.janelaMaxDias ?? 7) * 86_400_000
  const paraDispensar: { chave: string; evento: string; destinatario: string; motivo: string }[] = []

  for (const c of leitura.carrinhos) {
    // Sem data de abandono não há como saber qual toque ele merece — e chutar
    // mandaria o e-mail errado ou nenhum. Fica de fora até a Yampi informar.
    if (!c.email || !c.abandonadoEm) continue
    const idade = agora - new Date(c.abandonadoEm).getTime()
    // Carrinho mais velho que a janela é histórico, não oportunidade.
    if (idade > janelaMs) continue

    const horas = idade / 3_600_000
    const indice = toqueDevido(regra, horas, jaEnviados.get(c.id) ?? 0)
    if (indice === null) continue

    const toque = (regra.toques ?? [])[indice]
    const chave = `carrinho:${c.id}:toque${indice + 1}`
    r.candidatos++

    if (apenasDispensar) {
      paraDispensar.push({
        chave,
        evento: 'carrinho_recuperacao',
        destinatario: c.email,
        motivo: 'carrinho já era antigo quando a rotina automática foi ligada',
      })
      continue
    }
    if (r.enviados >= POR_RODADA) break
    if (!(await reservar(chave, 'carrinho_recuperacao', c.email, 'Recuperação de carrinho'))) continue

    try {
      const envio = await enviarEmailsCarrinho(
        [c.id],
        toque.cupom && regra.cupomPct
          ? { tipo: 'unico', pct: regra.cupomPct, validadeDias: regra.cupomValidadeDias ?? 7 }
          : null,
        // `forcar` porque a vaga já foi reservada AQUI: a trava de 7 dias da
        // função é para o envio manual em massa, e negaria o 2º e 3º toque.
        true,
      )
      // `enviados` da recuperação é a LISTA de quem recebeu, não uma
      // contagem — confundir os dois faria toda rodada parecer bem-sucedida.
      const ok = envio.ok && envio.resultado.enviados.length > 0
      await concluir(chave, ok, ok ? '' : 'a função de envio não confirmou a entrega')
      if (ok) r.enviados++
      else r.falhas.push(`${c.id}: sem confirmação`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await concluir(chave, false, msg)
      r.falhas.push(`${c.id}: ${msg}`)
    }
  }
  r.dispensados = await reservarEmLote(paraDispensar)
  return r
}

// ── Aniversário ─────────────────────────────────────────────────────────────

async function rodarAniversario(regra: RegraDeEnvio, apenasDispensar: boolean): Promise<ResultadoCampanha> {
  const r = vazio('aniversario')
  const { lista } = await aniversariantes()
  const hoje = hojeEmSaoPaulo()
  const ano = hoje.slice(0, 4)
  const diasAntes = typeof regra.diasAntes === 'number' ? regra.diasAntes : 0

  // O dia em que o presente sai: o aniversário menos a antecedência.
  const alvo = new Date(`${hoje}T12:00:00Z`)
  alvo.setUTCDate(alvo.getUTCDate() + diasAntes)
  const mesDiaAlvo = alvo.toISOString().slice(5, 10)

  for (const p of lista) {
    if (!p.email || !p.aniversario) continue
    if (p.aniversario.slice(5, 10) !== mesDiaAlvo) continue

    // Um presente por ano. A chave carrega o ano justamente para o próximo
    // aniversário não ser recusado como duplicata do anterior.
    const chave = `aniversario:${p.email.toLowerCase()}:${ano}`
    r.candidatos++

    if (apenasDispensar) {
      if (await reservar(chave, 'aniversario_giftback', p.email, '(não enviado)', 'dispensado',
        'aniversário já havia passado quando a rotina automática foi ligada')) r.dispensados++
      continue
    }
    if (r.enviados >= POR_RODADA) break
    if (!(await reservar(chave, 'aniversario_giftback', p.email, 'Feliz aniversário'))) continue

    try {
      const envio = await enviarPresente({
        email: p.email,
        nome: p.nome ?? '',
        pct: regra.cupomPct ?? 15,
        validadeDias: regra.cupomValidadeDias ?? 30,
      })
      await concluir(chave, envio.ok, envio.ok ? '' : envio.erro)
      if (envio.ok) r.enviados++
      else r.falhas.push(`${p.email}: ${envio.erro}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await concluir(chave, false, msg)
      r.falhas.push(`${p.email}: ${msg}`)
    }
  }
  return r
}

// ── Cashback vencendo ───────────────────────────────────────────────────────

async function rodarCashback(regra: RegraDeEnvio, apenasDispensar: boolean): Promise<ResultadoCampanha> {
  const r = vazio('cashback')
  const { carteiras } = await carteirasYampi()
  const hoje = hojeEmSaoPaulo()
  const antecedencias = Array.isArray(regra.diasAntes) ? regra.diasAntes : []

  for (const c of carteiras) {
    if (!c.email || !c.expiraEm || c.saldo <= 0) continue
    const dias = Math.round(
      (new Date(`${c.expiraEm}T12:00:00Z`).getTime() - new Date(`${hoje}T12:00:00Z`).getTime()) / 86_400_000,
    )
    if (!antecedencias.includes(dias)) continue

    // A data de vencimento entra na chave: o mesmo cliente ganha crédito novo,
    // com outro vencimento, e merece um aviso novo.
    const chave = `cashback:${c.customerId}:${c.expiraEm}:${dias}`
    r.candidatos++

    if (apenasDispensar) {
      if (await reservar(chave, 'cashback_expirando', c.email, '(não enviado)', 'dispensado',
        'saldo já estava perto de vencer quando a rotina automática foi ligada')) r.dispensados++
      continue
    }
    if (r.enviados >= POR_RODADA) break
    if (!(await reservar(chave, 'cashback_expirando', c.email, 'Seu cashback está perto de expirar'))) continue

    try {
      const envio = await enviarAvisoCashback([c.customerId])
      const ok = envio.ok && envio.resultado.enviados > 0
      await concluir(chave, ok, ok ? '' : 'a função de envio não confirmou a entrega')
      if (ok) r.enviados++
      else r.falhas.push(`${c.email}: sem confirmação`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await concluir(chave, false, msg)
      r.falhas.push(`${c.email}: ${msg}`)
    }
  }
  return r
}

/**
 * Roda o que estiver ligado.
 *
 * `apenasDispensar` é a carga inicial: percorre os mesmos candidatos e carimba
 * todos como dispensados, sem mandar nada. É o que torna ligar uma campanha
 * seguro — sem ele, a primeira rodada despeja o acumulado de dias.
 */
export async function rodarCampanhas(opcoes?: {
  apenasDispensar?: boolean
  somente?: string
}): Promise<ResultadoCampanha[]> {
  if (!supabaseConfigurado()) throw new Error('O Supabase precisa estar configurado.')
  const apenasDispensar = Boolean(opcoes?.apenasDispensar)
  const regras = await lerRegrasDeEnvio()
  const saida: ResultadoCampanha[] = []

  for (const regra of regras) {
    if (opcoes?.somente && regra.campanha !== opcoes.somente) continue
    // Na carga inicial a campanha desligada é justamente a que precisa ser
    // varrida: é dela que o acumulado sairia no dia em que fosse ligada.
    if (!regra.ligada && !apenasDispensar) {
      saida.push(vazio(regra.campanha, true))
      continue
    }
    const comecou = Date.now()
    try {
      if (regra.campanha === 'carrinho') saida.push(await rodarCarrinho(regra, apenasDispensar))
      if (regra.campanha === 'aniversario') saida.push(await rodarAniversario(regra, apenasDispensar))
      if (regra.campanha === 'cashback') saida.push(await rodarCashback(regra, apenasDispensar))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[campanhas] ${regra.campanha} falhou:`, msg)
      saida.push({ ...vazio(regra.campanha), falhas: [msg] })
    }
    const ultimo = saida[saida.length - 1]
    if (ultimo?.campanha === regra.campanha) ultimo.duracaoMs = Date.now() - comecou
  }
  return saida
}
