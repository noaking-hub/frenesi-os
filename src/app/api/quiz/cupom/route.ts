import { NextResponse } from 'next/server'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { emailComoIdentidade } from '@/domain'
import { yampiConfigurada } from '@/data/yampi'
import { criarCupomYampi } from '@/data/yampi-crm'

/**
 * O cupom da Curadoria Olfativa — a troca justa pelo e-mail.
 *
 * O quiz termina, a pessoa deixa o e-mail e recebe AGORA um cupom único de
 * 10% (7 dias) criado na Yampi. É o que transforma o quiz de página anônima
 * em captação: o e-mail entra no CRM com o perfil olfativo junto, e o cupom
 * torna a atribuição determinística — pedido que usou CURA10-XXXX veio do
 * quiz, sem janela probabilística.
 *
 * A rota é PÚBLICA (o quiz chama do navegador, de outro domínio), e as
 * defesas são de desenho, não de segredo:
 * - um cupom por e-mail — pedir de novo devolve o MESMO código;
 * - teto global de cupons novos por hora, contra farming;
 * - o cupom nasce com limite de 1 uso e "uso único por cliente" na Yampi.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 26

const DESCONTO_PCT = 10
const VALIDADE_DIAS = 7
/** Cupons NOVOS por hora — muito acima do tráfego real, muito abaixo do abuso. */
const TETO_POR_HORA = 30

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

function sufixoCupom(): string {
  // Sem 0/O/1/I/L: o cliente digita este código no checkout.
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 5; i++) s += alfabeto[Math.floor(Math.random() * alfabeto.length)]
  return s
}

export async function POST(req: Request) {
  const responder = (corpo: unknown, status = 200) =>
    NextResponse.json(corpo, { status, headers: CORS })

  if (!supabaseConfigurado() || !yampiConfigurada()) {
    return responder({ ok: false, erro: 'Serviço indisponível.' }, 503)
  }

  let corpo: { email?: string; respostas?: unknown }
  try {
    corpo = await req.json()
  } catch {
    return responder({ ok: false, erro: 'Corpo inválido.' }, 400)
  }

  const informado = (corpo.email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(informado) || informado.length > 200) {
    return responder({ ok: false, erro: 'Informe um e-mail válido.' }, 400)
  }
  // A identidade normalizada: nome+1@gmail e no.me@gmail são a mesma caixa,
  // e "um cupom por e-mail" tem que valer para a CAIXA, não para o apelido.
  const email = emailComoIdentidade(informado)

  const sb = supabaseServer()
  const id = `lead:${email}`

  try {
    // Um cupom por e-mail: quem já tem, recebe o mesmo de volta — inclusive
    // no clique duplo e no "voltei para pegar de novo".
    const { data: existente } = await sb
      .from('quiz_respostas')
      .select('dados')
      .eq('id', id)
      .maybeSingle()
    const guardado = existente?.dados as { cupom?: string; cupomExpiraEm?: string } | null
    if (guardado?.cupom) {
      return responder({
        ok: true,
        cupom: guardado.cupom,
        desconto: DESCONTO_PCT,
        validade: guardado.cupomExpiraEm ?? null,
        repetido: true,
      })
    }

    // Teto global por hora: cupom é dinheiro, e endpoint público sem teto é
    // convite. O teto vale para cupons NOVOS — repetidos saem acima, de graça.
    const desde = new Date(Date.now() - 3_600_000).toISOString()
    const { count } = await sb
      .from('quiz_respostas')
      .select('id', { count: 'exact', head: true })
      .eq('tabela_origem', 'lead-cupom')
      .gte('importado_em', desde)
    if ((count ?? 0) >= TETO_POR_HORA) {
      return responder({ ok: false, erro: 'Muitos pedidos agora — tente de novo em instantes.' }, 429)
    }

    const codigo = `CURA${DESCONTO_PCT}-${sufixoCupom()}`
    const expiraEm = new Date(Date.now() + VALIDADE_DIAS * 86_400_000).toLocaleDateString('sv', {
      timeZone: 'America/Sao_Paulo',
    })

    // O cupom nasce na Yampi ANTES do registro: prometer código que não
    // existe é pior que falhar — a mesma regra da recuperação de carrinho.
    await criarCupomYampi({
      codigo,
      valor: DESCONTO_PCT,
      percentual: true,
      limite: 1,
      usoUnicoPorCliente: true,
      naoAcumula: true,
      expiraEm,
    })

    const { error } = await sb.from('quiz_respostas').upsert({
      id,
      email,
      respondido_em: new Date().toISOString(),
      dados: {
        respostas: corpo.respostas ?? null,
        cupom: codigo,
        cupomExpiraEm: expiraEm,
        ...(informado !== email ? { emailInformado: informado } : {}),
      },
      tabela_origem: 'lead-cupom',
    })
    if (error) throw error

    return responder({ ok: true, cupom: codigo, desconto: DESCONTO_PCT, validade: expiraEm })
  } catch (e) {
    console.error('[quiz/cupom] falha:', e)
    // Mensagem genérica de propósito: detalhe de erro em endpoint público é
    // mapa para quem está sondando.
    return responder({ ok: false, erro: 'Não consegui gerar o cupom agora. Tente de novo.' }, 500)
  }
}
