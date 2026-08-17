import { randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'

import { cancelarAcao, confirmarAcao, lerAcoesPendentes } from '@/data/assessor/acoes'
import { gravarMensagem } from '@/data/assessor/conversas'
import { atorDoErp, escritaLiberada } from '@/data/assessor/motor'
import { sessaoAtual } from '@/data/sessao'
import { atorValido } from '@/domain'

/**
 * Aprovar ou cancelar uma ação pendente — §9 passos 8 a 12.
 *
 * A confirmação NÃO volta ao modelo. O usuário clica em aprovar e o servidor
 * executa direto, com os parâmetros que foram assinados na prévia. É deliberado:
 * entre o "sim" e a gravação não pode existir espaço para o assistente
 * reinterpretar o que foi aprovado.
 *
 * O recibo entra na conversa como mensagem do Gerente. Um resultado que só
 * aparece num toast some no primeiro clique, e ação financeira executada
 * precisa deixar rastro onde a pessoa vai procurar depois.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  const usuario = await sessaoAtual()
  const ator = atorDoErp(usuario?.id ?? null, usuario?.papel ?? 'operacao')
  if (!atorValido(ator)) return NextResponse.json({ acoes: [] })
  const acoes = await lerAcoesPendentes(null)
  return NextResponse.json({ acoes, escritaLiberada: await escritaLiberada() })
}

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as {
    id?: string
    decisao?: 'aprovar' | 'cancelar'
    conversaId?: string
  }
  const id = corpo.id?.trim()
  if (!id) return NextResponse.json({ erro: 'Informe a ação.' }, { status: 400 })

  const usuario = await sessaoAtual()
  const ator = atorDoErp(usuario?.id ?? null, usuario?.papel ?? 'operacao')
  if (!atorValido(ator)) {
    return NextResponse.json({ erro: 'Não consegui identificar o usuário.' }, { status: 403 })
  }

  try {
    if (corpo.decisao === 'cancelar') {
      await cancelarAcao(id, ator)
      return NextResponse.json({ ok: true, recibo: 'Ação cancelada. Nada foi gravado.' })
    }

    const traceId = randomUUID()
    const r = await confirmarAcao({
      id,
      ator,
      canal: 'erp',
      // A política é relida AQUI, e não herdada da prévia: se alguém desligou a
      // escrita entre a proposta e o clique, é o estado de agora que vale.
      escritaLiberada: await escritaLiberada(),
      traceId,
    })

    if (corpo.conversaId) {
      await gravarMensagem({
        conversaId: corpo.conversaId,
        papel: 'assessor',
        texto: `**Executado.** ${r.recibo}${
          r.undoId ? `\n\nPara reverter, peça: "desfaça o lote ${r.undoId}".` : ''
        }`,
      }).catch(() => {
        // Falha ao anexar o recibo na conversa não desfaz o que já foi gravado
        // no financeiro. Ela aparece no log; a ação continua válida.
      })
    }

    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    )
  }
}
