import { randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'

import { classificarLancamentos, desfazerClassificacao } from '@/data/assessor/financeiro'
import { atorDoErp, escritaLiberada } from '@/data/assessor/motor'
import { sessaoAtual } from '@/data/sessao'
import { atorValido, chaveDeIdempotencia } from '@/domain'

/**
 * Classificação aplicada pela TELA — sem passar pelo modelo.
 *
 * A fila de revisão mostra a sugestão do ERP, o operador marca o que concorda e
 * aplica. Não há LLM no caminho, e é de propósito: a sugestão já foi calculada
 * por função pura e testada, e mandar o modelo repetir a decisão só
 * acrescentaria custo, latência e a chance de ele discordar de si mesmo.
 *
 * A confirmação aqui é a própria seleção do operador, item a item — mais forte
 * que a aprovação de um lote montado por outro. Por isso não passa por ação
 * pendente: não existe prévia a assinar quando quem escolheu cada linha foi a
 * pessoa que está clicando.
 */

export const maxDuration = 120
export const dynamic = 'force-dynamic'

const TETO_POR_LOTE = 300

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as {
    acao?: 'classificar' | 'desfazer'
    ids?: string[]
    categoriaId?: string
    loteId?: string
  }

  const usuario = await sessaoAtual()
  const ator = atorDoErp(usuario?.id ?? null, usuario?.papel ?? 'operacao')
  if (!atorValido(ator)) {
    return NextResponse.json({ erro: 'Não consegui identificar o usuário.' }, { status: 403 })
  }
  if (!(await escritaLiberada())) {
    return NextResponse.json(
      { erro: 'A escrita do Gerente está desligada. Ligue em Meu Assessor → Configurações.' },
      { status: 403 },
    )
  }

  const traceId = randomUUID()

  try {
    if (corpo.acao === 'desfazer') {
      const loteId = corpo.loteId?.trim()
      if (!loteId) return NextResponse.json({ erro: 'Informe o lote.' }, { status: 400 })
      const revertidos = await desfazerClassificacao({ batchId: loteId, ator, canal: 'erp', traceId })
      return NextResponse.json({
        ok: true,
        revertidos,
        recibo:
          revertidos > 0
            ? `${revertidos} movimento(s) voltaram à categoria anterior.`
            : 'Nada foi revertido: o lote não existe ou já tinha sido desfeito.',
      })
    }

    const ids = (corpo.ids ?? []).filter((x) => typeof x === 'string' && x.length > 0)
    const categoriaId = corpo.categoriaId?.trim()
    if (ids.length === 0) return NextResponse.json({ erro: 'Selecione ao menos um movimento.' }, { status: 400 })
    if (!categoriaId) return NextResponse.json({ erro: 'Escolha a categoria.' }, { status: 400 })
    // Teto por lote: não é limite de banco, é limite de REVISÃO. Ninguém
    // confere trezentas linhas numa tela antes de clicar, e um lote que não foi
    // conferido não deveria ser tratado como aprovado.
    if (ids.length > TETO_POR_LOTE) {
      return NextResponse.json(
        { erro: `Máximo de ${TETO_POR_LOTE} movimentos por vez. Divida em lotes menores.` },
        { status: 400 },
      )
    }

    const r = await classificarLancamentos({
      ids: [...ids].sort(),
      categoriaId,
      ator,
      canal: 'erp',
      traceId,
      conversaId: null,
      confirmacao: 'explicita',
      // A chave inclui os ids ordenados: dois cliques no mesmo botão produzem a
      // MESMA chave e o segundo colide em vez de classificar de novo.
      chaveBase: chaveDeIdempotencia(ator.usuarioId, 'classificar_pela_tela', {
        ids: [...ids].sort(),
        categoriaId,
      }),
    })

    return NextResponse.json({
      ok: true,
      ...r,
      recibo:
        `${r.aplicados} movimento(s) classificados como ${r.categoria}` +
        (r.ignorados > 0
          ? `; ${r.ignorados} ignorado(s) por já estarem gravados ou não serem classificáveis`
          : '') +
        '.',
    })
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
