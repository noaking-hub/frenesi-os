import { NextResponse } from 'next/server'

import {
  abrirConversa,
  conversaDoUsuario,
  gravarMensagem,
  lerMensagens,
} from '@/data/assessor/conversas'
import { assessorConfigurado, auditar, perguntarAoAssessor } from '@/data/assessor/motor'
import { sessaoAtual } from '@/data/sessao'

/**
 * A pergunta ao Assessor.
 *
 * Rota, e não Server Action, pelo mesmo motivo do extrato: o Next enfileira
 * Server Actions por aba e segura a navegação enquanto uma está no ar. Uma
 * pergunta que chama três ferramentas leva dezenas de segundos, e travar o ERP
 * inteiro por isso seria inaceitável.
 *
 * A ordem das etapas é deliberada: grava a pergunta ANTES de chamar o modelo.
 * Se a chamada falhar, a pergunta continua na conversa com o erro logo abaixo —
 * em vez de sumir e deixar o usuário achando que não digitou nada.
 */

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const TETO_PERGUNTA = 4000

export async function POST(req: Request) {
  if (!assessorConfigurado()) {
    return NextResponse.json(
      { erro: 'O Assessor não está configurado: falta a variável ANTHROPIC_API_KEY no site.' },
      { status: 503 },
    )
  }

  const corpo = (await req.json().catch(() => ({}))) as { pergunta?: string; conversaId?: string }
  const pergunta = (corpo.pergunta ?? '').trim()
  if (!pergunta) return NextResponse.json({ erro: 'Escreva uma pergunta.' }, { status: 400 })
  if (pergunta.length > TETO_PERGUNTA) {
    return NextResponse.json({ erro: 'Pergunta longa demais.' }, { status: 400 })
  }

  const usuario = await sessaoAtual()
  const usuarioId = usuario?.id ?? null

  let conversaId = corpo.conversaId ?? null
  // Id que veio do navegador é conferido: sem isto, adivinhar um uuid daria
  // acesso ao histórico de outra pessoa.
  if (conversaId && !(await conversaDoUsuario(conversaId, usuarioId))) {
    return NextResponse.json({ erro: 'Conversa não encontrada.' }, { status: 404 })
  }
  if (!conversaId) conversaId = await abrirConversa(usuarioId, pergunta)

  const anteriores = await lerMensagens(conversaId)
  await gravarMensagem({ conversaId, papel: 'usuario', texto: pergunta })

  try {
    const r = await perguntarAoAssessor(
      pergunta,
      anteriores.map((m) => ({ papel: m.papel, texto: m.texto })),
    )
    await gravarMensagem({
      conversaId,
      papel: 'assessor',
      texto: r.texto,
      ferramentas: r.ferramentas.map((f) => ({ nome: f.nome, ms: f.ms, erro: f.erro })),
    })
    await auditar({
      conversaId,
      usuarioId,
      pergunta,
      resposta: r.texto,
      ferramentas: r.ferramentas,
      tokensEntrada: r.tokensEntrada,
      tokensSaida: r.tokensSaida,
      duracaoMs: r.duracaoMs,
    })
    return NextResponse.json({
      conversaId,
      texto: r.texto,
      ferramentas: r.ferramentas.map((f) => ({ nome: f.nome, ms: f.ms, erro: f.erro })),
    })
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    // A falha entra na conversa como mensagem do Assessor. Erro que só aparece
    // num toast some no primeiro clique e ninguém consegue relatar depois.
    await gravarMensagem({
      conversaId,
      papel: 'assessor',
      texto: `Não consegui responder: ${erro}`,
    })
    await auditar({ conversaId, usuarioId, pergunta, resposta: null, ferramentas: [], erro })
    return NextResponse.json({ conversaId, erro }, { status: 502 })
  }
}
