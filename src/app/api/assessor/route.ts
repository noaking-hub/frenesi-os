import { randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'

import {
  abrirConversa,
  conversaDoUsuario,
  gravarMensagem,
  lerMensagens,
} from '@/data/assessor/conversas'
import { assessorConfigurado, atorDoErp, executarInteracao } from '@/data/assessor/motor'
import { sessaoAtual } from '@/data/sessao'
import { atorValido } from '@/domain'

/**
 * A pergunta ao Gerente, pelo canal ERP.
 *
 * Rota, e não Server Action, pelo mesmo motivo do extrato: o Next enfileira
 * Server Actions por aba e segura a navegação enquanto uma está no ar. Uma
 * pergunta que chama três ferramentas leva dezenas de segundos, e travar o ERP
 * inteiro por isso seria inaceitável.
 *
 * A ordem das etapas é deliberada: grava a pergunta ANTES de chamar o modelo.
 * Se a chamada falhar, a pergunta continua na conversa com o erro logo abaixo —
 * em vez de sumir e deixar o usuário achando que não digitou nada.
 *
 * Esta rota é um ADAPTADOR, e o escopo §24 explica por quê: quando o WhatsApp
 * entrar, ele terá o seu próprio adaptador e chamará o MESMO motor, com o mesmo
 * ator e as mesmas políticas. O que muda entre canais é a entrada e a saída —
 * nunca a decisão.
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
  const ator = atorDoErp(usuarioId, usuario?.papel ?? 'operacao')
  // O motor exige ator inteiro; se um dia a montagem mudar e vier quebrada, é
  // melhor recusar aqui do que executar sem escopo de empresa.
  if (!atorValido(ator)) {
    return NextResponse.json({ erro: 'Não consegui identificar o usuário com segurança.' }, { status: 403 })
  }

  let conversaId = corpo.conversaId ?? null
  // Id que veio do navegador é conferido: sem isto, adivinhar um uuid daria
  // acesso ao histórico de outra pessoa.
  if (conversaId && !(await conversaDoUsuario(conversaId, usuarioId))) {
    return NextResponse.json({ erro: 'Conversa não encontrada.' }, { status: 404 })
  }
  if (!conversaId) conversaId = await abrirConversa(usuarioId, pergunta)

  const anteriores = await lerMensagens(conversaId)
  await gravarMensagem({ conversaId, papel: 'usuario', texto: pergunta })

  const traceId = randomUUID()

  try {
    // `executarInteracao` já audita no `finally`, com sucesso ou com erro. Esta
    // rota não chama `auditar` — chamar seria duplicar a linha, e depender de a
    // rota lembrar é exatamente o que o escopo §11 proíbe.
    const r = await executarInteracao({
      pergunta,
      historico: anteriores.map((m) => ({ papel: m.papel, texto: m.texto })),
      ator,
      canal: 'erp',
      traceId,
      conversaId,
    })

    // `argumentos` e `linhas` seguem junto por causa da exportação (§4.5): é o
    // par que permite ao botão "baixar CSV" reexecutar exatamente a consulta
    // que produziu a tabela, hoje e depois de recarregar a página.
    const ferramentas = r.ferramentas.map((f) => ({
      nome: f.nome,
      modo: f.modo,
      ms: f.ms,
      erro: f.erro,
      bloqueio: f.bloqueio,
      ...(f.linhas ? { linhas: f.linhas, argumentos: f.argumentos } : null),
    }))

    await gravarMensagem({ conversaId, papel: 'assessor', texto: r.texto, ferramentas })
    return NextResponse.json({
      conversaId,
      traceId: r.traceId,
      texto: r.texto,
      ferramentas,
      parou: r.parou,
      aviso: r.aviso,
      duracaoMs: r.duracaoMs,
    })
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    // A falha entra na conversa como mensagem do Gerente. Erro que só aparece
    // num toast some no primeiro clique e ninguém consegue relatar depois.
    await gravarMensagem({
      conversaId,
      papel: 'assessor',
      texto: `Não consegui responder: ${erro}`,
    })
    return NextResponse.json({ conversaId, traceId, erro }, { status: 502 })
  }
}
