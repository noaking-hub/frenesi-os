import { NextResponse } from 'next/server'

import { carregarCentralDoGerente } from '@/data/assessor/prioridades'
import { limparSaudeAntiga } from '@/data/saude-das-rotinas'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

/**
 * A vigília do Gerente — Fase 6 do escopo.
 *
 * O motor de prioridades já existia, mas só rodava quando alguém abria a tela.
 * Um gerente que só avisa quando você pergunta não é gerente; é consulta. Esta
 * rota roda de hora em hora e transforma a fila calculada em alertas que
 * PERSISTEM — e é a persistência que muda o comportamento, porque só quem
 * lembra consegue distinguir problema novo de problema já conhecido.
 *
 * Ela não chama o modelo. É de propósito: alerta é regra determinística do ERP,
 * e um alerta que depende de LLM custa dinheiro por hora e varia de opinião
 * entre execuções. O modelo entra depois, quando alguém pergunta "e daí?".
 */

export const maxDuration = 120
export const dynamic = 'force-dynamic'

function autorizado(req: Request): boolean {
  const esperado = process.env.CRON_SEGREDO
  if (!esperado) return false
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') === esperado
}

export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  if (!supabaseConfigurado()) {
    return NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 500 })
  }

  const central = await carregarCentralDoGerente()

  // A chave é a identidade do PROBLEMA, não da execução. O id da prioridade já
  // é estável entre rodadas por desenho do domínio — é o que permite dizer
  // "isto é o mesmo de ontem" em vez de criar um alerta a cada hora.
  const itens = central.itens.map((p) => ({
    chave: p.id,
    severidade: p.severidade,
    titulo: p.titulo,
    impactoFinanceiro: p.impactoFinanceiro,
    impactoOperacional: p.impactoOperacional,
    urgencia: p.urgencia,
    responsavel: p.responsavel,
    proximaAcao: p.proximaAcao,
    confianca: p.confianca,
  }))

  const { data, error } = await supabaseServer().rpc('sincronizar_alertas_do_gerente', {
    p_itens: itens,
  })
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })

  const r = Array.isArray(data) ? data[0] : data
  const relatorio = {
    fila: itens.length,
    novos: Number(r?.novos ?? 0),
    repetidos: Number(r?.repetidos ?? 0),
    resolvidos: Number(r?.resolvidos ?? 0),
    briefing: central.briefing,
    apuradoEm: central.apuradoEm,
  }

  // O registro da rodada — a mesma lição da Pagaleve. Uma vigília em que nada
  // mudou não altera linha nenhuma, e sem esta marca "rodou e estava tudo bem"
  // fica indistinguível de "não rodou".
  const { error: erroDoRegistro } = await supabaseServer().from('sincronizacoes').insert({
    origem: 'gerente',
    tipo: 'vigilia',
    perfumes: 0,
    variantes: 0,
    ignorados: 0,
    detalhes: relatorio,
  })
  if (erroDoRegistro) {
    console.error('[gerente] não consegui registrar a vigília:', erroDoRegistro.message)
  }

  // Faxina do diário de saúde das rotinas: 30 dias bastam para diagnóstico.
  await limparSaudeAntiga()

  return NextResponse.json(relatorio)
}
