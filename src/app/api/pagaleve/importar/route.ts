import { NextResponse } from 'next/server'

import { importarPagaleve } from '@/data/pagaleve-importacao'
import { pagaleveConfigurada } from '@/data/pagaleve'
import { supabaseConfigurado } from '@/data/supabase'

/**
 * Importação das vendas e repasses da Pagaleve, sob demanda.
 *
 *     POST /api/pagaleve/importar        → ENSAIO, não grava nada
 *     POST /api/pagaleve/importar
 *     { "gravar": true }                 → grava
 *
 * O ensaio vem primeiro e é o padrão, como foi no resgate da Pagar.me. O
 * motivo é a assimetria: um ensaio errado custa uma leitura, e uma gravação
 * errada custa uma conciliação inteira remendada à mão depois.
 *
 * O trabalho em si mora em `importarPagaleve`, porque a rotina horária chama a
 * MESMA função. Esta rota existe para o resgate manual e para o ensaio — ela
 * não limita a janela de pedidos, que é justamente o que permite casar venda
 * antiga quando alguém está consertando histórico.
 */

export const maxDuration = 300
export const dynamic = 'force-dynamic'

function autorizado(req: Request): boolean {
  const esperado = process.env.CRON_SEGREDO
  if (!esperado) return false
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') === esperado
}

export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  if (!pagaleveConfigurada()) {
    return NextResponse.json({ erro: 'Credencial da Pagaleve não está no site.' }, { status: 503 })
  }
  if (!supabaseConfigurado()) {
    return NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 500 })
  }

  const corpo = (await req.json().catch(() => ({}))) as { gravar?: boolean }

  try {
    const relatorio = await importarPagaleve({ gravar: corpo.gravar === true, detalhado: true })
    return NextResponse.json(relatorio)
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
