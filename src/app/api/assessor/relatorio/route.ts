import { NextResponse } from 'next/server'

import { assessorConfigurado, atorDoErp, exportarRelatorio } from '@/data/assessor/motor'
import { sessaoAtual } from '@/data/sessao'
import { atorValido } from '@/domain'

/**
 * Baixar como CSV o que o Gerente acabou de mostrar — §4.5.
 *
 * A rota devolve o arquivo, e não um JSON com o conteúdo dentro: assim o
 * navegador salva sozinho, sem o cliente ter que montar Blob nenhum, e o nome
 * do arquivo é decidido no servidor — onde se sabe qual ferramenta rodou.
 *
 * O `ferramenta` e os `argumentos` chegam do navegador, e por isso não são
 * confiados: quem valida os dois é o motor, que só aceita ferramenta de leitura
 * do catálogo e ainda passa pelo Policy Engine antes de executar.
 */

export const maxDuration = 120
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!assessorConfigurado()) {
    return NextResponse.json({ erro: 'O Assessor não está configurado.' }, { status: 503 })
  }

  const corpo = (await req.json().catch(() => ({}))) as {
    ferramenta?: string
    argumentos?: Record<string, unknown>
  }
  const ferramenta = (corpo.ferramenta ?? '').trim()
  if (!ferramenta) return NextResponse.json({ erro: 'Falta a ferramenta.' }, { status: 400 })

  const usuario = await sessaoAtual()
  const ator = atorDoErp(usuario?.id ?? null, usuario?.papel ?? 'operador')
  if (!atorValido(ator)) {
    return NextResponse.json({ erro: 'Não consegui identificar o usuário.' }, { status: 403 })
  }

  try {
    const r = await exportarRelatorio({
      ferramenta,
      argumentos: corpo.argumentos ?? {},
      ator,
      canal: 'erp',
    })
    return new NextResponse(r.csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${r.arquivo}"`,
        // Relatório é recalculado a cada clique; cache aqui serviria um número
        // velho com o nome de hoje.
        'cache-control': 'no-store',
        'x-linhas': String(r.linhas),
      },
    })
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ erro }, { status: 422 })
  }
}
