import { NextResponse } from 'next/server'

import { comoEstaConfigurada, pagaleveConfigurada, sondar } from '@/data/pagaleve'

/**
 * Sondagem da API da Pagaleve.
 *
 *     POST /api/pagaleve
 *     Authorization: Bearer $CRON_SEGREDO
 *
 * Rota de descoberta, não de importação: ela pergunta à API como a API é, e
 * devolve o que cada caminho respondeu. Existe porque escrever um importador
 * contra um schema imaginado é a forma mais cara de errar num ERP financeiro —
 * ele parece funcionar, grava número errado, e a conciliação só denuncia
 * semanas depois.
 *
 * Sai daqui apenas a FORMA da resposta: status, nomes de campo e 300
 * caracteres. Nome, CPF e valor de cliente não têm o que fazer num diagnóstico.
 */

export const maxDuration = 300
export const dynamic = 'force-dynamic'

function autorizado(req: Request): boolean {
  const esperado = process.env.CRON_SEGREDO
  if (!esperado) return false
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') === esperado
}

export async function POST(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  }
  if (!pagaleveConfigurada()) {
    return NextResponse.json(
      {
        erro: 'Credencial da Pagaleve não está no site.',
        esperado:
          'PAGALEVE_CHAVE (a "Chave de API" do painel) e PAGALEVE_SENHA (a "Senha da Chave de API")',
        encontrado: comoEstaConfigurada(),
      },
      { status: 503 },
    )
  }
  return NextResponse.json(await sondar())
}
