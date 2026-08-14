import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { createServerClient } from '@supabase/ssr'

import { coletarConcorrente, mensagemDe } from '@/data/concorrentes'

/**
 * Varredura de concorrentes para a tela — uma FATIA por chamada.
 *
 * A varredura completa leva minutos (centenas de páginas por loja, lidas
 * devagar de propósito) e a Netlify corta a função em ~26 s. A chamada única
 * morria no corte e derrubava a página inteira do navegador. Agora cada POST
 * avança a leitura da fonte pedida pelo que couber no prazo e devolve o
 * progresso; o cliente chama de novo até `concluido`.
 */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/** Quanto uma fatia pode gastar lendo. 14 s + a pior página (10 s) < 26 s. */
const PRAZO_DA_FATIA_MS = 14_000

/**
 * `/api/tela` fica fora da tranca do middleware (rotinas autenticam por token
 * próprio), então esta rota confere a sessão por conta: ela abre dezenas de
 * requisições contra lojas de terceiros, e aberta ao público viraria
 * ferramenta de abuso na mão de quem descobrisse o endereço.
 */
async function sessaoValida(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // Sem autenticação configurada o ERP roda aberto — modo local, como no
  // middleware.
  if (!url || !chave) return true

  const jarra = await cookies()
  const sb = createServerClient(url, chave, {
    cookies: {
      getAll: () => jarra.getAll(),
      // Rota não renova sessão; quem faz isso é o middleware.
      setAll: () => {},
    },
  })
  const {
    data: { user },
  } = await sb.auth.getUser()
  return Boolean(user)
}

export async function POST(req: Request) {
  if (!(await sessaoValida())) {
    return NextResponse.json({ ok: false, erro: 'Sessão expirada — entre de novo.' }, { status: 401 })
  }

  const corpo = (await req.json().catch(() => ({}))) as { id?: unknown }
  const id = typeof corpo.id === 'string' ? corpo.id : ''
  if (!id) {
    return NextResponse.json({ ok: false, erro: 'Informe a fonte a vasculhar.' }, { status: 400 })
  }

  try {
    const r = await coletarConcorrente(id, { prazoMs: PRAZO_DA_FATIA_MS })
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: mensagemDe(e) })
  }
}
